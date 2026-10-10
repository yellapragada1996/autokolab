import { MERGE_OK_PREFIX, waitsForMergeOk, type Ticket } from "../lib/data";
import { isBookkeeping, problemOf, type RoomMessage } from "../lib/room";
import { epicOf, goals as storyGoals, headline, plural } from "./story";
import type { Workspace } from "./useWorkspace";

// Captain home (DEC-22, autokolab-ux-handoff/screens/S01-captain-home.md): everything the screen
// shows, built from the record. Code writes the status sentences so they are instant, free and can't
// drift from the truth; Captain itself writes only its replies, plans, questions and review notes.
// Nothing here draws anything: the screen renders what these return.

// ------------------------------------------------------------------ the conversation

export type TurnKind = "you" | "captain" | "question" | "bookkeeping" | "problem";

/** One message between a person and Captain. */
export interface Turn {
  id: number;
  kind: TurnKind;
  at: string;
  body: string;
  /** The thread it belongs to: its root message's id. Answers to a question go in its thread. */
  thread: number;
  /** For a problem: the short plain line ("couldn't continue: session limit (resets 11:20pm Stockholm)"). */
  problem?: string;
}

/**
 * A person's conversation with Captain: the room's messages between the two of them, oldest first.
 * Captain is the project's lead agent; its member id is the project's lead_agent_id.
 */
export function conversation(messages: RoomMessage[], meId: string | null | undefined, captainId: string | null | undefined): Turn[] {
  if (!meId || !captainId) return [];
  return messages
    .filter((m) => (m.sender_id === meId && m.to_id === captainId) || (m.sender_id === captainId && m.to_id === meId))
    .sort((a, b) => a.id - b.id)
    .map((m) => {
      const base = { id: m.id, at: m.created_at, body: m.body, thread: m.thread_id ?? m.id };
      if (m.sender_id === meId) return { ...base, kind: "you" as const };
      if (isBookkeeping(m.body)) return { ...base, kind: "bookkeeping" as const };
      const problem = problemOf(m.body);
      if (problem) return { ...base, kind: "problem" as const, problem };
      return { ...base, kind: m.kind === "question" ? ("question" as const) : ("captain" as const) };
    });
}

export type Row = Turn | { kind: "fold"; id: number; turns: Turn[] };

/** The conversation with each run of bookkeeping folded into one row. Problems are never folded. */
export function folded(turns: Turn[]): Row[] {
  const rows: Row[] = [];
  for (const t of turns) {
    const last = rows[rows.length - 1];
    if (t.kind !== "bookkeeping") rows.push(t);
    else if (last?.kind === "fold") last.turns.push(t);
    else rows.push({ kind: "fold", id: t.id, turns: [t] });
  }
  return rows;
}

/** Captain's questions this person hasn't answered: nothing from them later in the same thread. */
export function openQuestions(turns: Turn[]): Turn[] {
  return turns.filter((q) => q.kind === "question" && !turns.some((t) => t.kind === "you" && t.thread === q.thread && t.id > q.id));
}

// ------------------------------------------------------------------ needs you

export type NeedKind = "risky_merge" | "ticket_question" | "captain_question" | "problem";

/** One thing that needs a person. Amber on screen means exactly this list, and nothing else. */
export interface Need {
  key: string;
  kind: NeedKind;
  /** What the person is asked to do, in plain words. */
  action: string;
  question: string;
  ticket: Ticket | null;
  /** The message to answer in, for a question Captain asked directly. */
  turnId: number | null;
  since: string;
}

const ACTION: Record<NeedKind, string> = {
  risky_merge: "OK a risky merge",
  ticket_question: "Answer a question",
  captain_question: "Answer a question",
  problem: "Look at a problem",
};

// What a runner writes in "Needs you" when a run or a merge went wrong (packages/autokolab/src/runner).
const RUNNER_PROBLEM = /^(I stopped|I couldn't start|I'm blocked|Couldn't merge|Can't check the PR|No automatic tests ran|Agents have gone back and forth)/;

const isOpen = (t: Ticket) => t.status !== "done" && t.status !== "canceled";

