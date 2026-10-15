import { statusHere } from "./agentStatus";
export { statusHere } from "./agentStatus";
import { MERGE_OK_PREFIX, type Agent, type Ticket, type TicketEvent } from "../lib/data";
import { localTime } from "../lib/place";
import { awayText, catchUpItems, clock, goalName, named, RUNNER_PROBLEM, type CatchUp, type Need, type Plan } from "./captain";
import { agentDot, agentOnline, epicOf, plural } from "./story";
import type { Workspace } from "./useWorkspace";

// Overview (AK-75): what an owner wants to know, at the level of features, never tickets. A feature
// is a goal (an epic); its parts are its tickets. Every sentence is built here from the record, with
// a fallback for goals and tickets written before Captain wrote plain summaries (AK-74). Nothing here
// draws anything, and no ticket key ever ends up in a sentence: keys only go in `key` fields, which
// the page shows as hover text at most.

export type State = "working" | "waiting" | "paused" | "idle";

export const STATE_WORD: Record<State, string> = { working: "Working", waiting: "Waiting on you", paused: "Paused", idle: "Idle" };

/** A person counts as online if they were seen within the last five minutes, like an agent. */
const ONLINE_MS = 5 * 60_000;

/** The name of the card for work that belongs to no feature. */
export const FIXES = "Fixes and upkeep";

const isWork = (t: Ticket) => t.type !== "epic" && t.status !== "canceled";
const isOpen = (t: Ticket) => t.status !== "done" && t.status !== "canceled";
const listed = (names: string[]) => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

// ------------------------------------------------------------------ plain words

/** A ticket summary that reads as a "-ing" phrase: starts with a lowercase word ending in "ing" ("adding Apple Pay"). */
export const isPhrase = (s: string | null | undefined): s is string => !!s && /^[a-z][a-z'’-]*ing\b/.test(s.trim());

/** The feature a ticket belongs to, by name; null when it belongs to none. */
export function featureName(ws: Workspace, t: Ticket): string | null {
  const e = t.type === "epic" ? t : epicOf(ws, t);
  return e ? goalName(e.title) : null;
}

/** What is being done on a ticket, in plain words: its summary when that reads as a phrase, else "working on <feature>", else its title in quotes. */
export function plainPhrase(ws: Workspace, t: Ticket): string {
  if (isPhrase(t.summary)) return t.summary.trim().replace(/[.\s]+$/, "");
  const f = featureName(ws, t);
  return f ? `working on ${f}` : `working on ${named(t.title)}`;
}

/** A part's line on an opened card: its outcome once done, its phrase while being built, else its title. */
export function partLine(t: Ticket): string {
  const s = t.summary?.trim();
  if (s && (t.status === "done" || isPhrase(s))) return s[0].toUpperCase() + s.slice(1).replace(/\.$/, "");
  return t.title.trim();
}

/** A goal's outcome sentence: its summary, else a short plain first paragraph of its description, else null. */
export function outcomeOf(epic: Ticket): string | null {
  const s = epic.summary?.trim();
  if (s) return s;
  const first = epic.description.trim().split(/\n\s*\n/)[0]?.trim() ?? "";
  return first && first.length <= 160 && !/[\n#*`>|]/.test(first) && !/^[-+]\s/.test(first) ? first : null;
}

/**
 * Text written by a runner or an agent with ticket keys swapped for the tickets' titles in quotes:
 * "SH-3 needs the table from SH-4" → "“Remember me” needs the table from “Pick the store”". Unknown keys stay.
 */
export function withoutKeys(ws: Workspace, text: string): string {
  return text.replace(/\b[A-Z][A-Z0-9]*-\d+\b/g, (k) => {
    const t = ws.byKey.get(k);
    return t ? named(t.title) : k;
  });
}

/** The catch-up's lines as Overview shows them, with no ticket keys. */
export const sinceItems = (ws: Workspace, c: CatchUp) => catchUpItems(c).map((i) => ({ ...i, text: withoutKeys(ws, i.text) }));

/** Whose name to show: Captain for the project's lead agent. */
export const whoName = (ws: Workspace, id: string) => (id === ws.project.lead_agent_id ? "Captain" : ws.nameOf(id));

/**
 * When an agent waiting out a limit resumes, from its status note: "Waiting for my usage limit to
 * reset, about 5:40 am (Europe/Stockholm)" or "resets 11:20pm (Europe/Stockholm)". The clock time is
 * in the agent's own time zone; this finds its next occurrence after `now`. Null when the note has none.
 */
export function resumeAt(note: string | null | undefined, now: Date): Date | null {
  const m = /\b(?:about|resets?|until)\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*(?:\(([^)]+)\))?/i.exec(note ?? "");
  if (!m) return null;
  const h12 = Number(m[1]);
  const minute = Number(m[2] ?? "0");
  if (h12 < 1 || h12 > 12 || minute > 59) return null;
  const hour = (h12 % 12) + (m[3].toLowerCase() === "p" ? 12 : 0);
  const zone = m[4]?.trim();
  let offset = 0;
  const base = Math.floor(now.getTime() / 60_000) * 60_000;
  let y = now.getFullYear(), mo = now.getMonth(), d = now.getDate();
  if (zone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
      [y, mo, d] = [get("year"), get("month") - 1, get("day")];
      offset = Date.UTC(y, mo, d, get("hour") % 24, get("minute")) - base;
    } catch {
      return null;
    }
    let t = Date.UTC(y, mo, d, hour, minute) - offset;
    if (t <= now.getTime()) t += 86_400_000;
    return new Date(t);
  }
  const local = new Date(y, mo, d, hour, minute);
  if (local.getTime() <= now.getTime()) local.setDate(local.getDate() + 1);
  return local;
}

