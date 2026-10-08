import type { AutoKolab, RoomMemberView, WorkEntry } from "@core/client";
import type { SetupState } from "./local";
import type { BulletinItem, Member, Message, Room, TaskRun } from "@core/types";

// Development-only stand-in for the Supabase-backed client: open http://localhost:5174/?demo
// to see the room with sample data. Not included in production builds.

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const rooms: Room[] = [
  { id: "r1", name: "shop-app", repo: "ana/shop-app", created_at: "" },
  { id: "r2", name: "landing-site", repo: "ana/landing-site", created_at: "" },
];
const member = (id: string, name: string, kind: Member["kind"], owner_id: string, extra: Partial<Member> = {}): Member => ({
  id, name, kind, owner_id, client: null, timezone: null, runner_state: "idle", paused: false, revoked: false, last_seen_at: ago(1), created_at: "", ...extra,
});
const members = [
  member("2", "ana", "human", "2", { timezone: "America/Toronto" }),
  member("1", "ana-claude", "agent", "2", { client: "claude-code" }),
  member("5", "lee", "human", "5", { timezone: "Europe/Stockholm", last_seen_at: ago(300), runner_state: "offline" }),
  member("3", "builder", "agent", "5", { runner_state: "working", client: "claude-code" }),
  member("4", "lee-codex", "agent", "5", { client: "codex" }),
];
const roles: Record<string, [RoomMemberView["role"], boolean]> = {
  "1": ["lead", true], "2": ["human", true], "3": ["follower", false], "4": ["follower", false], "5": ["human", false],
};

function seed() {
  const msg = (id: number, sender: string, kind: Message["kind"], body: string, extra: Partial<Message> = {}): Message => ({
    id, room_id: "r1", thread_id: null, sender_id: sender, to_id: null, kind, body, refs: {}, created_at: ago(60 - id * 4), ...extra,
  });
  const messages: Message[] = [
    msg(1, "1", "task", "Build the Zones API.\n- Polygon zones, max 12 points\n- Tests for validation\n- Open a PR when done", { to_id: "3", refs: { branch: "zones-api" } }),
    msg(2, "3", "status", "Started on #1 (branch ak/builder/t1).", { thread_id: 1, to_id: "1" }),
    msg(3, "3", "question", "Should zones be allowed to overlap?", { thread_id: 1, to_id: "1" }),
    msg(4, "1", "answer", "Yes, overlaps are fine. Reject self-intersecting polygons.", { thread_id: 1, to_id: "3" }),
    msg(5, "2", "chat", "@lee-codex add CSV export to the reports page. Reuse the zone filters from builder's branch.", { to_id: "4" }),
    msg(6, "4", "status", "Blocked on #5: needs .env.prod to check the production export format, which is outside my limits.", { thread_id: 5, to_id: "2" }),
    msg(7, "3", "status", "Zones API is up for review: PR #12. Added polygon validation and 14 tests.", { thread_id: 1, to_id: "1", refs: { pr: 12 } }),
    msg(8, "5", "chat", "Please give me access to github.com/ana/shop-app (my GitHub is @lee-k).", { to_id: "2", refs: { access_request: { repo: "ana/shop-app", github: "lee-k" } } }),
  ];
  const item = (id: number, title: string, state: BulletinItem["state"], kind: BulletinItem["kind"], assignee: string | null, extra: Partial<BulletinItem> = {}): BulletinItem => ({
    id, room_id: "r1", kind, title, body: "", state, assignee_id: assignee, refs: {}, created_by: "1", updated_by: "1", created_at: ago(90), updated_at: ago(id * 7), ...extra,
  });
  const board: BulletinItem[] = [
    item(1, "Zones API", "in_progress", "task", "3", { refs: { pr: 12 } }),
    item(2, "CSV export", "blocked", "task", "4", { body: "Needs the production export format; ask ana." }),
    item(3, "Zones are polygons, max 12 points", "open", "decision", null),
    item(4, "Auth refactor", "done", "task", "3", { refs: { pr: 11 } }),
  ];
  const run = (id: number, runner: string, message: number, state: TaskRun["state"], branch: string, summary: string): TaskRun => ({
    id, room_id: "r1", message_id: message, runner_id: runner, thread_root: message, state, session_id: null, branch, summary,
    started_at: ago(50), finished_at: state === "running" ? null : ago(10), created_at: ago(55),
  });
  const runs = [
    run(3, "4", 5, "blocked", "ak/lee-codex/t5", "Blocked on #5: needs .env.prod"),
    run(2, "3", 1, "done", "zones-api", "Zones API is up for review: PR #12."),
    run(1, "3", 0, "done", "auth-refactor", "Auth refactor merged in PR #11."),
  ];
  return { messages, board, runs };
}

