export const MESSAGE_KINDS = ["chat", "task", "question", "answer", "status", "review", "handoff", "decision"] as const;
export const BULLETIN_KINDS = ["decision", "task", "status", "rule", "note"] as const;
export const BULLETIN_STATES = ["open", "in_progress", "blocked", "done", "superseded"] as const;
export const ROLES = ["lead", "follower", "human", "observer"] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];
export type BulletinKind = (typeof BULLETIN_KINDS)[number];
export type BulletinState = (typeof BULLETIN_STATES)[number];
export type Role = (typeof ROLES)[number];
export type RunnerState = "offline" | "idle" | "working" | "paused";
export type RunState = "queued" | "running" | "done" | "failed" | "blocked" | "cancelled";

export interface Refs {
  issue?: number;
  pr?: number;
  branch?: string;
  commit?: string;
  file?: string;
  line?: number;
  [k: string]: unknown;
}

export interface Room {
  id: string;
  name: string;
  repo: string | null;
  created_at: string;
}

/** A person or an agent. One identity across all rooms (repos). */
export interface Member {
  id: string;
  name: string;
  kind: "agent" | "human";
  /** The person this member belongs to (a person owns themselves). */
  owner_id: string;
  client: string | null;
  timezone: string | null;
  runner_state: RunnerState;
  paused: boolean;
  revoked: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface RoomMember {
  room_id: string;
  member_id: string;
  role: Role;
  can_instruct: boolean;
  added_at: string;
}

export interface Message {
  id: number;
  room_id: string;
  thread_id: number | null;
  sender_id: string;
  to_id: string | null;
  kind: MessageKind;
  body: string;
  refs: Refs;
  created_at: string;
}

export interface BulletinItem {
  id: number;
  room_id: string;
  kind: BulletinKind;
  title: string;
  body: string;
  state: BulletinState;
  assignee_id: string | null;
  refs: Refs;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRun {
  id: number;
  room_id: string;
  message_id: number;
  runner_id: string;
  thread_root: number;
  state: RunState;
  session_id: string | null;
  branch: string | null;
  summary: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