/** "5:40 am", for "resumes about 5:40 am by itself". */
export const aboutTime = (at: Date) => `about ${clock(at.toISOString())}`;

/** Why a run stopped, from what the runner wrote in Needs you: "I stopped: hit the 60-minute limit. Where…" → "hit the 60-minute limit". */
export function stopReason(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, "");
  return first.replace(/^I stopped:\s*/i, "").replace(/^I\s+/, "").trim();
}

// ------------------------------------------------------------------ who is doing what

interface Running {
  agent: Agent;
  ticket: Ticket | null;
  running: boolean;
}

/** What an agent is on: the ticket its runner reported, else its most recently moved In progress ticket. */
function agentTicket(ws: Workspace, a: Agent, now = new Date()): Ticket | null {
  const scoped = statusHere(a, ws.project.id, ws.byId, now);
  if (scoped.elsewhere) return null;
  a = scoped;
  const cur = a.current_ticket_id ? ws.byId.get(a.current_ticket_id) : undefined;
  if (cur && isWork(cur) && isOpen(cur)) return cur;
  return (
    ws.tickets
      .filter((t) => isWork(t) && t.status === "in_progress" && t.assignee_id === a.id)
      .sort((x, y) => Date.parse(y.updated_at) - Date.parse(x.updated_at))[0] ?? null
  );
}

function agentsAt(ws: Workspace, now: Date): Running[] {
  return [...ws.people.agents.values()].map((a) => {
    const agent = statusHere(a, ws.project.id, ws.byId, now);
    return { agent, ticket: agent.elsewhere ? null : agentTicket(ws, a, now), running: !agent.elsewhere && agentDot(agent, now) === "working" };
  });
}

/** Tickets someone is on right now: an agent running on it, or a person holding it In progress. */
function activeTickets(ws: Workspace, now: Date): Set<string> {
  const ids = new Set<string>();
  for (const r of agentsAt(ws, now)) if (r.running && r.ticket) ids.add(r.ticket.id);
  for (const t of ws.tickets) if (isWork(t) && t.status === "in_progress" && t.assignee_type === "human" && t.assignee_id) ids.add(t.id);
  return ids;
}

/** A question for a person on a ticket, as opposed to a runner's problem or a merge OK. */
const asksPerson = (t: Ticket) => !!t.needs_human && !RUNNER_PROBLEM.test(t.needs_human) && !t.needs_human.startsWith(MERGE_OK_PREFIX);

export type RowKind = "running" | "reviewing" | "stopped" | "waiting";

export interface AgentRow {
  agentId: string;
  /** "builder", or "Captain" for the lead. Drawn in bold before `doing`. */
  name: string;
  kind: RowKind;
  /** The rest of the sentence: "is adding Apple Pay to the checkout". */
  doing: string;
  /** The small line under it: "Checkout · step 3 of 5 · tests passed · 12 min". */
  detail: string;
  /** The same line in parts, for layouts that show them separately. */
  feature: string;
  notes: string[];
  held: string;
  since: string;
  /** For hover text and opening the work; never drawn as text. */
  key: string;
}

/** One row per agent that is running, stopped or waiting, most recent first. */
export function agentRows(ws: Workspace, now: Date): AgentRow[] {
  const rows: AgentRow[] = [];
  for (const { agent: a, ticket: t, running } of agentsAt(ws, now)) {
    if (!t) continue;
    const name = whoName(ws, a.id);
    const feature = featureName(ws, t);
    const extra: string[] = [];
    let kind: RowKind;
    let doing: string;
    let since = t.updated_at;
    if (running && a.id === ws.project.lead_agent_id && t.status === "review" && t.assignee_id && t.assignee_id !== a.id) {
      kind = "reviewing";
      doing = `is reviewing ${whoName(ws, t.assignee_id)}'s work on ${feature ?? named(t.title)}`;
    } else if (running) {
      kind = "running";
      doing = `is ${plainPhrase(ws, t)}`;
      const steps = ws.steps.get(t.id) ?? [];
      const at = steps.findIndex((s) => s.status === "now");
      if (steps.length) extra.push(`step ${at >= 0 ? at + 1 : Math.min(steps.filter((s) => s.status === "done").length + 1, steps.length)} of ${steps.length}`);
      since = (at >= 0 ? steps[at].updated_at : null) ?? t.started_at ?? t.updated_at;
    } else if (t.status !== "in_progress") {
      continue;
    } else if (asksPerson(t) || a.status === "waiting_human") {
      kind = "waiting";
      doing = `is waiting for your answer before ${plainPhrase(ws, t)}`;
    } else {
      kind = "stopped";
      doing = `stopped while ${plainPhrase(ws, t)}`;
      const back = a.status === "paused" ? null : resumeAt(a.status_note, now);
      if (t.needs_human && RUNNER_PROBLEM.test(t.needs_human)) extra.push(withoutKeys(ws, stopReason(t.needs_human)));
      else if (a.status === "paused") extra.push("paused by its owner");
      else if (/usage limit/i.test(a.status_note ?? "")) extra.push("usage limit");
      if (back) extra.push(`resumes ${aboutTime(back)} by itself`);
    }
    if (t.pr_facts?.checks?.state === "success" && t.pr_facts.checks.total > 0) extra.splice(kind === "running" ? 1 : 0, 0, "tests passed");
    const held = Math.max(0, now.getTime() - Date.parse(since));
    const heldText = held >= 60_000 ? awayText(held) : "just now";
    const detail = [feature ?? FIXES, ...extra, heldText].join(" · ");
    rows.push({ agentId: a.id, name, kind, doing, detail, feature: feature ?? FIXES, notes: extra, held: heldText, since, key: t.key });
  }
  return rows.sort((x, y) => Date.parse(y.since) - Date.parse(x.since));
}

