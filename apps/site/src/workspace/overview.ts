import { MERGE_OK_PREFIX, type Agent, type Ticket } from "../lib/data";
import { awayText, catchUpItems, clock, goalName, named, RUNNER_PROBLEM, type CatchUp, type Need, type Plan } from "./captain";
import { agentDot, epicOf, plural } from "./story";
import type { Workspace } from "./useWorkspace";

// Overview (AK-75): what an owner wants to know, at the level of features, never tickets. A feature
// is a goal (an epic); its parts are its tickets. Every sentence is built here from the record, with
// a fallback for goals and tickets written before Captain wrote plain summaries (AK-74). Nothing here
// draws anything, and no ticket key ever ends up in a sentence: keys only go in `key` fields, which
// the page shows as hover text at most.

export type State = "working" | "waiting" | "paused" | "idle";

export const STATE_WORD: Record<State, string> = { working: "Working", waiting: "Waiting on you", paused: "Paused", idle: "Idle" };

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
function agentTicket(ws: Workspace, a: Agent): Ticket | null {
  const cur = a.current_ticket_id ? ws.byId.get(a.current_ticket_id) : undefined;
  if (cur && isWork(cur) && isOpen(cur)) return cur;
  return (
    ws.tickets
      .filter((t) => isWork(t) && t.status === "in_progress" && t.assignee_id === a.id)
      .sort((x, y) => Date.parse(y.updated_at) - Date.parse(x.updated_at))[0] ?? null
  );
}

function agentsAt(ws: Workspace, now: Date): Running[] {
  return [...ws.people.agents.values()].map((agent) => ({ agent, ticket: agentTicket(ws, agent), running: agentDot(agent, now) === "working" }));
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
    const detail = [feature ?? FIXES, ...extra, held >= 60_000 ? awayText(held) : "just now"].join(" · ");
    rows.push({ agentId: a.id, name, kind, doing, detail, since, key: t.key });
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
    if (column === "done") {
      word = "Finished";
      status = finishedWhen(finishedAt ?? now.toISOString(), now);
      tone = "done";
    } else if (column === "now") {
      word = progressWord(done, total);
      const on = [...new Set(sorted.filter((t) => active.has(t.id) && t.assignee_id).map((t) => whoName(ws, t.assignee_id!)))];
      const reviewer = agents.find((r) => r.running && r.ticket && sorted.includes(r.ticket) && r.ticket.assignee_id !== r.agent.id);
      if (reviewer && !on.includes(whoName(ws, reviewer.agent.id))) on.push(whoName(ws, reviewer.agent.id));
      const back = building.map((t) => resumes.get(t.id)).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0];
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

/** "just now", "2 min ago": how long since the data last loaded. */
export function updatedText(loadedAt: number, now: Date): string {
  const ms = now.getTime() - loadedAt;
  return ms < 60_000 ? "updated just now" : `updated ${awayText(ms)} ago`;
}
