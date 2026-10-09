import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AutoKolab } from "../core/client.js";
import { ProjectView, type AgentStatus, type Comment, type Ticket } from "../core/projects.js";
import { stateDir } from "../core/config.js";
import { connectFromConfig } from "../core/node.js";
import { redactSecrets } from "../core/secrets.js";
import type { Message, MessageKind, RunState, TaskRun } from "../core/types.js";
import { claudeBin, mcpArgs } from "../setup/agents.js";
import { loadRunnerConfig, runnerFiles, type RunnerConfig } from "./config.js";
import { claudeInvocation, codexInvocation, runEngine, type EngineRun, type PlanStep } from "./engines.js";
import { installHook } from "./githook.js";
import { BLOCKED_PREFIX, buildPrompt, buildTicketPrompt, parseOutcome } from "./prompt.js";
import { clonePath, currentBranch, ensureClone, ensureTicketWorktree, ensureWorktree, headCommit, pruneWorktrees, ticketBranch, type Worktree } from "./repos.js";

// The runner for one agent: listens to all of its rooms and, when someone who can instruct sends
// it work, starts the agent headless in that thread's own worktree. It also works the project
// board: tickets assigned to it in Ready, and people's comments on its open tickets. One task at a
// time per agent; room instructions go first.

/** Kinds from an instructor, addressed to this agent, that start or continue work. */
const DIRECT_KINDS: MessageKind[] = ["task", "chat", "answer", "review", "decision", "question"];
/** Kinds addressed to everyone that continue work in a thread this agent is already on. */
const THREAD_KINDS: MessageKind[] = ["task", "chat", "answer", "review", "decision"];

const POLL_MS = 30_000;
const HEARTBEAT_MS = 30_000;

interface Job {
  run: TaskRun;
  message: Message;
}

interface TicketJob {
  project: ProjectView;
  ticket: Ticket;
  /** People's comments that started this run (a follow-up), if any. */
  comments: Comment[];
}

/** Per agent, on this machine: the engine session for each ticket and the last comment handled. */
interface TicketState {
  sessions: Record<string, string>;
  seen: Record<string, number>;
}

const PROJECTS_RELOAD_MS = 5 * 60_000;

export class Runner {
  private queue: Job[] = [];
  private busy = false;
  private polling: Promise<void> | null = null;
  private pollAgain = false;
  private lastSeenId = 0;
  /** The run in progress: a room instruction or a ticket. */
  private current: { what: string; abort: AbortController } | null = null;
  private stopping = false;
  private channels: RealtimeChannel[] = [];
  private timers: NodeJS.Timeout[] = [];
  private hooked = new Set<string>();
  private logDir: string;
  private projects: ProjectView[] = [];
  private projectsLoadedAt = 0;
  private ticketChannels: RealtimeChannel[] = [];
  private isAgentRow = true;

  constructor(
    private ak: AutoKolab,
    private cfg: RunnerConfig,
  ) {
    this.logDir = join(stateDir(), "runs");
    mkdirSync(this.logDir, { recursive: true });
  }

  static async start(file: string): Promise<Runner> {
    const cfg = loadRunnerConfig(file);
    // Claude Code may come bundled with the desktop app instead of being on the PATH.
    if (cfg.engine === "claude" && cfg.claude_bin === "claude") cfg.claude_bin = claudeBin() ?? "claude";
    const ak = await connectFromConfig(cfg.agent_id);
    const r = new Runner(ak, cfg);
    await r.init();
    return r;
  }

  private log(msg: string): void {
    console.log(`${new Date().toISOString().slice(0, 19).replace("T", " ")} [${this.ak.me.name}] ${msg}`);
  }