// ------------------------------------------------------------------ features

export type Column = "now" | "next" | "done";
export type Tone = "live" | "needs" | "problem" | "quiet" | "done";

export interface Part {
  line: string;
  /** "Done", "In review", "Being built", "Waiting for you", "Stopped", "Up next", "Planned". */
  state: string;
  tone: Tone;
  who: string | null;
  /** Hover text and the Show-the-work sheet only. */
  key: string;
}

export interface Feature {
  /** The goal's ticket id, or "fixes". */
  id: string;
  name: string;
  outcome: string | null;
  column: Column;
  done: number;
  total: number;
  /** "Just started", "Under way", "Half done", "Nearly done"; "Finished" when done; null when nothing started. */
  word: string | null;
  /** The one status line under the outcome. */
  status: string;
  tone: Tone;
  /** "5 of 8 parts done", for the bar's hover text. */
  count: string;
  /** When the last part finished, for Done. */
  finishedAt: string | null;
  /** Someone is running on one of its parts. */
  active: boolean;
  /** Work started and nobody is on it now. */
  stopped: boolean;
  /** Who is on it right now, by name. */
  on: string[];
  /** Something in it is waiting for the person. */
  waits: boolean;
  /** "paused until about 17:26" or "stopped", when its work has stopped. */
  pause: string | null;
  parts: Part[];
}

/** The word for a share of parts done: under a quarter "Just started", up to 40% "Under way", up to 60% "Half done", then "Nearly done". */
export function progressWord(done: number, total: number): string {
  const share = total ? done / total : 0;
  if (share < 0.25) return "Just started";
  if (share <= 0.4) return "Under way";
  if (share <= 0.6) return "Half done";
  return "Nearly done";
}

