import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { AutoKolabError, friendly } from "./client.js";
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

/** The model and effort a run launched with; "" means the tool's own default (schema 11). */
export interface RanWith {
  model: string;
  effort: string;
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
}

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
  key: string;
  kind: "decision" | "contract";
  title: string;
  body: string;
  superseded_by: string | null;
}

interface Guide {
  concept: string;
  architecture: string;
  rules: string;
}

/** DEC-17: the lead acts on its own and asks its person only before big work. */
export const BIG_WORK = "a new epic or more than 3 tickets, migrations, dependencies, auth/security/CI/infra changes, deleting a feature, or changing a decision";
export function leadAutonomy(person: string): string {
  return `You run unattended too, while ${person} is away. Decide and act on your own (answer workers, delegate, create and assign tickets, review), then say what you did. Before big work (${BIG_WORK}), post one kind=question to ${person} in the room and stop; their reply in that thread resumes you.`;
}

/** How the lead signs off on a PR (AK-30): the runner merges only the commit it approved. */
export const LEAD_APPROVAL =
  'Review each PR in Review against its "done means": read the diff and check CI. Then approve it with ticket_approve, passing sha=<the commit you reviewed> (it refuses if the PR moved on since), or comment on what\'s missing. Approve only the commit you actually reviewed: a new push needs a new approval, because your runner merges only the approved commit, once its tests pass and the project\'s merge setting allows it.';

/** What the lead does. Shown to the lead in project_brief. */
export function leadGuide(project: string, people: string[]): string {
  const who = people.length ? `${people.join(" and ")} ${people.length === 1 ? "talks" : "talk"}` : "The people on this project talk";
  return `You are the lead of ${project}. ${who} to you, and you turn what they want into tickets the worker agents can do without asking anything. Workers only see the ticket, never your conversation, so the ticket is the whole brief.
1. Understand first: read the code involved, the guide and the decisions. Ask your person only about real product choices.
2. Split the work into tickets of a few hours each, one clear outcome per ticket. For a goal that needs several tickets, create an epic first and put the tickets under it.
3. Write every ticket like this:
   - Title: the outcome, as an instruction ("Add Google sign-in to /login").
   - Description, with these headings: **Context** (why, for whom), **What to do** (the behaviour and the approach to take), **Where** (files, modules, APIs and existing code to follow), **Not in scope**, **Notes** (decisions, gotchas, how to test).
   - Done means: 2 to 6 checkable items, including the tests that must pass.
   - Blocked by: tickets that must land first. If two tickets touch the same files, order them with blocked_by instead of running them in parallel.
4. Assign each ticket to a worker agent (see Agents below: status and open tickets) and put it in Ready so it starts now, or Backlog if it shouldn't start yet. Spread the work; don't stack one agent while another is idle.
5. Tell your person what you created: keys, who has what, and the order.
6. Follow up whenever your person comes back or asks: check tickets with "Needs you" and in Review. Answer a worker's question yourself on its ticket (ticket_comment, then ticket_update needs_human=null) when the answer is in the code, guide or decisions; bring real product choices to your person. ${LEAD_APPROVAL} Record settled choices with decision_add.
7. ${leadAutonomy("your person")}
8. You may change a worker's model and effort with agent_model when the work calls for it: stronger (e.g. opus, high) for hard, risky or wide changes; lighter (e.g. sonnet or haiku, low/medium) for routine, small or docs work. Prefer changing it right before assigning the ticket, and always give the reason. Owners can lock their machine (model_locked), in which case your change won't take effect there.`;
}

