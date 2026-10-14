import { LEAD_BUILT_QUESTION, MERGE_OK_PREFIX, waitsForMergeOk, type Decision, type Ticket } from "../lib/data";
import { isBookkeeping, problemOf, type RoomMessage } from "../lib/room";
import { waitsForApproval } from "./approve";
import { agentDot, epicOf, goals as storyGoals, headline, plural } from "./story";
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
  /** Captain's message is an answer (question_close posts one in its own question's thread to close it). */
  answer?: boolean;
}

/**
 * A person's conversation with Captain: the room's messages between the two of them, oldest first.
 * Captain is the project's lead agent; its member id is the project's lead_agent_id.
 * A reply the person writes in one of those threads belongs too, whoever it was addressed to:
 * otherwise an answer given in the Room would leave Captain's question open forever.
 */
export function conversation(messages: RoomMessage[], meId: string | null | undefined, captainId: string | null | undefined): Turn[] {
  if (!meId || !captainId) return [];
  const between = (m: RoomMessage) => (m.sender_id === meId && m.to_id === captainId) || (m.sender_id === captainId && m.to_id === meId);
  const threads = new Set(messages.filter(between).map((m) => m.thread_id ?? m.id));
  return messages
    .filter((m) => between(m) || (m.sender_id === meId && m.thread_id !== null && threads.has(m.thread_id)))
    .sort((a, b) => a.id - b.id)
    .map((m) => {
      const base = { id: m.id, at: m.created_at, body: m.body, thread: m.thread_id ?? m.id };
      if (m.sender_id === meId) return { ...base, kind: "you" as const };
      if (isBookkeeping(m.body)) return { ...base, kind: "bookkeeping" as const };
      const problem = problemOf(m.body);
      if (problem) return { ...base, kind: "problem" as const, problem };
      if (m.kind === "answer") return { ...base, kind: "captain" as const, answer: true };
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

const repliedTo = (turns: Turn[], q: Turn) => turns.find((t) => t.kind === "you" && t.thread === q.thread && t.id > q.id);
const closedBy = (turns: Turn[], q: Turn) => turns.find((t) => t.answer && t.thread === q.thread && t.id > q.id);

/**
 * Captain's questions still open: nothing from the person later in the same thread, and no later
 * answer from Captain there (question_close: Captain closing what it asked).
 */
export function openQuestions(turns: Turn[]): Turn[] {
  return turns.filter((q) => q.kind === "question" && !repliedTo(turns, q) && !closedBy(turns, q));
}

const KEY_IN_TEXT = /\b[A-Z][A-Z0-9]*-\d+\b/g;

/** The board's tickets a message names by key, in the order it names them. Keys that aren't tickets (DEC-17) are left out. */
export function ticketsIn(ws: Workspace, body: string): Ticket[] {
  const found = [...new Set(body.match(KEY_IN_TEXT) ?? [])].map((k) => ws.byKey.get(k));
  return found.filter((t): t is Ticket => !!t && t.type !== "epic");
}

const ABOUT_MERGE = /\b(merg\w*|approv\w*)\b/i;
const after = (at: string | null | undefined, since: string) => !!at && Date.parse(at) > Date.parse(since);

/** How a ticket a question named was settled after it was asked, or null while it's still open. */
function settledHow(t: Ticket, q: Turn, aboutMerge: boolean): string | null {
  if (t.status === "done") return aboutMerge ? "merged" : "finished";
  if (t.status === "canceled") return "canceled";
  if (aboutMerge && after(t.merge_ok_at, q.at)) return "OK'd to merge";
  if (aboutMerge && after(t.approved_at, q.at)) return "approved";
  return null;
}

/**
 * Captain's questions that closed without the person (by question id): what happened, for the quiet
 * line "Settled without you · …". A question closes this way when Captain answered it itself in its
 * thread, or when every ticket it names is Done or Canceled (or, for a question about a merge or an
 * approval, was approved or OK'd since it was asked). A question that names no ticket closes only by
 * a reply, as before; one the person replied to is theirs, not settled.
 */
export function settledWithoutYou(ws: Workspace, turns: Turn[]): Map<number, string> {
  const out = new Map<number, string>();
  const closings = captainClosings(turns);
  for (const q of turns) {
    if (q.kind !== "question" || repliedTo(turns, q)) continue;
    const answer = closings.get(q.id);
    if (answer) {
      out.set(q.id, shownUnder(answer) ? answer.body.trim().replace(/[.\s]+$/, "") : ANSWERED_BELOW);
      continue;
    }
    const mentioned = ticketsIn(ws, q.body);
    if (!mentioned.length) continue;
    const aboutMerge = ABOUT_MERGE.test(q.body);
    const how = mentioned.map((t) => settledHow(t, q, aboutMerge));
    if (how.some((h) => !h)) continue;
    const same = how.every((h) => h === how[0]);
    out.set(q.id, same ? `${keyList(mentioned.map((t) => t.key))} ${mentioned.length === 1 ? "was" : "were"} ${how[0]}` : mentioned.map((t, i) => `${t.key} was ${how[i]}`).join(", "));
  }
  return out;
}

const keyList = (ks: string[]) => (ks.length === 1 ? ks[0] : `${ks.slice(0, -1).join(", ")} and ${ks[ks.length - 1]}`);

/** "Settled without you · AK-90 was merged" */
export const settledLine = (what: string) => `Settled without you · ${what}`;

/** The settled line when Captain's closing answer is too long to sit under the question: it stays its own message. */
export const ANSWERED_BELOW = "Captain answered below";

/**
 * The answer that closed each of Captain's questions the person didn't reply to (by question id):
 * the first answer from Captain later in the question's thread. One the person replied to is theirs,
 * so whatever Captain said there stays an ordinary message.
 */
function captainClosings(turns: Turn[]): Map<number, Turn> {
  const out = new Map<number, Turn>();
  for (const q of turns) {
    if (q.kind !== "question" || repliedTo(turns, q)) continue;
    const answer = closedBy(turns, q);
    if (answer) out.set(q.id, answer);
  }
  return out;
}

/** A one-line answer is shown whole under the question it closed; a longer one stays its own message. */
const shownUnder = (answer: Turn) => !answer.body.trim().includes("\n");

/**
 * The ids of Captain's answers shown whole under the question they closed (settledWithoutYou), so
 * they aren't shown twice. Exactly those: every other answer of Captain's stays an ordinary message.
 */
export function closingAnswers(turns: Turn[]): Set<number> {
  return new Set([...captainClosings(turns).values()].filter(shownUnder).map((a) => a.id));
}

// ------------------------------------------------------------------ plans (CON-23)

/** What a plan message's ```autokolab-plan block says. `text` is the message without the block. */
export interface PlanBlock {
  goals: string[];
  asks: string[];
  not: string | null;
  text: string;
}

const PLAN_FENCE = /```[ \t]*autokolab-plan\b/gi;
const TICKET_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

/** Where the last ```autokolab-plan block starts and ends (to the end of the message when it isn't closed). */
function planBlockAt(body: string): { start: number; end: number; inner: string } | null {
  const opens = [...body.matchAll(PLAN_FENCE)];
  const open = opens[opens.length - 1];
  if (!open) return null;
  const from = open.index! + open[0].length;
  const close = body.indexOf("```", from);
  const end = close < 0 ? body.length : close + 3;
  return { start: open.index!, end, inner: body.slice(from, close < 0 ? body.length : close) };
}

/** A message without its plan block, even a broken one: a person never sees the raw block. */
export function withoutPlan(body: string): string {
  const b = planBlockAt(body);
  return b ? `${body.slice(0, b.start).trimEnd()}\n\n${body.slice(b.end).trim()}`.trim() : body;
}

const keys = (value: string | undefined) => [...new Set((value ?? "").split(/[\s,]+/).map((k) => k.trim().toUpperCase()).filter((k) => TICKET_KEY.test(k)))];

/**
 * The plan in a Captain message (CON-23): the ```autokolab-plan block, one `name: value` line per
 * field. Tolerant of spacing, case and a trailing newline. Null when there's no block or it names no
 * valid goal key: then it's an ordinary message (show it with withoutPlan).
 */
export function parsePlan(body: string): PlanBlock | null {
  const b = planBlockAt(body);
  if (!b) return null;
  const fields = new Map<string, string>();
  for (const line of b.inner.split(/\r?\n/)) {
    const m = /^\s*([a-z]+)\s*:(.*)$/i.exec(line);
    if (m && !fields.has(m[1].toLowerCase())) fields.set(m[1].toLowerCase(), m[2].trim());
  }
  const goals = keys(fields.get("goals"));
  if (!goals.length) return null;
  return { goals, asks: keys(fields.get("asks")), not: fields.get("not") || null, text: withoutPlan(body) };
}

export type PlanStatus = "pending" | "started" | "changes_asked" | "replaced";

export interface PlanGoal {
  goal: Ticket;
  tickets: Ticket[];
}

/** A plan Captain proposed, resolved against the board. Its status comes from the record, never from the block. */
export interface Plan {
  turnId: number;
  thread: number;
  at: string;
  /** The message without the block. */
  text: string;
  goals: PlanGoal[];
  tickets: Ticket[];
  /** The plan's tickets Captain expects to ask about. */
  asks: Ticket[];
  not: string | null;
  status: PlanStatus;
  /** When the person said "OK, start" in the plan's thread. */
  okAt: string | null;
  /** The person said "OK, start" themselves (not someone else, or a move on the board). */
  byYou: boolean;
  /** When the person last asked for changes. */
  changedAt: string | null;
}

export const OK_START = "OK, start";
const isOkStart = (body: string) => /^ok,?\s*start\.?$/i.test(body.trim());

/** Every plan in the conversation, oldest first: one per Captain message whose block names a known goal. */
export function plans(ws: Workspace, turns: Turn[]): Plan[] {
  const found: Plan[] = [];
  for (const turn of turns) {
    if (turn.kind !== "captain" && turn.kind !== "question") continue;
    const block = parsePlan(turn.body);
    if (!block) continue;
    const goals = block.goals
      .map((k) => ws.byKey.get(k))
      .filter((g): g is Ticket => !!g && g.type === "epic")
      .map((goal) => ({
        goal,
        tickets: ws.tickets.filter((t) => t.type !== "epic" && t.status !== "canceled" && epicOf(ws, t)?.id === goal.id).sort((a, b) => a.sort_order - b.sort_order),
      }));
    if (!goals.length) continue;
    const tickets = goals.flatMap((g) => g.tickets);
    const replies = turns.filter((t) => t.kind === "you" && t.thread === turn.thread && t.id > turn.id);
    const ok = replies.find((t) => isOkStart(t.body));
    const changes = replies.filter((t) => !isOkStart(t.body));
    const drafts = tickets.some((t) => t.status === "backlog");
    found.push({
      turnId: turn.id,
      thread: turn.thread,
      at: turn.at,
      text: block.text,
      goals,
      tickets,
      asks: block.asks.map((k) => tickets.find((t) => t.key === k)).filter((t): t is Ticket => !!t),
      not: block.not,
      status: tickets.length && !drafts ? "started" : changes.length && drafts ? "changes_asked" : "pending",
      okAt: ok?.at ?? null,
      byYou: !!ok,
      changedAt: changes[changes.length - 1]?.at ?? null,
    });
  }
  for (const p of found) {
    const ids = new Set(p.goals.map((g) => g.goal.id));
    if (found.some((later) => later.turnId > p.turnId && later.goals.some((g) => ids.has(g.goal.id)))) p.status = "replaced";
  }
  return found;
}

/** "Plan · 2 goals, 6 tickets", or "Plan · Google sign-in, 6 tickets" for one goal. */
export function planTitle(p: Plan): string {
  const size = plural(p.tickets.length, "ticket");
  return p.goals.length === 1 ? `Plan · ${p.goals[0].goal.title}, ${size}` : `Plan · ${plural(p.goals.length, "goal")}, ${size}`;
}

/** "You'll be asked 2 times", or null when Captain expects to ask nothing. */
export function planAsks(p: Plan): string | null {
  const n = p.asks.length;
  return n ? `You'll be asked ${n === 1 ? "once" : `${n} times`}` : null;
}

/** The newer plan that replaced this one: the first later plan sharing one of its goals. */
export function newerPlan(all: Plan[], p: Plan): Plan | null {
  const ids = new Set(p.goals.map((g) => g.goal.id));
  return all.find((later) => later.turnId > p.turnId && later.goals.some((g) => ids.has(g.goal.id))) ?? null;
}

/** The person's message a plan answers: the root of its thread, when they wrote it. */
export const planRequest = (p: Plan, turns: Turn[]): Turn | null => turns.find((t) => t.id === p.thread && t.kind === "you") ?? null;

/**
 * Tickets in an order that respects blockers: a ticket comes after every ticket in the list it waits
 * for; ties go by board order. A loop of blockers can't be ordered, so what's left goes last in board order.
 */
export function planOrder(ws: Workspace, tickets: Ticket[]): Ticket[] {
  const inList = new Set(tickets.map((t) => t.id));
  const byBoard = [...tickets].sort((a, b) => a.sort_order - b.sort_order);
  const waits = new Map(tickets.map((t) => [t.id, ws.blockersOf(t.id).filter((b) => inList.has(b.id) && b.id !== t.id).map((b) => b.id)]));
  const out: Ticket[] = [];
  const placed = new Set<string>();
  while (out.length < byBoard.length) {
    const next = byBoard.find((t) => !placed.has(t.id) && waits.get(t.id)!.every((id) => placed.has(id))) ?? byBoard.find((t) => !placed.has(t.id))!;
    out.push(next);
    placed.add(next.id);
  }
  return out;
}

/** "after “Store wishlists”" and "after “A” and “B”": what a ticket still waits for, or null when nothing. */
export function waitsFor(ws: Workspace, t: Ticket): string | null {
  const open = ws.blockersOf(t.id).filter((b) => b.id !== t.id && b.status !== "done" && b.status !== "canceled");
  if (!open.length) return null;
  const names = open.map((b) => named(b.title));
  return `after ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}`;
}

// ------------------------------------------------------------------ needs you

export type NeedKind = "risky_merge" | "approval" | "ticket_question" | "captain_question" | "plan" | "problem";

/** One thing that needs a person. Amber on screen means exactly this list, and nothing else. */
export interface Need {
  key: string;
  kind: NeedKind;
  /** What the person is asked to do, in plain words. */
  action: string;
  question: string;
  ticket: Ticket | null;
  /**
   * The message to answer in, for a question Captain asked directly. For a ticket's need, Captain's
   * newest open question about the same ticket: the two are one request, shown where Captain asked.
   */
  turnId: number | null;
  since: string;
  /** Captain's own words about a ticket's need, when its question said more than the ticket's "Needs you". */
  said?: string;
}

const ACTION: Record<NeedKind, string> = {
  risky_merge: "OK a risky merge",
  approval: "Approve a change",
  ticket_question: "Answer a question",
  captain_question: "Answer a question",
  plan: "OK a plan",
  problem: "Look at a problem",
};

// What a runner writes in "Needs you" when a run or a merge went wrong (packages/autokolab/src/runner).
export const RUNNER_PROBLEM = /^(I stopped|I couldn't start|I'm blocked|Couldn't merge|Can't check the PR|No automatic tests ran|Agents have gone back and forth)/;

const isOpen = (t: Ticket) => t.status !== "done" && t.status !== "canceled";

/**
 * Everything waiting on a person, longest-waiting first, each request once (AK-100). The Captain
 * page, Overview and the sidebar badge all count this one list.
 *
 * - A ticket's "Needs you" stops counting once the ticket is Done or Canceled, whatever it still says.
 * - Captain's questions that were settled without the person (settledWithoutYou) don't count.
 * - Captain's open questions that name exactly one ticket are about that ticket: the newest one
 *   stands for all of them, and when the ticket itself needs the person, the two are one item (the
 *   ticket's), shown where Captain asked. A question naming several tickets, or none, stays its own
 *   item: when it isn't clear two requests are the same, both show.
 */
export function needsYou(ws: Workspace, turns: Turn[]): Need[] {
  const all = gatherNeeds(ws, turns);
  const settled = settledWithoutYou(ws, turns);
  const asks = all.filter((n) => n.kind === "captain_question" && !settled.has(n.turnId!));
  const rest = all.filter((n) => n.kind !== "captain_question");
  const about = new Map<string, Need[]>();
  const out: Need[] = [];
  for (const q of asks) {
    const turn = turns.find((t) => t.id === q.turnId)!;
    const named = ticketsIn(ws, turn.body);
    if (named.length !== 1) out.push(q);
    else about.set(named[0].id, [...(about.get(named[0].id) ?? []), q]);
  }
  for (const n of rest) {
    const qs = n.ticket ? about.get(n.ticket.id) : undefined;
    if (!qs) {
      out.push(n);
      continue;
    }
    about.delete(n.ticket!.id);
    const newest = qs[qs.length - 1];
    const fuller = newest.question.trim().length > n.question.trim().length;
    out.push({ ...n, turnId: newest.turnId, since: newest.since, ...(fuller ? { said: newest.question } : {}) });
  }
  for (const qs of about.values()) out.push(qs[qs.length - 1]);
  return out.sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

/** Every request, before de-duplication. */
function gatherNeeds(ws: Workspace, turns: Turn[]): Need[] {
  const out: Need[] = [];
  for (const t of ws.tickets) {
    if (!isOpen(t) || !t.needs_human) continue;
    if (waitsForMergeOk(t)) {
      out.push({ key: `merge:${t.id}`, kind: "risky_merge", action: ACTION.risky_merge, question: t.needs_human.slice(MERGE_OK_PREFIX.length).trim(), ticket: t, turnId: null, since: t.updated_at });
    } else if (t.needs_human.startsWith(MERGE_OK_PREFIX)) {
      continue; // already OK'd: it merges by itself now
    } else if (waitsForApproval(t)) {
      out.push({ key: `approve:${t.id}`, kind: "approval", action: ACTION.approval, question: t.needs_human, ticket: t, turnId: null, since: t.updated_at });
    } else {
      const kind: NeedKind = RUNNER_PROBLEM.test(t.needs_human) ? "problem" : "ticket_question";
      out.push({ key: `ticket:${t.id}`, kind, action: ACTION[kind], question: t.needs_human, ticket: t, turnId: null, since: t.updated_at });
    }
  }
  const ps = plans(ws, turns);
  for (const p of ps) {
    if (p.status === "pending") out.push({ key: `plan:${p.turnId}`, kind: "plan", action: ACTION.plan, question: planTitle(p), ticket: null, turnId: p.turnId, since: p.at });
  }
  // A plan is its own card, never also a question.
  const planned = new Set(ps.map((p) => p.turnId));
  for (const q of openQuestions(turns)) {
    if (planned.has(q.id)) continue;
    out.push({ key: `ask:${q.id}`, kind: "captain_question", action: ACTION.captain_question, question: withoutPlan(q.body), ticket: null, turnId: q.id, since: q.at });
  }
  return out.sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

// ------------------------------------------------------------------ the briefing

export interface AgentRow {
  agentId: string;
  name: string;
  /** A sentence fragment: "running the tests", or "working on “Google callback”" when the ticket has no steps. */
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

/**
 * A step label inside a sentence: "Running the tests" → "running the tests"; leaves "PR review"
 * and "OAuth callback" alone. For steps only: a ticket's title is a name, so it's quoted as written.
 */
export function lowerFirst(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const word = t.split(/\s+/)[0];
  return /[A-Z]/.test(word.slice(1)) ? t : t[0].toLowerCase() + t.slice(1);
}

/** A ticket's title inside a sentence, as written: “Add the sessions column”. */
export const named = (title: string) => `“${title.trim()}”`;

/** A goal's short name, for sentences: the part of its title before the first ":" ("Captain UX: one point of contact" → "Captain UX"). */
export function goalName(title: string): string {
  const short = title.split(":")[0].trim();
  return short || title.trim();
}

const be = (n: number) => (n === 1 ? "is" : "are");

function workClause(ws: Workspace): string {
  const h = headline(ws);
  const b = h.building;
  if (!b) return h.stopped ? `Nobody is working; ${plural(h.stopped, "ticket")} ${be(h.stopped)} stopped.` : "Everyone is idle.";
  const who = b.agentsOnly ? plural(b.workers, "agent") : plural(b.workers, "teammate");
  if (b.epics.length === 1) return `${who} ${be(b.workers)} building ${goalName(b.epics[0].title)}.`;
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
    const agent = ws.agentOf(t.assignee_id)!;
    const working = agentDot(agent) === "working";
    const steps = ws.steps.get(t.id) ?? [];
    const now = steps.findIndex((s) => s.status === "now");
    const done = steps.filter((s) => s.status === "done").length;
    rows.set(t.assignee_id!, {
      agentId: t.assignee_id!,
      name: ws.nameOf(t.assignee_id),
      doing: working ? (now >= 0 ? lowerFirst(steps[now].label) : `working on ${named(t.title)}`) : `stopped on ${named(t.title)}`,
      step: working && steps.length ? `${now >= 0 ? now + 1 : Math.min(done + 1, steps.length)} of ${steps.length}` : null,
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
  approval: (t) => `${t} is waiting for an approval`,
  ticket_question: (t) => `${t} is waiting on your answer`,
  captain_question: () => "my question is waiting on your answer",
  plan: () => "my plan is waiting on your OK",
  problem: (t) => `${t} needs a look`,
};

/** What Captain does next, from the record: what waits on the person, then its next review. */
function nextLine(ws: Workspace, needs: Need[]): string | null {
  const first = needs[0];
  const review = ws.tickets
    .filter((t) => t.type !== "epic" && t.status === "review" && t.pr_url && !t.approved_sha && !t.needs_human && t.assignee_id !== ws.project.lead_agent_id)
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))[0];
  const waiting = first ? WAITING[first.kind](first.ticket ? named(first.ticket.title) : "") : null;
  const reviewing = review ? `the review of ${named(review.title)}` : null;
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

// ------------------------------------------------------------------ today (Overview, DEC-24)

export interface Today {
  /** Tickets done since local midnight, newest first. */
  shipped: Ticket[];
  /** Tickets in review right now, the longest-waiting first. */
  inReview: Ticket[];
  /** Decisions recorded since local midnight that still stand, newest first. */
  decided: Decision[];
}

/** What happened today, counted from local midnight (not from the person's last visit, like the catch-up). */
export function today(ws: Workspace, now = new Date()): Today {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sinceMidnight = (at: string | null | undefined) => !!at && Date.parse(at) >= midnight;
  const newest = (a: string, b: string) => Date.parse(b) - Date.parse(a);
  return {
    shipped: ws.tickets.filter((t) => t.type !== "epic" && t.status === "done" && sinceMidnight(t.completed_at)).sort((a, b) => newest(a.completed_at!, b.completed_at!)),
    inReview: ws.tickets.filter((t) => t.type !== "epic" && t.status === "review").sort((a, b) => newest(b.updated_at, a.updated_at)),
    decided: ws.decisions.filter((d) => !d.superseded_by && sinceMidnight(d.created_at)).sort((a, b) => newest(a.created_at, b.created_at)),
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

/** The catch-up card's summary row: "3 shipped · 1 decided · 1 problem", leaving out zero counts. */
export function catchUpSummary(c: CatchUp): string {
  return [
    c.shipped.length ? `${c.shipped.length} shipped` : null,
    c.decided.length ? `${c.decided.length} decided` : null,
    c.problems.length ? plural(c.problems.length, "problem") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type CatchUpItem = CatchUpLine & { type: "shipped" | "decided" | "problem" };

/** Every catch-up line, oldest first, each marked with what kind of news it is. */
export function catchUpItems(c: CatchUp): CatchUpItem[] {
  return [
    ...c.shipped.map((l) => ({ ...l, type: "shipped" as const })),
    ...c.decided.map((l) => ({ ...l, type: "decided" as const })),
    ...c.problems.map((l) => ({ ...l, type: "problem" as const })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// ------------------------------------------------------------------ the timeline

/** One thing in the conversation, in time order: a row, a decision card, or Captain's catch-up. */
export type Entry = { kind: "row"; key: string; at: string; row: Row } | { kind: "card"; key: string; at: string; need: Need } | { kind: "catchup"; key: string; at: string };

const rowAt = (r: Row) => (r.kind === "fold" ? r.turns[0].at : r.at);

/**
 * The conversation as one timeline: the folded rows, with a card for each need at the time it
 * started waiting. A question Captain asked becomes its card in place; ticket needs are slotted in
 * by time without reordering the messages. The catch-up, when there is one, sits at the time it was
 * worked out: the newest message on arrival, with anything said after it below.
 */
export function timeline(rows: Row[], cards: Need[], catchUpAt?: string | null): Entry[] {
  const asked = new Map(cards.filter((n) => n.turnId !== null).map((n) => [n.turnId, n]));
  // Captain's questions and plans become their cards; either can be any message Captain wrote.
  const asks = (r: Row) => r.kind === "question" || r.kind === "captain";
  const out: Entry[] = rows.map((r) => {
    const need = asks(r) ? asked.get(r.id) : undefined;
    return need ? { kind: "card", key: need.key, at: rowAt(r), need } : { kind: "row", key: `${r.kind}:${r.id}`, at: rowAt(r), row: r };
  });
  const loose = cards.filter((n) => n.turnId === null || !rows.some((r) => asks(r) && r.id === n.turnId)).sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
  const slot = (entry: Entry) => {
    const i = out.findIndex((e) => Date.parse(e.at) > Date.parse(entry.at));
    if (i < 0) out.push(entry);
    else out.splice(i, 0, entry);
  };
  for (const need of loose) slot({ kind: "card", key: need.key, at: need.since, need });
  if (catchUpAt) slot({ kind: "catchup", key: "catchup", at: catchUpAt });
  return out;
}

/** The day divider above a message: "This morning", "This afternoon", "Yesterday", then the date. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return d.getHours() < 12 ? "This morning" : "This afternoon";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

/** A message's time: "8:40 am" (or "08:40" where clocks run on 24 hours). */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M$/i, (_, p: string) => ` ${p.toLowerCase()}m`);

/** "3 quiet updates" */
export const foldText = (n: number) => plural(n, "quiet update");

// ------------------------------------------------------------------ decision cards

/** What a card is about, after "Needs you · ". The ticket's key and title follow the ones ending in "on". */
export const NEED_WHAT: Record<NeedKind, string> = {
  risky_merge: "a risky merge on",
  approval: "a change to approve on",
  ticket_question: "a question on",
  captain_question: "my question",
  plan: "my plan",
  problem: "a problem on",
};

/**
 * The one question on a risky-merge card. Captain's review question when it recorded one; otherwise
 * the plain fallback (00-AMENDMENTS.md: "the question falls back to 'OK to merge this?'").
 */
export function mergeQuestion(need: Need): string {
  return need.ticket?.review?.question?.trim() || `OK to merge ${named(need.ticket?.title ?? "this")}?`;
}

/**
 * What makes a merge risky, from what the runner wrote after the prefix (runner/merge.ts
 * mergeOkQuestion): "<question> (<files>)", or the files alone. Null when there's nothing left.
 */
export function riskyPart(need: Need): string | null {
  const q = need.ticket?.review?.question?.trim();
  let s = need.question.trim();
  if (q && s.startsWith(q)) s = s.slice(q.length).trim().replace(/^\((.*)\)$/s, "$1").trim();
  return s || null;
}

/** The evidence chip on a risky-merge card, from facts on the ticket only: "Reviewed by Captain, built by Birch". */
export function mergeChip(ws: Workspace, t: Ticket): string | null {
  if (!t.approved_by || !t.assignee_id) return null;
  const who = (id: string) => (id === ws.project.lead_agent_id ? "Captain" : ws.nameOf(id));
  return `Reviewed by ${who(t.approved_by)}, built by ${who(t.assignee_id)}`;
}

// ------------------------------------------------------------------ messages (AK-69, DEC-24)

/** "I stopped: hit the 60-minute limit. Where it got to: …" → "lee-codex stopped: hit the 60-minute limit". */
function stoppedLine(text: string, name: string): string {
  const first = text.trim().split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, "");
  return first.replace(/^I'm\b/, `${name} is`).replace(/^I\b/, name);
}

/**
 * What Captain says for something that needs the person, as one or two short sentences. The
 * actions go under it. A question Captain asked itself is just its message; a plan's line is planLine.
 */
export function needText(need: Need, nameOf: (id: string | null) => string): string {
  const t = need.ticket;
  const key = t?.key ?? "it";
  // Captain asked about this ticket too and said more: its words, as it wrote them.
  if (need.said && (need.kind === "ticket_question" || need.kind === "problem")) return withoutPlan(need.said).trim();
  switch (need.kind) {
    case "risky_merge":
      return `${key} is ready and needs your OK. ${mergeQuestion(need)}`;
    case "approval":
      return need.question === LEAD_BUILT_QUESTION ? `${key} is ready. I built it, so someone else has to approve it.` : `${key} is waiting for an approval. ${need.question.trim()}`;
    case "ticket_question":
      return `${t?.assignee_id ? nameOf(t.assignee_id) : "Someone"} has a question on ${key}: ${need.question.trim()}`;
    case "problem":
      return `${stoppedLine(need.question, t?.assignee_id ? nameOf(t.assignee_id) : "The agent")} on ${key}.`;
    default:
      return need.question.trim();
  }
}

/** A run that went wrong, in Captain's words: "couldn't continue: session limit" → "I couldn't continue: session limit." */
export const problemText = (problem: string) => `I ${problem.trim().replace(/[.\s]+$/, "")}.`;

/** The plain line under a plan: "2 goals, 6 tickets. You'll be asked 2 times." */
export function planLine(p: Plan): string {
  const asks = planAsks(p);
  return `${plural(p.goals.length, "goal")}, ${plural(p.tickets.length, "ticket")}.${asks ? ` ${asks}.` : ""}`;
}

export type Answer = "yes" | "no" | "approved" | "answered" | "closed" | "dismissed";

/** The quiet line that replaces a message's actions once the person has answered it. */
export function answeredLine(answer: Answer, at: string): string {
  switch (answer) {
    case "yes":
      return `You said yes · ${clock(at)}`;
    case "no":
      return `You said no · ${clock(at)}`;
    case "approved":
      return `You approved it · ${clock(at)}`;
    case "answered":
      return `You answered · ${clock(at)}`;
    case "closed":
      return `No answer needed · ${clock(at)}`;
    case "dismissed":
      return "Dismissed";
  }
}

/** What "Not needed any more" posts in a question's thread; any reply there closes it (openQuestions). */
export const NO_ANSWER_NEEDED = "No answer needed.";

/**
 * What goes in Captain's question's thread when the person answers a ticket's need that is also
 * that question (needsYou shows them as one item), so the question closes with it instead of coming
 * back on its own. Null for anything else: a need that isn't also a question has no thread to close.
 */
export function closingReply(need: Need, answer: Answer, text = ""): string | null {
  if (!need.ticket || need.turnId === null) return null;
  const key = need.ticket.key;
  switch (answer) {
    case "yes":
      return `Yes, merge ${key}.`;
    case "approved":
      return `I approved ${key}.`;
    case "no":
      return `No on ${key}: ${text.trim()}`;
    case "answered":
      return text.trim() || null;
    case "closed":
    case "dismissed":
      return NO_ANSWER_NEEDED;
  }
}

/** Captain messages longer than this, in characters or non-blank lines, are shortened (Show more). */
export const SHORT_CHARS = 280;
export const SHORT_LINES = 4;

/**
 * The beginning of a long Captain message, or null when it's short enough to show whole. Cuts only
 * between words and never inside a code block (a block is shown whole or not at all, unless it's
 * the very first thing). The beginning ends with "…" when it stops mid-line.
 */
export function shortened(text: string, maxChars = SHORT_CHARS, maxLines = SHORT_LINES): string | null {
  const body = text.trim();
  const lines = body.split("\n");
  const counted = lines.filter((l) => l.trim()).length;
  if (body.length <= maxChars && counted <= maxLines) return null;
  const out: string[] = [];
  let chars = 0;
  let shown = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      let end = i + 1;
      while (end < lines.length && !/^\s*```/.test(lines[end])) end++;
      const block = lines.slice(i, end + 1);
      const size = block.join("\n").length;
      if (out.length && (chars + size > maxChars || shown + block.length > maxLines)) break;
      out.push(...block);
      chars += size + 1;
      shown += block.length;
      i = end;
      continue;
    }
    if (!line.trim()) {
      out.push(line);
      continue;
    }
    if (shown >= maxLines) break;
    if (chars + line.length > maxChars) {
      const room = maxChars - chars;
      const cut = line.slice(0, room + 1).lastIndexOf(" ");
      if (cut > 0) out.push(`${line.slice(0, cut).replace(/[\s,;:.-]+$/, "")}…`);
      else if (!out.some((l) => l.trim())) out.push(`${line.slice(0, Math.max(room, 1))}…`);
      break;
    }
    out.push(line);
    chars += line.length + 1;
    shown++;
  }
  const head = out.join("\n").trim();
  return head && head !== body ? head : null;
}

/** "Replying to: Postgres keeps us on one…": the first few words of the message being answered. */
export function replyPreview(text: string, words = 6): string {
  const plain = withoutPlan(text)
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/^@\S+\s+/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return plain.length > words ? `${plain.slice(0, words).join(" ")}…` : plain.join(" ");
}

// ------------------------------------------------------------------ look first (S04)

/**
 * What "Let me look first" shows for a ticket key: the question to answer, who already OK'd it, or
 * nothing to answer (no such ticket, or it isn't waiting for a merge OK). Built from the ticket alone,
 * so a refresh or a direct link lands in the same place.
 */
export type LookState = { kind: "ask"; need: Need } | { kind: "answered"; by: string | null; at: string } | { kind: "nothing"; why: "unknown" | "not_waiting" };

export function lookState(ws: Workspace, key: string): LookState {
  const t = ws.byKey.get(key.trim().toUpperCase());
  if (!t) return { kind: "nothing", why: "unknown" };
  if (t.merge_ok_at) return { kind: "answered", by: t.merge_ok_by ?? null, at: t.merge_ok_at };
  const need = needsYou(ws, []).find((n) => n.kind === "risky_merge" && n.ticket?.id === t.id);
  return need ? { kind: "ask", need } : { kind: "nothing", why: "not_waiting" };
}

/** The modal's title: Captain's plain-English summary of the change, else the ticket's title. */
export const lookTitle = (t: Ticket) => t.review?.summary?.trim() || t.title;

export interface LookChip {
  text: string;
  /** "verified" chips are facts checked by a reviewer; the rest are plain warnings. */
  tone: "verified" | "neutral";
  sha?: string;
}

/**
 * The chips under the line that matters, each only when it's true: who approved the exact commit,
 * and that it can't be undone automatically (anything that waits for a merge OK can't: 00-AMENDMENTS.md).
 */
export function lookChips(ws: Workspace, t: Ticket): LookChip[] {
  const chips: LookChip[] = [];
  const sha = t.approved_sha?.trim();
  if (sha && t.approved_by) {
    const who = t.approved_by === ws.project.lead_agent_id ? "Captain" : ws.nameOf(t.approved_by);
    chips.push({ text: `${who} approved this exact commit`, tone: "verified", sha: sha.slice(0, 7) });
  }
  if (t.needs_human?.startsWith(MERGE_OK_PREFIX) || t.merge_ok_at) chips.push({ text: "Can't be undone automatically", tone: "neutral" });
  return chips;
}

/** "Ana already OK'd this at 11:04 am.", or "You …" when it was this person; the day is added when it wasn't today. */
export function answeredText(ws: Workspace, by: string | null, at: string, me: string, now = new Date()): string {
  const who = !by ? "Someone" : by === me ? "You" : ws.nameOf(by);
  const d = new Date(at);
  const today = d.toDateString() === now.toDateString();
  const when = today ? clock(at) : `${d.toLocaleDateString([], { month: "long", day: "numeric" })}, ${clock(at)}`;
  return `${who} already OK'd this at ${when}.`;
}

/** The code block's lines, with additions marked so they show in green. */
export const codeLines = (code: string) => code.split("\n").map((text) => ({ text, added: text.startsWith("+") && !text.startsWith("+++") }));

/** Whose agent this is, for the hover on a "Who's doing what" row: "James's agent". */
export function ownerOf(ws: Workspace, agentId: string): string | null {
  const a = ws.agentOf(agentId);
  const name = a?.owner_profile_id ? ws.people.profiles.get(a.owner_profile_id)?.name : null;
  return name ? `${name}'s agent` : null;
}
