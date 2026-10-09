import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AutoKolab } from "../core/client.js";
import { AGENT_COMMENT_LIMIT, AGENT_LOOP_QUESTION, MODEL_CHANGE_PREFIX, ProjectView, untriaged, type AgentStatus, type Comment, type RanWith, type Ticket } from "../core/projects.js";
import { stateDir } from "../core/config.js";
import { connectFromConfig } from "../core/node.js";
import { redactSecrets } from "../core/secrets.js";
import type { Message, MessageKind, Room, RunState, TaskRun } from "../core/types.js";
import { claudeBin, mcpArgs } from "../setup/agents.js";
import { loadRunnerConfig, runnerFiles, type RunnerConfig } from "./config.js";
import { chooseModel, claudeInvocation, codexInvocation, runEngine, type EngineRun, type ModelChoice, type PlanStep } from "./engines.js";
import { installHook } from "./githook.js";
import { BLOCKED_PREFIX, NO_REPLY, buildPrompt, buildTicketPrompt, buildTriagePrompt, parseOutcome } from "./prompt.js";
import { clonePath, currentBranch, ensureClone, ensureTicketWorktree, ensureWorktree, headCommit, pruneWorktrees, ticketBranch, type Worktree } from "./repos.js";

// The runner for one agent: listens to all of its rooms and, when someone sends it work or a
// teammate asks it something, starts the agent headless in that thread's own worktree. It also
// works the project board: tickets assigned to it in Ready, and comments on its open tickets. A
// project's lead also answers workers' questions on their tickets ("Needs you"). One task at a time
// per agent: room messages first, then the lead's triage, then its own tickets.

/** Kinds addressed to everyone that continue work in a thread this agent is already on. */
const THREAD_KINDS: MessageKind[] = ["task", "chat", "answer", "review", "decision"];
/** From a teammate, addressed to everyone: only these continue work in a thread we're on (DEC-17). */
const TEAMMATE_THREAD_KINDS: MessageKind[] = ["question", "answer", "review"];

const POLL_MS = 30_000;
const HEARTBEAT_MS = 30_000;

interface Job {
  run: TaskRun;
  message: Message;
  /** The sender can give this agent instructions (a person, or the lead side). */
  fromInstructor: boolean;
}

/** What the runner knows about a message's sender when deciding whether to wake its agent. */
export interface WakeContext {
  /** This agent's member id. */
  meId: string;
  /** The sender is still an active member of this room. */
  senderInRoom: boolean;
  /** The sender can give this agent instructions. */
  fromInstructor: boolean;
  /** This agent already has a run in the message's thread. */
  inThread: boolean;
  /** The owner also lets this agent take tasks addressed to everyone. */
  acceptBroadcastTasks: boolean;
}

export interface WakeDecision {
  wake: boolean;
  fromInstructor: boolean;
}

/**
 * Does this message wake this agent? Anyone in the room wakes it by addressing it directly, any
 * kind (so a runner's status report reaches the agent that asked), except with a runner notice.
 * Otherwise instructors work as they always have, and teammates (anyone else in the room) wake it
 * only by talking in a thread it's already working in.
 */
export function shouldWake(m: Pick<Message, "sender_id" | "to_id" | "thread_id" | "kind" | "body">, ctx: WakeContext): WakeDecision {
  const from = ctx.fromInstructor;
  const no = { wake: false, fromInstructor: from };
  if (m.sender_id === ctx.meId || !ctx.senderInRoom) return { wake: false, fromInstructor: false };
  // A runner saying "Started on #12" isn't something to answer.
  if (isRunnerNotice(m.body)) return no;
  if (m.to_id === ctx.meId) return { wake: true, fromInstructor: from };
  if (m.to_id !== null) return no;
  if (from) {
    if (m.thread_id && THREAD_KINDS.includes(m.kind) && ctx.inThread) return { wake: true, fromInstructor: true };
    return { wake: m.kind === "task" && !m.thread_id && ctx.acceptBroadcastTasks, fromInstructor: true };
  }
  if (m.thread_id && TEAMMATE_THREAD_KINDS.includes(m.kind) && ctx.inThread) return { wake: true, fromInstructor: false };
  return no;
}

/**
 * Progress pings a runner posts for its agent, and the lead's notice that it changed an agent's
 * model. They're news, not a question to answer.
 */
