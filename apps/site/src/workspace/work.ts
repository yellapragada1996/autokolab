import type { Status, Step, Ticket } from "../lib/data";
import type { Need } from "./captain";
import { epicOf, headline, plural } from "./story";
import type { Workspace } from "./useWorkspace";

export type WorkColumn = Status | "needs";
export const workStatus: Record<Status, string> = { backlog: "Later", ready: "To do", in_progress: "Building", review: "In review", done: "Shipped", canceled: "Canceled" };
export const WORK_COLUMNS: { id: WorkColumn; label: string; color: string }[] = [
  { id: "ready", label: workStatus.ready, color: "var(--text-secondary)" },
  { id: "in_progress", label: workStatus.in_progress, color: "var(--blue-text)" },
  { id: "review", label: workStatus.review, color: "var(--text-secondary)" },
  { id: "needs", label: "Needs you", color: "var(--amber)" },
  { id: "done", label: workStatus.done, color: "var(--green-text)" },
];

/** Requests are amber; runner failures remain problems in their existing column. */
export function workNeed(t: Ticket, needs: Need[]): Need | undefined {
  return t.status === "done" || t.status === "canceled" ? undefined : needs.find((n) => n.ticket?.id === t.id && n.kind !== "problem");
}

export function workColumn(t: Ticket, needs: Need[]): WorkColumn {
  return workNeed(t, needs) ? "needs" : t.status;
}

/** One line on a card, with the key left to its tooltip. */
export function cardLine(t: Pick<Ticket, "summary" | "title">): string {
  const summary = t.summary?.trim();
  return summary ? summary[0].toUpperCase() + summary.slice(1) : t.title;
}

export function shippedTime(at: string | null, now: Date): string {
  if (!at || !Number.isFinite(Date.parse(at))) return "Merged";
  const date = new Date(at);
  return `Merged · ${date.toDateString() === now.toDateString() ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : date.toLocaleDateString([], { month: "short", day: "numeric", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })}`;
}

/** Words and progress from the record, independent of rendering. */
export function cardWords(t: Ticket, blockers: Ticket[], steps: Step[], need: Need | undefined, now: Date) {
  const done = steps.filter((s) => s.status === "done").length;
  const live = steps.find((s) => s.status === "now");
  const after = blockers.filter((b) => b.status !== "done" && b.status !== "canceled").map(cardLine);
  const sub = need ? need.action
    : t.status === "done" ? shippedTime(t.completed_at, now)
    : t.status === "ready" && after.length ? `After ${after.join(", ")}`
    : t.status === "in_progress" && live ? `${live.label} · ${Math.min(done + 1, steps.length)} of ${steps.length}`
    : null;
  return { line: cardLine(t), sub, progress: t.status === "in_progress" && !need && steps.length ? done / steps.length : null };
}

export function workHeadline(ws: Workspace, now = new Date()): string {
  const h = headline(ws, now);
  const parts = [h.building ? `${plural(h.building.workers, h.building.agentsOnly ? "agent" : "teammate")} building` : h.stopped ? `${plural(h.stopped, "ticket")} stopped` : "Nobody building", h.needs ? `${h.needs} waiting on you` : null];
  return `${parts.filter(Boolean).join(", ")}.`;
}

export function cardContext(ws: Workspace, t: Ticket, groupBy: "none" | "assignee" | "epic"): string | null {
  return groupBy === "epic" ? ws.nameOf(t.assignee_id) : groupBy === "assignee" ? epicOf(ws, t)?.title ?? null : null;
}
