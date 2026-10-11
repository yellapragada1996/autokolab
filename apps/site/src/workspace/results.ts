import { MERGE_OK_PREFIX, statusLabel, type Status, type Ticket, type TicketEvent } from "../lib/data";
import { RUNNER_PROBLEM } from "./captain";
import type { Workspace } from "./useWorkspace";

// The Results page's numbers and the audit export, as pure functions over the record: tickets,
// their events and the decisions. Everything is counted; nothing is estimated or compared.

// ------------------------------------------------------------------ the period

export type Period = "week" | "4weeks";

export interface Range {
  period: Period;
  /** Monday 00:00 in the viewer's time: of this week, or of three weeks before it. */
  from: Date;
  /** Now: the period runs up to the moment the page was opened. */
  to: Date;
}

/** `?period=4weeks` in the address; anything else is this week. */
export const periodOf = (search: string): Period => (new URLSearchParams(search).get("period") === "4weeks" ? "4weeks" : "week");

const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function rangeOf(period: Period, now: Date): Range {
  const monday = mondayOf(now);
  return { period, from: period === "week" ? monday : addDays(monday, -21), to: now };
}

const inRange = (r: Range, iso: string | null | undefined) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= r.from.getTime() && t <= r.to.getTime();
};

const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const PERIOD_WORDS: Record<Period, string> = { week: "this week", "4weeks": "last 4 weeks" };

/** "Oct 5 – Oct 11 · this week" */
export const periodLine = (r: Range) => `${shortDate(r.from)} – ${shortDate(r.to)} · ${PERIOD_WORDS[r.period]}`;

// ------------------------------------------------------------------ the numbers

export type AskKind = "risky_merge" | "question" | "problem";

export const ASK_LABEL: Record<AskKind, string> = {
  risky_merge: "OK a risky merge",
  question: "Answer a question",
  problem: "Look at a problem",
};

/** What a "Needs you" note asked for: the same test the Captain page uses for its cards. */
export function askKind(note: string): AskKind {
  if (note.startsWith(MERGE_OK_PREFIX)) return "risky_merge";
  return RUNNER_PROBLEM.test(note) ? "problem" : "question";
}

export interface Bar {
  /** Under the bar: "Mon" for a day, "Sep 14" for the week starting then. */
  label: string;
  /** Read out and on hover: "Monday, Oct 5" or "Week of Sep 14". */
  name: string;
  count: number;
}

export interface AgentStat {
  id: string;
  captain: boolean;
  merged: number;
  medianMs: number | null;
  sentBack: number;
  /** Approvals given in the period; shown on Captain's row instead of merges. */
  approvals: number;
}

export interface Results {
  range: Range;
  merged: Ticket[];
  /** Of the merged tickets: how many carry an approval, and how many of those have passing tests on the approved commit. */
  reviewed: number;
  tested: number;
  medianMs: number | null;
  asked: { total: number; kinds: { kind: AskKind; label: string; count: number }[] };
  sentBack: { total: number; byReview: number; reopened: number };
  bars: Bar[];
  agents: AgentStat[];
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const timeToMerge = (t: Ticket) => (t.started_at && t.completed_at ? Date.parse(t.completed_at) - Date.parse(t.started_at) : null);
const medianOf = (ts: Ticket[]) => median(ts.map(timeToMerge).filter((ms): ms is number => ms !== null && ms >= 0));

/** "2 h 10 min", "45 min", "3 d 4 h" */
export function duration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

function bars(r: Range, merged: Ticket[]): Bar[] {
  const out: (Bar & { from: Date })[] = [];
  if (r.period === "week") {
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
      out.push({ from: d, label: d.toLocaleDateString("en-US", { weekday: "short" }), name: `${d.toLocaleDateString("en-US", { weekday: "long" })}, ${shortDate(d)}`, count: 0 });
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const d = addDays(r.from, i * 7);
      out.push({ from: d, label: shortDate(d), name: `Week of ${shortDate(d)}`, count: 0 });
    }
  }
  for (const t of merged) {
    const at = Date.parse(t.completed_at!);
    // The last bar that starts at or before the merge.
    const bar = out.filter((b) => b.from.getTime() <= at).pop();
    if (bar) bar.count++;
  }
  return out.map(({ label, name, count }) => ({ label, name, count }));
}

