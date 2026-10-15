import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { AutoKolabError, friendly } from "./client.js";
import { areaWaits, areaWaitText, cleanAreas } from "./areas.js";
import { ago } from "./format.js";
import { looksLikeSecret } from "./secrets.js";

// Projects (v2, autokolab.com): the ticket board, the Project Guide and decisions, as an agent
// sees them. Used by the MCP tools and by the runner. No Node imports.

export type Status = "backlog" | "ready" | "in_progress" | "review" | "done" | "canceled";
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type TicketType = "feature" | "bug" | "task" | "chore" | "epic";
export type StepStatus = "todo" | "now" | "done";
export type AgentStatus = "idle" | "planning" | "building" | "waiting_human" | "blocked" | "paused" | "offline";

export const STATUSES: Status[] = ["backlog", "ready", "in_progress", "review", "done", "canceled"];
export const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];
export const TYPES: TicketType[] = ["feature", "bug", "task", "chore", "epic"];
export const GUIDE_PARTS = ["concept", "architecture", "rules"] as const;
export type GuidePart = (typeof GUIDE_PARTS)[number];

const STATUS_LABEL: Record<Status, string> = { backlog: "Backlog", ready: "Ready", in_progress: "In progress", review: "Review", done: "Done", canceled: "Canceled" };

export interface Project {
  id: string;
  name: string;
  slug: string;
  repo: string | null;
  default_branch: string;
  ticket_prefix: string;
  /** The agent that turns people's requests into tickets and assigns them. */
  lead_agent_id: string | null;
  /** The project's room (schema 7). */
  room_id: string | null;
  /** How approved PRs get merged (schema 12, DEC-19). Missing on older servers. */
  merge_policy?: MergePolicy;
}

/** DEC-19: ask (a person merges), auto_safe (risky changes wait for a person's OK), auto_all. */
export type MergePolicy = "ask" | "auto_safe" | "auto_all";
export const MERGE_POLICY_LABEL: Record<MergePolicy, string> = {
  ask: "a person merges",
  auto_safe: "auto-merge safe changes",
  auto_all: "auto-merge everything",
};

/** How hard an agent thinks: the five levels both Claude Code and Codex accept (schema 10). */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** An agent's model and effort as set on AutoKolab (schema 10); null means its machine decides. */
export interface AgentModel {
  model: string | null;
  effort: string | null;
  model_set_by: string | null;
  /** What its latest run used, reported by its runner (schema 11). effective_at null: never reported. */
  effective_model?: string | null;
  effective_effort?: string | null;
  effective_at?: string | null;
}

/** What a runner reports about its day (schema 19): seconds used, the owner's limit, the local day, and when a limit wait ends. */
export interface UsageReport {
  used_s: number;
  limit_s: number;
  /** The local day on the agent's machine, "2026-10-11". */
  day: string;
  waiting_until: string | null;
}

/**
 * Which computer an agent runs on and, for an API-model agent, its active daily dollar limit
 * (schema 25). Non-secret values only: never a key or the settings file.
 */
export interface MachineReport {
  /** The computer's name; null when it isn't a plain hostname. */
  machine: string | null;
  /** daily_usd from the runner's settings, 0 for no limit; null for agents that don't spend dollars. */
  daily_usd: number | null;
}

/** Why the runner started its agent: to build a ticket, review one, reply in the room, or look at a worker's question. */
export type RunKind = "build" | "review" | "reply" | "question";

/**
 * Which path a run took (schema 26, AK-120): a review of the whole PR (full), of only the commits
 * since the last review (re_review) or a small safe PR on the cheaper model (light); or a build
 * resuming after a conflict send-back (conflict_fix). Other runs have none.
 */
export type RunPath = "full" | "re_review" | "light" | "conflict_fix";

/**
 * What one run used (schema 20), as the tool reported it: null where it didn't say, never an
 * estimate. Numbers and the model's name only; no message or prompt text.
 */
export interface RunUsageRow {
  kind: RunKind;
  ticket_id: string | null;
  model: string | null;
  input_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  output_tokens: number | null;
  turns: number | null;
  /** How long the run took, measured by the runner. */
  seconds: number;
  cost_usd: number | null;
  path: RunPath | null;
}

/** The model and effort a run launched with; "" means the tool's own default (schema 11). */
export interface RanWith {
  model: string;
  effort: string;
}

/** Report presence while tolerating databases before project scoping (27) and model reports (11). */
export async function reportAgentStatus(sb: SupabaseClient, status: AgentStatus, note: string | null = null,
  ticketId: string | null = null, ran?: RanWith, projectId: string | null = null): Promise<void> {
  const args: Record<string, unknown> = { p_status: status, p_note: note, p_ticket: ticketId, p_project: projectId };
  if (ran) Object.assign(args, { p_model: ran.model.slice(0, 100), p_effort: ran.effort });
  let res = await sb.rpc("agent_status", args);
  if (res.error && /p_project|function/i.test(res.error.message)) {
    delete args.p_project;
    res = await sb.rpc("agent_status", args);
  }
  if (res.error && ran && /p_model|p_effort|function/i.test(res.error.message)) {
    delete args.p_model;
    delete args.p_effort;
    res = await sb.rpc("agent_status", args);
  }
  check(res);
}

interface AgentInfo extends AgentModel {
  status: AgentStatus;
  status_note: string | null;
  last_seen_at: string | null;
  vendor: string;
  owner_label: string;
}

export interface Ticket {
  id: string;
  project_id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  type: TicketType;
  priority: Priority;
  status: Status;
  labels: string[];
  parent_id: string | null;
  assignee_id: string | null;
  assignee_type: "human" | "agent" | null;
  reporter_id: string;
  done_means: string[];
  branch: string | null;
  pr_url: string | null;
  needs_human: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** The PR head commit the lead approved, and a person's OK for a risky change (schema 12). */
  approved_sha?: string | null;
  approved_at?: string | null;
  merge_ok_by?: string | null;
  merge_ok_at?: string | null;
  /** One plain sentence on what the ticket changed (schema 14). Missing on older databases. */
  summary?: string | null;
  /** What the reviewer recorded with its approval (schema 16). */
  review?: Review | null;
  /** Everyone who has been the assignee while it was being built (schema 17). Missing on older databases. */
  built_by?: string[] | null;
  /** What GitHub last said about the PR, recorded by the lead's runner (schema 18). Missing on older databases. */
  pr_facts?: PrFacts | null;
  /** The repo paths or globs it touches; empty means no check (schema 26). Missing on older databases. */
  areas?: string[] | null;
}

/**
 * A ticket's scheduling fields: everything the board reads while looking for work, without the long
 * text (description, done means, labels). The runner reads this every tick and the full ticket only
 * for the run it starts (AK-146).
 */
export type TicketLight = Pick<
  Ticket,
  | "id" | "project_id" | "number" | "key" | "title" | "type" | "priority" | "status"
  | "assignee_id" | "sort_order" | "areas" | "needs_human" | "approved_sha" | "pr_url" | "branch" | "updated_at"
>;

/** The columns ticketsLight reads; keep in step with TicketLight (AK-146). */
export const LIGHT_COLUMNS =
  "id, project_id, number, key, title, type, priority, status, assignee_id, sort_order, areas, needs_human, approved_sha, pr_url, branch, updated_at";
/** How long the runner trusts a cached light list without a realtime change (AK-146). */
export const LIGHT_TTL_MS = 5 * 60_000;

/**
 * The Ready tickets assigned to `me` that can start now, best first: their blockers are done and
 * nothing In progress or in Review touches the same files (AK-126). `waiting` are the ones held
 * back only by the same files, with the tickets they wait for.
 */
export function readyToStart(
  all: TicketLight[],
  links: { ticket_id: string; blocked_by: string }[],
  me: string,
): { ready: TicketLight[]; waiting: { ticket: TicketLight; on: TicketLight[] }[] } {
  const byId = new Map(all.map((t) => [t.id, t]));
  const unblocked = all
    .filter((t) => t.assignee_id === me && t.status === "ready" && !t.needs_human)
    .filter((t) => links.filter((l) => l.ticket_id === t.id).every((l) => ["done", "canceled"].includes(byId.get(l.blocked_by)?.status ?? "done")))
    .sort((a, b) => rank(a.priority) - rank(b.priority) || a.sort_order - b.sort_order);
  const ready: TicketLight[] = [];
  const waiting: { ticket: TicketLight; on: TicketLight[] }[] = [];
  for (const t of unblocked) {
    const on = areaWaits(t, all);
    if (on.length) waiting.push({ ticket: t, on });
    else ready.push(t);
  }
  return { ready, waiting };
}

/**
 * Two runners can claim overlapping tickets at the same moment. Right after a claim, the ticket with
 * the higher number gives way to any overlapping one that was claimed alongside it.
 */
export function mustGiveWay(claimed: TicketLight, all: TicketLight[]): TicketLight[] {
  return areaWaits(claimed, all).filter((o) => o.number < claimed.number);
}

