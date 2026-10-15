import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, type Profile } from "./session";

// Everything the workspace reads and writes. RLS on the server decides what each person sees.

export type Status = "backlog" | "ready" | "in_progress" | "review" | "done" | "canceled";
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type TicketType = "feature" | "bug" | "task" | "chore" | "epic";

export const STATUSES: { id: Status; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "ready", label: "Ready" },
  { id: "in_progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];
export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "none", label: "No priority" },
];
export const TYPES: { id: TicketType; label: string }[] = [
  { id: "feature", label: "Story" },
  { id: "bug", label: "Bug" },
  { id: "task", label: "Task" },
  { id: "chore", label: "Chore" },
  { id: "epic", label: "Goal" },
];
export const statusLabel = (s: Status) => (s === "canceled" ? "Canceled" : STATUSES.find((x) => x.id === s)!.label);

export interface Project {
  id: string;
  name: string;
  slug: string;
  repo: string | null;
  default_branch: string;
  ticket_prefix: string;
  owner_id: string;
  /** The agent that writes tickets and assigns them. */
  lead_agent_id: string | null;
  /** The project's room (live chat). */
  room_id: string | null;
  created_at: string;
  /** How merging works (schema 12, DEC-19); absent before it, which reads as the default. */
  merge_policy?: MergePolicy;
}

export type MergePolicy = "ask" | "auto_safe" | "auto_all";

export const MERGE_POLICIES: { id: MergePolicy; label: string; sub: string }[] = [
  { id: "ask", label: "Ask me", sub: "Captain reviews; a person merges." },
  { id: "auto_safe", label: "Auto-merge safe changes (recommended)", sub: "Captain merges when tests pass and it approved the change. Database, dependency, CI and security changes wait for your OK." },
  { id: "auto_all", label: "Fully hands-off", sub: "Captain merges everything once tests pass and it approved the change." },
];

export const mergePolicyOf = (p: Project): MergePolicy => p.merge_policy ?? "auto_safe";

/** The lead's runner (AK-30) starts needs_human with this when a risky change waits for a person's OK. */
export const MERGE_OK_PREFIX = "Ready to merge — needs your OK:";

export const waitsForMergeOk = (t: Ticket) => !!t.needs_human?.startsWith(MERGE_OK_PREFIX) && !t.merge_ok_at;

/** What the lead's runner puts in "Needs you" when a change waits for someone to approve it (AK-59; packages/autokolab/src/core/projects.ts). */
export const LEAD_BUILT_QUESTION = "Captain built this, so a person or another agent has to approve it.";
export const REVIEW_LIMIT_QUESTION = "I've reviewed this 5 times and it still isn't right. Can you look?";
export const REVIEW_FAILED_PREFIX = "Captain couldn't finish reviewing this";

export const isReviewQuestion = (text: string | null | undefined) => !!text && (text === LEAD_BUILT_QUESTION || text === REVIEW_LIMIT_QUESTION || text.startsWith(REVIEW_FAILED_PREFIX));

/** The review a person's approval is stored with when they leave "Anything you're unsure about?" empty. */
export const PERSON_NO_NOTES = "Approved by a person; no notes.";

