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