/** The lead's runner's snapshot of a PR, for "How do you know?" (AK-57). */
export interface PrFacts {
  /** The PR's head commit these facts are about. */
  sha: string;
  checks: { passed: number; total: number; state: "success" | "pending" | "failure" };
  /** How many files the PR changes, the ones that wait for a person's OK, and each with its counts (schema 28). */
  files: { total: number; risky: string[]; list?: { path: string; additions: number; deletions: number }[] };
  additions: number;
  deletions: number;
  /** Set by the database when it's recorded. */
  checked_at?: string;
}

/** What a reviewer records when it approves a commit: the evidence behind "How do you know?". */
export interface Review {
  /** One plain sentence on what the change does. */
  summary?: string;
  /** For a risky change: the one yes/no question a person is asked before it merges. */
  question?: string;
  /** The line that matters, and what it means in plain words. */
  line?: { file: string; code: string; plain?: string };
  /** The decision keys the change was checked against. */
  decisions?: string[];
  /** Where the reviewer is less sure. Always present. */
  less_sure: string;
}

export const NOTHING_UNSURE = "Nothing I'm unsure about here.";

export interface Step {
  ticket_id: string;
  idx: number;
  label: string;
  status: StepStatus;
  note: string | null;
}

export interface Comment {
  id: number;
  ticket_id: string;
  author_id: string;
  author_type: "human" | "agent";
  body: string;
  created_at: string;
}

interface Decision {
  id: string;
  key: string;
  kind: "decision" | "contract";
  title: string;
  body: string;
  ticket_id: string | null;
  created_at: string;
  superseded_by: string | null;
}

const DECISION_REF = /\b(?:DEC|CON)-\d+\b/gi;
export const TICKET_DECISIONS_LIMIT = 12_000;

function decisionText(d: Decision, byId: Map<string, Decision>, tickets: Map<string, Ticket>): string {
  const replacement = d.superseded_by ? byId.get(d.superseded_by) : undefined;
  const first = replacement ? `Replaced by ${replacement.key}.\n` : d.superseded_by ? "Replaced by another decision.\n" : "";
  const source = d.ticket_id ? tickets.get(d.ticket_id)?.key : undefined;
  return `${first}${d.key} (${d.kind}): ${d.title}\nRecorded: ${d.created_at}${source ? `\nFrom ticket: ${source}` : ""}\n\n${d.body}`;
}

function briefDecision(d: Decision): string {
  // A code fence is not prose: stop before it rather than join its contents into the sentence.
  const beforeCode = d.body.split(/^\s*```/m, 1)[0].trim().replace(/\s+/g, " ");
  const excerpt = beforeCode.slice(0, 400);
  const cut = beforeCode.length > 400 || beforeCode.length < d.body.trim().replace(/\s+/g, " ").length;
  const pointer = cut || d.kind === "contract" ? `… (decision_get ${d.key} for the full text)` : "";
  return `- ${d.key}${d.kind === "contract" ? " (contract)" : ""}: ${d.title}${excerpt ? ` · ${excerpt}` : ""}${pointer}`;
}

interface Guide {
  concept: string;
  architecture: string;
  rules: string;
}

/** DEC-17: the lead acts on its own and asks its person only before big work. */
export const BIG_WORK = "a new epic or more than 3 tickets, migrations, dependencies, auth/security/CI/infra changes, deleting a feature, or changing a decision";
/** DEC-24: Captain's messages to people should read like a short chat. */
export const LEAD_VOICE = "To a person (room, Needs you, ticket reply), write like a helpful colleague texting: two or three short plain sentences, about 400 characters. Ask one question, last; prefer yes/no. No headings, tables, code, file paths or commit ids unless asked; lists only for two or three short items. Put detail in a ticket comment and name its key. Say what happened and what you need; never paste logs or tool output. Messages to agents can be as detailed as needed.";
/** AK-90: each message to an agent can start a model run, so the ticket is the report. */
export const ROOM_QUIET = "When you finish a ticket, don't post in the room: the ticket's status and your final comment are the report, and Captain's runner picks it up from there. Write to another agent only to ask something you can't answer from the ticket, the guide or the decisions, or to answer a question you were asked; one message with everything. Never post to say you started, are continuing, agree, or have nothing to add.";
/** AK-96: the folders whose changes show on a screen, so someone has to look at them. */
export const SCREEN_PATHS = ["apps/site/", "apps/web/"];
export function changesScreens(files: string[]): boolean {
  return files.some((f) => SCREEN_PATHS.some((p) => f.startsWith(p)));
}
/** AK-96: builders look at the pages they change. */
export const LOOK_BUILD = "When a ticket changes anything under apps/site or apps/web, run `npm run look -- <the pages you touched>` before Review (it takes screenshots at desktop and phone width; `npm run look -- --help` has the options), open the screenshots, and say in your final comment what you saw at each width. Exit code 1 means a page is broken: fix it. Exit code 2 means the browser couldn't start: say plainly that you couldn't look and why, and carry on; the reviewer looks instead.";
/** AK-96: looking at a page is never a person's chore. */
export const LOOK_NEVER_ASK = 'Never set "Needs you", post a question or create a ticket asking a person to look at a page or check a layout. If the builder couldn\'t look, the reviewer does; if neither could, say so in the approval\'s less_sure and carry on.';
/** AK-96: a website change is looked at in review, not only tested. `where` is the checkout to run it in. */
export function reviewLook(where: string, base: string): string {
  return `This PR changes the website (${SCREEN_PATHS.join(" or ")}), so look at it too. In ${where}, run \`npm install\` if node_modules is missing (that, and screenshots saved outside the checkout, are all you may add), then \`npm run look -- <the pages the change affects>\` and open the screenshots at each width. Exit code 1 (a page didn't load, has console errors or scrolls sideways) means it isn't approved on tests alone: send it back saying what you saw, unless ${base} has the same problem. Exit code 2 means you couldn't look. Either way, record in less_sure what you looked at, or that you couldn't and why. ${LOOK_NEVER_ASK}`;
}
/** AK-100: a person's "Needs you" lists each request once and only while it still needs them. */
export const LEAD_ASK_ONCE =
  "Asking a person: ask through one channel only. When the question is about a ticket, set needs_human on that ticket; post a kind=question to them in the room only when it isn't about any ticket. Never both. Before asking, check whether you already have an open request about the same thing (the ticket's Needs you, or your question's thread); if so, update it (edit needs_human, or reply in that thread) instead of asking again. When something you asked about is settled without the person, close your request in the same run: question_close with the question's id and one sentence on how, or ticket_update needs_human=null. Don't ask a person for something an agent can do: if another agent can review, test or look at a page, ask that agent.";
/** CON-23: the block a plan message ends with. The website shows it as a plan card. */
export const PLAN_BLOCK = "```autokolab-plan\ngoals: AK-60, AK-61\nasks: AK-62, AK-64\nnot: Password reset and account deletion are not in this plan.\n```";

/** CON-23 / AK-60: how the lead proposes big work. Its tickets wait in Backlog until the person says "OK, start". */
export const LEAD_PLAN = `Propose it as a plan instead of starting it. First create the goal(s) (epics) and every ticket under them in Backlog, complete and assigned. Then post ONE kind=question message to them in the room: a short plain summary (how many goals and tickets, and what you'll ask them about), ending with this block, in this exact format, with nothing after it:
${PLAN_BLOCK}
goals: the keys of the plan's goals, comma-separated (their tickets are the plan; don't list them). asks (optional): the keys of the plan's tickets you expect to wait for their OK (database, CI, dependencies or sign-in changes). not (optional): one sentence on what is out of scope. Then stop. When they reply "OK, start" in that thread, the website has already moved the tickets to Ready: there is nothing to move, so reply only if something needs saying. Any other reply asks for changes: edit the draft tickets, then post a new plan message with the same goals, which replaces the old one.`;

export function leadAutonomy(person: string): string {
  return `You run unattended too, while ${person} is away. Decide and act on your own (answer workers, delegate, create and assign tickets, review), then say what you did. Before big work (${BIG_WORK}), ask ${person} first. ${LEAD_PLAN}`;
}

/** How to write what goes with an approval. People read it on the website to decide whether to trust the change. */
export const REVIEW_EVIDENCE =
  `With the approval, record what you found (ticket_approve's other fields). People read this instead of the diff, so write for someone who doesn't code, and say what is true rather than persuade. less_sure (always): what you couldn't run or check, or "${NOTHING_UNSURE}" summary: one plain sentence on what the change does for the people using the product. question (required when the PR touches the database, CI, dependencies, auth or secrets): what happens to existing users or data, then one yes/no question specific to this change, like "Existing sessions keep working and get an empty provider. OK to add the column?", never just "OK to merge?". line_file, line_code, line_plain: the one line that matters most, copied from the diff, and what it means in plain words. decisions: the decision keys you checked the change against.`;

/** How the lead signs off on a PR (AK-30): the runner merges only the commit it approved. */
export const LEAD_APPROVAL =
  'Review each PR in Review against its "done means": read the diff and check CI. Then approve it with ticket_approve, passing sha=<the commit you reviewed> (it refuses if the PR moved on since), or comment on what\'s missing. Approve only the commit you actually reviewed: a new push needs a new approval, because your runner merges only the approved commit, once its tests pass and the project\'s merge setting allows it. You can\'t approve your own work: when you built a ticket yourself, ask a worker in the room to review it and approve it with ticket_approve, or ask your person. ' +
  REVIEW_EVIDENCE;

export const LEAD_UNDO = "When a person asks to undo a merged ticket, create one new ticket for a worker to revert that pull request's merge commit with git revert on a new branch. Its PR must target the default branch and go through the normal tests, review, approval and merge. Never revert a database migration; tell the person why it needs a manual plan instead. Reply with the new ticket's key.";

/** What Captain writes so people can recognise goals and see current work. */
export const LEAD_WORK_SUMMARIES = `A goal is one feature a person using the product would recognise and notice when finished. If nobody could notice it being done, it is not a goal. Name it in two to four plain words, with no colon or subtitle: "Google sign-in", not "Auth: OAuth callback and sessions". Give it a summary: one present-tense sentence about what people can do when it is done, such as "People can sign in with their Google account." Keep each goal small enough to finish in days, about three to ten tickets; split bigger work into several goals. Fixes and upkeep that belong to no feature need no goal.
Every ticket gets a summary when created: a plain phrase finishing "<agent> is …". Start with a lowercase -ing verb; use no ticket keys, file names or jargon; keep it to 120 characters. Examples: "adding Apple Pay to the checkout" and "making a profile page for people who sign in for the first time". Keep the title, description and done means written for the agent as usual.`;

/** What the lead does. Shown to the lead in project_brief. */
export function leadGuide(project: string, people: string[]): string {
  const who = people.length ? `${people.join(" and ")} ${people.length === 1 ? "talks" : "talk"}` : "The people on this project talk";
  return `You are Captain, the lead agent of ${project}. ${who} to you, and you turn what they want into tickets the worker agents can do without asking anything. Workers only see the ticket, never your conversation, so the ticket is the whole brief. People see you as Captain and see epics as goals; the tools and data still say lead and epic.
1. Understand first: read the code involved, the guide and the decisions. Ask your person only about real product choices.
2. Split the work into tickets of a few hours each, one clear outcome per ticket. For a goal that needs several tickets, create an epic (a goal) first and put the tickets under it.
${LEAD_WORK_SUMMARIES}
3. Write every ticket like this:
   - Title: the outcome, as an instruction ("Add Google sign-in to /login").
   - Description, with these headings: **Context** (why, for whom), **What to do** (the behaviour and the approach to take), **Where** (files, modules, APIs and existing code to follow), **Not in scope**, **Notes** (decisions, gotchas, how to test).
   - Done means: 2 to 6 checkable items, including the tests that must pass.
   - Areas: the repo paths or globs it will change, such as "packages/autokolab/src/runner/**" or "GUIDE.md" (a plain folder covers everything under it). A runner doesn't start a ticket while another ticket In progress or in Review touches the same areas, and the ticket says what it's waiting for. Keep them as narrow as the work allows; leave them empty only when you can't tell.
   - Blocked by: tickets that must land first, when one needs the other's result, not just the same files.
4. Assign each ticket to a worker agent (see Agents below: status and open tickets) and put it in Ready so it starts now, or Backlog if it shouldn't start yet. Spread the work; don't stack one agent while another is idle.
5. Tell your person what you created: keys, who has what, and the order.
6. Your runner starts you on a review of each worker's PR by itself once its tests pass, and sends failing tests back to the worker, so nobody has to ask. The board is the report, for workers and for you: ${ROOM_QUIET} Ask workers with kind=question and assign with kind=task: only question, task, review and answer wake an agent. Whenever your person comes back or asks, also check tickets with "Needs you" and in Review. Answer a worker's question yourself on its ticket (ticket_comment, then ticket_update needs_human=null) when the answer is in the code, guide or decisions; bring real product choices to your person. ${LEAD_ASK_ONCE} ${LEAD_APPROVAL} Record settled choices with decision_add. ${LOOK_NEVER_ASK}
7. ${leadAutonomy("your person")}
8. ${LEAD_UNDO}
9. You may change a worker's model and effort with agent_model when the work calls for it: stronger (e.g. opus, high) for hard, risky or wide changes; lighter (e.g. sonnet or haiku, low/medium) for routine, small or docs work. Prefer changing it right before assigning the ticket, and always give the reason. Owners can lock their machine (model_locked), in which case your change won't take effect there.
${LEAD_VOICE}`;
}

/** Used when a project has no rules written yet. Same as the website's recommended rules. */
export function defaultRules(defaultBranch: string): string {
  return [
    "- Only work on tickets assigned to you that are in Ready or In progress.",
    "- When you start, move the ticket to In progress and plan the steps on it.",
    "- One branch per ticket, named <ticket key>-<short-title>. Commit and push early so others can see your work.",
    `- Never push to ${defaultBranch}. Open a pull request against ${defaultBranch} (even when your branch builds on unmerged work) and move the ticket to Review.`,
    '- Every item under "Done means" must be true before you move a ticket to Review. Run the tests and the type checker first.',
    `- ${LOOK_BUILD}`,
    `- ${LOOK_NEVER_ASK}`,
    "- Follow the decisions. If you need to break one, ask first.",
    '- If something is ambiguous, first put the background in a ticket comment, then set "Needs you" to one short question a person can answer without opening anything.',
    "- If you find more work, create a new ticket instead of growing this one.",
    `- ${ROOM_QUIET}`,
    '- Don\'t post just to acknowledge ("thanks", "ok"). If you have nothing useful to add, make your final message exactly NO_REPLY.',
    "- When you finish, replace the ticket's summary with one plain sentence on what changed for people, such as \"Shoppers can pay with Apple Pay.\"",
    "- Never put keys, tokens or passwords in tickets, comments or code.",
  ].join("\n");
}

function check<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error) {
    const m = r.error.message;
    if (m.includes("AUTOKOLAB_")) throw new AutoKolabError(m.replace(/^.*AUTOKOLAB_[A-Z_]+:\s*/, ""));
    throw friendly(r.error);
  }
  return r.data as T;
}

