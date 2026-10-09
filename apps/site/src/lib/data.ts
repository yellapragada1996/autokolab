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
  { id: "epic", label: "Epic" },
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
}

export interface Agent {
  id: string;
  owner_profile_id: string | null;
  owner_label: string;
  vendor: "claude" | "codex";
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
}

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** Suggestions only: the model box also takes any name typed in, since these lists go stale. */
export const MODEL_CHOICES: Record<Agent["vendor"], string[]> = {
  claude: ["opus", "sonnet", "haiku", "fable", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
  codex: ["gpt-5-codex", "gpt-5"],
};

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
  if (r.error) throw new Error(friendly(r.error.message));
  return r.data as T;
}

export function friendly(m: string): string {
  if (m.includes("AUTOKOLAB_")) return m.replace(/^.*AUTOKOLAB_[A-Z_]+:\s*/, "");
  if (/row-level security|permission denied/i.test(m)) return "You can't change that here.";
  if (/JWT|expired/i.test(m)) return "Your session expired. Reload the page.";
  return m;
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

export async function addPerson(projectId: string, githubLogin: string): Promise<void> {
  check(await supabase.rpc("add_project_person", { p_project: projectId, p_github_login: githubLogin.replace(/^@/, "") }));
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