/** "Finished today", "Finished yesterday", "Finished Tuesday" (within a week), else "Finished 3 Oct". */
export function finishedWhen(iso: string, now: Date): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const d = new Date(iso);
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return "Finished today";
  if (diff === 1) return "Finished yesterday";
  if (diff < 7) return `Finished ${d.toLocaleDateString("en-US", { weekday: "long" })}`;
  return `Finished ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
}

export interface Look {
  state: State;
  headline: string;
  rows: AgentRow[];
  features: { now: Feature[]; next: Feature[]; done: Feature[] };
  /** When stopped work resumes by itself, when an agent's note says. */
  resumes: Date | null;
}

/** The whole Overview, from the board, what needs the person and Captain's plans. */
export function overview(ws: Workspace, needs: Need[], plans: Plan[], now: Date): Look {
  const agents = agentsAt(ws, now);
  const active = activeTickets(ws, now);
  const needTickets = new Set(needs.map((n) => n.ticket?.id).filter((id): id is string => !!id));
  const pendingGoals = new Set(plans.filter((p) => p.status === "pending" || p.status === "changes_asked").flatMap((p) => p.goals.map((g) => g.goal.id)));
  const resumes = new Map<string, Date>();
  for (const r of agents) {
    const back = !r.running && r.agent.status !== "paused" ? resumeAt(r.agent.status_note, now) : null;
    if (back && r.ticket) resumes.set(r.ticket.id, back);
  }

  const groups = new Map<string | null, Ticket[]>();
  for (const t of ws.tickets) {
    if (!isWork(t)) continue;
    const id = epicOf(ws, t)?.id ?? null;
    groups.set(id, [...(groups.get(id) ?? []), t]);
  }

  const partOf = (t: Ticket): Part => {
    const who = t.assignee_id ? whoName(ws, t.assignee_id) : null;
    const [state, tone]: [string, Tone] =
      t.status === "done"
        ? ["Done", "done"]
        : needTickets.has(t.id)
          ? ["Waiting for you", "needs"]
          : t.status === "review"
            ? ["In review", active.has(t.id) ? "live" : "quiet"]
            : t.status === "in_progress"
              ? active.has(t.id)
                ? ["Being built", "live"]
                : ["Stopped", "problem"]
              : t.status === "ready"
                ? ["Up next", "quiet"]
                : ["Planned", "quiet"];
    return { line: withoutKeys(ws, partLine(t)), state, tone, who, key: t.key };
  };

  const featureOf = (epic: Ticket | null, parts: Ticket[]): Feature => {
    const sorted = [...parts].sort((a, b) => a.sort_order - b.sort_order);
    const total = sorted.length;
    const done = sorted.filter((t) => t.status === "done").length;
    const started = sorted.some((t) => t.status === "in_progress" || t.status === "review" || t.status === "done");
    const column: Column = total ? (done === total ? "done" : started ? "now" : "next") : epic?.status === "done" ? "done" : "next";
    const isActive = sorted.some((t) => active.has(t.id));
    const building = sorted.filter((t) => t.status === "in_progress");
    const stopped = !isActive && building.length > 0;
    const waits = sorted.some((t) => needTickets.has(t.id)) || (!!epic && pendingGoals.has(epic.id));
    const finishedAt = column === "done" ? (sorted.map((t) => t.completed_at).filter((x): x is string => !!x).sort().pop() ?? epic?.completed_at ?? epic?.updated_at ?? null) : null;
    let word: string | null = null;
    let status: string;
    let tone: Tone;
    let on: string[] = [];
    let pause: string | null = null;
    if (column === "done") {
      word = "Finished";
      status = finishedWhen(finishedAt ?? now.toISOString(), now);
      tone = "done";
    } else if (column === "now") {
      word = progressWord(done, total);
      on = [...new Set(sorted.filter((t) => active.has(t.id) && t.assignee_id).map((t) => whoName(ws, t.assignee_id!)))];
      const reviewer = agents.find((r) => r.running && r.ticket && sorted.includes(r.ticket) && r.ticket.assignee_id !== r.agent.id);
      if (reviewer && !on.includes(whoName(ws, reviewer.agent.id))) on.push(whoName(ws, reviewer.agent.id));
      const back = building.map((t) => resumes.get(t.id)).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0];
      if (stopped && !on.length) pause = back ? `paused until ${aboutTime(back)}` : "stopped";
      if (waits) [status, tone] = [`${word} · ${on.length ? `${listed(on)} on it · ` : ""}waiting for your answer`, "needs"];
      else if (on.length) [status, tone] = [`${word} · ${listed(on)} on it`, "live"];
      else if (stopped) [status, tone] = [`${word} · ${back ? `paused until ${aboutTime(back)}` : "stopped"}`, "problem"];
      else [status, tone] = [word, "quiet"];
    } else if (epic && pendingGoals.has(epic.id)) {
      [status, tone] = ["Waiting for your OK to start", "needs"];
    } else {
      const after = afterFeature(ws, epic, sorted);
      [status, tone] = [after ? `Planned · starts after ${after}` : "Not started", "quiet"];
    }
    return {
      id: epic?.id ?? "fixes",
      name: epic ? goalName(epic.title) : FIXES,
      outcome: epic ? outcomeOf(epic) : null,
      column,
      done,
      total,
      word,
      status,
      tone,
      count: `${done} of ${plural(total, "part")} done`,
      finishedAt,
      active: isActive,
      stopped,
      on,
      waits: waits && column !== "done",
      pause,
      parts: sorted.map(partOf),
    };
  };

  const all = ws.tickets.filter((t) => t.type === "epic" && t.status !== "canceled").map((e) => featureOf(e, groups.get(e.id) ?? []));
  const loose = groups.get(null) ?? [];
  if (loose.length) all.push(featureOf(null, loose));

  const latest = (f: Feature) => Math.max(0, ...(groups.get(f.id === "fixes" ? null : f.id) ?? []).map((t) => Date.parse(t.updated_at)));
  const order = (f: Feature) => (f.id === "fixes" ? Infinity : (ws.byId.get(f.id)?.sort_order ?? 0));
  const features = {
    now: all.filter((f) => f.column === "now").sort((a, b) => Number(b.active) - Number(a.active) || latest(b) - latest(a)),
    next: all.filter((f) => f.column === "next").sort((a, b) => Number(a.tone === "needs") - Number(b.tone === "needs") || order(a) - order(b)),
    done: all.filter((f) => f.column === "done").sort((a, b) => Date.parse(b.finishedAt ?? "") - Date.parse(a.finishedAt ?? "")),
  };

  const running = agents.some((r) => r.running && r.ticket) || ws.tickets.some((t) => isWork(t) && t.status === "in_progress" && t.assignee_type === "human" && !!t.assignee_id);
  const inProgress = ws.tickets.some((t) => isWork(t) && t.status === "in_progress");
  const inReview = ws.tickets.filter((t) => isWork(t) && t.status === "review");
  const state: State = running ? "working" : needs.length ? "waiting" : inProgress ? "paused" : "idle";
  const back = [...resumes.values()].sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  let headline: string;
  if (state === "working") {
    const names = all.filter((f) => f.active && f.column !== "done").map((f) => (f.id === "fixes" ? "fixes and upkeep" : f.name));
    headline = !names.length
      ? "The team is working."
      : names.length <= 2
        ? `The team is building ${listed(names)}.`
        : `The team is building ${names.slice(0, 2).join(", ")} and ${plural(names.length - 2, "more feature")}.`;
  } else if (state === "waiting") {
    const held = heldUp(ws, needs, plans);
    headline = held.length === 0 ? "Captain is waiting for your answer." : held.length === 1 ? `${held[0]} can't move until you answer.` : `${plural(held.length, "feature")} can't move until you answer.`;
  } else if (state === "paused") {
    const stoppedOn = features.now.filter((f) => f.stopped).map((f) => (f.id === "fixes" ? "fixes and upkeep" : f.name));
    headline = back ? `Work is paused until ${aboutTime(back)}. Nothing for you to do.` : `Work has stopped on ${listed(stoppedOn) || "the work in progress"}.`;
  } else {
    const nextUp = features.next.find((f) => f.id !== "fixes") ?? features.next[0];
    const reviewed = [...new Set(inReview.map((t) => featureName(ws, t) ?? "fixes and upkeep"))];
    headline = reviewed.length
      ? `Nothing is being built. Work on ${listed(reviewed)} is waiting for review.`
      : nextUp
        ? `Nothing is being built. Next up: ${nextUp.id === "fixes" ? "fixes and upkeep" : nextUp.name}.`
        : "Everything planned is finished.";
  }

  return { state, headline, rows: agentRows(ws, now), features, resumes: back };
}

/** The feature a goal's parts wait on: the first other, unfinished feature one of its parts is blocked by. */
function afterFeature(ws: Workspace, epic: Ticket | null, parts: Ticket[]): string | null {
  for (const t of parts) {
    for (const b of ws.blockersOf(t.id)) {
      if (b.status === "done" || b.status === "canceled") continue;
      const other = b.type === "epic" ? b : epicOf(ws, b);
      if (other && other.id !== epic?.id) return goalName(other.title);
    }
  }
  return null;
}

/** The features what needs the person holds up, by name, in the order they started waiting. */
export function heldUp(ws: Workspace, needs: Need[], plans: Plan[]): string[] {
  const names: string[] = [];
  const add = (n: string | null) => {
    if (n && !names.includes(n)) names.push(n);
  };
  for (const n of needs) {
    if (n.ticket) add(featureName(ws, n.ticket) ?? FIXES);
    else if (n.kind === "plan") for (const g of plans.find((p) => `plan:${p.turnId}` === n.key)?.goals ?? []) add(goalName(g.goal.title));
  }
  return names;
}

// ------------------------------------------------------------------ you

export interface YouLine {
  text: string;
  /** The oldest need, which Answer opens on the Captain page. */
  oldest: Need;
}

/** "1 answer is waiting on you. It holds up Google sign-in. 11 min." Null when nothing needs the person. */
export function youLine(ws: Workspace, needs: Need[], plans: Plan[], now: Date): YouLine | null {
  if (!needs.length) return null;
  const oldest = [...needs].sort((a, b) => Date.parse(a.since) - Date.parse(b.since))[0];
  const n = needs.length;
  const held = heldUp(ws, needs, plans);
  const holds = held.length ? ` ${n === 1 ? "It holds" : "They hold"} up ${listed(held)}.` : "";
  const waited = Math.max(0, now.getTime() - Date.parse(oldest.since));
  return { text: `${plural(n, "answer")} ${n === 1 ? "is" : "are"} waiting on you.${holds} ${waited >= 60_000 ? awayText(waited) : "Just now"}.`, oldest };
}

// ------------------------------------------------------------------ since you last looked

/** "Since you last looked, 2 h ago: Search was finished, 1 decision was recorded, 1 problem came up." Null when nothing is new. */
export function sinceLine(ws: Workspace, c: CatchUp | null): string | null {
  if (!c || !catchUpItems(c).length) return null;
  const keys = new Set(c.shipped.map((l) => l.ref));
  const finished: string[] = [];
  const moved: string[] = [];
  let fixes = 0;
  for (const k of keys) {
    const t = k ? ws.byKey.get(k) : undefined;
    if (!t) continue;
    const e = epicOf(ws, t);
    if (!e) {
      fixes++;
      continue;
    }
    const name = goalName(e.title);
    const done = ws.tickets.filter((x) => isWork(x) && epicOf(ws, x)?.id === e.id).every((x) => x.status === "done");
    if (done) {
      if (!finished.includes(name)) finished.push(name);
    } else if (!moved.includes(name)) moved.push(name);
  }
  const parts = [
    ...finished.map((f) => `${f} was finished`),
    moved.length ? (moved.length <= 2 ? `${listed(moved)} moved forward` : `${plural(moved.length, "feature")} moved forward`) : null,
    fixes ? `${plural(fixes, "fix", "fixes")} went in` : null,
    c.decided.length ? `${plural(c.decided.length, "decision")} ${c.decided.length === 1 ? "was" : "were"} recorded` : null,
    c.problems.length ? `${plural(c.problems.length, "problem")} came up` : null,
  ].filter((p): p is string => !!p);
  if (!parts.length) return null;
  return `Since you last looked, ${awayText(c.awayMs)} ago: ${parts.join(", ")}.`;
}

// ------------------------------------------------------------------ team

export type TeamState = "elsewhere" | "working" | "reviewing" | "waiting" | "free" | "idle" | "stopped" | "limit" | "offline";

export interface Usage {
  /** "1 h 10 of 3 h today" */
  text: string;
  /** 0 to 1, for the bar. */
  share: number;
}

export interface TeamAgent {
  id: string;
  name: string;
  state: TeamState;
  /** "working", "free · idle 40 min", "limit reached · back about 5:40 am". */
  label: string;
  tone: Tone;
  /** Null unless its runner reported usage for today on its own machine. */
  usage: Usage | null;
  /** Whose agent it is and its model, for hover text. */
  hover: string;
}

export interface TeamPerson {
  id: string;
  name: string;
  online: boolean;
  /** "online · 9:41 AM"; just "away" when their time zone isn't known. */
  label: string;
}

export interface Team {
  agents: TeamAgent[];
  people: TeamPerson[];
}

/** "1 h 10", "3 h", "40 min": a length of work time. */
export function workTime(seconds: number): string {
  const min = Math.round(seconds / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min`;
}