/** Every number on the page, counted from the tickets and the period's events. */
export function results(ws: Workspace, events: TicketEvent[], period: Period, now: Date): Results {
  const range = rangeOf(period, now);
  const evs = events.filter((e) => inRange(range, e.created_at));
  const data = (e: TicketEvent) => e.data as Record<string, string | null | undefined>;

  const merged = ws.tickets.filter((t) => t.type !== "epic" && t.status === "done" && !!t.pr_url && inRange(range, t.completed_at));
  const reviewed = merged.filter((t) => !!t.approved_sha);
  const tested = reviewed.filter((t) => t.pr_facts?.sha === t.approved_sha && t.pr_facts?.checks.state === "success");

  const count: Record<AskKind, number> = { risky_merge: 0, question: 0, problem: 0 };
  for (const e of evs) {
    const note = e.kind === "needs_human" ? data(e).note : null;
    if (note) count[askKind(note)]++;
  }
  const kinds = (Object.keys(ASK_LABEL) as AskKind[]).map((kind) => ({ kind, label: ASK_LABEL[kind], count: count[kind] })).filter((k) => k.count > 0);

  const byReview = new Set<string>();
  const reopened = new Set<string>();
  for (const e of evs) {
    if (e.kind !== "status") continue;
    const { from, to } = data(e);
    if (from === "review" && to === "in_progress") byReview.add(e.ticket_id);
    if (from === "done" && to !== "done") reopened.add(e.ticket_id);
  }
  const sentBackIds = new Set([...byReview, ...reopened]);

  const lead = ws.project.lead_agent_id;
  const approvals = lead ? evs.filter((e) => e.kind === "approval" && e.actor_id === lead && !!data(e).to).length : 0;
  const builtBy = (id: string, ts: Ticket[]) => ts.filter((t) => t.assignee_id === id);
  const sentBack = [...sentBackIds].map((id) => ws.byId.get(id)).filter((t): t is Ticket => !!t);
  const builders = new Set([...merged, ...sentBack].map((t) => t.assignee_id).filter((id): id is string => !!id));
  if (lead && approvals) builders.add(lead);
  const agents = [...builders]
    .map((id): AgentStat => {
      const mine = builtBy(id, merged);
      return { id, captain: id === lead, merged: mine.length, medianMs: medianOf(mine), sentBack: builtBy(id, sentBack).length, approvals: id === lead ? approvals : 0 };
    })
    .sort((a, b) => Number(a.captain) - Number(b.captain) || b.merged - a.merged || ws.nameOf(a.id).localeCompare(ws.nameOf(b.id)));

  return {
    range,
    merged,
    reviewed: reviewed.length,
    tested: tested.length,
    medianMs: medianOf(merged),
    asked: { total: kinds.reduce((n, k) => n + k.count, 0), kinds },
    sentBack: { total: sentBackIds.size, byReview: byReview.size, reopened: reopened.size },
    bars: bars(range, merged),
    agents,
  };
}

// ------------------------------------------------------------------ the sentences

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WHEN: Record<Period, string> = { week: "this week", "4weeks": "in the last 4 weeks" };

/** How the merged tickets were checked, saying only what the record shows. */
export function checkedText(r: Results): string {
  const n = r.merged.length;
  if (r.reviewed < n) return `${r.reviewed} of ${n} reviewed`;
  if (r.tested < n) return n === 1 ? "reviewed" : "all reviewed";
  return n === 1 ? "reviewed and tested" : "all reviewed and tested";
}

/** "23 tickets merged this week, all reviewed and tested. You were asked 4 times." */
export function headline(r: Results): string {
  const asked = r.asked.total === 0 ? "You weren't asked anything." : `You were asked ${r.asked.total === 1 ? "once" : `${r.asked.total} times`}.`;
  return `${plural(r.merged.length, "ticket")} merged ${WHEN[r.range.period]}, ${checkedText(r)}. ${asked}`;
}

/** The empty state: one plain sentence. */
export const emptyText = (r: Results) => (r.range.period === "week" ? "Nothing has merged this week yet." : "Nothing has merged in the last 4 weeks.");

/** The chart for people who can't see it: every bar, in words. */
export function barsText(r: Results): string {
  return `Merged tickets per ${r.range.period === "week" ? "day" : "week"}: ${r.bars.map((b) => `${b.name}: ${b.count}`).join("; ")}.`;
}

export const sentBackCaption = (r: Results) => `${r.sentBack.byReview} after review · ${r.sentBack.reopened} reopened after done`;

// ------------------------------------------------------------------ the audit export

