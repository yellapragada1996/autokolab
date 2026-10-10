import { MERGE_OK_PREFIX, waitsForMergeOk, type Ticket, type TicketEvent } from "../lib/data";
import type { Workspace } from "./useWorkspace";

// The Overview's plain-English story, worked out from the board without any AI: the headline,
// each goal's progress, what a person is asked to do, and activity as sentences.

const isOpen = (t: Ticket) => t.status !== "done" && t.status !== "canceled";

/** The epic a ticket belongs to, following parents up (an epic is its own goal). */
export function epicOf(ws: Workspace, t: Ticket): Ticket | undefined {
  let cur: Ticket | undefined = t.parent_id ? ws.byId.get(t.parent_id) : undefined;
  for (let i = 0; cur && i < 10; i++) {
    if (cur.type === "epic") return cur;
    cur = cur.parent_id ? ws.byId.get(cur.parent_id) : undefined;
  }
  return undefined;
}

export interface Headline {
  /** Who is building what; null when nothing is in progress. */
  building: { workers: number; agentsOnly: boolean; epics: Ticket[]; tickets: number } | null;
  /** Tickets moved to Done since local midnight. */
  shipped: number;
  /** Open tickets with a question for a person or waiting for a merge OK. */
  needs: number;
}

export function headline(ws: Workspace, now = new Date()): Headline {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const work = ws.tickets.filter((t) => t.type !== "epic");
  const moving = work.filter((t) => t.status === "in_progress");
  const workers = new Set(moving.map((t) => t.assignee_id).filter((id): id is string => !!id));
  const epics: Ticket[] = [];
  for (const t of moving) {
    const e = epicOf(ws, t);
    if (e && !epics.includes(e)) epics.push(e);
  }
  return {
    building: moving.length ? { workers: workers.size, agentsOnly: [...workers].every((id) => !!ws.agentOf(id)), epics, tickets: moving.length } : null,
    shipped: work.filter((t) => t.status === "done" && t.completed_at && Date.parse(t.completed_at) >= midnight).length,
    needs: ws.tickets.filter((t) => isOpen(t) && (t.needs_human || waitsForMergeOk(t))).length,
  };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type GoalState = "waiting" | "moving" | "not_started" | "paused" | "done";

export const goalStateText: Record<GoalState, { label: string; color: string }> = {
  waiting: { label: "Waiting on you", color: "var(--warn)" },
  moving: { label: "Moving", color: "var(--ok)" },
  not_started: { label: "Not started", color: "var(--faint)" },
  paused: { label: "Paused", color: "var(--muted)" },
  done: { label: "Done", color: "var(--muted)" },
};

export interface Goal {
  /** The epic, or null for "Other work" (tickets with no epic). */
  epic: Ticket | null;
  done: number;
  total: number;
  /** Assignees of the goal's unfinished tickets, people and agents. */
  who: string[];
  state: GoalState;
}

function goalOf(epic: Ticket | null, children: Ticket[]): Goal {
  const counted = children.filter((t) => t.status !== "canceled");
  const open = counted.filter(isOpen);
  const done = counted.length - open.length;
  const who = [...new Set(open.map((t) => t.assignee_id).filter((id): id is string => !!id))];
  const state: GoalState = open.some((t) => t.needs_human || waitsForMergeOk(t))
    ? "waiting"
    : open.some((t) => t.status === "in_progress" || t.status === "review")
      ? "moving"
      : counted.length && !open.length
        ? "done"
        : done
          ? "paused"
          : "not_started";
  return { epic, done, total: counted.length, who, state };
}

const ORDER: GoalState[] = ["waiting", "moving", "paused", "not_started", "done"];

/** Open epics with their progress, most urgent first, then "Other work" if it has anything open. */
export function goals(ws: Workspace): Goal[] {
  const groups = new Map<string | null, Ticket[]>();
  for (const t of ws.tickets) {
    if (t.type === "epic") continue;
    const id = epicOf(ws, t)?.id ?? null;
    groups.set(id, [...(groups.get(id) ?? []), t]);
  }
  const out = ws.tickets
    .filter((t) => t.type === "epic" && isOpen(t))
    .map((e) => goalOf(e, groups.get(e.id) ?? []))
    .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.epic!.sort_order - b.epic!.sort_order);
  const other = goalOf(null, groups.get(null) ?? []);
  if (other.total > other.done) out.push(other);
  return out;
}

/** What a person is asked to do about a ticket in Needs you, in plain words. */
export function actionFor(t: Ticket): string {
  if (waitsForMergeOk(t)) return "OK a risky merge";
  if (t.needs_human) return "Answer a question";
  return t.pr_url ? "Review a PR" : "Review the work";
}

/**
 * One activity event as a sentence around the ticket key: "merged" SH-5 "(auto-merge)".
 * Runner bookkeeping (steps, branches, approvals reset by a new PR, self-assignment) is null.
 */
export function activity(ws: Workspace, e: TicketEvent, t: Ticket): { verb: string; after?: string } | null {
  const d = e.data as Record<string, string | null | undefined>;
  const agent = !!(e.actor_id && ws.agentOf(e.actor_id));
  switch (e.kind) {
    case "created":
      return { verb: t.type === "epic" ? "set up the goal" : "created" };
    case "status":
      switch (d.to) {
        case "in_progress":
          return d.from === "review" ? { verb: "took back", after: "for more work" } : { verb: "started on" };
        case "review":
          return { verb: "sent", after: "for review" };
        case "done":
          if (d.from === "review" && t.pr_url) return { verb: "merged", after: agent ? "(auto-merge)" : undefined };
          return { verb: "finished" };
        case "canceled":
          return { verb: "canceled" };
        case "ready":
          return { verb: "made", after: "ready for an agent" };
        case "backlog":
          return { verb: "moved", after: "to the backlog" };
        default:
          return null;
      }
    case "assignee":
      if (!d.to) return { verb: "unassigned" };
      return d.to === e.actor_id ? null : { verb: "gave", after: `to ${ws.nameOf(d.to)}` };
    case "priority":
      return { verb: "set", after: `to ${d.to} priority` };
    case "title":
      return { verb: "renamed" };
    case "pr":
      return { verb: "opened a pull request for" };
    case "needs_human":
      return d.note?.startsWith(MERGE_OK_PREFIX) ? { verb: "asked for an OK to merge" } : { verb: "asked a question on" };
    case "comment":
      return { verb: "commented on" };
    case "approval":
      return d.to ? { verb: "approved" } : d.reason === "pr_changed" ? null : { verb: "withdrew the approval on" };
    case "merge_ok":
      return d.by ? { verb: "OK'd the merge of" } : null;
    default:
      return null;
  }
}