  private async init(): Promise<void> {
    const { ak, cfg } = this;
    const rooms = ak.rooms().map((r) => r.name).join(", ") || "no rooms yet";
    this.log(`Ready · ${cfg.engine} · rooms: ${rooms}`);
    const pruned = pruneWorktrees(ak.me.name);
    if (pruned) this.log(`Cleaned up ${pruned} old worktree(s).`);

    await this.recoverInterruptedRuns();
    const since = new Date(Date.now() - cfg.catch_up_hours * 3600_000).toISOString();
    this.lastSeenId = await ak.firstMessageIdSince(since);

    await ak.heartbeat(ak.me.paused ? "paused" : "idle");
    if (ak.me.paused) this.log(`Paused by ${ak.ownerName(ak.me)}; instructions will queue until resumed.`);

    this.channels.push(ak.onAnyMessage(() => this.poll()));
    this.channels.push(ak.onMembersChange(() => void this.onPauseChange(ak.me.paused)));
    this.timers.push(setInterval(() => this.poll(), POLL_MS));
    this.timers.push(
      setInterval(() => {
        void ak.heartbeat(this.stateNow()).catch((e) => this.log(`Heartbeat failed: ${e.message}`));
        void this.touchAgent();
      }, HEARTBEAT_MS),
    );
    await this.loadProjects();
    if (this.projects.length) {
      this.log(`Projects: ${this.projects.map((p) => p.project.name).join(", ")}`);
      await this.setStatus(ak.me.paused ? "paused" : "idle");
    }
    this.poll();
    void this.introduce().catch((e) => this.log(`Couldn't introduce myself yet: ${(e as Error).message}`));
  }

  // ------------------------------------------------------------ daily limit

  private usagePath(): string {
    return join(stateDir(), "usage", `${this.ak.me.id}.json`);
  }

  private usedToday(): number {
    try {
      const u = JSON.parse(readFileSync(this.usagePath(), "utf8")) as { date: string; seconds: number };
      return u.date === today() ? u.seconds : 0;
    } catch {
      return 0;
    }
  }

  private addUsage(seconds: number): void {
    mkdirSync(join(stateDir(), "usage"), { recursive: true });
    writeFileSync(this.usagePath(), JSON.stringify({ date: today(), seconds: this.usedToday() + seconds }));
  }

  private overLimit(): boolean {
    return this.usedToday() >= this.cfg.limits.max_hours_per_day * 3600;
  }