export interface AuditRow {
  /** ISO time, UTC. */
  time: string;
  type: "ticket" | "decision";
  key: string;
  title: string;
  /** What happened, in a few plain words: "Created", "Approved", "Done". */
  event: string;
  detail: string;
  /** The approved commit, for an approval. */
  commit: string;
  actor: string;
  actor_kind: "person" | "agent" | "";
}

const label = (s: string | null | undefined) => (s && ["backlog", "ready", "in_progress", "review", "done", "canceled"].includes(s) ? statusLabel(s as Status) : (s ?? ""));

const CLEARED: Record<string, string> = { pr_changed: "the pull request changed", assignee_changed: "the ticket was reassigned" };

function happened(ws: Workspace, e: TicketEvent): Pick<AuditRow, "event" | "detail" | "commit"> {
  const d = e.data as Record<string, string | null | undefined>;
  const row = (event: string, detail = "", commit = "") => ({ event, detail, commit });
  switch (e.kind) {
    case "created":
      return row("Created", label(d.status));
    case "status":
      return row(d.to === "done" ? "Done" : "Status changed", `${label(d.from)} → ${label(d.to)}`);
    case "approval":
      return d.to ? row("Approved", `commit ${d.to}`, d.to) : row("Approval cleared", CLEARED[d.reason ?? ""] ?? "");
    case "merge_ok":
      return d.by ? row("Merge OK'd", `by ${ws.nameOf(d.by)}`) : row("Merge OK cleared", CLEARED[d.reason ?? ""] ?? "");
    case "needs_human":
      return row("Asked a person", d.note ?? "");
    case "assignee":
      return d.to ? row("Assigned", `to ${ws.nameOf(d.to)}`) : row("Unassigned");
    case "pr":
      return row("Pull request opened", d.url ?? "");
    case "comment":
      return row("Commented");
    case "priority":
      return row("Priority changed", `${d.from ?? ""} → ${d.to ?? ""}`);
    case "title":
      return row("Renamed", `${d.from ?? ""} → ${d.to ?? ""}`);
    case "branch":
      return row("Branch set", d.branch ?? "");
    case "step":
      return row("Step", `${d.label ?? ""}: ${d.status ?? ""}`);
    case "summary":
      return row("Summary written");
    default:
      return row(e.kind);
  }
}

function actor(ws: Workspace, id: string | null, type?: string | null): Pick<AuditRow, "actor" | "actor_kind"> {
  if (!id) return { actor: "AutoKolab", actor_kind: "" };
  const kind = type === "human" || ws.people.profiles.has(id) ? "person" : type === "agent" || ws.agentOf(id) ? "agent" : "";
  return { actor: ws.nameOf(id), actor_kind: kind };
}

/** One row per ticket event and per decision recorded in the period, oldest first. */
export function auditRows(ws: Workspace, events: TicketEvent[], range: Range): AuditRow[] {
  const rows: AuditRow[] = [];
  for (const e of events) {
    if (!inRange(range, e.created_at)) continue;
    const t = ws.byId.get(e.ticket_id);
    rows.push({ time: new Date(e.created_at).toISOString(), type: "ticket", key: t?.key ?? "", title: t?.title ?? "", ...happened(ws, e), ...actor(ws, e.actor_id, e.actor_type) });
  }
  for (const d of ws.decisions) {
    if (!inRange(range, d.created_at)) continue;
    rows.push({ time: new Date(d.created_at).toISOString(), type: "decision", key: d.key, title: d.title, event: d.kind === "contract" ? "Contract recorded" : "Decision recorded", detail: "", commit: "", ...actor(ws, d.created_by) });
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time));
}

const COLUMNS: (keyof AuditRow)[] = ["time", "type", "key", "title", "event", "detail", "commit", "actor", "actor_kind"];

// A cell a spreadsheet would run as a formula is written as text instead.
const cell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function auditCsv(rows: AuditRow[]): string {
  return [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

export function auditJson(ws: Workspace, rows: AuditRow[], range: Range): string {
  const without = ({ type: _type, ...rest }: AuditRow) => rest;
  return JSON.stringify(
    {
      project: ws.project.name,
      repo: ws.project.repo,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      events: rows.filter((r) => r.type === "ticket").map(without),
      decisions: rows.filter((r) => r.type === "decision").map(({ time, key, title, event, actor, actor_kind }) => ({ time, key, title, event, actor, actor_kind })),
    },
    null,
    2,
  );
}

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "shop-audit-2026-10-05-to-2026-10-11.csv" */
export const auditFileName = (slug: string, range: Range, ext: "csv" | "json") => `${slug}-audit-${day(range.from)}-to-${day(range.to)}.${ext}`;
