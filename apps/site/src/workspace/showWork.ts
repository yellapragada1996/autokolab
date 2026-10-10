import { waitsForMergeOk, type Ticket, type TicketEvent } from "../lib/data";
import { describe } from "./TicketPage";
import type { Workspace } from "./useWorkspace";
import type { Turn } from "./captain";

export type UndoState = { kind: "none" | "risky" | "can" } | { kind: "asked"; at: string };

export function undoState(ticket: Ticket, turns: Turn[]): UndoState {
  if (ticket.status !== "done" || !ticket.pr_url) return { kind: "none" };
  if (ticket.merge_ok_at) return { kind: "risky" };
  const asked = turns.find((turn) => turn.kind === "you" && turn.body.startsWith(`Undo ${ticket.key} `));
  return asked ? { kind: "asked", at: asked.at } : { kind: "can" };
}

export function undoMessage(ticket: Ticket): string {
  return `Undo ${ticket.key} (“${ticket.title}”): please open a revert of ${ticket.pr_url} as a new ticket, through the normal tests, review and merge. If it changed the database, don't revert it; tell me why instead.`;
}

export function workSummary(t: Ticket): string {
  return t.review?.summary?.trim() || t.summary?.trim() || t.title;
}

export type WorkRow = { label: "Built by" | "Reviewed by" | "Waiting on"; value: string; sha?: string; at?: string };

export function workRows(ws: Workspace, t: Ticket): WorkRow[] {
  const who = (id: string) => id === ws.project.lead_agent_id ? "Captain" : ws.nameOf(id);
  const rows: WorkRow[] = [];
  if (t.assignee_id) rows.push({ label: "Built by", value: who(t.assignee_id) });
  if (t.approved_by) rows.push({ label: "Reviewed by", value: who(t.approved_by), sha: t.approved_sha?.slice(0, 7), at: t.approved_at ?? undefined });
  const blockers = ws.blockersOf(t.id).filter((b) => b.status !== "done" && b.status !== "canceled");
  const waiting = waitsForMergeOk(t) ? "your OK to merge" : t.needs_human?.trim() || (blockers.length ? blockers.map((b) => `${b.key} ${b.title}`).join(", ") : null);
  if (waiting) rows.push({ label: "Waiting on", value: waiting });
  return rows;
}

export function workHistory(ws: Workspace, events: TicketEvent[]): { id: number; at: string; text: string }[] {
  return [...events].sort((a, b) => a.id - b.id).flatMap((event) => {
    const text = describe(ws, event);
    return text ? [{ id: event.id, at: event.created_at, text }] : [];
  });
}