/** Used when a project has no rules written yet. Same as the website's recommended rules. */
export function defaultRules(defaultBranch: string): string {
  return [
    "- Only work on tickets assigned to you that are in Ready or In progress.",
    "- When you start, move the ticket to In progress and plan the steps on it.",
    "- One branch per ticket, named <ticket key>-<short-title>. Commit and push early so others can see your work.",
    `- Never push to ${defaultBranch}. Open a pull request against ${defaultBranch} (even when your branch builds on unmerged work) and move the ticket to Review.`,
    '- Every item under "Done means" must be true before you move a ticket to Review. Run the tests and the type checker first.',
    "- Follow the decisions. If you need to break one, ask first.",
    '- If something is ambiguous, set "Needs you" on the ticket with a short question.',
    "- If you find more work, create a new ticket instead of growing this one.",
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

const rank = (p: Priority) => PRIORITIES.indexOf(p);

export class ProjectView {
  private names = new Map<string, { name: string; type: "human" | "agent" }>();
  private agentInfo = new Map<string, AgentInfo>();

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
      (want && all.find((x) => x.slug === want || x.repo === want || x.name.toLowerCase() === want)) ||
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
    return check(await this.sb.from("tickets").select("*").eq("project_id", this.project.id).order("sort_order"));
  }

  async ticket(ref: string): Promise<Ticket> {
    const t = check<Ticket | null>(await this.sb.from("tickets").select("*").eq("project_id", this.project.id).eq("key", this.key(ref)).maybeSingle());
    if (!t) throw new AutoKolabError(`No ticket ${this.key(ref)} in ${this.project.name}.`);
    return t;
  }

  async steps(ticketId: string): Promise<Step[]> {
    return check(await this.sb.from("ticket_steps").select("*").eq("ticket_id", ticketId).order("idx"));
  }

  async comments(ticketId: string): Promise<Comment[]> {
    return check(await this.sb.from("ticket_comments").select("*").eq("ticket_id", ticketId).order("id"));
  }

  async links(): Promise<{ ticket_id: string; blocked_by: string }[]> {
    const ids = (await this.tickets()).map((t) => t.id);
    if (!ids.length) return [];
    return check(await this.sb.from("ticket_links").select("*").in("ticket_id", ids));
  }

  async create(input: {
    title: string;
    description?: string;
    type?: TicketType;
    priority?: Priority;
    status?: Status;
    assignee?: string | null;
    epic?: string | null;
    labels?: string[];
    done_means?: string[];
    blocked_by?: string[];
  }): Promise<Ticket> {
    this.noSecrets(input.title, input.description, ...(input.done_means ?? []));
    this.checkBrief({ ...input, assignee_id: input.assignee ? this.resolveActor(input.assignee) : null });
    const parent = input.epic ? (await this.ticket(input.epic)).id : null;
    const t = check<Ticket>(
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
    for (const b of input.blocked_by ?? []) await this.addBlocker(t.key, b);
    return t;
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
      blocked_by_add?: string[];
      blocked_by_remove?: string[];
    },
  ): Promise<Ticket> {
    const t = await this.ticket(ref);
    this.noSecrets(change.title, change.description, change.needs_human, ...(change.done_means ?? []));
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
    for (const b of change.blocked_by_add ?? []) await this.addBlocker(t.key, b);
    for (const b of change.blocked_by_remove ?? []) {
      const other = await this.ticket(b);
      check(await this.sb.from("ticket_links").delete().eq("ticket_id", t.id).eq("blocked_by", other.id));
    }
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
    return check(await this.sb.from("decisions").select("key, kind, title, body, superseded_by").eq("project_id", this.project.id).order("number"));
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
    const args: Record<string, unknown> = { p_status: status, p_note: note, p_ticket: ticketId };
    if (ran) Object.assign(args, { p_model: ran.model.slice(0, 100), p_effort: ran.effort });
    const res = await this.sb.rpc("agent_status", args);
    // A database before schema 11 has no p_model: still report the status.
    if (res.error && ran && /p_model|function/i.test(res.error.message)) return this.status(status, note, ticketId);
    check(res);
  }

  // ------------------------------------------------------------------ for the runner

  /**
   * Take the next Ready ticket assigned to this agent whose blockers are all done: highest priority
   * first, then board order. Moving it to In progress is the claim, so two runners can't both take it.
   */
  async claimNext(): Promise<Ticket | null> {
    const all = await this.tickets();
    const links = await this.links();
    const byId = new Map(all.map((t) => [t.id, t]));
    const ready = all
      .filter((t) => t.assignee_id === this.meId && t.status === "ready" && !t.needs_human)
      .filter((t) => links.filter((l) => l.ticket_id === t.id).every((l) => ["done", "canceled"].includes(byId.get(l.blocked_by)?.status ?? "done")))
      .sort((a, b) => rank(a.priority) - rank(b.priority) || a.sort_order - b.sort_order);
    for (const t of ready) {
      const r = await this.sb.from("tickets").update({ status: "in_progress" }).eq("id", t.id).eq("status", "ready").select("*");
      const got = check<Ticket[]>(r);
      if (got.length) return got[0];
    }
    return null;
  }

  /**
   * New comments by anyone but this agent on its open tickets, after the given comment ids.
   * `looping` means only agents commented and they've gone back and forth too often: don't resume.
   */
  async newComments(after: Record<string, number>): Promise<{ ticket: Ticket; comments: Comment[]; looping: boolean }[]> {
    const mine = (await this.tickets()).filter((t) => t.assignee_id === this.meId && ["in_progress", "review"].includes(t.status));
    if (!mine.length) return [];
    const rows = check<Comment[]>(await this.sb.from("ticket_comments").select("*").in("ticket_id", mine.map((t) => t.id)).order("id"));
    const out: { ticket: Ticket; comments: Comment[]; looping: boolean }[] = [];
    for (const t of mine) {
      const all = rows.filter((c) => c.ticket_id === t.id);
      const fresh = commentsToAct(all, after[t.id] ?? 0, this.meId);
      if (fresh.length) out.push({ ticket: t, comments: fresh, looping: agentsLooping(all, fresh) });
    }
    return out;
  }

  /** The project's merge setting, read fresh; a server before schema 12 has none, and then a person merges. */
  async mergePolicy(): Promise<MergePolicy> {
    const row = check<Project | null>(await this.sb.from("projects").select("*").eq("id", this.project.id).maybeSingle());
    if (row) this.project.merge_policy = row.merge_policy;
    return this.project.merge_policy ?? "ask";
  }

  /** Record the PR head commit the lead (or a person) approved, through approve_ticket (schema 12). */
  async approve(ref: string, sha: string): Promise<Ticket> {
    const t = await this.ticket(ref);
    const r = await this.sb.rpc("approve_ticket", { p_ticket: t.id, p_sha: sha.toLowerCase() });
    if (r.error && /approve_ticket/.test(r.error.message) && !r.error.message.includes("AUTOKOLAB_")) {
      throw new AutoKolabError("This AutoKolab server can't record approvals yet (it needs schema 12).");
    }
    return check<Ticket>(r);
  }

  /** For the lead: tickets in Review with a PR and an approved commit, for the runner to merge. */
  async approvedForMerge(): Promise<Ticket[]> {
    if (!this.iAmLead) return [];
    return (await this.tickets()).filter((t) => t.status === "review" && t.pr_url && t.approved_sha);
  }

  /** For the lead: workers' tickets in this project with a question for a person. Empty for anyone else. */
  async openQuestions(): Promise<Ticket[]> {
    if (!this.iAmLead) return [];
    return questionsForLead(await this.tickets(), this.meId);
  }

  /** "raghavendra (person)", "raghavendra-claude (lead agent)" or "ana-codex (agent)". */
  authorLabel(c: Pick<Comment, "author_id" | "author_type">): string {
    return `${this.nameOf(c.author_id)} (${authorKind(c, this.leadId)})`;
  }

  onChange(cb: () => void): RealtimeChannel {
    const ch = this.sb.channel(`project-${this.project.id}-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "tickets", filter: `project_id=eq.${this.project.id}` }, cb);
    ch.on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "ticket_comments" }, cb);
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
      return `- ${t.key} [${STATUS_LABEL[t.status]}${t.priority !== "none" ? `, ${t.priority}` : ""}] ${t.title} · ${t.assignee_id ? this.nameOf(t.assignee_id) : "unassigned"}${t.needs_human ? " · NEEDS A PERSON" : ""}${b.length ? ` · waiting on ${b.map((x) => x.key).join(", ")}` : ""}`;
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
      live.length ? live.map((d) => `- ${d.key}${d.kind === "contract" ? " (contract)" : ""}: ${d.title}${d.body.trim() ? ` · ${d.body.trim().replace(/\s+/g, " ").slice(0, 400)}` : ""}`).join("\n") : "(none yet)",
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
    const [steps, comments, all, links] = await Promise.all([this.steps(t.id), this.comments(t.id), this.tickets(), this.links()]);
    const byId = new Map(all.map((x) => [x.id, x]));
    const parent = t.parent_id ? byId.get(t.parent_id) : undefined;
    const blockedBy = links.filter((l) => l.ticket_id === t.id).map((l) => byId.get(l.blocked_by)).filter((x): x is Ticket => !!x);
    const unblocks = links.filter((l) => l.blocked_by === t.id).map((l) => byId.get(l.ticket_id)).filter((x): x is Ticket => !!x);
    const children = all.filter((x) => x.parent_id === t.id);
    const ref2 = (x: Ticket) => `${x.key} (${STATUS_LABEL[x.status]}) ${x.title}`;
    return [
      `${t.key} · ${t.title}`,
      `Status: ${STATUS_LABEL[t.status]} · Priority: ${t.priority} · Type: ${t.type} · Assignee: ${t.assignee_id ? this.nameOf(t.assignee_id) : "unassigned"} · Reporter: ${this.nameOf(t.reporter_id)}`,
      ...(parent ? [`Epic: ${parent.key} ${parent.title}`] : []),
      ...(t.labels.length ? [`Labels: ${t.labels.join(", ")}`] : []),
      ...(t.branch || t.pr_url ? [`Branch: ${t.branch ?? "-"} · PR: ${t.pr_url ?? "-"}`] : []),
      ...(t.needs_human ? [`NEEDS A PERSON: ${t.needs_human}`] : []),
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
export function questionsForLead(tickets: Ticket[], leadId: string): Ticket[] {
  return tickets.filter(
    (t) =>
      t.needs_human &&
      t.needs_human !== AGENT_LOOP_QUESTION &&
      !isMergeQuestion(t.needs_human) &&
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