/** The database is older than the column being written (PostgREST's PGRST204, Postgres's 42703). */
export function missingColumn(e: { message: string; code?: string }): boolean {
  return e.code === "PGRST204" || e.code === "42703";
}

const rank = (p: Priority) => PRIORITIES.indexOf(p);

export class ProjectView {
  private names = new Map<string, { name: string; type: "human" | "agent" }>();
  private agentInfo = new Map<string, AgentInfo>();
  /** The database has no record_pr_facts yet (before schema 18). */
  private prFactsMissing = false;
  /** The database has no report_usage yet (before schema 19). */
  private usageMissing = false;
  /** The database has no report_machine yet (before schema 25). */
  private machineMissing = false;
  /** The database has no record_run_usage yet (before schema 20). */
  private runUsageMissing = false;
  /** The database's record_run_usage has no p_path yet (before schema 26). */
  private runPathMissing = false;
  /** The scheduling list kept between ticks; refetched when realtime says it changed, or after 5 minutes (AK-146). */
  private light: { at: number; rows: TicketLight[] } | null = null;
  /** Realtime saw a change to tickets, comments or links: the next read must refetch (AK-146). */
  private lightStale = false;
  /** The database is older than schema 26 and has no `areas`: read the full list instead (AK-146). */
  private lightFull = false;
  /** The runner's rough byte counter, for its once-every-10-minutes log (AK-146). */
  onDownload?: (bytes: number) => void;

  private constructor(
    readonly sb: SupabaseClient,
    readonly meId: string,
    readonly project: Project,
  ) {}

  /** Projects this member is in. Empty if the server doesn't have projects yet. */
  static async mine(sb: SupabaseClient): Promise<Project[]> {
    // "*": merge_policy only exists from schema 12, and this must keep working before it.
    const r = await sb.from("projects").select("*").order("created_at");
    if (r.error) return [];
    return r.data as Project[];
  }

  /** The project for a repo ("owner/name"), else the only project this member is in, else null. */
  static async find(sb: SupabaseClient, meId: string, ref?: string | null, repo?: string | null): Promise<ProjectView | null> {
    const all = await ProjectView.mine(sb);
    const want = ref?.toLowerCase();
    const p =
      (want && all.find((x) => x.id === want || x.slug === want || x.repo === want || x.name.toLowerCase() === want)) ||
      (repo && all.find((x) => x.repo === repo.toLowerCase())) ||
      (!want && all.length === 1 ? all[0] : undefined);
    if (!p) return null;
    const v = new ProjectView(sb, meId, p);
    await v.loadNames();
    return v;
  }

  static async all(sb: SupabaseClient, meId: string): Promise<ProjectView[]> {
    const views = (await ProjectView.mine(sb)).map((p) => new ProjectView(sb, meId, p));
    await Promise.all(views.map((v) => v.loadNames()));
    return views;
  }

  // ------------------------------------------------------------------ people