/** The calendar day in a time zone, "2026-10-11"; the browser's own zone when none is given or it's unknown. */
export function dayIn(tz: string | null | undefined, now: Date): string {
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (!tz) return local;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return local;
  }
}

/** Time used today, only when the runner's report is for today where the agent runs (its owner's time zone). */
export function usageOf(ws: Workspace, a: Agent, now: Date): Usage | null {
  if (a.used_today_s == null || !a.daily_limit_s || !a.usage_day) return null;
  const tz = a.owner_profile_id ? ws.people.profiles.get(a.owner_profile_id)?.timezone : null;
  if (a.usage_day !== dayIn(tz, now)) return null;
  return { text: `${workTime(a.used_today_s)} of ${workTime(a.daily_limit_s)} today`, share: Math.min(1, a.used_today_s / a.daily_limit_s) };
}

/** When an agent waiting out a limit expects to be back: what its runner reported, else what its note says. */
function backAt(a: Agent, now: Date): Date | null {
  if (a.waiting_until) return Date.parse(a.waiting_until) > now.getTime() ? new Date(a.waiting_until) : null;
  return /usage limit/i.test(a.status_note ?? "") ? resumeAt(a.status_note, now) : null;
}

const queuedFor = (ws: Workspace, id: string) => ws.tickets.filter((t) => isWork(t) && t.assignee_id === id && (t.status === "ready" || t.status === "in_progress"));

