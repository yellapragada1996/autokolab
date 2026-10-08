import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { parseToken } from "./token.js";
import { looksLikeSecret } from "./secrets.js";
import type {
  BulletinItem,
  BulletinKind,
  BulletinState,
  Member,
  Message,
  MessageKind,
  Refs,
  Room,
  RoomMember,
  RunnerState,
  TaskRun,
} from "./types.js";

// The one client every part of AutoKolab uses: MCP server, runner, CLI and web view.
// A member has one identity across all rooms; RoomView scopes the room-specific operations.
// No Node imports here so the web view can share it.

export interface ConnectOptions {
  url: string;
  anonKey: string;
  token: string;
  /** WebSocket implementation for realtime when the runtime has none (Node < 22). */
  realtimeTransport?: unknown;
}

export interface PostInput {
  body: string;
  kind?: MessageKind;
  /** Member name or id; omitted = everyone in the room. */
  to?: string | null;
  thread?: number | null;
  refs?: Refs;
}

export interface ReadResult {
  messages: Message[];
  hasMore: boolean;
  cursor: number;
}

export interface UpsertInput {
  id?: number;
  kind?: BulletinKind;
  title?: string;
  body?: string;
  state?: BulletinState;
  assignee?: string | null;
  refs?: Refs;
}

export interface WorkEntry {
  run: TaskRun;
  instruction?: Message;
}

/** A member as seen in one room. */
export type RoomMemberView = Member & Pick<RoomMember, "role" | "can_instruct">;

export class AutoKolabError extends Error {}

export class AutoKolab {
  private memberMap = new Map<string, Member>();
  private roomMap = new Map<string, Room>();
  private memberships: RoomMember[] = [];

  private constructor(
    readonly sb: SupabaseClient,
    public me: Member,
  ) {}