  async loadNames(): Promise<void> {
    const members = check<{ actor_id: string; actor_type: "human" | "agent" }[]>(
      await this.sb.from("project_members").select("actor_id, actor_type").eq("project_id", this.project.id),
    );
    const humans = members.filter((m) => m.actor_type === "human").map((m) => m.actor_id);
    const agents = members.filter((m) => m.actor_type === "agent").map((m) => m.actor_id);
    const [p, a] = await Promise.all([
      humans.length ? this.sb.from("profiles").select("id, name, github_login").in("id", humans) : Promise.resolve({ data: [], error: null }),
      // "*": model and effort only exist from schema 10, and this must keep working before it.
      agents.length ? this.sb.from("agents").select("*").in("id", agents) : Promise.resolve({ data: [], error: null }),
    ]);
    this.names.clear();
    for (const x of check<{ id: string; name: string }[]>(p as never)) this.names.set(x.id, { name: x.name, type: "human" });
    this.agentInfo.clear();
    for (const x of check<(AgentInfo & { id: string; display_name: string })[]>(a as never)) {
      this.names.set(x.id, { name: x.display_name, type: "agent" });
      this.agentInfo.set(x.id, { ...x, model: x.model ?? null, effort: x.effort ?? null, model_set_by: x.model_set_by ?? null });
    }
  }

  nameOf(id: string | null | undefined): string {
    if (!id) return "nobody";
    return this.names.get(id)?.name ?? "someone";
  }

  /** A person's or agent's id from their name; "me" is you. */
  resolveActor(ref: string): string {
    if (ref === "me") return this.meId;
    const r = ref.replace(/^@/, "").toLowerCase();
    const hit = [...this.names.entries()].find(([id, x]) => id === ref || x.name.toLowerCase() === r);
    if (!hit) throw new AutoKolabError(`No one called "${ref}" in ${this.project.name}. People and agents here: ${this.peopleLine()}`);
    return hit[0];
  }

  peopleLine(): string {
    return [...this.names.values()].map((x) => `${x.name}${x.type === "agent" ? " (agent)" : ""}`).join(", ");
  }

  get leadId(): string | null {
    return this.project.lead_agent_id;
  }

  get iAmLead(): boolean {
    return this.project.lead_agent_id === this.meId;
  }

  isAgent(id: string | null | undefined): boolean {
    return !!id && this.names.get(id)?.type === "agent";
  }

  /** "sonnet · medium (set by raghavendra-claude)", or "model set on its machine", plus what it last ran. Null for a non-agent. */
  modelLine(agentId: string, withRun = true): string | null {
    const a = this.agentInfo.get(agentId);
    return a ? modelText(withRun ? a : { ...a, effective_at: undefined }, (id) => this.nameOf(id)) : null;
  }

  /**
   * Set or clear an agent's model and effort through set_agent_model; the database decides who may
   * (DEC-18). It sets both at once, so the value not being changed is read fresh and passed back.
   */
  async setModel(agentRef: string, change: ModelChange): Promise<{ agentId: string; name: string; before: AgentModel; after: AgentModel }> {
    const id = this.resolveActor(agentRef);
    if (!this.isAgent(id)) throw new AutoKolabError(`${this.nameOf(id)} isn't an agent. Agents here: ${[...this.agentInfo.keys()].map((x) => this.nameOf(x)).join(", ")}`);
    if (change.model) this.noSecrets(change.model);
    const row = check<AgentModel | null>(await this.sb.from("agents").select("*").eq("id", id).maybeSingle());
    const before: AgentModel = { model: row?.model ?? null, effort: row?.effort ?? null, model_set_by: row?.model_set_by ?? null };
    const next = nextModel(before, change);
    const after = check<AgentModel>(await this.sb.rpc("set_agent_model", { p_agent: id, p_model: next.model, p_effort: next.effort }));
    const info = this.agentInfo.get(id);
    if (info) this.agentInfo.set(id, { ...info, model: after.model, effort: after.effort, model_set_by: after.model_set_by });
    return { agentId: id, name: this.nameOf(id), before, after };
  }

  /**
   * A worker agent only gets what's written on its ticket, so work handed to an agent must say
   * what to do and what done means.
   */
  private checkBrief(t: { title: string; description?: string; done_means?: string[]; status?: Status; assignee_id?: string | null; type?: TicketType }): void {
    if (!this.isAgent(t.assignee_id) || t.assignee_id === this.meId || t.type === "epic") return;
    if (!["ready", "in_progress"].includes(t.status ?? "backlog")) return;
    const missing: string[] = [];
    if ((t.description ?? "").trim().length < 120) missing.push("a description with the context, what to do and where in the code (at least a few sentences)");
    if (!(t.done_means ?? []).filter((d) => d.trim()).length) missing.push('"done means": checkable items, including tests');
    if (missing.length) {
      throw new AutoKolabError(`${this.nameOf(t.assignee_id)} only sees what's on the ticket. Before giving it work in ${t.status === "ready" ? "Ready" : "In progress"}, add ${missing.join(" and ")}. (Or leave it in Backlog for now.)`);
    }
  }

  // ------------------------------------------------------------------ tickets

  key(ref: string): string {
    const r = ref.trim().toUpperCase();
    return /^\d+$/.test(r) ? `${this.project.ticket_prefix}-${r}` : r;
  }

  async tickets(): Promise<Ticket[]> {
    const rows = check<Ticket[]>(await this.sb.from("tickets").select("*").eq("project_id", this.project.id).order("sort_order"));
    this.noteDownload(rows);
    return rows;
  }

  /**
   * The board without the long text, for scheduling (AK-146). Kept between ticks: it's refetched
   * when realtime says tickets, comments or links changed (invalidateLight), or after LIGHT_TTL_MS.
   * A database before schema 26 (no `areas`) falls back to the full list.
   */
  async ticketsLight(force = false): Promise<TicketLight[]> {
    if (!force && this.light && !this.lightStale && Date.now() - this.light.at < LIGHT_TTL_MS) {
      this.onDownload?.(0);
      return this.light.rows;
    }
    let rows: TicketLight[];
    if (this.lightFull) {
      rows = (await this.tickets()) as TicketLight[];
    } else {
      const r = await this.sb.from("tickets").select(LIGHT_COLUMNS).eq("project_id", this.project.id).order("sort_order");
      if (r.error && missingColumn(r.error)) {
        this.lightFull = true;
        rows = (await this.tickets()) as TicketLight[];
      } else {
        rows = check<TicketLight[]>(r);
        this.noteDownload(rows);
      }
    }
    this.light = { at: Date.now(), rows };
    this.lightStale = false;
    return rows;
  }

  /** The light list is cached and nothing has marked it stale: an idle tick can skip the reads (AK-146). */
  boardFresh(): boolean {
    return !!this.light && !this.lightStale && Date.now() - this.light.at < LIGHT_TTL_MS;
  }

  /** Realtime saw a change to tickets, comments or links: forget the cached board (AK-146). */
  invalidateLight(): void {
    this.lightStale = true;
  }

  /** Add a rough response size to the runner's byte counter (AK-146). Never fails a read. */
  private noteDownload(rows: unknown): void {
    if (!this.onDownload) return;
    try {
      this.onDownload(JSON.stringify(rows)?.length ?? 0);
    } catch {
      // A measuring error is never worth a failed read.
    }
  }

  async ticket(ref: string): Promise<Ticket> {
    const t = check<Ticket | null>(await this.sb.from("tickets").select("*").eq("project_id", this.project.id).eq("key", this.key(ref)).maybeSingle());
    if (!t) throw new AutoKolabError(`No ticket ${this.key(ref)} in ${this.project.name}.`);
    this.noteDownload(t);
    return t;
  }

  async steps(ticketId: string): Promise<Step[]> {
    return check(await this.sb.from("ticket_steps").select("*").eq("ticket_id", ticketId).order("idx"));
  }

  async comments(ticketId: string): Promise<Comment[]> {
    const rows = check<Comment[]>(await this.sb.from("ticket_comments").select("*").eq("ticket_id", ticketId).order("id"));
    this.noteDownload(rows);
    return rows;
  }

  async links(): Promise<{ ticket_id: string; blocked_by: string }[]> {
    const ids = (await this.ticketsLight()).map((t) => t.id);
    if (!ids.length) return [];
    const rows = check<{ ticket_id: string; blocked_by: string }[]>(await this.sb.from("ticket_links").select("*").in("ticket_id", ids));
    this.noteDownload(rows);
    return rows;
  }

  async create(input: {
    title: string;
    description?: string;
    summary?: string;
    type?: TicketType;
    priority?: Priority;
    status?: Status;
    assignee?: string | null;
    epic?: string | null;
    labels?: string[];
    done_means?: string[];
    blocked_by?: string[];
    areas?: string[];
  }): Promise<Ticket> {
    this.noSecrets(input.title, input.description, input.summary, ...(input.done_means ?? []), ...(input.areas ?? []));
    this.checkBrief({ ...input, assignee_id: input.assignee ? this.resolveActor(input.assignee) : null });
    const parent = input.epic ? (await this.ticket(input.epic)).id : null;
    let t = check<Ticket>(
      await this.sb.rpc("create_ticket", {
        p_project: this.project.id,
        p_title: input.title,
        p_description: input.description ?? "",
        p_type: input.type ?? "task",
        p_priority: input.priority ?? "none",
        p_status: input.status ?? "backlog",
        p_assignee: input.assignee ? this.resolveActor(input.assignee) : null,
        p_parent: parent,
        p_labels: input.labels ?? [],
        p_done_means: input.done_means ?? [],
      }),
    );
    // create_ticket predates summary and has no summary argument. Schema 14 grants this update.
    if (input.summary !== undefined) {
      const summary = input.summary.trim().slice(0, 200) || null;
      const r = await this.sb.from("tickets").update({ summary }).eq("id", t.id).select("*").single();
      if (!r.error) t = r.data as Ticket;
      else if (!missingColumn(r.error)) t = check<Ticket>(r);
    }
    if (input.areas?.length) t = await this.setAreas(t, input.areas);
    for (const b of input.blocked_by ?? []) await this.addBlocker(t.key, b);
    this.invalidateLight();
    return t;
  }