/** Everything waiting on a person, longest-waiting first. */
export function needsYou(ws: Workspace, turns: Turn[]): Need[] {
  const out: Need[] = [];
  for (const t of ws.tickets) {
    if (!isOpen(t) || !t.needs_human) continue;
    if (waitsForMergeOk(t)) {
      out.push({ key: `merge:${t.id}`, kind: "risky_merge", action: ACTION.risky_merge, question: t.needs_human.slice(MERGE_OK_PREFIX.length).trim(), ticket: t, turnId: null, since: t.updated_at });
    } else if (t.needs_human.startsWith(MERGE_OK_PREFIX)) {
      continue; // already OK'd: it merges by itself now
    } else {
      const kind: NeedKind = RUNNER_PROBLEM.test(t.needs_human) ? "problem" : "ticket_question";
      out.push({ key: `ticket:${t.id}`, kind, action: ACTION[kind], question: t.needs_human, ticket: t, turnId: null, since: t.updated_at });
    }
  }
  for (const q of openQuestions(turns)) {
    out.push({ key: `ask:${q.id}`, kind: "captain_question", action: ACTION.captain_question, question: q.body, ticket: null, turnId: q.id, since: q.at });
  }
  return out.sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

// ------------------------------------------------------------------ the briefing

export interface AgentRow {
  agentId: string;
  name: string;
  /** A lowercase sentence fragment: "running the tests", "working on the Google callback". */
  doing: string;
  /** "4 of 7", when the ticket has steps. */
  step: string | null;
  needsYou: boolean;
  ticket: Ticket;
}

export type Segment = "done" | "needs_you" | "building" | "todo";

export interface GoalRow {
  /** The goal's ticket id; null for work that belongs to no goal. */
  id: string | null;
  title: string;
  /** One segment per ticket, in board order. */
  segments: Segment[];
  done: number;
  total: number;
}

export interface Briefing {
  /** "3 agents are building Google sign-in." */
  work: string;
  /** "1 thing needs you." in amber, or "Nothing needs you." in green. */
  needs: { text: string; tone: "amber" | "green"; count: number };
  /** "Next from me: …", or null when there's nothing to say. */
  next: string | null;
  agents: AgentRow[];
  goals: GoalRow[];
}

/** "Running the tests" → "running the tests"; leaves "PR review" and "OAuth callback" alone. */
export function lowerFirst(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const word = t.split(/\s+/)[0];
  return /[A-Z]/.test(word.slice(1)) ? t : t[0].toLowerCase() + t.slice(1);
}

const be = (n: number) => (n === 1 ? "is" : "are");

function workClause(ws: Workspace): string {
  const b = headline(ws).building;
  if (!b) return "Everyone is idle.";
  if (!b.workers) return `${plural(b.tickets, "ticket")} ${be(b.tickets)} in progress.`;
  const who = b.agentsOnly ? plural(b.workers, "agent") : plural(b.workers, "teammate");
  if (b.epics.length === 1) return `${who} ${be(b.workers)} building ${b.epics[0].title}.`;
  if (b.epics.length > 1) return `${who} ${be(b.workers)} working on ${b.epics.length} goals.`;
  return `${who} ${be(b.workers)} working on ${plural(b.tickets, "ticket")}.`;
}

function agentRows(ws: Workspace): AgentRow[] {
  const rows = new Map<string, AgentRow>();
  const moving = ws.tickets
    .filter((t) => t.type !== "epic" && t.status === "in_progress" && t.assignee_id && ws.agentOf(t.assignee_id))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  for (const t of moving) {
    if (rows.has(t.assignee_id!)) continue;
    const steps = ws.steps.get(t.id) ?? [];
    const now = steps.findIndex((s) => s.status === "now");
    const done = steps.filter((s) => s.status === "done").length;
    rows.set(t.assignee_id!, {
      agentId: t.assignee_id!,
      name: ws.nameOf(t.assignee_id),
      doing: now >= 0 ? lowerFirst(steps[now].label) : `working on ${lowerFirst(t.title)}`,
      step: steps.length ? `${now >= 0 ? now + 1 : Math.min(done + 1, steps.length)} of ${steps.length}` : null,
      needsYou: !!t.needs_human,
      ticket: t,
    });
  }
  return [...rows.values()];
}

const segmentOf = (t: Ticket): Segment => (t.status === "done" ? "done" : t.needs_human ? "needs_you" : t.status === "in_progress" || t.status === "review" ? "building" : "todo");

function goalRows(ws: Workspace): GoalRow[] {
  return storyGoals(ws)
    .filter((g) => g.state !== "done")
    .map((g) => {
      const id = g.epic?.id ?? null;
      const children = ws.tickets
        .filter((t) => t.type !== "epic" && t.status !== "canceled" && (epicOf(ws, t)?.id ?? null) === id)
        .sort((a, b) => a.sort_order - b.sort_order);
      return { id, title: g.epic?.title ?? "Other work", segments: children.map(segmentOf), done: g.done, total: g.total };
    });
}

const WAITING: Record<NeedKind, (title: string) => string> = {
  risky_merge: (t) => `${t} is waiting on your OK`,
  ticket_question: (t) => `${t} is waiting on your answer`,
  captain_question: () => "my question is waiting on your answer",
  problem: (t) => `${t} needs a look`,
};

/** What Captain does next, from the record: what waits on the person, then its next review. */
function nextLine(ws: Workspace, needs: Need[]): string | null {
  const first = needs[0];
  const review = ws.tickets
    .filter((t) => t.type !== "epic" && t.status === "review" && t.pr_url && !t.approved_sha && !t.needs_human && t.assignee_id !== ws.project.lead_agent_id)
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))[0];
  const waiting = first ? WAITING[first.kind](first.ticket ? lowerFirst(first.ticket.title) : "") : null;
  const reviewing = review ? `the review of ${lowerFirst(review.title)}` : null;
  if (waiting && reviewing) return `Next from me: ${waiting}, then ${reviewing}.`;
  if (waiting) return `Next from me: ${waiting}.`;
  if (reviewing) return `Next from me: ${reviewing}.`;
  return null;
}