export interface Agent {
  id: string;
  owner_profile_id: string | null;
  owner_label: string;
  /** "opencode": any provider's model through OpenCode (DEC-26); its model shows as provider/model. */
  vendor: "claude" | "codex" | "opencode";
  display_name: string;
  status: "idle" | "planning" | "building" | "waiting_human" | "blocked" | "paused" | "offline";
  status_note: string | null;
  current_ticket_id: string | null;
  last_seen_at: string | null;
  /** Set from AutoKolab (schema 10); null means the agent's machine decides. */
  model: string | null;
  effort: Effort | null;
  /** The profile or agent that last set model/effort, and when. */
  model_set_by: string | null;
  model_set_at: string | null;
  /** What its latest run actually used, reported by its runner (schema 11; absent before it). */
  effective_model?: string | null;
  effective_effort?: Effort | null;
  /** When its runner last reported; null means it never has (its machine runs an older AutoKolab). */
  effective_at?: string | null;
  /** Seconds worked on usage_day and the owner's daily limit, reported by its runner (schema 19; absent before it). */
  used_today_s?: number | null;
  daily_limit_s?: number | null;
  /** The local day on the agent's machine the seconds belong to, "2026-10-11". */
  usage_day?: string | null;
  /** When it expects to work again while it waits out a limit; null otherwise. */
  waiting_until?: string | null;
  /** The computer it runs on, reported by its runner (schema 25; absent before it, null until reported). */
  machine?: string | null;
  /** An API-model agent's active daily dollar limit from its runner, 0 for none (schema 25); null when not reported. */
  daily_usd?: number | string | null;
}

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** Suggestions only: the model box also takes any name typed in, since these lists go stale. */
export const MODEL_CHOICES: Record<Agent["vendor"], string[]> = {
  claude: ["opus", "sonnet", "haiku", "fable", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
  codex: ["gpt-5-codex", "gpt-5"],
  opencode: [],
};

/** What runs the agent, in words. */
export const VENDOR_LABEL: Record<Agent["vendor"], string> = { claude: "Claude Code", codex: "Codex", opencode: "API model" };

export interface Member {
  actor_id: string;
  actor_type: "human" | "agent";
  role: "owner" | "member";
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
  started_at: string | null;
  completed_at: string | null;
  /** The PR head commit the lead approved, who approved it and when (schema 12; absent before it). */
  approved_sha?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  /** A person's one-click OK to merge a risky change (schema 12). */
  merge_ok_by?: string | null;
  merge_ok_at?: string | null;
  /** One plain sentence on what the ticket changed, set at Review (schema 14; absent before it). */
  summary?: string | null;
  /** What the reviewer recorded with its approval (schema 16): the evidence behind "How do you know?". */
  review?: Review | null;
  /** What GitHub last said about the PR, recorded by Captain's runner (schema 18; absent before it). */
  pr_facts?: PrFacts | null;
  /** Everyone who worked on it; none of them can approve it (schema 17, narrowed by 21; absent before 17). */
  built_by?: string[] | null;
}

/** A snapshot of the PR at one commit: its tests and how big the change is (AK-57). */
export interface PrFacts {
  sha: string;
  checks: { passed: number; total: number; state: "success" | "pending" | "failure" };
  /** How many files change, and the ones that need a person's OK (database, CI, dependencies, sign-in). */
  files: { total: number; risky: string[] };
  additions: number;
  deletions: number;
  checked_at?: string;
}

export interface Review {
  summary?: string;
  /** For a risky change: the one yes/no question a person is asked before it merges. */
  question?: string;
  line?: { file: string; code: string; plain?: string };
  decisions?: string[];
  /** Where the reviewer is less sure. Always present. */
  less_sure: string;
}

export interface Step {
  ticket_id: string;
  idx: number;
  label: string;
  status: "todo" | "now" | "done";
  note: string | null;
  updated_at: string;
}

export interface Link {
  ticket_id: string;
  blocked_by: string;
}

export interface Comment {
  id: number;
  ticket_id: string;
  author_id: string;
  author_type: "human" | "agent";
  body: string;
  created_at: string;
}

export interface TicketEvent {
  id: number;
  ticket_id: string;
  actor_id: string | null;
  actor_type: string | null;
  kind: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Decision {
  id: string;
  number: number;
  key: string;
  kind: "decision" | "contract";
  title: string;
  body: string;
  ticket_id: string | null;
  created_by: string;
  created_at: string;
  superseded_by: string | null;
}

export interface Guide {
  project_id: string;
  concept: string;
  architecture: string;
  rules: string;
  updated_by: string | null;
  updated_at: string;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

// ------------------------------------------------------------------ projects and people

export async function myProjects(): Promise<Project[]> {
  return check(await supabase.from("projects").select("*").order("created_at"));
}

export async function createProject(name: string, repo: string, prefix: string): Promise<Project> {
  return check(await supabase.rpc("create_project", { p_name: name, p_repo: repo, p_prefix: prefix }));
}

export interface People {
  members: Member[];
  profiles: Map<string, Profile>;
  agents: Map<string, Agent>;
}

export async function people(projectId: string): Promise<People> {
  const members = check<Member[]>(await supabase.from("project_members").select("actor_id, actor_type, role").eq("project_id", projectId));
  const humanIds = members.filter((m) => m.actor_type === "human").map((m) => m.actor_id);
  const agentIds = members.filter((m) => m.actor_type === "agent").map((m) => m.actor_id);
  const [profiles, agents] = await Promise.all([
    humanIds.length ? supabase.from("profiles").select("*").in("id", humanIds) : Promise.resolve({ data: [], error: null }),
    agentIds.length ? supabase.from("agents").select("*").in("id", agentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    members,
    profiles: new Map(check<Profile[]>(profiles as never).map((p) => [p.id, p])),
    agents: new Map(check<Agent[]>(agents as never).map((a) => [a.id, a])),
  };
}

/**
 * Set an agent's model and effort (its owner, or the project's lead). The function sets both at
 * once, so pass the current value of the one that isn't changing; null hands it back to the machine.
 */
export async function setAgentModel(agentId: string, model: string | null, effort: Effort | null): Promise<Agent> {
  return check(await supabase.rpc("set_agent_model", { p_agent: agentId, p_model: model, p_effort: effort }));
}

// ------------------------------------------------------------------ joining

export interface Invite {
  code: string;
  project_id: string;
  created_at: string;
  expires_at: string;
  max_uses: number | null;
  uses: number;
  revoked: boolean;
}

export interface InvitePeek {
  project: string;
  slug: string;
  repo: string | null;
  invited_by: string | null;
  people: number;
  agents: number;
  valid: boolean;
  reason: "revoked" | "expired" | "used" | null;
  member: boolean;
}

/** "7KQM2PXA" → "7KQM-2PXA", easier to read out. */
export const showCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** Links people share must work for them, so a local copy of the site points at the live one. */
export const PUBLIC_SITE: string =
  (import.meta.env.VITE_PUBLIC_SITE as string | undefined) ?? (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? "https://autokolab.vercel.app" : location.origin);
export const inviteLink = (c: string) => `${PUBLIC_SITE}/j/${showCode(c)}`;

export async function createInvite(projectId: string, days = 7, maxUses: number | null = null): Promise<Invite> {
  return check(await supabase.rpc("create_invite", { p_project: projectId, p_days: days, p_max_uses: maxUses }));
}

export async function invites(projectId: string): Promise<Invite[]> {
  return check(await supabase.from("project_invites").select("*").eq("project_id", projectId).order("created_at", { ascending: false }));
}

export async function revokeInvite(code: string): Promise<void> {
  check(await supabase.rpc("revoke_invite", { p_code: code }));
}

export async function peekInvite(code: string): Promise<InvitePeek | null> {
  return check(await supabase.rpc("peek_project_invite", { p_code: code }));
}

export async function acceptInvite(code: string): Promise<Project> {
  return check(await supabase.rpc("accept_invite", { p_code: code }));
}

export interface Pairing {
  code: string;
  project_id: string;
  expires_at: string;
  used_at: string | null;
}

export async function createPairing(projectId: string): Promise<Pairing> {
  return check(await supabase.rpc("create_pairing", { p_project: projectId }));
}

/** The one terminal line that installs the helper and connects this computer's agents. */
export const connectLine = (code: string) => `curl -fsSL ${PUBLIC_SITE}/install.sh | bash -s -- ${showCode(code)}`;

export async function setLead(projectId: string, agentId: string | null): Promise<void> {
  check(await supabase.from("projects").update({ lead_agent_id: agentId }).eq("id", projectId));
}

/** Only the project's owner can; the refusal comes back as a plain sentence. */
export async function setMergePolicy(projectId: string, policy: MergePolicy): Promise<Project> {
  return check(await supabase.rpc("set_merge_policy", { p_project: projectId, p_policy: policy }));
}

/**
 * A person OKs merging a risky change, then the question is cleared: the lead's runner merges on
 * merge_ok_by, not on the question.
 */
export async function allowMerge(ticketId: string): Promise<Ticket> {
  const t = check<Ticket>(await supabase.rpc("allow_merge", { p_ticket: ticketId }));
  return t.needs_human?.startsWith(MERGE_OK_PREFIX) ? updateTicket(ticketId, { needs_human: null }) : t;
}

/**
 * A person approves the exact commit they were shown (AK-95). Their note, or PERSON_NO_NOTES, is the
 * review's "less sure" line. The question asking for an approval is cleared, as allowMerge does.
 * The database refuses anyone who worked on the ticket, with a plain sentence.
 */
export async function approveTicket(ticketId: string, sha: string, note: string): Promise<Ticket> {
  const t = check<Ticket>(await supabase.rpc("approve_ticket", { p_ticket: ticketId, p_sha: sha.toLowerCase(), p_review: { less_sure: note.trim() || PERSON_NO_NOTES } }));
  return isReviewQuestion(t.needs_human) ? updateTicket(ticketId, { needs_human: null }) : t;
}

/** The project's owner says someone didn't work on a ticket after all (schema 21). History keeps the reason. */
export async function forgetBuilder(ticketId: string, memberId: string, reason: string): Promise<Ticket> {
  return check(await supabase.rpc("forget_builder", { p_ticket: ticketId, p_member: memberId, p_reason: reason }));
}

export async function addPerson(projectId: string, githubLogin: string): Promise<void> {
  check(await supabase.rpc("add_project_person", { p_project: projectId, p_github_login: githubLogin.replace(/^@/, "") }));
}

// ------------------------------------------------------------------ last visit (Captain's catch-up)

const caughtUpKey = (projectId: string) => `autokolab:caught-up:${projectId}`;

function localCaughtUp(projectId: string): string | null {
  try {
    return localStorage.getItem(caughtUpKey(projectId));
  } catch {
    return null; // private window, or storage blocked
  }
}

/** The later of two times, either of which may be missing. */
export function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a || !b) return a || b || null;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * When this person last caught up on the project; null if never. Kept in the database (schema 15) so
 * it follows them between devices, and in this browser so it works before that database update.
 */
export async function lastCaughtUp(projectId: string): Promise<string | null> {
  const r = await supabase.from("project_reads").select("caught_up_at").eq("project_id", projectId).maybeSingle();
  return laterOf(r.error ? null : (r.data?.caught_up_at as string | undefined), localCaughtUp(projectId));
}

/** The person has seen everything up to now: the next catch-up counts from here. */
export async function markCaughtUp(projectId: string): Promise<string> {
  const r = await supabase.rpc("mark_caught_up", { p_project: projectId });
  const at = !r.error && typeof r.data === "string" ? r.data : new Date().toISOString();
  try {
    localStorage.setItem(caughtUpKey(projectId), at);
  } catch {
    // Not saved in this browser; the database copy is enough.
  }
  return at;
}

// ------------------------------------------------------------------ tickets

export async function tickets(projectId: string): Promise<Ticket[]> {
  return check(await supabase.from("tickets").select("*").eq("project_id", projectId).order("sort_order"));
}

export async function allSteps(ticketIds: string[]): Promise<Step[]> {
  if (!ticketIds.length) return [];
  return check(await supabase.from("ticket_steps").select("*").in("ticket_id", ticketIds).order("idx"));
}

export async function links(ticketIds: string[]): Promise<Link[]> {
  if (!ticketIds.length) return [];
  return check(await supabase.from("ticket_links").select("*").in("ticket_id", ticketIds));
}

export interface NewTicket {
  title: string;
  description?: string;
  type?: TicketType;
  priority?: Priority;
  status?: Status;
  assignee?: string | null;
  parent?: string | null;
  labels?: string[];
  doneMeans?: string[];
}

export async function createTicket(projectId: string, t: NewTicket): Promise<Ticket> {
  return check(
    await supabase.rpc("create_ticket", {
      p_project: projectId,
      p_title: t.title,
      p_description: t.description ?? "",
      p_type: t.type ?? "task",
      p_priority: t.priority ?? "none",
      p_status: t.status ?? "backlog",
      p_assignee: t.assignee ?? null,
      p_parent: t.parent ?? null,
      p_labels: t.labels ?? [],
      p_done_means: t.doneMeans ?? [],
    }),
  );
}

export type TicketPatch = Partial<
  Pick<Ticket, "title" | "description" | "type" | "priority" | "status" | "labels" | "parent_id" | "assignee_id" | "done_means" | "branch" | "pr_url" | "needs_human" | "sort_order">
>;

export async function updateTicket(id: string, patch: TicketPatch): Promise<Ticket> {
  return check(await supabase.from("tickets").update(patch).eq("id", id).select("*").single());
}

export async function ticketDetail(id: string): Promise<{ steps: Step[]; comments: Comment[]; events: TicketEvent[] }> {
  const [steps, comments, events] = await Promise.all([
    supabase.from("ticket_steps").select("*").eq("ticket_id", id).order("idx"),
    supabase.from("ticket_comments").select("*").eq("ticket_id", id).order("id"),
    supabase.from("ticket_events").select("*").eq("ticket_id", id).order("id"),
  ]);
  return { steps: check(steps), comments: check(comments), events: check(events) };
}

export async function addComment(ticketId: string, me: string, body: string): Promise<void> {
  check(await supabase.from("ticket_comments").insert({ ticket_id: ticketId, author_id: me, author_type: "human", body }));
}

export async function setSteps(ticketId: string, steps: { label: string; status: Step["status"] }[]): Promise<void> {
  check(await supabase.from("ticket_steps").delete().eq("ticket_id", ticketId));
  if (steps.length) check(await supabase.from("ticket_steps").insert(steps.map((s, idx) => ({ ticket_id: ticketId, idx, label: s.label, status: s.status }))));
}

export async function setStepStatus(ticketId: string, idx: number, status: Step["status"]): Promise<void> {
  check(await supabase.from("ticket_steps").update({ status }).eq("ticket_id", ticketId).eq("idx", idx));
}

export async function addBlocker(ticketId: string, blockedBy: string): Promise<void> {
  check(await supabase.from("ticket_links").insert({ ticket_id: ticketId, blocked_by: blockedBy }));
}

export async function removeBlocker(ticketId: string, blockedBy: string): Promise<void> {
  check(await supabase.from("ticket_links").delete().eq("ticket_id", ticketId).eq("blocked_by", blockedBy));
}

/** The latest things that happened anywhere in the project, newest first. */
export async function recentEvents(projectId: string, limit = 40): Promise<TicketEvent[]> {
  return check(await supabase.from("ticket_events").select("*").eq("project_id", projectId).order("id", { ascending: false }).limit(limit));
}

const EVENTS_PAGE = 1000;

/**
 * Everything that happened in the project between two times, oldest first. Read a page at a time,
 * so a busy month isn't cut off at the server's row limit.
 */
export async function eventsBetween(projectId: string, from: Date, to: Date): Promise<TicketEvent[]> {
  const out: TicketEvent[] = [];
  // Each page starts after the last row of the one before, and it ends at an empty page: the
  // server may hand back fewer rows than asked for.
  for (let after = 0; ; ) {
    const rows = check<TicketEvent[]>(
      await supabase
        .from("ticket_events")
        .select("*")
        .eq("project_id", projectId)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .gt("id", after)
        .order("id")
        .limit(EVENTS_PAGE),
    );
    if (!rows.length) return out;
    out.push(...rows);
    after = rows[rows.length - 1].id;
  }
}

/** Why a runner started its agent: to build a ticket, review one, reply in the room, or look at a worker's question. */
export type RunKind = "build" | "review" | "reply" | "question";

/** What one run used, as its tool reported it (schema 20). null: the tool didn't say. */
export interface RunUsage {
  id: number;
  agent_id: string;
  ticket_id: string | null;
  kind: RunKind;
  model: string | null;
  input_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  output_tokens: number | null;
  turns: number | null;
  seconds: number;
  cost_usd: number | null;
  created_at: string;
}

/**
 * What every run in the project used between two times, oldest first, a page at a time. A database
 * before schema 20 has no such table: that reads as no runs.
 */
export async function usageBetween(projectId: string, from: Date, to: Date): Promise<RunUsage[]> {
  const out: RunUsage[] = [];
  for (let after = 0; ; ) {
    const r = await supabase
      .from("run_usage")
      .select("*")
      .eq("project_id", projectId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .gt("id", after)
      .order("id")
      .limit(EVENTS_PAGE);
    const e = r.error as { message: string; code?: string } | null;
    // Only a missing table reads as no runs; any other error, a permission error too, is shown (AK-93).
    if (e && (e.code === "42P01" || e.code === "PGRST205")) return [];
    const rows = check<RunUsage[]>(r);
    if (!rows.length) return out;
    out.push(...rows);
    after = rows[rows.length - 1].id;
  }
}

// ------------------------------------------------------------------ guide and decisions

export async function guide(projectId: string): Promise<Guide | null> {
  return check(await supabase.from("project_guides").select("*").eq("project_id", projectId).maybeSingle());
}

export async function saveGuide(projectId: string, patch: Partial<Pick<Guide, "concept" | "architecture" | "rules">>): Promise<Guide> {
  return check(await supabase.from("project_guides").update(patch).eq("project_id", projectId).select("*").single());
}

export async function decisions(projectId: string): Promise<Decision[]> {
  return check(await supabase.from("decisions").select("*").eq("project_id", projectId).order("number", { ascending: false }));
}

export async function addDecision(projectId: string, title: string, body: string, kind: Decision["kind"] = "decision"): Promise<Decision> {
  return check(await supabase.rpc("create_decision", { p_project: projectId, p_title: title, p_body: body, p_kind: kind }));
}

export async function supersede(id: string, by: string | null): Promise<void> {
  check(await supabase.from("decisions").update({ superseded_by: by }).eq("id", id));
}

// ------------------------------------------------------------------ live updates

/** Re-run `onChange` whenever anything in the project's workspace changes (debounced). */
export function watchProject(projectId: string, onChange: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const bump = () => {
    clearTimeout(t);
    t = setTimeout(onChange, 150);
  };
  const channels: RealtimeChannel[] = [];
  const ch = supabase.channel(`project-${projectId}-${Math.random().toString(36).slice(2)}`);
  for (const table of ["tickets", "ticket_events", "decisions", "project_guides", "project_members"]) {
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table, filter: `project_id=eq.${projectId}` }, bump);
  }
  for (const table of ["ticket_steps", "ticket_links", "ticket_comments", "agents"]) {
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table }, bump);
  }
  channels.push(ch.subscribe());
  const poll = setInterval(onChange, 30_000);
  return () => {
    clearTimeout(t);
    clearInterval(poll);
    for (const c of channels) void supabase.removeChannel(c);
  };
}