  /** create_ticket has no areas argument, so they're written on their own (schema 26). */
  private async setAreas(t: Ticket, areas: string[]): Promise<Ticket> {
    const r = await this.sb.from("tickets").update({ areas: cleanAreas(areas) }).eq("id", t.id).select("*").single();
    if (!r.error) return r.data as Ticket;
    if (missingColumn(r.error)) throw new AutoKolabError("This AutoKolab server can't store a ticket's areas yet (it needs schema 26). The rest of the change was saved.");
    return check<Ticket>(r);
  }

  async update(
    ref: string,
    change: {
      status?: Status;
      title?: string;
      description?: string;
      priority?: Priority;
      type?: TicketType;
      assignee?: string | null;
      epic?: string | null;
      labels?: string[];
      done_means?: string[];
      branch?: string | null;
      pr_url?: string | null;
      needs_human?: string | null;
      summary?: string | null;
      blocked_by_add?: string[];
      blocked_by_remove?: string[];
      areas?: string[];
    },
  ): Promise<Ticket> {
    const t = await this.ticket(ref);
    this.noSecrets(change.title, change.description, change.needs_human, change.summary, ...(change.done_means ?? []), ...(change.areas ?? []));
    const patch: Record<string, unknown> = {};
    for (const k of ["status", "title", "description", "priority", "type", "labels", "done_means", "branch", "pr_url", "needs_human"] as const) {
      if (change[k] !== undefined) patch[k] = change[k];
    }
    if (change.assignee !== undefined) patch.assignee_id = change.assignee ? this.resolveActor(change.assignee) : null;
    if (change.epic !== undefined) patch.parent_id = change.epic ? (await this.ticket(change.epic)).id : null;
    // Handing work to an agent (assigning it, or moving it to Ready) needs a complete brief.
    if (patch.assignee_id !== undefined || change.status === "ready") {
      this.checkBrief({
        title: change.title ?? t.title,
        description: change.description ?? t.description,
        done_means: change.done_means ?? t.done_means,
        status: change.status ?? t.status,
        assignee_id: (patch.assignee_id as string | null | undefined) === undefined ? t.assignee_id : (patch.assignee_id as string | null),
        type: change.type ?? t.type,
      });
    }
    let out = t;
    if (Object.keys(patch).length) out = check<Ticket>(await this.sb.from("tickets").update(patch).eq("id", t.id).select("*").single());
    // On its own, so a database without the column (before schema 14) still takes the rest.
    if (change.summary !== undefined) {
      const summary = change.summary?.trim().slice(0, 200) || null;
      const r = await this.sb.from("tickets").update({ summary }).eq("id", t.id).select("*").single();
      if (!r.error) out = r.data as Ticket;
      else if (!missingColumn(r.error)) out = check<Ticket>(r);
    }
    if (change.areas !== undefined) out = await this.setAreas(out, change.areas);
    for (const b of change.blocked_by_add ?? []) await this.addBlocker(t.key, b);
    for (const b of change.blocked_by_remove ?? []) {
      const other = await this.ticket(b);
      check(await this.sb.from("ticket_links").delete().eq("ticket_id", t.id).eq("blocked_by", other.id));
    }
    this.invalidateLight();
    return out;
  }

  async addBlocker(ref: string, blockedBy: string): Promise<void> {
    const [t, b] = await Promise.all([this.ticket(ref), this.ticket(blockedBy)]);
    const r = await this.sb.from("ticket_links").insert({ ticket_id: t.id, blocked_by: b.id });
    if (r.error && r.error.code !== "23505") check(r);
  }

  async comment(ref: string, body: string): Promise<Comment> {
    const t = await this.ticket(ref);
    this.noSecrets(body);
    return check(await this.sb.from("ticket_comments").insert({ ticket_id: t.id, author_id: this.meId, author_type: "agent", body }).select("*").single());
  }

  /** Replace the plan. Steps already done keep their state when the label matches. */
  async plan(ref: string, labels: string[]): Promise<Step[]> {
    const t = await this.ticket(ref);
    const old = await this.steps(t.id);
    check(await this.sb.from("ticket_steps").delete().eq("ticket_id", t.id));
    const rows = labels.map((label, idx) => ({ ticket_id: t.id, idx, label, status: old.find((s) => s.label === label)?.status ?? "todo" }));
    if (rows.length) check(await this.sb.from("ticket_steps").insert(rows));
    return this.steps(t.id);
  }

  /**
   * Mirror the agent's own to-do list onto the ticket. Same steps: only changed statuses are
   * written (so the history shows each finished step); a new list replaces the plan.
   */
  async syncSteps(ref: string, plan: { label: string; status: StepStatus }[]): Promise<void> {
    const t = await this.ticket(ref);
    const want = plan.slice(0, 20).map((s) => ({ ...s, label: s.label.slice(0, 200) }));
    if (!want.length) return;
    const old = await this.steps(t.id);
    const same = old.length === want.length && old.every((s, i) => s.label === want[i].label);
    if (!same) {
      check(await this.sb.from("ticket_steps").delete().eq("ticket_id", t.id));
      check(await this.sb.from("ticket_steps").insert(want.map((s, idx) => ({ ticket_id: t.id, idx, label: s.label, status: s.status }))));
    } else {
      for (const [i, s] of want.entries()) {
        if (old[i].status !== s.status) check(await this.sb.from("ticket_steps").update({ status: s.status }).eq("ticket_id", t.id).eq("idx", old[i].idx));
      }
    }
    const now = want.find((s) => s.status === "now");
    await this.status("building", now?.label ?? null, t.id).catch(() => undefined);
  }

  /** Mark step n (1-based). Marking one "now" finishes the steps before it. */
  async step(ref: string, n: number, status: StepStatus, note?: string): Promise<Step[]> {
    const t = await this.ticket(ref);
    const steps = await this.steps(t.id);
    const s = steps[n - 1];
    if (!s) throw new AutoKolabError(`${t.key} has ${steps.length} step${steps.length === 1 ? "" : "s"}; there's no step ${n}. Plan them first.`);
    if (note) this.noSecrets(note);
    const patch: Record<string, unknown> = { status };
    if (note !== undefined) patch.note = note;
    check(await this.sb.from("ticket_steps").update(patch).eq("ticket_id", t.id).eq("idx", s.idx));
    if (status === "now") {
      for (const p of steps.slice(0, n - 1)) if (p.status !== "done") check(await this.sb.from("ticket_steps").update({ status: "done" }).eq("ticket_id", t.id).eq("idx", p.idx));
      for (const p of steps.slice(n)) if (p.status === "now") check(await this.sb.from("ticket_steps").update({ status: "todo" }).eq("ticket_id", t.id).eq("idx", p.idx));
      await this.status("building", s.label, t.id).catch(() => undefined);
    }
    return this.steps(t.id);
  }

  // ------------------------------------------------------------------ guide, decisions, status

  async guide(): Promise<Guide> {
    const g = check<Guide | null>(await this.sb.from("project_guides").select("concept, architecture, rules").eq("project_id", this.project.id).maybeSingle());
    return g ?? { concept: "", architecture: "", rules: "" };
  }

  async updateGuide(part: GuidePart, text: string, mode: "replace" | "append" = "replace"): Promise<void> {
    this.noSecrets(text);
    const current = (await this.guide())[part];
    const value = mode === "append" && current.trim() ? `${current.trimEnd()}\n\n${text}` : text;
    check(await this.sb.from("project_guides").update({ [part]: value }).eq("project_id", this.project.id));
  }

  async decisions(): Promise<Decision[]> {
    return check(await this.sb.from("decisions").select("*").eq("project_id", this.project.id).order("number"));
  }

  /** Full decisions by key, including older decisions replaced by another one. */
  async decisionGet(keys: string[]): Promise<string> {
    const decisions = await this.decisions();
    const tickets = await this.tickets();
    const byKey = new Map(decisions.map((d) => [d.key.toUpperCase(), d]));
    const byId = new Map(decisions.map((d) => [d.id, d]));
    const ticketById = new Map(tickets.map((t) => [t.id, t]));
    return keys.map((raw) => {
      const key = raw.trim().toUpperCase();
      const d = byKey.get(key);
      return d ? decisionText(d, byId, ticketById) : `No decision or contract ${key} in ${this.project.name}.`;
    }).join("\n\n---\n\n");
  }

  async addDecision(title: string, body: string, kind: "decision" | "contract" = "decision", ticket?: string): Promise<Decision> {
    this.noSecrets(title, body);
    const t = ticket ? await this.ticket(ticket) : null;
    return check(await this.sb.rpc("create_decision", { p_project: this.project.id, p_title: title, p_body: body, p_kind: kind, p_ticket: t?.id ?? null }));
  }

