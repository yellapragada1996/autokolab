import type { AutoKolab, RoomMemberView, WorkEntry } from "./client.js";
import type { BulletinItem, Member, Message } from "./types.js";

// Plain-text renderings shared by the CLI and the MCP tools.

export function formatMessage(ak: AutoKolab, m: Message, opts: { showRoom?: boolean } = {}): string {
  const to = m.to_id ? ` → ${ak.nameOf(m.to_id)}` : "";
  const thread = m.thread_id ? ` (thread #${m.thread_id})` : "";
  const room = opts.showRoom ? `${ak.roomById(m.room_id)?.name ?? "?"} · ` : "";
  const refs = Object.keys(m.refs ?? {}).length ? `\n  refs: ${JSON.stringify(m.refs)}` : "";
  const time = m.created_at.replace("T", " ").slice(0, 16) + " UTC";
  return `${room}#${m.id} [${m.kind}] ${ak.nameOf(m.sender_id)}${to}${thread} · ${time}\n${indent(m.body)}${refs}`;
}

export function formatItem(ak: AutoKolab, b: BulletinItem): string {
  const who = b.assignee_id ? ` · ${ak.nameOf(b.assignee_id)}` : "";
  const refs = Object.keys(b.refs ?? {}).length ? ` · refs ${JSON.stringify(b.refs)}` : "";
  const body = b.body ? `\n${indent(b.body)}` : "";
  return `#${b.id} [${b.kind}/${b.state}] ${b.title}${who}${refs}${body}`;
}

/** `model`: an agent's model and effort line from its project (ProjectView.modelLine), if known. */
export function formatMember(ak: { nameOf(id: string): string }, m: Member | RoomMemberView, model?: string | null): string {
  const seen = m.last_seen_at ? ago(m.last_seen_at) : "never";
  const role = "role" in m ? `${m.role}${m.can_instruct ? ", can instruct" : ""}` : m.kind;
  const runner = m.kind === "agent" && m.runner_state !== "offline" ? `, runner ${m.paused ? "paused" : m.runner_state}` : m.paused ? ", paused" : "";
  const owner = m.kind === "agent" ? `; ${ak.nameOf(m.owner_id)}'s agent` : "";
  const runs = m.kind === "agent" && model ? `; ${model}` : "";
  return `${m.name} (${role}${runner}${owner}${runs}; seen ${seen})`;
}

export function formatWork(ak: AutoKolab, e: WorkEntry): string {
  const r = e.run;
  const task = e.instruction ? firstLine(e.instruction.body) : `message #${r.message_id}`;
  const when = ago(r.finished_at ?? r.started_at ?? r.created_at);
  const branch = r.branch ? `\n  branch: ${r.branch}` : "";
  const result = r.summary ? `\n  result: ${firstLine(r.summary)}` : "";
  return `${ak.nameOf(r.runner_id)} · ${r.state} · ${when} · #${r.message_id} (thread #${r.thread_root}): ${task}${branch}${result}`;
}

function firstLine(t: string): string {
  const l = t.split("\n").find((x) => x.trim()) ?? "";
  return l.length > 140 ? l.slice(0, 139) + "…" : l;
}

export function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function indent(t: string): string {
  return t
    .split("\n")
    .map((l) => "  " + l)
    .join("\n");
}