export function isRunnerNotice(body: string): boolean {
  const first = body.trim();
  return /^(Started on|Picked up|Queued) #\d+/.test(first) || isPauseNotice(first) || first.startsWith(MODEL_CHANGE_PREFIX);
}

/**
 * Catch-up on start is for instructions only: a teammate's message from before this runner
 * started is old conversation, not work, so it's skipped (and a run queued for it is dropped).
 */
export function staleTeammateMessage(m: Pick<Message, "created_at">, fromInstructor: boolean, runnerStartedAt: number): boolean {
  return !fromInstructor && Date.parse(m.created_at) < runnerStartedAt;
}

export const STALE_RUN_SUMMARY = "Skipped: old teammate message from before the runner started";

/** What a run says in the room as it starts. Teammate chat gets none: its reply (if any) is enough. */
export function startNotice(messageId: number, branch: string, resumed: boolean, fromInstructor: boolean): string | null {
  if (!fromInstructor) return null;
  return resumed ? `Picked up #${messageId}, continuing.` : `Started on #${messageId} (branch ${branch}).`;
}

export function pauseNotice(turns: number): string {
  return `Pausing this thread after ${turns} agent messages in a row. A person can reply to continue.`;
}

export function isPauseNotice(body: string): boolean {
  return /^Pausing this thread after \d+ agent messages in a row\. A person can reply to continue\.$/.test(body.trim());
}

export interface RunOutcome {
  state: RunState;
  /** What the run is recorded as, and what the room is told unless `quiet`. */
  report: string;
  /** NO_REPLY: nothing is posted to the room. */
  quiet: boolean;
}

/** How a finished run is recorded and reported. */
export function runOutcome(
  result: Pick<EngineRun, "aborted" | "timedOut" | "isError">,
  text: string,
  ctx: { messageId: number; stopReason: string; maxMinutes: number },
): RunOutcome {
  const sofar = text ? `\n\nWhere it got to:\n${text}` : "";
  const quiet = false;
  if (result.aborted) return { state: "cancelled", report: `Stopped #${ctx.messageId}: ${ctx.stopReason}.${sofar}`, quiet };
  if (result.timedOut) return { state: "failed", report: `Stopped #${ctx.messageId}: hit the ${ctx.maxMinutes}-minute limit.${sofar}`, quiet };
  if (text.startsWith(BLOCKED_PREFIX)) return { state: "blocked", report: `Blocked on #${ctx.messageId}: ${text.slice(BLOCKED_PREFIX.length).trim()}`, quiet };
  if (result.isError) return { state: "failed", report: `Failed on #${ctx.messageId}.${text ? `\n\n${text}` : ""}`, quiet };
  if (text === NO_REPLY) return { state: "done", report: "No reply needed", quiet: true };
  return { state: "done", report: text || `Done with #${ctx.messageId}.`, quiet };
}

/** The loop guard's count: messages in a thread since the last one from a person, leaving out runner notices. */
export function agentTurnsSinceHuman(thread: Pick<Message, "sender_id" | "body">[], isHuman: (senderId: string) => boolean): number {
  let turns = 0;
  for (let i = thread.length - 1; i >= 0; i--) {
    if (isHuman(thread[i].sender_id)) break;
    if (!isRunnerNotice(thread[i].body)) turns++;
  }
  return turns;
}

interface TicketJob {
  project: ProjectView;
  ticket: Ticket;
  /** People's comments that started this run (a follow-up), if any. */
  comments: Comment[];
}

/** A worker's question on a ticket, for the project's lead to answer or bring to its person. */
interface TriageJob {
  project: ProjectView;
  ticket: Ticket;
}

/**
 * Per agent, on this machine: the engine session for each ticket, the last comment handled, and
 * (for a lead) the question text on each worker's ticket it already triaged.
 */
interface TicketState {
  sessions: Record<string, string>;
  seen: Record<string, number>;
  triaged?: Record<string, string>;
}

const PROJECTS_RELOAD_MS = 5 * 60_000;