  /**
   * What this agent is doing, shown on the board and in People. `ran` is the model and effort the
   * current run launched with (schema 11; "" for the tool's own default); left out, the last one stays.
   */
  async status(status: AgentStatus, note: string | null = null, ticketId: string | null = null, ran?: RanWith): Promise<void> {
    await reportAgentStatus(this.sb, status, note, ticketId, ran, this.project.id);
  }

  /**
   * How much of its day this agent has used, through report_usage (schema 19). Returns false when
   * the database doesn't have it yet; it isn't asked again until the next reload.
   */
  async reportUsage(u: UsageReport): Promise<boolean> {
    if (this.usageMissing) return false;
    const r = await this.sb.rpc("report_usage", { p_used_s: u.used_s, p_limit_s: u.limit_s, p_day: u.day, p_waiting_until: u.waiting_until });
    const e = r.error;
    if (e && !e.message.includes("AUTOKOLAB_") && (e.code === "PGRST202" || missingColumn(e) || /report_usage/.test(e.message))) {
      this.usageMissing = true;
      return false;
    }
    check(r);
    return true;
  }

  /**
   * This agent's computer name and daily dollar limit, through report_machine (schema 25). Returns
   * false when the database doesn't have it yet; it isn't asked again until the next reload.
   */
  async reportMachine(m: MachineReport): Promise<boolean> {
    if (this.machineMissing) return false;
    const r = await this.sb.rpc("report_machine", { p_machine: m.machine, p_daily_usd: m.daily_usd });
    const e = r.error;
    if (e && !e.message.includes("AUTOKOLAB_") && (e.code === "PGRST202" || missingColumn(e) || /report_machine/.test(e.message))) {
      this.machineMissing = true;
      return false;
    }
    check(r);
    return true;
  }

  /**
   * What one run used, through record_run_usage (schema 20). Returns false when the database
   * doesn't have it yet; it isn't asked again until the next reload. The path is sent only when
   * there is one, and dropped from then on when the database is older than schema 26.
   */
  async recordRunUsage(u: RunUsageRow): Promise<boolean> {
    if (this.runUsageMissing) return false;
    const args = {
      p_project: this.project.id,
      p_kind: u.kind,
      p_seconds: u.seconds,
      p_ticket: u.ticket_id,
      p_model: u.model,
      p_input_tokens: u.input_tokens,
      p_cache_read_tokens: u.cache_read_tokens,
      p_cache_write_tokens: u.cache_write_tokens,
      p_output_tokens: u.output_tokens,
      p_turns: u.turns,
      p_cost_usd: u.cost_usd,
    };
    const missing = (code?: string) => code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205";
    let r = await this.sb.rpc("record_run_usage", u.path && !this.runPathMissing ? { ...args, p_path: u.path } : args);
    if (u.path && !this.runPathMissing && missing(r.error?.code)) {
      this.runPathMissing = true;
      r = await this.sb.rpc("record_run_usage", args);
    }
    const e = r.error;
    // Only a missing function or table switches recording off; anything else (a permission error
    // too) is thrown, and the runner tries again next run (AK-93).
    if (e && missing(e.code)) {
      this.runUsageMissing = true;
      return false;
    }
    check(r);
    return true;
  }

  // ------------------------------------------------------------------ for the runner

  /**
   * Take the next Ready ticket assigned to this agent whose blockers are all done: highest priority
   * first, then board order. Moving it to In progress is the claim, so two runners can't both take it.
   * A ticket whose areas overlap one In progress or in Review waits (AK-126); `onWait` hears which.
   */
  async claimNext(onWait?: (ticket: TicketLight, text: string) => void): Promise<TicketLight | null> {
    const all = await this.ticketsLight();
    const { ready, waiting } = readyToStart(all, await this.links(), this.meId);
    for (const w of waiting) onWait?.(w.ticket, areaWaitText(w.on)!);
    for (const t of ready) {
      const r = await this.sb.from("tickets").update({ status: "in_progress" }).eq("id", t.id).eq("status", "ready").select(LIGHT_COLUMNS);
      const got = check<TicketLight[]>(r);
      if (!got.length) continue;
      this.invalidateLight();
      if (!got[0].areas?.length) return got[0];
      // Another runner may have claimed an overlapping ticket at the same moment.
      const first = mustGiveWay(got[0], await this.ticketsLight(true));
      if (!first.length) return got[0];
      check(await this.sb.from("tickets").update({ status: "ready" }).eq("id", t.id).eq("status", "in_progress"));
      this.invalidateLight();
      onWait?.(t, areaWaitText(first)!);
    }
    return null;
  }

  /**
   * New comments by anyone but this agent on its open tickets, after the given comment ids (AK-146).
   * Each ticket is asked only for comments newer than the id already handled, so an idle runner
   * downloads nothing. `looping` means only agents commented and they've gone back and forth too
   * often: don't resume; the trailing authors are read to keep that count exact.
   */
  async newComments(after: Record<string, number>): Promise<{ ticket: TicketLight; comments: Comment[]; looping: boolean }[]> {
    const mine = (await this.ticketsLight()).filter((t) => t.assignee_id === this.meId && ["in_progress", "review"].includes(t.status));
    const out: { ticket: TicketLight; comments: Comment[]; looping: boolean }[] = [];
    for (const t of mine) {
      const since = after[t.id] ?? 0;
      const fresh = check<Comment[]>(await this.sb.from("ticket_comments").select("*").eq("ticket_id", t.id).gt("id", since).order("id"));
      this.noteDownload(fresh);
      const act = commentsToAct(fresh, since, this.meId);
      if (!act.length) continue;
      const looping = !act.some((c) => c.author_type === "human") && (await this.tailStreak(t.id)) >= AGENT_COMMENT_LIMIT;
      out.push({ ticket: t, comments: act, looping });
    }
    return out;
  }

  /** Agent comments in a row at the end of a ticket, read from its last AGENT_COMMENT_LIMIT comments (AK-146). */
  private async tailStreak(ticketId: string): Promise<number> {
    const rows = check<Pick<Comment, "author_type">[]>(
      await this.sb.from("ticket_comments").select("author_type").eq("ticket_id", ticketId).order("id", { ascending: false }).limit(AGENT_COMMENT_LIMIT),
    );
    return agentStreak([...rows].reverse());
  }

  /** The project's merge setting, read fresh; a server before schema 12 has none, and then a person merges. */
  async mergePolicy(): Promise<MergePolicy> {
    const row = check<Project | null>(await this.sb.from("projects").select("*").eq("id", this.project.id).maybeSingle());
    if (row) this.project.merge_policy = row.merge_policy;
    return this.project.merge_policy ?? "ask";
  }

  /** Record the PR head commit the lead (or a person) approved, through approve_ticket (schema 12). */
  async approve(ref: string, sha: string, review?: Review): Promise<Ticket> {
    const t = await this.ticket(ref);
    if (review) this.noSecrets(review.summary, review.question, review.less_sure, review.line?.code, review.line?.plain);
    const args = { p_ticket: t.id, p_sha: sha.toLowerCase() };
    const missing = (e: { message: string } | null) => !!e && /approve_ticket/.test(e.message) && !e.message.includes("AUTOKOLAB_");
    let r = await this.sb.rpc("approve_ticket", review ? { ...args, p_review: review } : args);
    // A database from before schema 16 doesn't take the review: the approval still counts.
    if (review && missing(r.error)) r = await this.sb.rpc("approve_ticket", args);
    if (missing(r.error)) throw new AutoKolabError("This AutoKolab server can't record approvals yet (it needs schema 12).");
    return check<Ticket>(r);
  }

  /** Take back a ticket's approval, through approve_ticket with no commit (AK-124): its PR needs a new one. */
  async withdrawApproval(ticketId: string): Promise<void> {
    check(await this.sb.rpc("approve_ticket", { p_ticket: ticketId, p_sha: null }));
  }

  /**
   * For the lead: record what GitHub says about a ticket's PR, through record_pr_facts (schema 18).
   * Returns false when the database doesn't have it yet; it isn't asked again until the next reload.
   */
  async recordPrFacts(ticketId: string, facts: PrFacts): Promise<boolean> {
    if (this.prFactsMissing) return false;
    const r = await this.sb.rpc("record_pr_facts", { p_ticket: ticketId, p_facts: facts });
    const e = r.error;
    // PGRST202: no such function. 42703: the function is there but not the column (a half-applied update).
    if (e && !e.message.includes("AUTOKOLAB_") && (e.code === "PGRST202" || missingColumn(e) || /record_pr_facts|pr_facts/.test(e.message))) {
      this.prFactsMissing = true;
      return false;
    }
    check(r);
    return true;
  }

  /** For the lead: tickets in Review with a PR and an approved commit, for the runner to merge. */
  async approvedForMerge(): Promise<TicketLight[]> {
    if (!this.iAmLead) return [];
    return (await this.ticketsLight()).filter((t) => t.status === "review" && t.pr_url && t.approved_sha);
  }

  /** For the lead: tickets in Review with a PR and no approval yet, for the runner to start a review (AK-59). */
  async waitingForReview(): Promise<TicketLight[]> {
    if (!this.iAmLead) return [];
    return (await this.ticketsLight()).filter((t) => t.status === "review" && t.pr_url && !t.approved_sha && t.type !== "epic");
  }

