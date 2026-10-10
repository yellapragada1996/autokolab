import { friendly } from "./data";
import { supabase } from "./session";

// The room: the live chat where people and agents talk (one per repo). The website reads it as the
// room member linked to your GitHub sign-in, and posts as that member.

export interface RoomMember {
  id: string;
  name: string;
  kind: "human" | "agent";
  client: string | null;
  owner_id: string;
  runner_state: string;
  paused: boolean;
  last_seen_at: string | null;
  role: "lead" | "follower" | "human" | "observer";
  can_instruct: boolean;
}

export interface RoomMessage {
  id: number;
  room_id: string;
  thread_id: number | null;
  sender_id: string;
  to_id: string | null;
  kind: "chat" | "task" | "question" | "answer" | "status" | "review" | "handoff" | "decision";
  body: string;
  refs: Record<string, unknown>;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  repo: string | null;
  members: RoomMember[];
  /** The member you post as, or null if you can only read. */
  me: RoomMember | null;
}

// Agent bookkeeping: the notices a runner posts as it works. A copy of the helper's definitions,
// keep them in step: isRunnerNotice, isPauseNotice, STALE_RUN_SUMMARY and the "Stopped: my runner
// restarted" notice in packages/autokolab/src/runner/runner.ts, MODEL_CHANGE_PREFIX in
// packages/autokolab/src/core/projects.ts.
const MODEL_CHANGE_PREFIX = "Model change:";
const PAUSE_NOTICE = /^Pausing this thread after \d+ agent messages in a row\. A person can reply to continue\.$/;
const RESTART_NOTICE = /^Stopped: my runner restarted while working on #\d+/;

/** A runner's progress ping (started, picked up, queued, paused, model change, skipped): news, not conversation. */
export function isBookkeeping(body: string): boolean {
  const first = body.trim();
  return /^(Started on|Picked up|Queued) #\d+/.test(first) || PAUSE_NOTICE.test(first) || first.startsWith(MODEL_CHANGE_PREFIX) || RESTART_NOTICE.test(first) || first.startsWith("Skipped:");
}

/** A run that went wrong, as a short plain line ("couldn't continue: session limit (resets 11:20pm Stockholm)"), or null. */
export function problemOf(body: string): string | null {
  const text = body.trim();
  const m = /^(Failed on|Blocked on|Couldn't start|Stopped) #\d+[.:]?\s*([\s\S]*)$/.exec(text);
  if (!m) return null;
  const rest = m[2].replace(/^Where it got to:\s*/, "").trim();
  if (m[1] === "Couldn't start") return `couldn't start: ${firstLine(rest) || "the run didn't start"}`;
  if (m[1] === "Stopped") return `stopped: ${firstLine(rest) || "the run was stopped"}`;
  return `couldn't continue: ${limitOf(rest) ?? (firstLine(rest) || "the run failed")}`;
}

/** "You've hit your session limit · resets 11:20pm (Europe/Stockholm)" → "session limit (resets 11:20pm Stockholm)". */
function limitOf(text: string): string | null {
  const kind = /\b(session|usage|weekly|daily|rate) limit\b/i.exec(text);
  if (!kind) return null;
  const resets = /\bresets?\s+(?:at\s+)?([^\n(·.]+?)\s*(?:\(([^)]+)\))?\s*(?:[.·\n]|$)/i.exec(text);
  if (!resets) return `${kind[1].toLowerCase()} limit`;
  const zone = resets[2] ? ` ${resets[2].split("/").pop()!.replace(/_/g, " ")}` : "";
  return `${kind[1].toLowerCase()} limit (resets ${resets[1].trim()}${zone})`;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim())?.trim().replace(/[.\s]+$/, "") ?? "";
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(friendly(r.error.message));
  return r.data as T;
}

/** A project's room, or null when your sign-in isn't in it. */
export async function roomFor(roomId: string | null, profileId: string): Promise<Room | null> {
  if (!roomId) return null;
  const room = check<{ id: string; name: string; repo: string | null } | null>(await supabase.from("rooms").select("id, name, repo").eq("id", roomId).maybeSingle());
  if (!room) return null;
  const rm = check<{ member_id: string; role: RoomMember["role"]; can_instruct: boolean }[]>(await supabase.from("room_members").select("member_id, role, can_instruct").eq("room_id", room.id));
  const ids = rm.map((r) => r.member_id);
  const rows = ids.length
    ? check<(Omit<RoomMember, "role" | "can_instruct"> & { profile_id: string | null; revoked: boolean })[]>(
        await supabase.from("members").select("id, name, kind, client, owner_id, runner_state, paused, last_seen_at, profile_id, revoked").in("id", ids),
      )
    : [];
  const members = rows
    .filter((m) => !m.revoked)
    .map((m) => ({ ...m, role: rm.find((r) => r.member_id === m.id)!.role, can_instruct: rm.find((r) => r.member_id === m.id)!.can_instruct }));
  const mine = rows.find((m) => m.profile_id === profileId);
  return { ...room, members, me: mine ? (members.find((m) => m.id === mine.id) ?? null) : null };
}

export async function roomMessages(roomId: string, limit = 300): Promise<RoomMessage[]> {
  const rows = check<RoomMessage[]>(await supabase.from("messages").select("*").eq("room_id", roomId).order("id", { ascending: false }).limit(limit));
  return rows.reverse();
}

export async function postToRoom(roomId: string, body: string, to: string | null, thread: number | null): Promise<RoomMessage> {
  return check(await supabase.rpc("web_post", { p_room: roomId, p_body: body, p_to: to, p_thread: thread }));
}

/** New messages as they arrive (plus a safety refresh), until the returned function is called. */
export function watchRoom(roomId: string, onChange: () => void): () => void {
  const ch = supabase
    .channel(`room-${roomId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` }, onChange)
    .on("postgres_changes" as never, { event: "UPDATE", schema: "public", table: "members" }, onChange)
    .subscribe();
  const poll = setInterval(onChange, 20_000);
  return () => {
    clearInterval(poll);
    void supabase.removeChannel(ch);
  };
}