/** An agent's state in a word, before any wording: shared by the Team block and Worth watching. */
function teamState(ws: Workspace, a: Agent, now: Date): TeamState {
  if (!agentOnline(a, now)) return "offline";
  if (a.status === "paused") return "stopped";
  if (backAt(a, now) || /usage limit/i.test(a.status_note ?? "")) return "limit";
  if (statusHere(a, ws.project.id, ws.byId, now).elsewhere) return "elsewhere";
  if (a.status === "blocked") return "stopped";
  if (agentDot(a, now) === "working") {
    const t = agentTicket(ws, a, now);
    return t && t.status === "review" && t.assignee_id !== a.id ? "reviewing" : "working";
  }
  if (backAt(a, now) || /usage limit/i.test(a.status_note ?? "")) return "limit";
  if (a.status === "waiting_human") return "waiting";
  return queuedFor(ws, a.id).length ? "idle" : "free";
}

const TEAM_TONE: Record<TeamState, Tone> = { elsewhere: "live", working: "live", reviewing: "live", waiting: "needs", free: "quiet", idle: "quiet", stopped: "problem", limit: "problem", offline: "quiet" };

/**
 * Who is free, who is stopped and how much of today each agent has used, then each person.
 * `seen` is when each person was last seen (by profile id), from the room; `me` is looking right now.
 */
export function team(ws: Workspace, now: Date, seen: Map<string, string | null> = new Map(), me?: string): Team {
  const lead = ws.project.lead_agent_id;
  const agents = [...ws.people.agents.values()]
    .sort((a, b) => Number(b.id === lead) - Number(a.id === lead))
    .map((a): TeamAgent => {
      const state = teamState(ws, a, now);
      let label: string = state;
      if (state === "elsewhere") label = "Busy in another project";
      else if (state === "limit") label = backAt(a, now) ? `limit reached · back ${aboutTime(backAt(a, now)!)}` : "limit reached";
      else if (state === "waiting") label = "waiting on you";
      else if (state === "offline") label = a.last_seen_at ? `offline · ${awayText(now.getTime() - Date.parse(a.last_seen_at))}` : "not connected yet";
      else if (state === "free" || state === "idle") {
        // Since its last run started or a ticket of its own last moved, whichever is later.
        const since = Math.max(0, ...[a.effective_at, ...ws.tickets.filter((t) => isWork(t) && t.assignee_id === a.id && t.status !== "backlog").map((t) => t.updated_at)].map((x) => (x ? Date.parse(x) : 0)));
        const held = now.getTime() - since;
        if (since && held >= 60_000) label = state === "free" ? `free · idle ${awayText(held)}` : `idle · ${awayText(held)}`;
      }
      const owner = a.owner_profile_id ? ws.nameOf(a.owner_profile_id) : a.owner_label;
      const hover = [owner ? `${owner}'s agent` : "shared agent", a.effective_model ?? a.model ?? "model set on its machine"].join(" · ");
      return { id: a.id, name: whoName(ws, a.id), state, label, tone: TEAM_TONE[state], usage: usageOf(ws, a, now), hover };
    });
  const people = ws.people.members
    .filter((m) => m.actor_type === "human")
    .map((m): TeamPerson => {
      const p = ws.people.profiles.get(m.actor_id);
      const last = seen.get(m.actor_id);
      const online = m.actor_id === me || (!!last && now.getTime() - Date.parse(last) < ONLINE_MS);
      const word = online ? "online" : "away";
      return { id: m.actor_id, name: p?.name ?? "Someone", online, label: p?.timezone ? `${word} · ${localTime(p.timezone, now)}` : word };
    });
  return { agents, people };
}