  /** The project's agents with what their runners last said, for picking a reviewer. */
  agents(): ReviewerCandidate[] {
    return [...this.agentInfo.entries()].map(([id, a]) => ({
      id,
      name: this.nameOf(id),
      vendor: a.vendor,
      status: a.status,
      online: !!a.last_seen_at && Date.now() - Date.parse(a.last_seen_at) < 5 * 60_000 && a.status !== "offline",
    }));
  }

  /** For the lead: workers' tickets in this project with a question for a person. Empty for anyone else. */
  async openQuestions(): Promise<TicketLight[]> {
    if (!this.iAmLead) return [];
    return questionsForLead(await this.ticketsLight(), this.meId);
  }

  /** "raghavendra (person)", "raghavendra-claude (lead agent)" or "ana-codex (agent)". */
  authorLabel(c: Pick<Comment, "author_id" | "author_type">): string {
    return `${this.nameOf(c.author_id)} (${authorKind(c, this.leadId)})`;
  }

  onChange(cb: () => void): RealtimeChannel {
    const ch = this.sb.channel(`project-${this.project.id}-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "tickets", filter: `project_id=eq.${this.project.id}` }, cb);
    ch.on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "ticket_comments" }, cb);
    // Links change which tickets can start, so the cached board is stale too (AK-146).
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "ticket_links" }, cb);
    return ch.subscribe();
  }

  // ------------------------------------------------------------------ text for agents

  /** Everything an agent should know before working here: guide, rules, decisions, the board. */
  async brief(): Promise<string> {
    const [g, decisions, tickets, links] = await Promise.all([this.guide(), this.decisions(), this.tickets(), this.links()]);
    const p = this.project;
    const live = decisions.filter((d) => !d.superseded_by);
    const open = tickets.filter((t) => !["done", "canceled"].includes(t.status));
    const counts = (["backlog", "ready", "in_progress", "review", "done"] as Status[]).map((s) => `${STATUS_LABEL[s]} ${tickets.filter((t) => t.status === s).length}`).join(" · ");
    const mine = open.filter((t) => t.assignee_id === this.meId);
    const blockers = (t: Ticket) => links.filter((l) => l.ticket_id === t.id).map((l) => tickets.find((x) => x.id === l.blocked_by)).filter((x): x is Ticket => !!x && !["done", "canceled"].includes(x.status));
    const line = (t: Ticket) => {
      const b = blockers(t);
      const same = t.status === "ready" ? areaWaitText(areaWaits(t, tickets)) : null;
      return `- ${t.key} [${STATUS_LABEL[t.status]}${t.priority !== "none" ? `, ${t.priority}` : ""}] ${t.title} · ${t.assignee_id ? this.nameOf(t.assignee_id) : "unassigned"}${t.needs_human ? " · NEEDS A PERSON" : ""}${b.length ? ` · waiting on ${b.map((x) => x.key).join(", ")}` : ""}${same ? ` · ${same}` : ""}`;
    };
    const humans = [...this.names.values()].filter((x) => x.type === "human").map((x) => x.name);
    const lead = this.leadId ? this.nameOf(this.leadId) : null;
    const role = this.iAmLead
      ? ["## Your job", leadGuide(p.name, humans)]
      : this.isAgent(this.meId)
        ? ["## Your job", `You are a worker agent. ${lead ? `${lead} is the lead: it writes the tickets and assigns them.` : "People write the tickets and assign them."} Work the tickets assigned to you, exactly as written. If a ticket is unclear or wrong, ask ${lead ?? "the agent who knows"} in the room first (room_post kind=question with wait_s). Set needs_human on the ticket only for a real product choice a person must make, or if nobody answers.`]
        : [];
    const agentLines = [...this.agentInfo.entries()].map(([id, a]) => {
      const online = a.last_seen_at && Date.now() - Date.parse(a.last_seen_at) < 5 * 60_000 && a.status !== "offline";
      const openCount = open.filter((t) => t.assignee_id === id).length;
      return `- ${this.nameOf(id)}${id === this.leadId ? " (lead)" : ""} · ${a.vendor === "claude" ? "Claude Code" : "Codex"} · ${a.owner_label}'s · ${online ? a.status.replace("_", " ") : "offline"}${a.status_note && online ? ` (${a.status_note})` : ""} · ${modelText(a, (x) => this.nameOf(x))} · ${openCount} open ticket${openCount === 1 ? "" : "s"}`;
    });
    return [
      `# ${p.name}${p.repo ? ` · github.com/${p.repo}` : ""} · tickets ${p.ticket_prefix}-n · default branch ${p.default_branch}`,
      `You are ${this.nameOf(this.meId)}${this.iAmLead ? ", the lead" : ""}. People and agents in this project: ${this.peopleLine()}.`,
      "",
      ...(role.length ? [...role, ""] : []),
      "## Agents",
      agentLines.length ? agentLines.join("\n") : "(none yet)",
      "",
      "## Concept",
      g.concept.trim() || "(Not written yet. Read the repo's README. If you're asked to, draft it with guide_update.)",
      "",
      "## Architecture",
      g.architecture.trim() || "(Not written yet. Look at the repo to learn how it's built.)",
      "",
      "## Rules",
      g.rules.trim() || `(No rules written yet; these are the defaults.)\n${defaultRules(p.default_branch)}`,
      "",
      "## Decisions in force",
      live.length ? live.map(briefDecision).join("\n") : "(none yet)",
      "",
      "## Board",
      counts,
      ...open.filter((t) => t.type !== "epic").slice(0, 60).map(line),
      ...(open.filter((t) => t.type === "epic").length ? ["", "Epics:", ...open.filter((t) => t.type === "epic").map((t) => `- ${t.key} ${t.title}`)] : []),
      "",
      "## Your open tickets",
      mine.length ? mine.map(line).join("\n") : "(none)",
    ].join("\n");
  }

  /** One ticket in full: fields, description, done means, steps, blockers and the conversation. */
  async ticketText(ref: string): Promise<string> {
    const t = await this.ticket(ref);
    const [steps, comments, all, links, decisions] = await Promise.all([this.steps(t.id), this.comments(t.id), this.tickets(), this.links(), this.decisions()]);
    const byId = new Map(all.map((x) => [x.id, x]));
    const parent = t.parent_id ? byId.get(t.parent_id) : undefined;
    const blockedBy = links.filter((l) => l.ticket_id === t.id).map((l) => byId.get(l.blocked_by)).filter((x): x is Ticket => !!x);
    const unblocks = links.filter((l) => l.blocked_by === t.id).map((l) => byId.get(l.ticket_id)).filter((x): x is Ticket => !!x);
    const children = all.filter((x) => x.parent_id === t.id);
    const ref2 = (x: Ticket) => `${x.key} (${STATUS_LABEL[x.status]}) ${x.title}`;
    const mentions = [t.title, t.description, ...t.done_means, ...comments.map((c) => c.body)].join("\n");
    const keys = [...new Set([...mentions.matchAll(DECISION_REF)].map((m) => m[0].toUpperCase()))];
    const byKey = new Map(decisions.map((d) => [d.key.toUpperCase(), d]));
    const byDecisionId = new Map(decisions.map((d) => [d.id, d]));
    const ticketById = new Map(all.map((x) => [x.id, x]));
    const decisionLines: string[] = [];
    let sectionSize = "Decisions and contracts this ticket mentions:\n".length;
    for (const key of keys) {
      const d = byKey.get(key);
      if (!d) continue;
      const full = decisionText(d, byDecisionId, ticketById);
      const entry = `${decisionLines.length ? "\n\n" : ""}${full}`;
      if (sectionSize + entry.length <= TICKET_DECISIONS_LIMIT) {
        decisionLines.push(full);
        sectionSize += entry.length;
      } else {
        const pointer = `${key}: decision_get ${key} for the full text`;
        decisionLines.push(pointer);
        sectionSize += pointer.length + 2;
      }
    }
    return [
      `${t.key} · ${t.title}`,
      `Status: ${STATUS_LABEL[t.status]} · Priority: ${t.priority} · Type: ${t.type} · Assignee: ${t.assignee_id ? this.nameOf(t.assignee_id) : "unassigned"} · Reporter: ${this.nameOf(t.reporter_id)}`,
      ...(parent ? [`Epic: ${parent.key} ${parent.title}`] : []),
      ...(t.labels.length ? [`Labels: ${t.labels.join(", ")}`] : []),
      ...(t.branch || t.pr_url ? [`Branch: ${t.branch ?? "-"} · PR: ${t.pr_url ?? "-"}`] : []),
      ...(t.summary ? [`Summary: ${t.summary}`] : []),
      ...(t.needs_human ? [`NEEDS A PERSON: ${t.needs_human}`] : []),
      ...(t.areas?.length ? [`Touches: ${t.areas.join(", ")}`] : []),
      ...(t.status === "ready" && areaWaits(t, all).length ? [`Not started yet: ${areaWaitText(areaWaits(t, all))}`] : []),
      ...(blockedBy.length ? [`Blocked by: ${blockedBy.map(ref2).join("; ")}`] : []),
      ...(unblocks.length ? [`Unblocks: ${unblocks.map(ref2).join("; ")}`] : []),
      "",
      "Description:",
      t.description.trim() || "(none)",
      "",
      "Done means:",
      t.done_means.length ? t.done_means.map((d) => `- [ ] ${d}`).join("\n") : "(not written; agree it in a comment if unclear)",
      "",
      "Steps:",
      steps.length ? steps.map((s, i) => `${i + 1}. [${s.status}] ${s.label}${s.note ? ` · ${s.note}` : ""}`).join("\n") : "(none planned yet)",
      ...(children.length ? ["", "Tickets in this epic:", ...children.map((c) => `- ${ref2(c)}`)] : []),
      "",
      `Comments (${comments.length}, oldest first):`,
      comments.length ? comments.map((c) => `[#${c.id} ${c.created_at.slice(0, 16).replace("T", " ")}] ${this.nameOf(c.author_id)}${c.author_type === "agent" ? " (agent)" : ""}: ${c.body}`).join("\n\n") : "(none)",
      ...(decisionLines.length ? ["", "Decisions and contracts this ticket mentions:", decisionLines.join("\n\n")] : []),
    ].join("\n");
  }

  ticketsText(tickets: Ticket[]): string {
    if (!tickets.length) return "No matching tickets.";
    return tickets
      .map((t) => `${t.key} [${STATUS_LABEL[t.status]}${t.priority !== "none" ? `, ${t.priority}` : ""}${t.type !== "task" ? `, ${t.type}` : ""}] ${t.title} · ${t.assignee_id ? this.nameOf(t.assignee_id) : "unassigned"}${t.needs_human ? " · NEEDS A PERSON" : ""}${t.pr_url ? ` · ${t.pr_url}` : ""}`)
      .join("\n");
  }

  private noSecrets(...texts: (string | null | undefined)[]): void {
    if (texts.some((t) => t && looksLikeSecret(t))) throw new AutoKolabError("That looks like it contains a key or token; leave it out.");
  }
}