  static async connect(opts: ConnectOptions): Promise<AutoKolab> {
    const { email, password, memberId } = parseToken(opts.token);
    const sb = createClient(opts.url, opts.anonKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: opts.realtimeTransport ? ({ transport: opts.realtimeTransport } as never) : undefined,
    });
    const { error: authError } = await sb.auth.signInWithPassword({ email, password });
    if (authError) {
      throw new AutoKolabError(`Sign-in failed (${authError.message}). The token may be revoked, or the project URL/key may be wrong.`);
    }
    const { data: me, error } = await sb.from("members").select("*").eq("id", memberId).maybeSingle();
    if (error) throw friendly(error);
    if (!me) throw new AutoKolabError("Signed in, but this token isn't an active member (revoked?).");
    const ak = new AutoKolab(sb, me as Member);
    await ak.refresh();
    return ak;
  }

  async close(): Promise<void> {
    await this.sb.removeAllChannels();
    await this.sb.auth.signOut().catch(() => undefined);
  }

  /** Reload members, rooms and memberships visible to this member. */
  async refresh(): Promise<void> {
    const [members, rooms, memberships] = await Promise.all([
      this.sb.from("members").select("*").order("created_at"),
      this.sb.from("rooms").select("*").order("created_at"),
      this.sb.from("room_members").select("*"),
    ]);
    for (const r of [members, rooms, memberships]) if (r.error) throw friendly(r.error);
    this.memberMap = new Map((members.data as Member[]).map((m) => [m.id, m]));
    this.roomMap = new Map((rooms.data as Room[]).map((r) => [r.id, r]));
    this.memberships = memberships.data as RoomMember[];
    const self = this.memberMap.get(this.me.id);
    if (self) this.me = self;
  }

  // ------------------------------------------------------------------ rooms

  rooms(): Room[] {
    return [...this.roomMap.values()];
  }

  roomById(id: string): Room | undefined {
    return this.roomMap.get(id);
  }

  /** Find a room by name, repo ("owner/name") or id. */
  findRoom(ref: string): Room | undefined {
    const r = ref.toLowerCase();
    return this.rooms().find((x) => x.id === ref || x.name === r || x.repo === r);
  }

  room(roomOrId: Room | string): RoomView {
    const room = typeof roomOrId === "string" ? this.roomMap.get(roomOrId) : roomOrId;
    if (!room) throw new AutoKolabError(`You're not in room ${roomOrId}.`);
    return new RoomView(this, room);
  }

  membership(roomId: string, memberId = this.me.id): RoomMember | undefined {
    return this.memberships.find((m) => m.room_id === roomId && m.member_id === memberId);
  }

  canInstruct(memberId: string, roomId: string): boolean {
    const m = this.memberMap.get(memberId);
    return !!m && !m.revoked && !!this.membership(roomId, memberId)?.can_instruct;
  }

  membersOf(roomId: string): RoomMemberView[] {
    return this.memberships
      .filter((rm) => rm.room_id === roomId)
      .map((rm) => {
        const m = this.memberMap.get(rm.member_id);
        return m ? { ...m, role: rm.role, can_instruct: rm.can_instruct } : null;
      })
      .filter((m): m is RoomMemberView => !!m && !m.revoked);
  }

  // ------------------------------------------------------------------ members

  listMembers(): Member[] {
    return [...this.memberMap.values()];
  }

  member(id: string | null | undefined): Member | undefined {
    return id ? this.memberMap.get(id) : undefined;
  }

  async memberFresh(id: string): Promise<Member | undefined> {
    if (!this.memberMap.has(id)) await this.refresh();
    return this.memberMap.get(id);
  }

  nameOf(id: string | null | undefined): string {
    if (!id) return "everyone";
    return this.memberMap.get(id)?.name ?? id.slice(0, 8);
  }

  async resolveMember(nameOrId: string, roomId?: string): Promise<Member> {
    const pool = () => (roomId ? this.membersOf(roomId) : this.listMembers());
    const find = () => pool().find((m) => m.name === nameOrId || m.id === nameOrId);
    let m: Member | undefined = find();
    if (!m) {
      await this.refresh();
      m = find();
    }
    if (!m) {
      const where = roomId ? ` in ${this.roomById(roomId)?.name}` : "";
      throw new AutoKolabError(`No member named "${nameOrId}"${where}. Members: ${pool().map((x) => x.name).join(", ")}`);
    }
    return m;
  }

  async heartbeat(state?: RunnerState): Promise<Member> {
    const { data, error } = await this.sb.rpc("heartbeat", state ? { state } : {});
    if (error) throw friendly(error);
    this.me = data as Member;
    this.memberMap.set(this.me.id, this.me);
    return this.me;
  }

  /** The person a member belongs to (for a person, themselves). */
  ownerName(m: Member): string {
    return this.nameOf(m.owner_id);
  }

  /** Members owned by the same person as this one (them and their agents). */
  mine(): Member[] {
    return this.listMembers().filter((m) => m.owner_id === this.me.owner_id && !m.revoked);
  }

  /** Rename yourself or one of your agents, set a time zone, or retire one of your agents. */
  async updateMember(target: string, change: { name?: string; timezone?: string; retire?: boolean }): Promise<Member> {
    const { data, error } = await this.sb.rpc("update_member", {
      target,
      new_name: change.name ?? null,
      new_timezone: change.timezone ?? null,
      retire: change.retire ?? false,
    });
    if (error) throw friendly(error);
    const m = data as Member;
    this.memberMap.set(m.id, m);
    if (m.id === this.me.id) this.me = m;
    return m;
  }

  async setPaused(name: string, paused: boolean): Promise<Member> {
    const { data, error } = await this.sb.rpc("set_paused", { target_name: name, pause: paused });
    if (error) throw friendly(error);
    this.memberMap.set((data as Member).id, data as Member);
    return data as Member;
  }

  // ------------------------------------------------------------------ all-rooms feeds (runner, watch)

  /** Messages after `id` in any of this member's rooms, oldest first. */
  async messagesAfter(id: number, limit = 200): Promise<Message[]> {
    const { data, error } = await this.sb.from("messages").select("*").gt("id", id).order("id", { ascending: true }).limit(limit);
    if (error) throw friendly(error);
    return data as Message[];
  }

  async messageById(id: number): Promise<Message | undefined> {
    const { data, error } = await this.sb.from("messages").select("*").eq("id", id).maybeSingle();
    if (error) throw friendly(error);
    return (data as Message) ?? undefined;
  }

  async firstMessageIdSince(isoTime: string): Promise<number> {
    const { data, error } = await this.sb.from("messages").select("id").gte("created_at", isoTime).order("id").limit(1);
    if (error) throw friendly(error);
    if (data.length) return Number(data[0].id) - 1;
    const { data: last } = await this.sb.from("messages").select("id").order("id", { ascending: false }).limit(1);
    return last?.length ? Number(last[0].id) : 0;
  }

  /** New messages in any of this member's rooms. Remove the channel when done. */
  onAnyMessage(cb: (m: Message) => void): RealtimeChannel {
    return this.channel("msg", "messages", "INSERT", undefined, (row) => cb(row as unknown as Message));
  }

  /** Member and membership changes (presence, runner state, pause, joins). */
  onMembersChange(cb: () => void): RealtimeChannel {
    const ch = this.sb.channel(`ak-members-${rand()}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "members" }, (p) => {
      const m = p.new as Member;
      if (m?.id) {
        this.memberMap.set(m.id, m);
        if (m.id === this.me.id) this.me = m;
      }
      cb();
    });
    ch.on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, () => {
      void this.refresh().then(cb, () => undefined);
    });
    return ch.subscribe();
  }

  channel(tag: string, table: string, event: "INSERT" | "*", filter: string | undefined, cb: (row: Record<string, unknown>) => void): RealtimeChannel {
    return this.sb
      .channel(`ak-${tag}-${rand()}`)
      .on("postgres_changes", { event, schema: "public", table, ...(filter ? { filter } : {}) } as never, (payload: { new: Record<string, unknown> }) => {
        if (payload.new && Object.keys(payload.new).length) cb(payload.new);
      })
      .subscribe();
  }

  // ------------------------------------------------------------------ task runs (runner)

  async claimRun(message: Message): Promise<TaskRun | null> {
    const { data, error } = await this.sb
      .from("task_runs")
      .insert({ room_id: message.room_id, message_id: message.id, runner_id: this.me.id, thread_root: message.thread_id ?? message.id, state: "queued" })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return null;
      throw friendly(error);
    }
    return data as TaskRun;
  }

  async updateRun(id: number, patch: Partial<Pick<TaskRun, "state" | "session_id" | "branch" | "summary" | "started_at" | "finished_at">>): Promise<void> {
    const { error } = await this.sb.from("task_runs").update(patch).eq("id", id);
    if (error) throw friendly(error);
  }

  async runsIn(threadRoot: number): Promise<TaskRun[]> {
    const { data, error } = await this.sb
      .from("task_runs")
      .select("*")
      .eq("runner_id", this.me.id)
      .eq("thread_root", threadRoot)
      .order("id", { ascending: true });
    if (error) throw friendly(error);
    return data as TaskRun[];
  }

  async lastSession(threadRoot: number): Promise<string | null> {
    const runs = await this.runsIn(threadRoot);
    for (let i = runs.length - 1; i >= 0; i--) if (runs[i].session_id) return runs[i].session_id;
    return null;
  }

  async myRuns(limit = 200): Promise<TaskRun[]> {
    const { data, error } = await this.sb.from("task_runs").select("*").eq("runner_id", this.me.id).order("id", { ascending: false }).limit(limit);
    if (error) throw friendly(error);
    return data as TaskRun[];
  }
}

// ---------------------------------------------------------------------- one room

export class RoomView {
  constructor(
    readonly ak: AutoKolab,
    readonly room: Room,
  ) {}

  get id(): string {
    return this.room.id;
  }

  members(): RoomMemberView[] {
    return this.ak.membersOf(this.room.id);
  }

  myRole() {
    return this.ak.membership(this.room.id)?.role;
  }

  canInstruct(): boolean {
    return this.ak.canInstruct(this.ak.me.id, this.room.id);
  }

  async post(input: PostInput): Promise<Message> {
    const kind = input.kind ?? "chat";
    const body = input.body?.trim();
    if (!body) throw new AutoKolabError("Message body is empty.");
    if (looksLikeSecret(body) || looksLikeSecret(JSON.stringify(input.refs ?? {}))) {
      throw new AutoKolabError("Not sent: the message looks like it contains a key or token. Remove it and try again.");
    }
    if ((kind === "task" || kind === "decision") && !this.canInstruct()) {
      throw new AutoKolabError(`Only members who can instruct (the lead side) can post ${kind} messages. Use question, status or chat.`);
    }
    const to = input.to ? (await this.ak.resolveMember(input.to, this.room.id)).id : null;
    const { data, error } = await this.ak.sb
      .from("messages")
      .insert({ room_id: this.room.id, sender_id: this.ak.me.id, to_id: to, thread_id: input.thread ?? null, kind, body, refs: input.refs ?? {} })
      .select("*")
      .single();
    if (error) throw friendly(error);
    return data as Message;
  }

  async cursor(): Promise<number> {
    const { data, error } = await this.ak.sb
      .from("read_cursors")
      .select("last_read_message_id")
      .eq("member_id", this.ak.me.id)
      .eq("room_id", this.room.id)
      .maybeSingle();
    if (error) throw friendly(error);
    return Number(data?.last_read_message_id ?? 0);
  }

  async markRead(upto: number): Promise<number> {
    const { data, error } = await this.ak.sb.rpc("mark_read", { room: this.room.id, upto });
    if (error) throw friendly(error);
    return Number(data);
  }

  /** Unread messages (or those after `since`), oldest first; advances the cursor unless told not to. */
  async read(opts: { since?: number; limit?: number; advance?: boolean; includeOwn?: boolean } = {}): Promise<ReadResult> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const after = opts.since ?? (await this.cursor());
    const { data, error } = await this.ak.sb
      .from("messages")
      .select("*")
      .eq("room_id", this.room.id)
      .gt("id", after)
      .order("id", { ascending: true })
      .limit(limit + 1);
    if (error) throw friendly(error);
    const rows = data as Message[];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.length ? page[page.length - 1].id : after;
    let cursor = after;
    if (opts.advance !== false && opts.since === undefined && last > after) cursor = await this.markRead(last);
    const messages = opts.includeOwn ? page : page.filter((m) => m.sender_id !== this.ak.me.id);
    return { messages, hasMore, cursor };
  }

  async recent(limit = 100): Promise<Message[]> {
    const { data, error } = await this.ak.sb
      .from("messages")
      .select("*")
      .eq("room_id", this.room.id)
      .order("id", { ascending: false })
      .limit(limit);
    if (error) throw friendly(error);
    return (data as Message[]).reverse();
  }

  async messagesAfter(id: number, limit = 200): Promise<Message[]> {
    const { data, error } = await this.ak.sb
      .from("messages")
      .select("*")
      .eq("room_id", this.room.id)
      .gt("id", id)
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw friendly(error);
    return data as Message[];
  }

  async thread(rootId: number): Promise<Message[]> {
    const { data, error } = await this.ak.sb
      .from("messages")
      .select("*")
      .eq("room_id", this.room.id)
      .or(`id.eq.${rootId},thread_id.eq.${rootId}`)
      .order("id", { ascending: true });
    if (error) throw friendly(error);
    return data as Message[];
  }

  /** Wait for someone else's message (or the timeout), then return unread messages. */
  async wait(timeoutS: number, opts: { advance?: boolean } = {}): Promise<ReadResult> {
    const timeoutMs = Math.min(Math.max(timeoutS, 1), 600) * 1000;
    let wake: () => void = () => undefined;
    let woke = new Promise<void>((r) => (wake = r));
    const channel = this.onMessage((m) => {
      if (m.sender_id !== this.ak.me.id) wake();
    });
    try {
      await waitSubscribed(channel, 5000).catch(() => undefined);
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const peek = await this.read({ advance: false });
        if (peek.messages.length) return opts.advance === false ? peek : this.read({});
        const left = deadline - Date.now();
        if (left <= 0) return peek;
        await Promise.race([woke, sleep(Math.min(left, 15000))]);
        woke = new Promise<void>((r) => (wake = r));
      }
    } finally {
      await this.ak.sb.removeChannel(channel);
    }
  }

  /** Wait for replies from others in one thread after message `afterId` (or the timeout). */
  async waitInThread(thread: number, afterId: number, timeoutS: number): Promise<Message[]> {
    const timeoutMs = Math.min(Math.max(timeoutS, 1), 600) * 1000;
    let wake: () => void = () => undefined;
    let woke = new Promise<void>((r) => (wake = r));
    const channel = this.onMessage((m) => {
      if (m.sender_id !== this.ak.me.id && (m.thread_id === thread || m.id === thread)) wake();
    });
    try {
      await waitSubscribed(channel, 5000).catch(() => undefined);
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const replies = (await this.thread(thread)).filter((m) => m.id > afterId && m.sender_id !== this.ak.me.id);
        // "Started on #…" alone isn't an answer; wait a little longer for something substantive.
        const substantive = replies.filter((m) => !/^(Started on|Picked up) #\d+/.test(m.body));
        if (substantive.length) return replies;
        const left = deadline - Date.now();
        if (left <= 0) return replies;
        await Promise.race([woke, sleep(Math.min(left, 15000))]);
        woke = new Promise<void>((r) => (wake = r));
      }
    } finally {
      await this.ak.sb.removeChannel(channel);
    }
  }

  onMessage(cb: (m: Message) => void): RealtimeChannel {
    return this.ak.channel("room-msg", "messages", "INSERT", `room_id=eq.${this.room.id}`, (row) => cb(row as unknown as Message));
  }

  onBulletinChange(cb: (b: BulletinItem) => void): RealtimeChannel {
    return this.ak.channel("board", "bulletin", "*", `room_id=eq.${this.room.id}`, (row) => cb(row as unknown as BulletinItem));
  }

  /**
   * What every agent in the room has worked on: each run with its instruction, state, branch and
   * result, newest first. The branches are on the shared repo, so anyone can read the code.
   */
  async workLog(opts: { agent?: string; limit?: number } = {}): Promise<WorkEntry[]> {
    let q = this.ak.sb.from("task_runs").select("*").eq("room_id", this.room.id).order("id", { ascending: false }).limit(Math.min(opts.limit ?? 20, 100));
    if (opts.agent) q = q.eq("runner_id", (await this.ak.resolveMember(opts.agent, this.room.id)).id);
    const { data, error } = await q;
    if (error) throw friendly(error);
    const runs = data as TaskRun[];
    const ids = [...new Set(runs.map((r) => r.message_id))];
    const { data: msgs, error: mErr } = ids.length
      ? await this.ak.sb.from("messages").select("*").in("id", ids)
      : { data: [], error: null };
    if (mErr) throw friendly(mErr);
    const byId = new Map((msgs as Message[]).map((m) => [m.id, m]));
    return runs.map((run) => ({ run, instruction: byId.get(run.message_id) }));
  }

  async boardList(opts: { state?: BulletinState | "active"; assignee?: string; kind?: BulletinKind } = {}): Promise<BulletinItem[]> {
    let q = this.ak.sb.from("bulletin").select("*").eq("room_id", this.room.id).order("updated_at", { ascending: false }).limit(200);
    if (opts.state === "active") q = q.in("state", ["open", "in_progress", "blocked"]);
    else if (opts.state) q = q.eq("state", opts.state);
    if (opts.kind) q = q.eq("kind", opts.kind);
    if (opts.assignee) q = q.eq("assignee_id", (await this.ak.resolveMember(opts.assignee, this.room.id)).id);
    const { data, error } = await q;
    if (error) throw friendly(error);
    return data as BulletinItem[];
  }

  async boardUpsert(input: UpsertInput): Promise<BulletinItem> {
    if (looksLikeSecret(`${input.title ?? ""}\n${input.body ?? ""}\n${JSON.stringify(input.refs ?? {})}`)) {
      throw new AutoKolabError("Not saved: the item looks like it contains a key or token.");
    }
    const patch: Record<string, unknown> = { updated_by: this.ak.me.id };
    for (const k of ["kind", "title", "body", "state", "refs"] as const) if (input[k] !== undefined) patch[k] = input[k];
    if (input.assignee !== undefined) {
      patch.assignee_id = input.assignee === null ? null : (await this.ak.resolveMember(input.assignee, this.room.id)).id;
    }
    if (input.id !== undefined) {
      const { data, error } = await this.ak.sb.from("bulletin").update(patch).eq("id", input.id).eq("room_id", this.room.id).select("*").maybeSingle();
      if (error) throw friendly(error);
      if (!data) throw new AutoKolabError(`No bulletin item #${input.id} in ${this.room.name}.`);
      return data as BulletinItem;
    }
    if (!input.kind || !input.title) throw new AutoKolabError("A new bulletin item needs a kind and a title.");
    const { data, error } = await this.ak.sb
      .from("bulletin")
      .insert({ ...patch, room_id: this.room.id, created_by: this.ak.me.id })
      .select("*")
      .single();
    if (error) throw friendly(error);
    return data as BulletinItem;
  }
}