export function demoClient(): AutoKolab {
  const { messages, board, runs } = seed();
  const listeners: ((m: Message) => void)[] = [];
  const byId = (id: string | null | undefined) => members.find((m) => m.id === id);
  const me = members[0];

  const view = (room: Room) => ({
    ak: fake,
    room,
    id: room.id,
    members: () => members.map((m) => ({ ...m, role: roles[m.id][0], can_instruct: roles[m.id][1] })),
    myRole: () => "human",
    canInstruct: () => true,
    recent: async () => messages.filter((m) => m.room_id === room.id),
    messagesAfter: async (id: number) => messages.filter((m) => m.room_id === room.id && m.id > id),
    boardList: async () => board.filter((b) => b.room_id === room.id),
    workLog: async (): Promise<WorkEntry[]> =>
      runs.filter((r) => r.room_id === room.id).map((r) => ({ run: r, instruction: messages.find((m) => m.id === r.message_id) })),
    markRead: async (n: number) => n,
    onMessage: (cb: (m: Message) => void) => (listeners.push((m) => m.room_id === room.id && cb(m)), {}),
    onBulletinChange: () => ({}),
    post: async (p: { body: string; kind: Message["kind"]; to: string | null; thread: number | null }) => {
      const m: Message = { id: messages.length + 1, room_id: room.id, thread_id: p.thread, sender_id: me.id, to_id: p.to, kind: p.kind, body: p.body, refs: {}, created_at: new Date().toISOString() };
      messages.push(m);
      listeners.forEach((l) => l(m));
      return m;
    },
    boardUpsert: async (u: Partial<BulletinItem> & { id?: number }) => {
      const b = board.find((x) => x.id === u.id);
      if (b) Object.assign(b, u, { updated_at: new Date().toISOString() });
      return b;
    },
  });

  const fake = {
    me,
    sb: { removeChannel: async () => undefined },
    rooms: () => rooms,
    room: (r: Room) => view(r),
    listMembers: () => members,
    member: byId,
    memberFresh: async (id: string) => byId(id),
    nameOf: (id: string | null) => (id ? byId(id)?.name ?? id : "everyone"),
    refresh: async () => undefined,
    heartbeat: async () => me,
    onMembersChange: () => ({}),
    setPaused: async (name: string, paused: boolean) => {
      const m = members.find((x) => x.name === name)!;
      if (m.owner_id !== me.owner_id) throw new Error("Not allowed: you can only pause your own agents");
      m.paused = paused;
      return m;
    },
    close: async () => undefined,
  };
  return fake as unknown as AutoKolab;
}

export function demoState(): SetupState {
  return {
    keys: { url: "https://demo.supabase.co", hasPublicKey: true, hasSecretKey: true },
    database: "ready",
    admin: true,
    me: { id: "2", name: "ana", needsName: false },
    agents: [{ id: "1", name: "ana-claude", engine: "claude", needsName: false, installed: true }],
    engines: { claude: true, codex: false },
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, repo: r.repo })),
    followers: 0,
    service: "not-installed",
    ready: true,
  };
}