/** Agent comments in a row (since the last person's) after which agents stop resuming each other. */
export const AGENT_COMMENT_LIMIT = 8;
export const AGENT_LOOP_QUESTION = `Agents have gone back and forth ${AGENT_COMMENT_LIMIT} times on this ticket; a person should take a look.`;

/** A ticket's comments after `afterId` that should resume its assignee: anyone's but the assignee's own. */
export function commentsToAct(comments: Comment[], afterId: number, assigneeId: string): Comment[] {
  return comments.filter((c) => c.id > afterId && c.author_id !== assigneeId);
}

/** Agent comments at the end of a ticket's conversation, since the last person's comment. */
export function agentStreak(comments: Pick<Comment, "author_type">[]): number {
  let n = 0;
  for (let i = comments.length - 1; i >= 0 && comments[i].author_type === "agent"; i--) n++;
  return n;
}

/** Only agents spoke since last time, and agents have commented AGENT_COMMENT_LIMIT times in a row. */
export function agentsLooping(all: Pick<Comment, "author_type">[], fresh: Pick<Comment, "author_type">[]): boolean {
  return !fresh.some((c) => c.author_type === "human") && agentStreak(all) >= AGENT_COMMENT_LIMIT;
}

/**
 * Open tickets the lead should triage: someone else's, with "Needs you" set. The agents-looping
 * question is left for a person, since the lead answering would only add to the back and forth.
 */
export function questionsForLead(tickets: TicketLight[], leadId: string): TicketLight[] {
  return tickets.filter(
    (t) =>
      t.needs_human &&
      t.needs_human !== AGENT_LOOP_QUESTION &&
      !isMergeQuestion(t.needs_human) &&
      !isReviewQuestion(t.needs_human) &&
      t.assignee_id !== leadId &&
      !["done", "canceled"].includes(t.status) &&
      t.type !== "epic",
  );
}

/** What the lead's runner puts in "Needs you" while merging (AK-30). They're for a person, not the lead. */
export const NO_CHECKS_QUESTION = "No automatic tests ran on this PR.";
export const MERGE_OK_PREFIX = "Ready to merge — needs your OK:";
export const MERGE_FAILED_PREFIX = "Couldn't merge";
export const MERGE_GH_PREFIX = "Can't check the PR";

/** What the lead's runner puts in "Needs you" while starting reviews (AK-59). Also for a person, not the lead. */
export const MAX_AUTO_REVIEWS = 5;
export const REVIEW_LIMIT_QUESTION = `I've reviewed this ${MAX_AUTO_REVIEWS} times and it still isn't right. Can you look?`;
export const LEAD_BUILT_QUESTION = "Captain built this, so a person or another agent has to approve it.";
export const REVIEW_FAILED_PREFIX = "Captain couldn't finish reviewing this";

export function isReviewQuestion(text: string | null | undefined): boolean {
  return !!text && (text === REVIEW_LIMIT_QUESTION || text === LEAD_BUILT_QUESTION || text.startsWith(REVIEW_FAILED_PREFIX));
}

/** An agent in the project, as the lead's runner sees it when asking someone to review. */
export interface ReviewerCandidate {
  id: string;
  name: string;
  vendor: string;
  status: AgentStatus;
  online: boolean;
}

export function isMergeQuestion(text: string | null | undefined): boolean {
  return !!text && (text === NO_CHECKS_QUESTION || [MERGE_OK_PREFIX, MERGE_FAILED_PREFIX, MERGE_GH_PREFIX].some((p) => text.startsWith(p)));
}

/** The questions not yet triaged: each ticket's question text is handled once. */
export function untriaged<T extends Pick<Ticket, "id" | "needs_human">>(questions: T[], handled: Record<string, string>): T[] {
  return questions.filter((t) => handled[t.id] !== t.needs_human);
}

/** A change to an agent's model and effort; what isn't named stays as it is. */
export interface ModelChange {
  model?: string;
  effort?: Effort;
  /** Both back to null: the agent's machine decides again. */
  clear?: boolean;
}

/** The values to send to set_agent_model, which always sets both: the one not changing keeps its value. */
export function nextModel(current: Pick<AgentModel, "model" | "effort">, change: ModelChange): { model: string | null; effort: string | null } {
  if (change.clear) {
    if (change.model || change.effort) throw new AutoKolabError("Pass clear on its own, or a model and/or effort, not both.");
    return { model: null, effort: null };
  }
  if (!change.model && !change.effort) throw new AutoKolabError("Pass a model, an effort, or clear=true.");
  return { model: change.model?.trim() || current.model, effort: change.effort ?? current.effort };
}

/**
 * "sonnet · medium (set by raghavendra-claude) · last ran Sonnet 5.5 · medium effort · 2h ago"; a value
 * not set on AutoKolab is its machine's. effective_at undefined leaves the last run out; null says it
 * was never reported.
 */
export function modelText(a: AgentModel, nameOf: (id: string) => string): string {
  const what = !a.model && !a.effort ? "model set on its machine" : `${a.model ?? "its machine's model"} · ${a.effort ?? "its machine's effort"}`;
  const set = a.model_set_by && (a.model || a.effort) ? `${what} (set by ${nameOf(a.model_set_by)})` : what;
  if (a.effective_at === undefined) return set;
  const ran = a.effective_at ? `last ran ${ranWith(a.effective_model ?? null, a.effective_effort ?? null)} · ${ago(a.effective_at)}` : "last run not reported yet (its machine needs the latest AutoKolab)";
  return `${set} · ${ran}`;
}

/** "Sonnet 5.5 · high effort"; a null part was the tool's own default. */
export function ranWith(model: string | null, effort: string | null): string {
  return `${model ? shortModel(model) : "default model"} · ${effort ? `${effort} effort` : "default effort"}`;
}

const SHORT_MODELS: Record<string, string> = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-haiku-5-5": "Haiku 5.5",
  "claude-fable-5-1": "Fable 5.1",
};

/** "claude-sonnet-5-5" → "Sonnet 5.5" (keeping a "[1m]" suffix); anything else as is. */
export function shortModel(model: string): string {
  const [, base, suffix = ""] = /^(.*?)(\[.*\])?$/.exec(model)!;
  const short = SHORT_MODELS[base.toLowerCase()];
  return short ? short + suffix : model;
}

/** One line for the room: what changed and why. Applies from the agent's next run, never the one in flight. */
export function modelChangeMessage(by: string, after: Pick<AgentModel, "model" | "effort">, reason: string): string {
  const what = after.model || after.effort ? `switched you to ${after.model ?? "your machine's model"} · ${after.effort ? `${after.effort} effort` : "your machine's effort"}` : "handed your model and effort back to your machine";
  return `${MODEL_CHANGE_PREFIX} ${by} ${what}: ${reason.trim().replace(/[.\s]+$/, "")}. Applies from your next run.`;
}
/** Marks the model-change notice, so it informs the agent without starting a run for it. */
export const MODEL_CHANGE_PREFIX = "Model change:";

export function authorKind(c: Pick<Comment, "author_id" | "author_type">, leadId: string | null): "person" | "lead agent" | "agent" {
  if (c.author_type === "human") return "person";
  return c.author_id === leadId ? "lead agent" : "agent";
}

export function statusLabel(s: Status): string {
  return STATUS_LABEL[s];
}