  private limitNoticeDay = "";
  private async waitForTomorrow(job: Job): Promise<void> {
    if (this.limitNoticeDay !== today()) {
      this.limitNoticeDay = today();
      const hours = this.cfg.limits.max_hours_per_day;
      await this.say(job.message.room_id, job.run.thread_root, job.message.sender_id,
        `I've done my ${hours} hour${hours === 1 ? "" : "s"} of work for today (the limit ${this.ak.ownerName(this.ak.me)} set). I'll pick up #${job.message.id} tomorrow.`);
      this.log(`Daily limit reached; waiting until tomorrow.`);
    }
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5).getTime() - now.getTime();
    setTimeout(() => void this.work(), Math.min(midnight, 3600_000)).unref();
  }

  // ------------------------------------------------------------ hello

  /** The first time this agent runs, it reads the repo and says hello to the team. */
  private async introduce(): Promise<void> {
    const marker = join(stateDir(), "introduced", this.ak.me.id);
    if (existsSync(marker)) return;
    const room = this.ak.rooms().find((r) => r.repo);
    if (!room) return;
    const clone = ensureClone(room.repo!);
    const prompt =
      `You are ${this.ak.me.name}, ${this.ak.ownerName(this.ak.me)}'s AI agent, and you just joined the team working on github.com/${room.repo}. ` +
      `Don't change any files. Read the README and look around the repo for a minute, then write a short hello for the team (3 to 5 sentences): ` +
      `who you are and your understanding of what this project is and how it's built. Your final message is posted to the team's room as is.`;
    const mcp = { command: process.execPath, args: mcpArgs(this.cfg.agent_id, room.name) };
    const inv = this.cfg.engine === "claude" ? claudeInvocation(this.cfg, mcp, null) : codexInvocation(this.cfg, mcp, null, clone);
    const result = await runEngine({ cfg: this.cfg, inv, cwd: clone, prompt, logFile: join(this.logDir, `${room.name}-hello.log`), signal: new AbortController().signal });
    const text = redactSecrets(result.finalText.trim()).slice(0, 4000);
    if (result.isError || !text) throw new Error(text || "no reply");
    await this.ak.room(room).post({ kind: "chat", body: text });
    mkdirSync(join(stateDir(), "introduced"), { recursive: true });
    writeFileSync(marker, new Date().toISOString());
    this.log("Said hello to the team.");
  }

  private stateNow() {
    return this.ak.me.paused ? ("paused" as const) : this.current ? ("working" as const) : ("idle" as const);
  }

  private async recoverInterruptedRuns(): Promise<void> {
    for (const r of (await this.ak.myRuns(200)).reverse()) {
      if (r.state === "running") {
        await this.ak.updateRun(r.id, { state: "failed", summary: "Runner stopped while this was running.", finished_at: now() });
        await this.say(r.room_id, r.thread_root, null, `Stopped: my runner restarted while working on #${r.message_id}. Send it again to retry.`);
      } else if (r.state === "queued") {
        const message = await this.ak.messageById(r.message_id);
        if (message) this.queue.push({ run: r, message });
      }
    }
  }

  /** Fetch messages after the last one seen. Realtime events and the timer both just call this. */
  private poll(): void {
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    this.polling = (async () => {
      do {
        this.pollAgain = false;
        try {
          for (;;) {
            const batch = await this.ak.messagesAfter(this.lastSeenId, 100);
            for (const m of batch) {
              this.lastSeenId = Math.max(this.lastSeenId, m.id);
              if (await this.isInstruction(m)) await this.enqueue(m);
            }
            if (batch.length < 100) break;
          }
        } catch (e) {
          this.log(`Couldn't check for messages: ${(e as Error).message}`);
        }
      } while (this.pollAgain);
      this.polling = null;
      void this.work();
    })();
  }

  private async isInstruction(m: Message): Promise<boolean> {
    const me = this.ak.me;
    if (m.sender_id === me.id) return false;
    if (!this.ak.roomById(m.room_id) || !this.ak.membership(m.room_id, m.sender_id)) await this.ak.refresh();
    if (!this.ak.canInstruct(m.sender_id, m.room_id)) return false;
    if (m.to_id === me.id) return DIRECT_KINDS.includes(m.kind);
    if (m.to_id !== null) return false;
    if (m.thread_id && THREAD_KINDS.includes(m.kind) && (await this.ak.runsIn(m.thread_id)).length) return true;
    return m.kind === "task" && !m.thread_id && this.cfg.accept_broadcast_tasks;
  }

  private async enqueue(m: Message): Promise<void> {
    const run = await this.ak.claimRun(m);
    if (!run) return;
    this.log(`Queued #${m.id} from ${this.ak.nameOf(m.sender_id)} in ${this.ak.roomById(m.room_id)?.name}.`);
    this.queue.push({ run, message: m });
    if (this.ak.me.paused) {
      await this.say(m.room_id, run.thread_root, m.sender_id, `Queued #${m.id}: ${this.ak.ownerName(this.ak.me)} has paused me; I'll start when resumed.`);
    }
  }

  private async onPauseChange(paused: boolean): Promise<void> {
    await this.ak.heartbeat(this.stateNow()).catch(() => undefined);
    if (!this.current) await this.setStatus(paused ? "paused" : "idle");
    if (paused && this.current) {
      this.log("Paused by owner: stopping the current task.");
      this.current.abort.abort();
    }
    if (!paused) void this.work();
  }

  private async work(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length && !this.ak.me.paused && !this.stopping) {
        if (this.overLimit()) {
          await this.waitForTomorrow(this.queue[0]);
          break;
        }
        const job = this.queue.shift()!;
        await this.execute(job).catch(async (e) => {
          const msg = (e as Error).message;
          this.log(`#${job.message.id} failed to start: ${msg}`);
          await this.ak.updateRun(job.run.id, { state: "failed", summary: msg.slice(0, 16000), finished_at: now() }).catch(() => undefined);
          await this.say(job.message.room_id, job.run.thread_root, job.message.sender_id, `Couldn't start #${job.message.id}: ${msg}`);
        });
      }
      // Then the board: follow-ups on its tickets, then the next Ready ticket.
      while (!this.queue.length && !this.ak.me.paused && !this.stopping && !this.overLimit()) {
        const tj = await this.nextTicket().catch((e) => {
          this.log(`Couldn't check the board: ${(e as Error).message}`);
          return null;
        });
        if (!tj) break;
        await this.executeTicket(tj).catch(async (e) => {
          const msg = (e as Error).message;
          this.log(`${tj.ticket.key} failed to start: ${msg}`);
          await tj.project.update(tj.ticket.key, { needs_human: `I couldn't start: ${msg}`.slice(0, 1000) }).catch(() => undefined);
          await this.setStatus("blocked", `Couldn't start ${tj.ticket.key}`, tj.ticket.id);
        });
      }
    } finally {
      this.busy = false;
    }
  }

  private prepareWorkspace(m: Message, threadRoot: number): Worktree {
    const room = this.ak.roomById(m.room_id);
    if (!room?.repo) throw new Error(`room ${room?.name ?? m.room_id} isn't linked to a GitHub repo.`);
    ensureClone(room.repo);
    if (!this.hooked.has(room.repo)) {
      installHook(clonePath(room.repo), this.cfg.limits.protected_branches);
      this.hooked.add(room.repo);
    }
    return ensureWorktree(this.ak.me.name, room.repo, threadRoot);
  }

  private async execute(job: Job): Promise<void> {
    const { ak, cfg } = this;
    const { run, message: m } = job;
    const room = ak.roomById(m.room_id)!;
    const sender = (await ak.memberFresh(m.sender_id))!;
    const worktree = this.prepareWorkspace(m, run.thread_root);
    const resume = await ak.lastSession(run.thread_root);
    const instructors = ak.membersOf(room.id).filter((x) => x.can_instruct).map((x) => x.name);
    const prompt = buildPrompt({
      me: ak.me,
      ownerName: ak.ownerName(ak.me),
      myRole: ak.membership(room.id)?.role ?? "follower",
      room,
      sender,
      senderRole: ak.membership(room.id, sender.id)?.role ?? "member",
      message: m,
      instructors,
      cfg,
      worktree,
      followUp: Boolean(resume),
    });
    const mcp = { command: process.execPath, args: mcpArgs(cfg.agent_id, room.name) };
    const inv = cfg.engine === "claude" ? claudeInvocation(cfg, mcp, resume) : codexInvocation(cfg, mcp, resume, worktree.path);
    const logFile = join(this.logDir, `${room.name}-run${run.id}-msg${m.id}.log`);

    const abort = new AbortController();
    this.current = { what: `#${m.id}`, abort };
    await ak.updateRun(run.id, { state: "running", branch: worktree.branch, started_at: now() });
    await ak.heartbeat("working").catch(() => undefined);
    this.log(`Working on #${m.id} in ${room.name} (${worktree.branch})${resume ? ", continuing session" : ""}.`);
    await this.say(room.id, run.thread_root, sender.id, resume ? `Picked up #${m.id}, continuing.` : `Started on #${m.id} (branch ${worktree.branch}).`);

    let result;
    const startedAt = Date.now();
    try {
      result = await runEngine({ cfg, inv, cwd: worktree.path, prompt, logFile, signal: abort.signal });
    } finally {
      this.current = null;
      this.addUsage((Date.now() - startedAt) / 1000);
    }

    const text = redactSecrets(result.finalText.trim()).slice(0, 12000);
    let state: RunState;
    let report: string;
    if (result.aborted) {
      state = "cancelled";
      const why = this.stopping ? "my runner was shut down" : `${ak.ownerName(ak.me)} paused me`;
      report = `Stopped #${m.id}: ${why}.${text ? `\n\nWhere it got to:\n${text}` : ""}`;
    } else if (result.timedOut) {
      state = "failed";
      report = `Stopped #${m.id}: hit the ${cfg.limits.max_minutes}-minute limit.${text ? `\n\nWhere it got to:\n${text}` : ""}`;
    } else if (text.startsWith(BLOCKED_PREFIX)) {
      state = "blocked";
      report = `Blocked on #${m.id}: ${text.slice(BLOCKED_PREFIX.length).trim()}`;
    } else if (result.isError) {
      state = "failed";
      report = `Failed on #${m.id}.${text ? `\n\n${text}` : ""}`;
    } else {
      state = "done";
      report = text || `Done with #${m.id}.`;
    }

    const branch = currentBranch(worktree.path) ?? worktree.branch;
    await ak.updateRun(run.id, { state, session_id: result.sessionId, branch, summary: report.slice(0, 16000), finished_at: now() });
    await this.say(room.id, run.thread_root, sender.id, report);
    await ak.heartbeat(this.stateNow()).catch(() => undefined);
    // Cost is an API-price estimate (not a bill on a Claude subscription); keep it out of the room.
    this.log(`#${m.id} ${state}.${result.costUsd !== undefined ? ` (estimated API cost $${result.costUsd.toFixed(2)})` : ""}`);
  }


  // ------------------------------------------------------------ project board

  private async loadProjects(): Promise<void> {
    this.projectsLoadedAt = Date.now();
    const views = await ProjectView.all(this.ak.sb, this.ak.me.id).catch(() => [] as ProjectView[]);
    const known = new Set(this.projects.map((p) => p.project.id));
    const changed = views.length !== this.projects.length || views.some((v) => !known.has(v.project.id));
    this.projects = views;
    if (!changed) return;
    for (const ch of this.ticketChannels) void this.ak.sb.removeChannel(ch);
    this.ticketChannels = views.map((v) => v.onChange(() => void this.work()));
    // First run on this machine: comments from before don't start work.
    const st = this.ticketState();
    for (const v of views) {
      for (const { ticket, comments } of await v.newHumanComments(st.seen).catch(() => [])) {
        if (st.seen[ticket.id] === undefined) st.seen[ticket.id] = comments[comments.length - 1].id;
      }
    }
    this.saveTicketState(st);
  }

  private ticketStatePath(): string {
    return join(stateDir(), "tickets", `${this.ak.me.id}.json`);
  }

  private ticketState(): TicketState {
    try {
      return { sessions: {}, seen: {}, ...(JSON.parse(readFileSync(this.ticketStatePath(), "utf8")) as Partial<TicketState>) };
    } catch {
      return { sessions: {}, seen: {} };
    }
  }

  private saveTicketState(st: TicketState): void {
    mkdirSync(join(stateDir(), "tickets"), { recursive: true });
    writeFileSync(this.ticketStatePath(), JSON.stringify(st, null, 2));
  }

  private async nextTicket(): Promise<TicketJob | null> {
    if (Date.now() - this.projectsLoadedAt > PROJECTS_RELOAD_MS) await this.loadProjects();
    if (!this.projects.length) return null;
    const st = this.ticketState();
    for (const project of this.projects) {
      const [first] = await project.newHumanComments(st.seen);
      if (first) return { project, ticket: first.ticket, comments: first.comments };
    }
    for (const project of this.projects) {
      const ticket = await project.claimNext();
      if (ticket) return { project, ticket, comments: [] };
    }
    return null;
  }

  /** What this agent is doing, for the board and People. Quietly does nothing for v1-only agents. */
  private async setStatus(status: AgentStatus, note: string | null = null, ticketId: string | null = null): Promise<void> {
    if (!this.isAgentRow || !this.projects.length) return;
    try {
      await this.projects[0].status(status, note, ticketId);
    } catch (e) {
      if ((e as Error).message.includes("only agents")) this.isAgentRow = false;
    }
  }

  /** Keep "last seen" fresh without changing what the agent said it's doing. */
  private async touchAgent(): Promise<void> {
    if (!this.isAgentRow || !this.projects.length) return;
    const { data } = await this.ak.sb.from("agents").select("status, status_note, current_ticket_id").eq("id", this.ak.me.id).maybeSingle();
    if (data) await this.setStatus(data.status as AgentStatus, data.status_note, data.current_ticket_id);
  }

  private async executeTicket(job: TicketJob): Promise<void> {
    const { ak, cfg } = this;
    const { project: p } = job;
    let t = job.ticket;
    const repo = p.project.repo;
    if (!repo) throw new Error(`${p.project.name} isn't linked to a GitHub repo yet (set it on autokolab.com).`);

    const st = this.ticketState();
    if (job.comments.length) st.seen[t.id] = job.comments[job.comments.length - 1].id;
    this.saveTicketState(st);

    ensureClone(repo);
    if (!this.hooked.has(repo)) {
      installHook(clonePath(repo), cfg.limits.protected_branches);
      this.hooked.add(repo);
    }
    const worktree = ensureTicketWorktree(ak.me.name, repo, t.key, t.branch ?? ticketBranch(t.key, t.title));
    if (t.branch !== worktree.branch) t = await p.update(t.key, { branch: worktree.branch });

    await p.loadNames();
    const resume = st.sessions[t.id] ?? null;
    const commentsText = job.comments.length ? job.comments.map((c) => `${p.nameOf(c.author_id)}: ${c.body}`).join("\n\n") : null;
    const prompt = buildTicketPrompt({
      myName: ak.me.name,
      ownerName: ak.ownerName(ak.me),
      projectName: p.project.name,
      key: t.key,
      brief: resume && commentsText ? "" : await p.brief(),
      ticket: resume && commentsText ? "" : await p.ticketText(t.key),
      cfg,
      worktree,
      followUp: Boolean(resume),
      newComments: commentsText,
    });
    const mcp = { command: process.execPath, args: mcpArgs(cfg.agent_id, undefined, p.project.slug) };
    const inv = cfg.engine === "claude" ? claudeInvocation(cfg, mcp, resume) : codexInvocation(cfg, mcp, resume, worktree.path);
    const logFile = join(this.logDir, `${p.project.slug}-${t.key}-${Date.now()}.log`);

    const abort = new AbortController();
    this.current = { what: t.key, abort };
    await ak.heartbeat("working").catch(() => undefined);
    await this.setStatus("planning", job.comments.length ? "Reading new comments" : "Reading the ticket", t.id);
    this.log(`Working on ${t.key} in ${p.project.name} (${worktree.branch})${job.comments.length ? " after new comments" : ""}${resume ? ", continuing session" : ""}.`);

    // Progress shows on the board even when the agent can't use the AutoKolab tools: its own
    // to-do list becomes the ticket's steps, and without one, its latest commit is what it's doing.
    let pendingPlan: PlanStep[] | null = null;
    let sawPlan = false;
    let syncing: Promise<void> = Promise.resolve();
    const flushPlan = () => {
      const plan = pendingPlan;
      pendingPlan = null;
      if (plan) syncing = syncing.then(() => p.syncSteps(t.key, plan)).catch((e) => this.log(`Couldn't update ${t.key}'s steps: ${(e as Error).message}`));
    };
    let lastSha = headCommit(worktree.path)?.sha;
    const timers = [
      setInterval(flushPlan, 3000),
      setInterval(() => {
        const h = headCommit(worktree.path);
        if (!h || h.sha === lastSha) return;
        lastSha = h.sha;
        if (!sawPlan) void this.setStatus("building", `Committed: ${h.subject}`.slice(0, 200), t.id);
      }, 30_000),
    ];

    let result!: EngineRun;
    const startedAt = Date.now();
    try {
      result = await runEngine({
        cfg,
        inv,
        cwd: worktree.path,
        prompt,
        logFile,
        signal: abort.signal,
        onPlan: (plan, run) => {
          sawPlan = true;
          if (!run.reportsSteps) pendingPlan = plan;
        },
      });
    } finally {
      for (const x of timers) clearInterval(x);
      if (!result?.reportsSteps) flushPlan();
      else pendingPlan = null;
      await syncing;
      this.current = null;
      this.addUsage((Date.now() - startedAt) / 1000);
    }

    if (result.sessionId) {
      const s2 = this.ticketState();
      s2.sessions[t.id] = result.sessionId;
      this.saveTicketState(s2);
    }

    const raw = redactSecrets(result.finalText.trim()).slice(0, 12000);
    const o = parseOutcome(raw);
    const text = o.body;
    const after = await p.ticket(t.key);
    const ourPr = (u?: string) => (u && u.toLowerCase().startsWith(`https://github.com/${repo}/pull/`) ? u : undefined);
    let outcome: string;
    if (result.aborted) {
      outcome = "stopped";
      await p.comment(t.key, `Stopped: ${this.stopping ? "my runner was shut down" : `${ak.ownerName(ak.me)} paused me`}.${text ? `\n\nWhere it got to:\n${text}` : ""}`).catch(() => undefined);
    } else if (result.timedOut || result.isError) {
      outcome = "failed";
      const why = result.timedOut ? `hit the ${cfg.limits.max_minutes}-minute limit` : "the run failed";
      await p.comment(t.key, `Stopped: ${why}.${text ? `\n\n${text}` : ""}`).catch(() => undefined);
      await p.update(t.key, { needs_human: `I stopped: ${why}. Comment here to have me continue, or check the log on ${ak.ownerName(ak.me)}'s computer.` }).catch(() => undefined);
    } else if (text.startsWith(BLOCKED_PREFIX)) {
      outcome = "blocked";
      const q = text.slice(BLOCKED_PREFIX.length).trim();
      await p.update(t.key, { needs_human: q.slice(0, 1000) || "I'm blocked; see my comment." }).catch(() => undefined);
      if (q.length > 1000) await p.comment(t.key, q).catch(() => undefined);
    } else {
      outcome = o.status === "blocked" ? "blocked" : "done";
      if (text) await p.comment(t.key, text).catch((e) => this.log(`Couldn't comment on ${t.key}: ${(e as Error).message}`));
      // The ending block (or just a PR link) moves the ticket, so agents without the tools can finish too.
      const pr = ourPr(o.pr) ?? ourPr(text.match(/https:\/\/github\.com\/[^\s)>\]]+\/pull\/\d+/i)?.[0]);
      const change: Parameters<ProjectView["update"]>[1] = {};
      if (o.question) change.needs_human = o.question;
      else if (o.status === "blocked") change.needs_human = "I'm blocked; see my last comment.";
      if (pr && !after.pr_url) change.pr_url = pr;
      if (pr && after.status === "in_progress" && (!o.status || o.status === "review")) change.status = "review";
      if (Object.keys(change).length) await p.update(t.key, change).catch((e) => this.log(`Couldn't update ${t.key}: ${(e as Error).message}`));
      if (o.newTickets.length) {
        const open = (await p.tickets()).filter((x) => !["done", "canceled"].includes(x.status)).map((x) => x.title.toLowerCase());
        for (const title of o.newTickets) {
          if (open.includes(title.toLowerCase())) continue;
          await p.create({ title, description: `Found by ${ak.me.name} while working on ${t.key}.` }).catch((e) => this.log(`Couldn't create "${title}": ${(e as Error).message}`));
        }
      }
    }
    await this.setStatus(ak.me.paused ? "paused" : "idle");
    await ak.heartbeat(this.stateNow()).catch(() => undefined);
    this.log(`${t.key} ${outcome}.${result.costUsd !== undefined ? ` (estimated API cost $${result.costUsd.toFixed(2)})` : ""}`);
  }

  private async say(roomId: string, thread: number, to: string | null, body: string): Promise<void> {
    try {
      await this.ak.room(roomId).post({ body, kind: "status", to, thread });
    } catch (e) {
      this.log(`Couldn't post to the room: ${(e as Error).message}`);
      if ((e as Error).message.includes("key or token")) {
        await this.ak
          .room(roomId)
          .post({ body: "Finished, but my report was withheld because it looked like it contained a secret. The runner log on my machine has it.", kind: "status", to, thread })
          .catch(() => undefined);
      }
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.queue = [];
    for (const t of this.timers) clearInterval(t);
    if (this.current) {
      this.current.abort.abort();
      const deadline = Date.now() + 20_000;
      while ((this.current || this.busy) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    }
    await this.ak.heartbeat("offline").catch(() => undefined);
    await this.setStatus("offline");
    await this.ak.close();
  }
}

/** Run every agent on this machine that has runner limits set up (or just the named ones). */
export async function runAll(only?: string[]): Promise<Runner[]> {
  const profiles = only?.length ? only : runnerFiles();
  if (!profiles.length) {
    throw new Error("No agents to run on this machine. `autokolab join <invite>` sets them up.");
  }
  const runners: Runner[] = [];
  for (const p of profiles) {
    try {
      runners.push(await Runner.start(p));
    } catch (e) {
      console.error(`[${p}] couldn't start: ${(e as Error).message}`);
    }
  }
  if (!runners.length) throw new Error("No runner could start (see above).");
  return runners;
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