// ------------------------------------------------------------------ worth watching

/** A finished change has waited too long for review after this. */
const REVIEW_WAIT_MS = 20 * 60_000;
/** A machine with work assigned is worth a look when unseen for this long. */
const UNSEEN_MS = 24 * 3600_000;
/** Send-backs are counted over the last 7 days. */
export const WEEK_MS = 7 * 24 * 3600_000;
/** This many parts waiting on one agent, while another is free, is a pile. */
const PILE = 2;

export interface WatchItem {
  text: string;
  /** Coral for something going wrong; quiet for something to keep an eye on. */
  tone: "problem" | "quiet";
  /** The ticket whose Show-the-work sheet it opens, else People; neither for the empty queue. */
  key?: string;
  people?: boolean;
}

const times = (n: number) => (n === 2 ? "twice" : `${n} times`);

/**
 * What is quietly going wrong, most serious first, in plain sentences with no ticket keys.
 * `events` are the project's recent events; send-backs are counted from the last 7 days of them.
 */
export function watch(ws: Workspace, events: TicketEvent[], now: Date): WatchItem[] {
  const open = ws.tickets.filter((t) => isWork(t) && isOpen(t));
  const subject = (t: Ticket) => withoutKeys(ws, named(t.title));
  const out: WatchItem[] = [];

  for (const t of open) {
    if ((t.status === "review" || t.status === "in_progress") && t.pr_facts?.checks?.state === "failure") out.push({ text: `Tests are failing on ${subject(t)}.`, tone: "problem", key: t.key });
  }

  const sentBack = new Map<string, number>();
  const inReviewSince = new Map<string, string>();
  for (const e of events) {
    if (e.kind !== "status" || now.getTime() - Date.parse(e.created_at) > WEEK_MS) continue;
    if (e.data.from === "review" && e.data.to === "in_progress") sentBack.set(e.ticket_id, (sentBack.get(e.ticket_id) ?? 0) + 1);
    if (e.data.to === "review" && (inReviewSince.get(e.ticket_id) ?? "") < e.created_at) inReviewSince.set(e.ticket_id, e.created_at);
  }
  for (const t of open) {
    const n = sentBack.get(t.id) ?? 0;
    if (n >= 2) out.push({ text: `${subject(t)} was sent back by review ${times(n)}.`, tone: "problem", key: t.key });
  }

  const agents = [...ws.people.agents.values()];
  for (const a of agents) {
    const unseen = a.last_seen_at ? now.getTime() - Date.parse(a.last_seen_at) : Infinity;
    if (unseen <= UNSEEN_MS || !queuedFor(ws, a.id).length) continue;
    const name = whoName(ws, a.id);
    out.push({ text: a.last_seen_at ? `${name} has work assigned, but its computer hasn't been seen for ${awayText(unseen)}.` : `${name} has work assigned, but its computer has never connected.`, tone: "problem", people: true });
  }

  const reviewing = new Set(agentsAt(ws, now).filter((r) => r.running && r.ticket).map((r) => r.ticket!.id));
  for (const t of open) {
    // Approved work waits for its tests or a person's OK, not for a review.
    if (t.status !== "review" || t.approved_sha || reviewing.has(t.id)) continue;
    const waited = now.getTime() - Date.parse(inReviewSince.get(t.id) ?? t.updated_at);
    if (waited > REVIEW_WAIT_MS) out.push({ text: `${subject(t)} has waited ${awayText(waited)} for review.`, tone: "quiet", key: t.key });
  }

  const states = new Map(agents.map((a) => [a.id, teamState(ws, a, now)]));
  const free = agents.find((a) => a.id !== ws.project.lead_agent_id && states.get(a.id) === "free");
  if (free) {
    for (const a of agents) {
      const waiting = ws.tickets.filter((t) => isWork(t) && t.status === "ready" && t.assignee_id === a.id).length;
      if (a.id !== free.id && waiting >= PILE) out.push({ text: `${plural(waiting, "part")} are waiting for ${whoName(ws, a.id)} while ${whoName(ws, free.id)} is free.`, tone: "quiet", people: true });
    }
  }

  const building = [...activeTickets(ws, now)].some((id) => ws.byId.get(id)?.status === "in_progress");
  if (building && !ws.tickets.some((t) => isWork(t) && t.status === "ready")) out.push({ text: "Nothing is queued after the current work.", tone: "quiet" });

  return out;
}

/** "just now", "2 min ago": how long since the data last loaded. */
export function updatedText(loadedAt: number, now: Date): string {
  const ms = now.getTime() - loadedAt;
  return ms < 60_000 ? "updated just now" : `updated ${awayText(ms)} ago`;
}

