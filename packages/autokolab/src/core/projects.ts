import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { AutoKolabError, friendly } from "./client.js";
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

/** Used when a project has no rules written yet. Same as the website's recommended rules. */
export function defaultRules(defaultBranch: string): string {
  return [
    "- Only work on tickets assigned to you that are in Ready or In progress.",
    "- When you start, move the ticket to In progress and plan the steps on it.",
    "- One branch per ticket, named <ticket key>-<short-title>. Commit and push early so others can see your work.",
    `- Never push to ${defaultBranch}. Open a pull request and move the ticket to Review.`,
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

  private constructor(
    readonly sb: SupabaseClient,
    readonly meId: string,
    readonly project: Project,
  ) {}

  /** Projects this member is in. Empty if the server doesn't have projects yet. */
  static async mine(sb: SupabaseClient): Promise<Project[]> {
    const r = await sb.from("projects").select("id, name, slug, repo, default_branch, ticket_prefix").order("created_at");
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
      agents.length ? this.sb.from("agents").select("id, display_name").in("id", agents) : Promise.resolve({ data: [], error: null }),
    ]);
    this.names.clear();
    for (const x of check<{ id: string; name: string }[]>(p as never)) this.names.set(x.id, { name: x.name, type: "human" });
    for (const x of check<{ id: string; display_name: string }[]>(a as never)) this.names.set(x.id, { name: x.display_name, type: "agent" });
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

  /** What this agent is doing, shown on the board and in People. */
  async status(status: AgentStatus, note: string | null = null, ticketId: string | null = null): Promise<void> {
    check(await this.sb.rpc("agent_status", { p_status: status, p_note: note, p_ticket: ticketId }));
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

  /** New comments from people on this agent's open tickets, after the given comment ids. */
  async newHumanComments(after: Record<string, number>): Promise<{ ticket: Ticket; comments: Comment[] }[]> {
    const mine = (await this.tickets()).filter((t) => t.assignee_id === this.meId && ["in_progress", "review"].includes(t.status));
    if (!mine.length) return [];
    const rows = check<Comment[]>(
      await this.sb.from("ticket_comments").select("*").in("ticket_id", mine.map((t) => t.id)).eq("author_type", "human").order("id"),
    );
    const out: { ticket: Ticket; comments: Comment[] }[] = [];
    for (const t of mine) {
      const fresh = rows.filter((c) => c.ticket_id === t.id && c.id > (after[t.id] ?? 0));
      if (fresh.length) out.push({ ticket: t, comments: fresh });
    }
    return out;
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
    return [
      `# ${p.name}${p.repo ? ` · github.com/${p.repo}` : ""} · tickets ${p.ticket_prefix}-n · default branch ${p.default_branch}`,
      `You are ${this.nameOf(this.meId)}. People and agents in this project: ${this.peopleLine()}.`,
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

export function statusLabel(s: Status): string {
  return STATUS_LABEL[s];
}