// ---------------------------------------------------------------------- helpers

export function friendly(error: { message: string; code?: string }): AutoKolabError {
  const m = error.message ?? String(error);
  if (m.includes("AUTOKOLAB_SECRET")) return new AutoKolabError("Rejected: it looks like it contains a key or token.");
  if (m.includes("AUTOKOLAB_RATE_LIMIT")) return new AutoKolabError("Slow down: more than 30 messages in a minute.");
  if (m.includes("AUTOKOLAB_FORBIDDEN")) return new AutoKolabError(m.replace(/^.*AUTOKOLAB_FORBIDDEN:\s*/, "Not allowed: "));
  if (m.includes("AUTOKOLAB_")) return new AutoKolabError(m.replace(/^.*AUTOKOLAB_[A-Z_]+:\s*/, ""));
  if (m.includes("row-level security")) {
    return new AutoKolabError("Not allowed by the room's rules (observers can't post; only the lead side can post tasks and decisions).");
  }
  if (/relation .* does not exist|Could not find the table/i.test(m)) {
    return new AutoKolabError("The AutoKolab database tables aren't set up in this Supabase project yet. Run: autokolab init");
  }
  if (m.includes("JWT") || m.includes("401")) return new AutoKolabError("Session expired or token revoked. Try again or join again.");
  return new AutoKolabError(m);
}

export function waitSubscribed(channel: RealtimeChannel, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("realtime subscribe timed out")), timeoutMs);
    const check = () => {
      if (channel.state === "joined") {
        clearTimeout(t);
        resolve();
      } else setTimeout(check, 100);
    };
    check();
  });
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rand = () => Math.random().toString(36).slice(2);