// ------------------------------------------------------------------ at a glance (AK-111)

/**
 * The counts across the top of Overview. Agents waiting on the person are counted in `needs`, as
 * requests; an idle agent (work queued but not started) is in the team table only.
 */
export interface Pulse {
  working: number;
  needs: number;
  stopped: number;
  free: number;
  offline: number;
}

export function pulse(t: Team, needs: number): Pulse {
  const n = (states: TeamState[]) => t.agents.filter((a) => states.includes(a.state)).length;
  return { working: n(["working", "reviewing"]), needs, stopped: n(["stopped", "limit"]), free: n(["free"]), offline: n(["offline"]) };
}

/** One request in the Needs-you panel: a line to read and a smaller line of context. */
export interface AskItem {
  key: string;
  title: string;
  sub: string;
}

/** The first sentence of a question, cut to about a line. */
export function firstSentence(s: string, max = 110): string {
  const one = s.replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s/)[0] ?? "";
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** What needs the person, oldest first, each as one plain line naming what to do and about what. */
export function askItems(ws: Workspace, needs: Need[], plans: Plan[], now: Date): AskItem[] {
  return [...needs]
    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since))
    .map((n) => {
      const t = n.ticket;
      const subject = t ? withoutKeys(ws, partLine(t)) : "";
      const question = withoutKeys(ws, firstSentence(n.question));
      let title: string;
      if (n.kind === "risky_merge") title = `OK to merge: ${subject}`;
      else if (n.kind === "approval") title = `Approve: ${subject}`;
      else if (n.kind === "plan") {
        const names = plans.find((p) => `plan:${p.turnId}` === n.key)?.goals.map((g) => goalName(g.goal.title)) ?? [];
        title = names.length ? `OK the plan for ${listed(names)}` : "OK Captain's plan";
      } else if (n.kind === "captain_question") title = `Captain asks: ${question}`;
      else if (n.kind === "ticket_question") title = `${t?.assignee_id ? whoName(ws, t.assignee_id) : "An agent"} asks: ${question}`;
      else if (n.kind === "problem" && t?.assignee_id && /^I\s/.test(question)) title = `${whoName(ws, t.assignee_id)} ${question.replace(/^I\s+/, "")}`;
      else title = capital(question || subject);
      const waited = Math.max(0, now.getTime() - Date.parse(n.since));
      const sub = [t ? (featureName(ws, t) ?? FIXES) : null, waited >= 60_000 ? `waiting ${awayText(waited)}` : "just now"].filter(Boolean).join(" · ");
      return { key: n.key, title, sub };
    });
}

/** One row of the team table: an agent's state in a word, what it is doing, and where. */
export interface CrewRow {
  /** Reported API spend, alongside time used; absent when no cost is known. */
  spend?: string | null;
  id: string;
  name: string;
  state: TeamState;
  /** "Working", "Reviewing", "Waiting on you", "Stopped", "Limit reached", "Free", "Idle", "Offline". */
  word: string;
  tone: Tone;
  /** What it is doing, as a sentence without its name: "Adding Google sign-in beside the email form". */
  doing: string;
  /** The feature it's on; null when it has nothing. */
  feature: string | null;
  /** Why it stopped, when it resumes, its step, how long: small facts, each shown on its own. */
  notes: string[];
  usage: Usage | null;
  hover: string;
  /** The ticket it is on, for Show the work; null when none. */
  key: string | null;
}

const CREW_WORD: Record<TeamState, string> = { elsewhere: "Busy", working: "Working", reviewing: "Reviewing", waiting: "Waiting on you", stopped: "Stopped", limit: "Limit reached", free: "Free", idle: "Idle", offline: "Offline" };
const CREW_ORDER: TeamState[] = ["working", "reviewing", "elsewhere", "waiting", "stopped", "limit", "idle", "free", "offline"];

/** The team table: every agent once, working first, then waiting, stopped, idle, free and offline. */
export function crew(t: Team, rows: AgentRow[]): CrewRow[] {
  const byAgent = new Map(rows.map((r) => [r.agentId, r]));
  return t.agents
    .map((a): CrewRow => {
      const r = byAgent.get(a.id);
      let doing: string;
      if (r) {
        const d = r.doing.replace(/^is /, "");
        doing = r.kind === "stopped" ? capital(d.replace(/^stopped while /, "was ")) : r.kind === "waiting" ? capital(d.replace(/^waiting for your answer before /, "")) : capital(d);
      } else if (a.state === "free") doing = "Nothing assigned";
      else if (a.state === "idle") doing = "Has work waiting to start";
      else if (a.state === "offline") doing = capital(a.label);
      else if (a.state === "limit") doing = capital(a.label.replace(/^limit reached · /, ""));
      else doing = capital(a.label);
      const notes = r ? [...r.notes, r.held] : a.state === "free" || a.state === "idle" ? a.label.split(" · ").slice(1) : [];
      return { id: a.id, name: a.name, state: a.state, word: CREW_WORD[a.state], tone: a.tone, doing, feature: r?.feature ?? null, notes, usage: a.usage, hover: a.hover, key: r?.key ?? null };
    })
    .sort((x, y) => CREW_ORDER.indexOf(x.state) - CREW_ORDER.indexOf(y.state));
}