export class Runner {
  private queue: Job[] = [];
  private busy = false;
  private polling: Promise<void> | null = null;
  private pollAgain = false;
  private lastSeenId = 0;
  /** When this runner started: teammate messages from before it don't start work. */
  private readonly startedAt = Date.now();
  /** The run in progress: a room instruction or a ticket. */
  private current: { what: string; abort: AbortController } | null = null;
  private stopping = false;
  /** The updater holds new runs while it pulls and builds (AK-31). */
  private held = false;
  /** Saying hello runs the agent outside the queue. */
  private greeting = false;
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
    // React only when this agent's own pause switch flips. Member rows change all the time (every
    // check-in), and answering each change with another check-in once made an endless storm.
    let paused = ak.me.paused;
    this.channels.push(
      ak.onMembersChange(() => {
        if (ak.me.paused === paused) return;
        paused = ak.me.paused;
        void this.onPauseChange(paused);
      }),
    );
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
    if (!room || this.held) return;
    this.greeting = true;
    try {
      await this.sayHello(room, marker);
    } finally {
      this.greeting = false;
    }
  }

  private async sayHello(room: Room, marker: string): Promise<void> {
    const clone = ensureClone(room.repo!);
    const prompt =
      `You are ${this.ak.me.name}, ${this.ak.ownerName(this.ak.me)}'s AI agent, and you just joined the team working on github.com/${room.repo}. ` +
      `Don't change any files. Read the README and look around the repo for a minute, then write a short hello for the team (3 to 5 sentences): ` +
      `who you are and your understanding of what this project is and how it's built. Your final message is posted to the team's room as is.`;
    const mcp = { command: process.execPath, args: mcpArgs(this.cfg.agent_id, room.name) };
    const choice = await this.modelChoice();
    const inv = this.cfg.engine === "claude" ? claudeInvocation(this.cfg, mcp, null, choice) : codexInvocation(this.cfg, mcp, null, clone, choice);
    const result = await runEngine({ cfg: this.cfg, inv, cwd: clone, prompt, logFile: join(this.logDir, `${room.name}-hello.log`), signal: new AbortController().signal, onModel: this.reportModel(choice) });
    const text = redactSecrets(result.finalText.trim()).slice(0, 4000);
    if (result.isError || !text) throw new Error(text || "no reply");
    await this.ak.room(room).post({ kind: "chat", body: text });
    mkdirSync(join(stateDir(), "introduced"), { recursive: true });
    writeFileSync(marker, new Date().toISOString());
    this.log("Said hello to the team.");
  }

  /**
   * The model and effort for the run about to start, read fresh from the agent's row each time, so a
   * change on AutoKolab applies to the next run without a restart and never disturbs one in flight.
   * If the row can't be read (an older server, or offline), the toml decides.
   */
  private async modelChoice(): Promise<ModelChoice> {
    if (this.cfg.model_locked) return chooseModel(this.cfg, null);
    try {
      const { data, error } = await this.ak.sb.from("agents").select("model, effort").eq("id", this.ak.me.id).maybeSingle();
      if (error) throw new Error(error.message);
      return chooseModel(this.cfg, data as { model: string | null; effort: string | null } | null);
    } catch (e) {
      this.log(`Couldn't read my model and effort; using my runner settings: ${(e as Error).message}`);
      return chooseModel(this.cfg, null);
    }
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
        if (!message) continue;
        const fromInstructor = this.ak.canInstruct(message.sender_id, message.room_id);
        if (staleTeammateMessage(message, fromInstructor, this.startedAt)) {
          await this.ak.updateRun(r.id, { state: "cancelled", summary: STALE_RUN_SUMMARY, finished_at: now() });
          this.log(`Dropped queued #${message.id}: ${STALE_RUN_SUMMARY.toLowerCase()}.`);
          continue;
        }
        this.queue.push({ run: r, message, fromInstructor });
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
              const d = await this.decideWake(m);
              if (!d.wake) continue;
              if (staleTeammateMessage(m, d.fromInstructor, this.startedAt)) continue;
              if (!d.fromInstructor && !(await this.withinAgentTurns(m))) continue;
              await this.enqueue(m, d.fromInstructor);
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

  private async decideWake(m: Message): Promise<WakeDecision> {
    const { ak } = this;
    if (m.sender_id === ak.me.id) return { wake: false, fromInstructor: false };
    if (!ak.roomById(m.room_id) || !ak.membership(m.room_id, m.sender_id)) await ak.refresh();
    // Only a broadcast in a thread needs the extra lookup, so most messages cost nothing.
    const threaded = m.to_id === null && m.thread_id !== null && (THREAD_KINDS.includes(m.kind) || TEAMMATE_THREAD_KINDS.includes(m.kind));
    return shouldWake(m, {
      meId: ak.me.id,
      senderInRoom: ak.inRoom(m.sender_id, m.room_id),
      fromInstructor: ak.canInstruct(m.sender_id, m.room_id),
      inThread: threaded ? (await ak.runsIn(m.thread_id!)).length > 0 : false,
      acceptBroadcastTasks: this.cfg.accept_broadcast_tasks,
    });
  }

  /**
   * The loop guard: agents talking only to each other stop after max_agent_turns messages, and the
   * thread gets one notice saying a person can restart it. Anyone's reply resets the count.
   */
  private async withinAgentTurns(m: Message): Promise<boolean> {
    const root = m.thread_id ?? m.id;
    let thread: Message[];
    try {
      thread = await this.ak.threadMessages(m.room_id, root);
    } catch (e) {
      this.log(`Couldn't read thread #${root}: ${(e as Error).message}`);
      return true;
    }
    const turns = agentTurnsSinceHuman(thread, (id) => this.ak.isHuman(id));
    if (turns < this.cfg.limits.max_agent_turns) return true;
    const last = thread[thread.length - 1];
    if (!last || !isPauseNotice(last.body)) {
      this.log(`Pausing thread #${root}: ${turns} agent messages since a person's.`);
      await this.say(m.room_id, root, null, pauseNotice(turns));
    }
    return false;
  }

  private async enqueue(m: Message, fromInstructor: boolean): Promise<void> {
    const run = await this.ak.claimRun(m);
    if (!run) return;
    this.log(`Queued #${m.id} from ${this.ak.nameOf(m.sender_id)} in ${this.ak.roomById(m.room_id)?.name}.`);
    this.queue.push({ run, message: m, fromInstructor });
    if (this.ak.me.paused && fromInstructor) {
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

  /** For the updater: if no run is in progress, hold new ones until release() and say yes. */
  holdIfIdle(): boolean {
    if (this.busy || this.current || this.greeting) return false;
    this.held = true;
    return true;
  }

  release(): void {
    this.held = false;
    void this.work();
  }

  note(msg: string): void {
    this.log(msg);
  }

  private async work(): Promise<void> {
    if (this.busy || this.held) return;
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
      // Then the board: workers' questions (for a lead), follow-ups on its tickets, the next Ready ticket.
      while (!this.queue.length && !this.ak.me.paused && !this.stopping && !this.overLimit()) {
        const q = await this.nextQuestion().catch((e) => {
          this.log(`Couldn't check workers' questions: ${(e as Error).message}`);
          return null;
        });
        if (q) {
          await this.executeTriage(q).catch((e) => this.log(`Couldn't look at ${q.ticket.key}'s question: ${(e as Error).message}`));
          continue;
        }
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
      fromInstructor: job.fromInstructor,
    });
    const mcp = { command: process.execPath, args: mcpArgs(cfg.agent_id, room.name) };
    const choice = await this.modelChoice();
    const inv = cfg.engine === "claude" ? claudeInvocation(cfg, mcp, resume, choice) : codexInvocation(cfg, mcp, resume, worktree.path, choice);
    const logFile = join(this.logDir, `${room.name}-run${run.id}-msg${m.id}.log`);

    const abort = new AbortController();
    this.current = { what: `#${m.id}`, abort };
    await ak.updateRun(run.id, { state: "running", branch: worktree.branch, started_at: now() });
    await ak.heartbeat("working").catch(() => undefined);
    this.log(`Working on #${m.id} in ${room.name} (${worktree.branch})${resume ? ", continuing session" : ""}.`);
    const notice = startNotice(m.id, worktree.branch, Boolean(resume), job.fromInstructor);
    if (notice) await this.say(room.id, run.thread_root, sender.id, notice);

    let result;
    const startedAt = Date.now();
    try {
      result = await runEngine({ cfg, inv, cwd: worktree.path, prompt, logFile, signal: abort.signal, onModel: this.reportModel(choice) });
    } finally {
      this.current = null;
      this.addUsage((Date.now() - startedAt) / 1000);
    }

    const text = redactSecrets(result.finalText.trim()).slice(0, 12000);
    const { state, report, quiet } = runOutcome(result, text, {
      messageId: m.id,
      stopReason: this.stopping ? "my runner was shut down" : `${ak.ownerName(ak.me)} paused me`,
      maxMinutes: cfg.limits.max_minutes,
    });

    const branch = currentBranch(worktree.path) ?? worktree.branch;
    await ak.updateRun(run.id, { state, session_id: result.sessionId, branch, summary: report.slice(0, 16000), finished_at: now() });
    if (!quiet) await this.say(room.id, run.thread_root, sender.id, report);
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
      for (const { ticket, comments } of await v.newComments(st.seen).catch(() => [])) {
        if (st.seen[ticket.id] === undefined) st.seen[ticket.id] = comments[comments.length - 1].id;
      }
    }
    // Likewise for a lead: questions already waiting when this first runs are left to people.
    if (!st.triaged) {
      st.triaged = {};
      for (const v of views) for (const t of await v.openQuestions().catch(() => [])) st.triaged[t.id] = t.needs_human!;
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
      for (const { ticket, comments, looping } of await project.newComments(st.seen)) {
        if (!looping) return { project, ticket, comments };
        // Agents keep answering each other here: stop resuming and hand it to a person.
        st.seen[ticket.id] = comments[comments.length - 1].id;
        this.saveTicketState(st);
        this.log(`${ticket.key}: agents went back and forth ${AGENT_COMMENT_LIMIT} times; asking a person.`);
        if (ticket.needs_human !== AGENT_LOOP_QUESTION) {
          await project.update(ticket.key, { needs_human: AGENT_LOOP_QUESTION }).catch((e) => this.log(`Couldn't update ${ticket.key}: ${(e as Error).message}`));
        }
      }
    }
    for (const project of this.projects) {
      const ticket = await project.claimNext();
      if (ticket) return { project, ticket, comments: [] };
    }
    return null;
  }

  /**
   * For a lead: the next worker's question it hasn't looked at. Each question text is handled once;
   * once a ticket's question is cleared or changed, its old entry is dropped.
   */
  private async nextQuestion(): Promise<TriageJob | null> {
    if (Date.now() - this.projectsLoadedAt > PROJECTS_RELOAD_MS) await this.loadProjects();
    const leading = this.projects.filter((p) => p.iAmLead);
    if (!leading.length) return null;
    const st = this.ticketState();
    const handled = st.triaged ?? {};
    const open: TriageJob[] = [];
    for (const project of leading) for (const ticket of await project.openQuestions()) open.push({ project, ticket });
    const kept = Object.fromEntries(open.filter((j) => handled[j.ticket.id] === j.ticket.needs_human).map((j) => [j.ticket.id, j.ticket.needs_human!]));
    if (Object.keys(kept).length !== Object.keys(handled).length) {
      st.triaged = kept;
      this.saveTicketState(st);
    }
    const next = untriaged(open.map((j) => j.ticket), handled)[0];
    return next ? open.find((j) => j.ticket.id === next.id)! : null;
  }

  /** What this agent is doing, for the board and People. Quietly does nothing for v1-only agents. */
  private setStatus(status: AgentStatus, note: string | null = null, ticketId: string | null = null): Promise<void> {
    return this.inOrder(async () => {
      if (!this.isAgentRow || !this.projects.length) return;
      try {
        await this.projects[0].status(status, note, ticketId);
      } catch (e) {
        if ((e as Error).message.includes("only agents")) this.isAgentRow = false;
      }
    });
  }

  /** Status writes one at a time, so a model report can't put back a status that just changed. */
  private statusQueue: Promise<void> = Promise.resolve();
  private inOrder(fn: () => Promise<void>): Promise<void> {
    this.statusQueue = this.statusQueue.then(fn, fn);
    return this.statusQueue;
  }

  /**
   * Report the model and effort a run launches with (AK-11), keeping whatever the agent says it's
   * doing. Returns the engine's onModel: when the tool says which model it's actually running
   * (Claude Code's init event), that replaces the one we asked for. Effort is never reported back,
   * so it stays the one we passed.
   */
  private reportModel(choice: ModelChoice): (model: string) => void {
    const ran: RanWith = { model: choice.model ?? "", effort: choice.effort ?? "" };
    const report = (r: RanWith) =>
      void this.inOrder(async () => {
        if (!this.isAgentRow || !this.projects.length) return;
        try {
          const { data, error } = await this.ak.sb.from("agents").select("status, status_note, current_ticket_id").eq("id", this.ak.me.id).maybeSingle();
          if (error) throw new Error(error.message);
          if (data) await this.projects[0].status(data.status as AgentStatus, data.status_note, data.current_ticket_id, r);
        } catch (e) {
          this.log(`Couldn't report my model: ${(e as Error).message}`);
        }
      });
    report(ran);
    return (model) => report({ ...ran, model });
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
    const commentsText = job.comments.length ? job.comments.map((c) => `${p.authorLabel(c)}: ${c.body}`).join("\n\n") : null;
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
    const choice = await this.modelChoice();
    const inv = cfg.engine === "claude" ? claudeInvocation(cfg, mcp, resume, choice) : codexInvocation(cfg, mcp, resume, worktree.path, choice);
    const logFile = join(this.logDir, `${p.project.slug}-${t.key}-${Date.now()}.log`);

    const abort = new AbortController();
    this.current = { what: t.key, abort };
    await ak.heartbeat("working").catch(() => undefined);
    await this.setStatus("planning", job.comments.length ? "Reading new comments" : "Reading the ticket", t.id);
    const onModel = this.reportModel(choice);
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
        onModel,
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

  /** The lead looks at one worker's question: answers it on the ticket, or asks its person once. */
  private async executeTriage(job: TriageJob): Promise<void> {
    const { ak, cfg } = this;
    const { project: p, ticket: t } = job;
    // Handled once, whatever happens below, so a failing run can't loop.
    const st = this.ticketState();
    st.triaged = { ...(st.triaged ?? {}), [t.id]: t.needs_human! };
    this.saveTicketState(st);

    const repo = p.project.repo;
    if (!repo) return;
    ensureClone(repo);
    if (!this.hooked.has(repo)) {
      installHook(clonePath(repo), cfg.limits.protected_branches);
      this.hooked.add(repo);
    }
    // Its own worktree to read the code in, never its person's checkout.
    const worktree = ensureTicketWorktree(ak.me.name, repo, "triage", `ak/${ak.me.name}/triage`);
    await p.loadNames();
    const prompt = buildTriagePrompt({
      myName: ak.me.name,
      ownerName: ak.ownerName(ak.me),
      projectName: p.project.name,
      key: t.key,
      assignee: p.nameOf(t.assignee_id),
      question: t.needs_human!,
      ticket: await p.ticketText(t.key),
      repoPath: worktree.path,
    });
    const mcp = { command: process.execPath, args: mcpArgs(cfg.agent_id, undefined, p.project.slug) };
    const choice = await this.modelChoice();
    const inv = cfg.engine === "claude" ? claudeInvocation(cfg, mcp, null, choice) : codexInvocation(cfg, mcp, null, worktree.path, choice);
    const logFile = join(this.logDir, `${p.project.slug}-${t.key}-triage-${Date.now()}.log`);

    const abort = new AbortController();
    this.current = { what: `${t.key}'s question`, abort };
    await ak.heartbeat("working").catch(() => undefined);
    await this.setStatus("planning", `Looking at ${p.nameOf(t.assignee_id)}'s question on ${t.key}`);
    this.log(`Looking at the question on ${t.key} in ${p.project.name}.`);
    let result: EngineRun;
    const startedAt = Date.now();
    try {
      result = await runEngine({ cfg, inv, cwd: worktree.path, prompt, logFile, signal: abort.signal, onModel: this.reportModel(choice) });
    } finally {
      this.current = null;
      this.addUsage((Date.now() - startedAt) / 1000);
    }
    await this.setStatus(ak.me.paused ? "paused" : "idle");
    await ak.heartbeat(this.stateNow()).catch(() => undefined);
    const said = redactSecrets(result.finalText.trim()).split("\n")[0].slice(0, 200);
    this.log(`${t.key} question: ${result.aborted ? "stopped" : result.timedOut ? "hit the time limit" : result.isError ? "failed" : said || "done"}.`);
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