/** The pinned briefing: one sentence of state, what needs the person, and who's doing what on request. */
export function briefing(ws: Workspace, needs: Need[]): Briefing {
  const n = needs.length;
  return {
    work: workClause(ws),
    needs: n ? { text: `${plural(n, "thing")} ${n === 1 ? "needs" : "need"} you.`, tone: "amber", count: n } : { text: "Nothing needs you.", tone: "green", count: 0 },
    next: nextLine(ws, needs),
    agents: agentRows(ws),
    goals: goalRows(ws),
  };
}

// ------------------------------------------------------------------ the catch-up

export interface CatchUpLine {
  text: string;
  at: string;
  /** A ticket or decision key to open, when there is one. */
  ref?: string;
}

export interface CatchUp {
  awayMs: number;
  shipped: CatchUpLine[];
  decided: CatchUpLine[];
  problems: CatchUpLine[];
}

/** Shorter gaps than this get no catch-up: the person hardly left. */
export const CATCH_UP_AFTER_MS = 30 * 60_000;

/**
 * What happened since the person last caught up (handoff journey J2: counted from their last visit,
 * not from midnight). Null on a first visit or after a short gap.
 */
export function catchUp(ws: Workspace, messages: RoomMessage[], since: string | null | undefined, nameOf: (memberId: string) => string, now = new Date()): CatchUp | null {
  if (!since) return null;
  const from = Date.parse(since);
  const awayMs = now.getTime() - from;
  if (!(awayMs >= CATCH_UP_AFTER_MS)) return null;
  const after = (at: string | null | undefined) => !!at && Date.parse(at) > from;
  const byTime = (a: CatchUpLine, b: CatchUpLine) => Date.parse(a.at) - Date.parse(b.at);
  return {
    awayMs,
    shipped: ws.tickets
      .filter((t) => t.type !== "epic" && t.status === "done" && after(t.completed_at))
      .map((t) => ({ text: t.summary?.trim() || t.title, at: t.completed_at!, ref: t.key }))
      .sort(byTime),
    decided: ws.decisions
      .filter((d) => !d.superseded_by && after(d.created_at))
      .map((d) => ({ text: d.title, at: d.created_at, ref: d.key }))
      .sort(byTime),
    problems: messages
      .filter((m) => after(m.created_at) && problemOf(m.body))
      .map((m) => ({ text: `${nameOf(m.sender_id)} ${problemOf(m.body)}`, at: m.created_at }))
      .sort(byTime),
  };
}

/** "9 h", "45 min", "2 days". */
export function awayText(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

/** Captain's return message, as one or two plain sentences. */
export function catchUpText(c: CatchUp, needs: number): string {
  const parts = [
    c.shipped.length ? `${plural(c.shipped.length, "thing")} shipped` : null,
    c.decided.length ? `${plural(c.decided.length, "decision")} ${c.decided.length === 1 ? "was" : "were"} recorded` : null,
    c.problems.length ? `${plural(c.problems.length, "problem")} came up` : null,
  ].filter((p): p is string => !!p);
  const away = `While you were away (${awayText(c.awayMs)})`;
  if (!parts.length) return needs ? `${away} nothing shipped.` : "Quiet. Nothing shipped and nothing needs you.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${away} ${list}.`;
}
