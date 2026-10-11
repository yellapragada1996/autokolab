import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AutoKolab } from "../core/client.js";
import { AGENT_COMMENT_LIMIT, AGENT_LOOP_QUESTION, LEAD_BUILT_QUESTION, MERGE_FAILED_PREFIX, MERGE_GH_PREFIX, MODEL_CHANGE_PREFIX, NO_CHECKS_QUESTION, REVIEW_FAILED_PREFIX, REVIEW_LIMIT_QUESTION, ProjectView, isMergeQuestion, isReviewQuestion, untriaged, type AgentStatus, type Comment, type RanWith, type RunKind, type RunUsageRow, type Ticket } from "../core/projects.js";
import { stateDir } from "../core/config.js";
import { connectFromConfig } from "../core/node.js";
import { redactSecrets } from "../core/secrets.js";
import type { Message, MessageKind, Room, RunState, TaskRun } from "../core/types.js";
import { claudeBin, mcpArgs } from "../setup/agents.js";
import { loadRunnerConfig, runnerFiles, type RunnerConfig } from "./config.js";
import { chooseModel, claudeInvocation, codexInvocation, noUsage, runEngine, type EngineRun, type ModelChoice, type PlanStep } from "./engines.js";
import { installHook } from "./githook.js";
import { usageLimit, usageReport } from "./limit.js";
import { askReviewMessage, checkResult, ghPrDiff, ghPrMerge, ghPrView, mergeDecision, mergeNeedsHuman, mergedComment, pickReviewer, plainGhError, prFacts, prNumber, readyToMergeMessage, REVIEW_UNDECIDED_QUESTION, reviewDecision, reviewEndedUndecided, riskyFiles, samePrFacts, testsFailedComment, type MergeDecision, type PrCheck, type PrInfo, type ReviewRecord } from "./merge.js";
import { BLOCKED_PREFIX, NO_REPLY, buildPrompt, buildReviewPrompt, buildTicketPrompt, buildTriagePrompt, parseOutcome } from "./prompt.js";
import { SHIP_FAILED_PREFIX, fetchBranch, movesToReview, ship, shipBody, shipNeedsHuman, shipPlan, trustedIo, worktreeFacts } from "./ship.js";
import { checkoutCommit, currentBranch, ensureClone, ensureTicketWorktree, ensureWorktree, headCommit, pruneWorktrees, ticketBranch, worktreeGitDir, type Worktree } from "./repos.js";

// The runner for one agent: listens to all of its rooms and, when someone sends it work or a
// teammate asks it something, starts the agent headless in that thread's own worktree. It also
// works the project board: tickets assigned to it in Ready, and comments on its open tickets. A
// project's lead also answers workers' questions on their tickets ("Needs you") and reviews workers'
// PRs once their tests pass. One task at a time per agent: room messages first, then the lead's
// triage, then its reviews, then its own tickets.

/** Kinds addressed to everyone that continue work in a thread this agent is already on. */
const THREAD_KINDS: MessageKind[] = ["task", "chat", "answer", "review", "decision"];
/** From a teammate, addressed to everyone: only these continue work in a thread we're on (DEC-17). */
const TEAMMATE_THREAD_KINDS: MessageKind[] = ["question", "answer", "review"];

const POLL_MS = 30_000;
const HEARTBEAT_MS = 30_000;

export interface Job {
  run: TaskRun;
  message: Message;
  /** The sender can give this agent instructions (a person, or the lead side). */
  fromInstructor: boolean;
  /** Later messages in the same thread, answered in the same run, oldest first (AK-90). */
  more: { run: TaskRun; message: Message }[];
  /** Don't start before this time (ms); 0 starts as soon as the agent is free. */
  notBefore: number;
  /** When the first message was queued (ms). */
  queuedAt: number;
}

/** A teammate's message waits this long for more in the same thread, and never more than BATCH_MAX_MS in all. */
export const BATCH_WAIT_MS = 20_000;
export const BATCH_MAX_MS = 120_000;

/**
 * Queue a message's run. A message in the same thread as one still waiting (and from the same side:
 * instructions don't mix with teammates' requests) joins that job, so the agent answers them once.
 * A teammate's message waits briefly to collect a burst; a person's message is never delayed, and
 * starts the job it joins right away.
 */
export function addToQueue(
  queue: Job[],
  entry: { run: TaskRun; message: Message; fromInstructor: boolean },
  delay: boolean,
  now: number,
): "run" | "merged" {
  const job = queue.find((j) => j.message.room_id === entry.message.room_id && j.run.thread_root === entry.run.thread_root && j.fromInstructor === entry.fromInstructor);
  if (!job) {
    queue.push({ ...entry, more: [], notBefore: delay ? now + BATCH_WAIT_MS : 0, queuedAt: now });
    return "run";
  }
  job.more.push({ run: entry.run, message: entry.message });
  job.notBefore = !delay || job.notBefore === 0 ? 0 : Math.min(now + BATCH_WAIT_MS, job.queuedAt + BATCH_MAX_MS);
  return "merged";
}

/**
 * How a reply run's final text goes out: as an answer to the teammate agent who asked (a question,
 * task or review request), which wakes them; otherwise as a status report, which wakes nobody.
 */
export function replyAs(messages: Pick<Message, "sender_id" | "kind">[], isHuman: (id: string) => boolean): { kind: MessageKind; to: string } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!isHuman(m.sender_id) && ASKING_KINDS.includes(m.kind)) return { kind: "answer", to: m.sender_id };
  }
  return { kind: "status", to: messages[messages.length - 1].sender_id };
}

export interface WakeCounts {
  /** Messages to this agent or to everyone, from someone else. */
  seen: number;
  /** Messages that started a run. */
  run: number;
  /** Messages answered in a run another message started. */
  merged: number;
}

/** Add one to today's count, keeping the last two weeks. */
export function countWake(counts: Record<string, WakeCounts>, day: string, what: keyof WakeCounts): Record<string, WakeCounts> {
  const out = { ...counts, [day]: { ...{ seen: 0, run: 0, merged: 0 }, ...counts[day] } };
  out[day][what]++;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).slice(-14));
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
  /** The sender is a person, not an agent. */
  fromPerson: boolean;
  /**
   * An older runner's reply posted as `status`: the first message from this sender after this
   * agent asked it something in the thread. Counts as an answer (AK-90).
   */
  legacyAnswer?: boolean;
}

export interface WakeDecision {
  wake: boolean;
  fromInstructor: boolean;
}

/** From another agent, only these need a model run; the other kinds are news (AK-90). */
export const AGENT_WAKE_KINDS: MessageKind[] = ["question", "task", "review", "answer"];
/** A run started by a teammate's message of these kinds posts its reply as an answer. */
export const ASKING_KINDS: MessageKind[] = ["question", "task", "review"];

/**
 * Does this message wake this agent? A person wakes it by addressing it directly, any kind; an
 * agent only with a question, task, review request or answer (the rest is news, and the board is
 * the report). A runner notice never wakes anyone. Otherwise instructors work as they always have,
 * and teammates (anyone else in the room) wake it only by talking in a thread it's already working in.
 */
export function shouldWake(m: Pick<Message, "sender_id" | "to_id" | "thread_id" | "kind" | "body">, ctx: WakeContext): WakeDecision {
  const from = ctx.fromInstructor;
  const no = { wake: false, fromInstructor: from };
  if (m.sender_id === ctx.meId || !ctx.senderInRoom) return { wake: false, fromInstructor: false };
  // A runner saying "Started on #12" isn't something to answer.
  if (isRunnerNotice(m.body)) return no;
  if (!ctx.fromPerson && !AGENT_WAKE_KINDS.includes(m.kind)) {
    if (m.to_id === ctx.meId && ctx.legacyAnswer) return { wake: true, fromInstructor: from };
    return no;
  }
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
 * Runners before AK-90 post every reply as `status`. Until every machine updates, a `status` from
 * an agent is still an answer when it's that agent's first message in the thread since this agent
 * last asked it something there (a question, task or review request). Runner notices don't count.
 */
export function isLegacyAnswer(
  thread: Pick<Message, "id" | "sender_id" | "kind" | "body">[],
  m: Pick<Message, "id" | "sender_id" | "kind">,
  meId: string,
): boolean {
  if (m.kind !== "status") return false;
  for (let i = thread.length - 1; i >= 0; i--) {
    const x = thread[i];
    if (x.id >= m.id || isRunnerNotice(x.body)) continue;
    if (x.sender_id === m.sender_id) return false;
    if (x.sender_id === meId) return ASKING_KINDS.includes(x.kind);
  }
  return false;
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

/**
 * The loop guard's count: agent turns in a thread since the last message from a person. Consecutive
 * messages from the same agent are one turn (one merged run answers a burst); runner notices are
 * left out and don't split a turn.
 */
export function agentTurnsSinceHuman(thread: Pick<Message, "sender_id" | "body">[], isHuman: (senderId: string) => boolean): number {
  let turns = 0;
  let previous: string | null = null;
  for (let i = thread.length - 1; i >= 0; i--) {
    if (isHuman(thread[i].sender_id)) break;
    if (isRunnerNotice(thread[i].body)) continue;
    if (thread[i].sender_id !== previous) turns++;
    previous = thread[i].sender_id;
  }
  return turns;
}

/** One run as a run_usage row: the tool's own figures, null where it gave none. Nothing is estimated. */
export function runUsageRow(kind: RunKind, ticketId: string | null, result: Pick<EngineRun, "usage" | "model">, seconds: number): RunUsageRow {
  const u = result.usage ?? noUsage();
  return {
    kind,
    ticket_id: ticketId,
    model: result.model ?? null,
    input_tokens: u.inputTokens,
    cache_read_tokens: u.cacheReadTokens,
    cache_write_tokens: u.cacheWriteTokens,
    output_tokens: u.outputTokens,
    turns: u.turns,
    seconds: Math.max(0, Math.round(seconds)),
    cost_usd: u.costUsd,
  };
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

/** A worker's PR whose tests passed, for the project's lead to review at its head commit (AK-59). */
interface ReviewJob {
  project: ProjectView;
  ticket: Ticket;
  pr: PrInfo;
  sha: string;
}

interface LimitWait {
  until: string;
  noticedAt: string;
  kind: "message" | "ticket" | "triage" | "review";
  project?: string;
  key?: string;
  comments?: Comment[];
  pr?: PrInfo;
  sha?: string;
  messageId?: number;
}

/**
 * Per agent, on this machine: the engine session for each ticket, the last comment handled, and
 * (for a lead) the question text on each worker's ticket it already triaged.
 */
interface TicketState {
  sessions: Record<string, string>;
  seen: Record<string, number>;
  triaged?: Record<string, string>;
  /**
   * For a lead: what its runner last did about merging each approved ticket (AK-30). `sig` stops it
   * repeating itself; `failedAt` is the ticket's updated_at after a failed merge, so it doesn't
   * retry until the ticket changes.
   */
  merges?: Record<string, { sig: string; failedAt?: string }>;
  /** For a lead: the last commit of each ticket waiting for review that it handled, and how (AK-59). */
  reviews?: Record<string, ReviewRecord>;
}

const PROJECTS_RELOAD_MS = 5 * 60_000;
/** How often the lead's runner looks at each approved PR. */
const MERGE_CHECK_MS = 60_000;

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
  /** The last try at recording what a run used failed; said once, quiet until one succeeds again. */
  private runUsageFailing = false;
  private merging = false;
  private mergeCheckedAt = new Map<string, number>();
  private reviewQueue: ReviewJob[] = [];
  private checkingReviews = false;
  private reviewCheckedAt = new Map<string, { at: number; updated: string }>();
  private limitWait: LimitWait | null = null;

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

    this.limitWait = this.readLimitWait();
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
    // Merging approved PRs is plain code, not a model run, so it has its own timer and goes on
    // while a task is running.
    this.timers.push(
      setInterval(() => {
        void this.checkMerges();
        void this.checkReviews();
      }, MERGE_CHECK_MS),
    );
    this.timers.push(
      setInterval(() => {
        void ak.heartbeat(this.stateNow()).catch((e) => this.log(`Heartbeat failed: ${e.message}`));
        void this.touchAgent();
        void this.reportUsage();
      }, HEARTBEAT_MS),
    );
    await this.loadProjects();
    if (this.projects.length) {
      this.log(`Projects: ${this.projects.map((p) => p.project.name).join(", ")}`);
      await this.setStatus(ak.me.paused ? "paused" : "idle", this.limitWait && !ak.me.paused ? this.waitNote() : null);
      await this.reportUsage();
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
    void this.reportUsage();
  }

  /**
   * Tell the team how much of today is used and when a limit wait ends (AK-76), only when it
   * changed. Never stops anything: a database before schema 19 just doesn't get it.
   */
  private usageSent = "";
  private async reportUsage(): Promise<void> {
    if (!this.isAgentRow || !this.projects.length) return;
    const report = usageReport(this.usedToday(), this.cfg.limits.max_hours_per_day, this.limitWait?.until ?? null);
    const sent = JSON.stringify(report);
    if (sent === this.usageSent) return;
    try {
      if (await this.projects[0].reportUsage(report)) this.usageSent = sent;
    } catch (e) {
      this.log(`Couldn't report my usage: ${(e as Error).message}`);
    }
  }

  private overLimit(): boolean {
    return this.usedToday() >= this.cfg.limits.max_hours_per_day * 3600;
  }

  private limitPath(): string {
    return join(stateDir(), "usage", `${this.ak.me.id}-subscription.json`);
  }

  private readLimitWait(): LimitWait | null {
    try {
      const wait = JSON.parse(readFileSync(this.limitPath(), "utf8")) as LimitWait;
      return Number.isFinite(Date.parse(wait.until)) && ["message", "ticket", "triage", "review"].includes(wait.kind) ? wait : null;
    } catch { return null; }
  }

  private saveLimitWait(wait: LimitWait | null): void {
    this.limitWait = wait;
    if (wait) {
      mkdirSync(join(stateDir(), "usage"), { recursive: true });
      writeFileSync(this.limitPath(), JSON.stringify(wait));
    } else rmSync(this.limitPath(), { force: true });
    void this.reportUsage();
  }

  private waitNote(): string {
    const wait = this.limitWait!;
    return `Waiting for my usage limit to reset, about ${this.waitTime(wait)}`;
  }

  private waitTime(wait: LimitWait): string {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(wait.until));
    return `${time.toLowerCase()} (${zone})`;
  }

  private async waitForUsage(run: EngineRun, kind: LimitWait["kind"], job?: TicketJob | TriageJob | ReviewJob, messageId?: number): Promise<{ notice: boolean; wait: LimitWait } | null> {
    const limit = usageLimit(run);
    if (!limit) return null;
    const previous = this.limitWait;
    const target = job?.ticket;
    const wait: LimitWait = {
      until: limit.until.toISOString(), noticedAt: previous?.noticedAt ?? new Date().toISOString(), kind,
      ...(job ? { project: job.project.project.slug, key: target!.key } : {}),
      ...(kind === "ticket" ? { comments: (job as TicketJob).comments } : {}),
      ...(kind === "review" ? { pr: (job as ReviewJob).pr, sha: (job as ReviewJob).sha } : {}),
      ...(messageId ? { messageId } : {}),
    };
    this.saveLimitWait(wait);
    await this.setStatus(this.ak.me.paused ? "paused" : "idle", this.ak.me.paused ? null : this.waitNote(), target?.id ?? null);
    await this.ak.heartbeat(this.stateNow()).catch(() => undefined);
    // A renewed limit within an hour extends the wait without repeating the notice.
    const notice = !previous || Date.now() - Date.parse(previous.noticedAt) >= 3600_000;
    if (notice) {
      wait.noticedAt = new Date().toISOString();
      this.saveLimitWait(wait);
      if (job) {
        const message = `I've reached my ${this.cfg.engine === "claude" ? "Claude" : "Codex"} usage limit. I'll continue with ${target!.key} at about ${this.waitTime(wait)}.`;
        await job.project.comment(target!.key, message).catch((e) => this.log(`Couldn't comment on ${target!.key}: ${(e as Error).message}`));
      }
    }
    this.log(`Usage limit reached; waiting until ${wait.until}.`);
    return { notice, wait };
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
    if (!room || this.held || this.limitWait) return;
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
        if (this.limitWait?.kind === "message" && this.limitWait.messageId === r.message_id) {
          const message = await this.ak.messageById(r.message_id);
          if (message) this.queue.unshift({ run: r, message, fromInstructor: this.ak.canInstruct(message.sender_id, message.room_id), more: [], notBefore: 0, queuedAt: Date.now() });
          await this.ak.updateRun(r.id, { state: "queued", summary: "Waiting for usage limit to reset" });
          continue;
        }
        await this.ak.updateRun(r.id, { state: "failed", summary: "Runner stopped while this was running.", finished_at: now() });
        await this.say(r.room_id, r.thread_root, null, `Stopped: my runner restarted while working on #${r.message_id}. Send it again to retry.`);
      } else if (r.state === "queued") {
        const message = await this.ak.messageById(r.message_id);
        if (!message) continue;
        const fromInstructor = this.ak.canInstruct(message.sender_id, message.room_id);
        if (staleTeammateMessage(message, fromInstructor, this.startedAt) && this.limitWait?.messageId !== message.id) {
          await this.ak.updateRun(r.id, { state: "cancelled", summary: STALE_RUN_SUMMARY, finished_at: now() });
          this.log(`Dropped queued #${message.id}: ${STALE_RUN_SUMMARY.toLowerCase()}.`);
          continue;
        }
        addToQueue(this.queue, { run: r, message, fromInstructor }, false, Date.now());
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
              if (m.sender_id === this.ak.me.id || (m.to_id !== null && m.to_id !== this.ak.me.id)) continue;
              const d = await this.decideWake(m);
              // One line per decision, so the runner log shows what woke the model and what didn't (AK-90).
              const what = `#${m.id} from ${this.ak.nameOf(m.sender_id)}: ${m.kind}`;
              this.countWake("seen");
              if (!d.wake) {
                this.log(`${what}, no run.`);
                continue;
              }
              if (staleTeammateMessage(m, d.fromInstructor, this.startedAt)) {
                this.log(`${what}, no run (from before I started).`);
                continue;
              }
              if (!d.fromInstructor && !(await this.withinAgentTurns(m))) {
                this.log(`${what}, no run (thread paused).`);
                continue;
              }
              const queued = await this.enqueue(m, d.fromInstructor);
              if (queued) this.countWake(queued);
              this.log(`${what}, ${queued === "run" ? "run" : queued === "merged" ? "answered with the waiting messages in its thread" : "already taken"}.`);
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
    const fromPerson = ak.isHuman(m.sender_id);
    // Likewise, only an agent's status to this agent in a thread could be an older runner's answer.
    let legacyAnswer = false;
    if (!fromPerson && m.kind === "status" && m.to_id === ak.me.id && m.thread_id !== null && !isRunnerNotice(m.body)) {
      try {
        legacyAnswer = isLegacyAnswer(await ak.threadMessages(m.room_id, m.thread_id), m, ak.me.id);
      } catch (e) {
        this.log(`Couldn't read thread #${m.thread_id}: ${(e as Error).message}`);
      }
    }
    return shouldWake(m, {
      meId: ak.me.id,
      senderInRoom: ak.inRoom(m.sender_id, m.room_id),
      fromInstructor: ak.canInstruct(m.sender_id, m.room_id),
      inThread: threaded ? (await ak.runsIn(m.thread_id!)).length > 0 : false,
      acceptBroadcastTasks: this.cfg.accept_broadcast_tasks,
      fromPerson,
      legacyAnswer,
    });
  }

  /**
   * The loop guard: agents talking only to each other stop after max_agent_turns turns, and the
   * thread gets one notice saying a person can restart it. A person's reply resets the count. It runs
   * for each incoming message, but a burst from one agent is one turn, so a merged run counts once.
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
      this.log(`Pausing thread #${root}: ${turns} agent turns since a person's.`);
      await this.say(m.room_id, root, null, pauseNotice(turns));
    }
    return false;
  }

  private async enqueue(m: Message, fromInstructor: boolean): Promise<"run" | "merged" | null> {
    const run = await this.ak.claimRun(m);
    if (!run) return null;
    const queued = addToQueue(this.queue, { run, message: m, fromInstructor }, !this.ak.isHuman(m.sender_id), Date.now());
    if (queued === "run" && this.ak.me.paused && fromInstructor) {
      await this.say(m.room_id, run.thread_root, m.sender_id, `Queued #${m.id}: ${this.ak.ownerName(this.ak.me)} has paused me; I'll start when resumed.`);
    }
    return queued;
  }

  private wakeCountsPath(): string {
    return join(stateDir(), "wakes", `${this.ak.me.id}.json`);
  }

  /** Per day: messages seen, messages that started a run, and messages merged into another's run. */
  private countWake(what: keyof WakeCounts): void {
    try {
      let counts: Record<string, WakeCounts> = {};
      try {
        counts = JSON.parse(readFileSync(this.wakeCountsPath(), "utf8")) as Record<string, WakeCounts>;
      } catch {
        // First count on this machine.
      }
      mkdirSync(join(stateDir(), "wakes"), { recursive: true });
      writeFileSync(this.wakeCountsPath(), JSON.stringify(countWake(counts, today(), what), null, 2));
    } catch (e) {
      this.log(`Couldn't count messages: ${(e as Error).message}`);
    }
  }

  private async onPauseChange(paused: boolean): Promise<void> {
    await this.ak.heartbeat(this.stateNow()).catch(() => undefined);
    if (!this.current) await this.setStatus(paused ? "paused" : "idle", !paused && this.limitWait ? this.waitNote() : null);
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
      if (this.limitWait && Date.now() < Date.parse(this.limitWait.until)) return;
      if (this.limitWait?.kind === "message" && !this.queue.length && Date.now() >= Date.parse(this.limitWait.until)) this.saveLimitWait(null);
      if (this.limitWait && !this.ak.me.paused && !this.stopping && !this.overLimit() && this.limitWait.kind !== "message") {
        const wait = this.limitWait;
        await this.loadProjects(true);
        const project = this.projects.find((p) => p.project.slug === wait.project);
        if (!project || !wait.key) {
          this.log(`Dropping usage-limit retry for ${wait.key ?? "a ticket"}: the project is no longer available.`);
          this.saveLimitWait(null);
          await this.setStatus("idle");
        } else {
          let ticket: Ticket | null = null;
          try {
            ticket = await project.ticket(wait.key);
          } catch (e) {
            if (!/^No ticket /.test((e as Error).message)) throw e; // A read failure can be retried.
            this.log(`Dropping usage-limit retry for ${wait.key}: the ticket no longer exists.`);
            this.saveLimitWait(null);
            await this.setStatus("idle");
          }
          if (ticket) {
            if (["done", "canceled"].includes(ticket.status) ||
                (wait.kind === "ticket" && ticket.assignee_id !== this.ak.me.id) ||
                (wait.kind === "review" && (ticket.status !== "review" || !!ticket.approved_sha)) ||
                (wait.kind === "triage" && !ticket.needs_human)) {
              this.log(`Dropping usage-limit retry for ${wait.key}: the ticket no longer needs this run.`);
              this.saveLimitWait(null);
              await this.setStatus("idle");
            } else {
              try {
                if (wait.kind === "ticket") await this.executeTicket({ project, ticket, comments: wait.comments ?? [] });
                else if (wait.kind === "triage") await this.executeTriage({ project, ticket });
                else if (wait.pr && wait.sha) await this.executeReview({ project, ticket, pr: wait.pr, sha: wait.sha });
                else this.saveLimitWait(null);
                if (this.limitWait === wait) {
                  this.saveLimitWait(null); // The resume no longer had work to do.
                  await this.setStatus("idle");
                }
              } catch (e) {
                const msg = (e as Error).message;
                this.saveLimitWait(null);
                this.log(`${wait.key} couldn't resume after the usage limit: ${msg}`);
                if (wait.kind === "ticket") {
                  await project.update(wait.key, { needs_human: `I couldn't start: ${msg}`.slice(0, 1000) }).catch(() => undefined);
                  await this.setStatus("blocked", `Couldn't start ${wait.key}`, ticket.id);
                } else await this.setStatus("idle");
              }
            }
          }
        }
      }
      while (this.queue.length && !this.ak.me.paused && !this.stopping) {
        if (this.overLimit()) {
          await this.waitForTomorrow(this.queue[0]);
          break;
        }
        if (this.limitWait && Date.now() < Date.parse(this.limitWait.until)) break;
        const ready = this.queue.findIndex((j) => j.notBefore <= Date.now());
        if (ready < 0) {
          // Only teammates' messages are waiting, collecting a burst: come back when the first is due.
          this.workLater(Math.min(...this.queue.map((j) => j.notBefore)) - Date.now());
          break;
        }
        const [job] = this.queue.splice(ready, 1);
        await this.execute(job).catch(async (e) => {
          const msg = (e as Error).message;
          this.log(`#${job.message.id} failed to start: ${msg}`);
          await this.updateRuns(job, { state: "failed", summary: msg.slice(0, 16000), finished_at: now() }).catch(() => undefined);
          await this.say(job.message.room_id, job.run.thread_root, job.message.sender_id, `Couldn't start #${job.message.id}: ${msg}`);
        });
      }
      // Then the board: workers' questions (for a lead), follow-ups on its tickets, the next Ready ticket.
      while (!this.queue.length && !this.ak.me.paused && !this.stopping && !this.overLimit() && !this.limitWait) {
        const q = await this.nextQuestion().catch((e) => {
          this.log(`Couldn't check workers' questions: ${(e as Error).message}`);
          return null;
        });
        if (q) {
          await this.executeTriage(q).catch((e) => this.log(`Couldn't look at ${q.ticket.key}'s question: ${(e as Error).message}`));
          continue;
        }
        const rj = this.nextReview();
        if (rj) {
          await this.executeReview(rj).catch((e) => this.log(`Couldn't review ${rj.ticket.key}: ${(e as Error).message}`));
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
    } catch (e) {
      this.log(`Couldn't resume after usage limit: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private workTimer: NodeJS.Timeout | null = null;
  private workLater(ms: number): void {
    if (this.workTimer) clearTimeout(this.workTimer);
    this.workTimer = setTimeout(() => {
      this.workTimer = null;
      void this.work();
    }, Math.max(ms, 0) + 50);
    this.workTimer.unref();
  }

  private prepareWorkspace(m: Message, threadRoot: number): Worktree {
    const room = this.ak.roomById(m.room_id);
    if (!room?.repo) throw new Error(`room ${room?.name ?? m.room_id} isn't linked to a GitHub repo.`);
    const clone = ensureClone(room.repo);
    if (!this.hooked.has(room.repo)) {
      installHook(clone, this.cfg.limits.protected_branches);
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
    const more = [];
    for (const x of job.more) {
      const from = (await ak.memberFresh(x.message.sender_id)) ?? sender;
      more.push({ message: x.message, sender: from, senderRole: ak.membership(room.id, from.id)?.role ?? "member" });
    }
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
      more,
    });
    const mcp = { command: process.execPath, args: mcpArgs(cfg.agent_id, room.name) };
    const choice = await this.modelChoice();
    const inv = cfg.engine === "claude" ? claudeInvocation(cfg, mcp, resume, choice) : codexInvocation(cfg, mcp, resume, worktree.path, choice);
    const logFile = join(this.logDir, `${room.name}-run${run.id}-msg${m.id}.log`);
    const ids = [m, ...job.more.map((x) => x.message)].map((x) => `#${x.id}`).join(", ");

    const abort = new AbortController();
    this.current = { what: ids, abort };
    await this.updateRuns(job, { state: "running", branch: worktree.branch, started_at: now() });
    await ak.heartbeat("working").catch(() => undefined);
    this.log(`Working on ${ids} in ${room.name} (${worktree.branch})${resume ? ", continuing session" : ""}.`);
    const notice = this.limitWait?.kind === "message" ? null : startNotice(m.id, worktree.branch, Boolean(resume), job.fromInstructor);
    if (notice) await this.say(room.id, run.thread_root, sender.id, notice);

    let result;
    const startedAt = Date.now();
    try {
      result = await runEngine({ cfg, inv, cwd: worktree.path, prompt, logFile, signal: abort.signal, onModel: this.reportModel(choice) });
    } finally {
      this.current = null;
      this.addUsage((Date.now() - startedAt) / 1000);
    }
    this.recordRun(this.projects.find((p) => this.projectRoom(p)?.id === room.id), "reply", null, result, startedAt);

    const text = redactSecrets(result.finalText.trim()).slice(0, 12000);
    const limited = await this.waitForUsage(result, "message", undefined, m.id);
    if (limited) {
      await this.updateRuns(job, { state: "queued", session_id: result.sessionId, summary: "Waiting for usage limit to reset" });
      this.queue.unshift({ ...job, notBefore: 0 });
      if (limited.notice) await this.say(room.id, run.thread_root, sender.id,
        `I've reached my ${cfg.engine === "claude" ? "Claude" : "Codex"} usage limit. I'll continue with #${m.id} at about ${this.waitTime(limited.wait)}.`);
      return;
    }
    if (this.limitWait?.kind === "message") {
      this.saveLimitWait(null);
      await this.setStatus(ak.me.paused ? "paused" : "idle");
    }
    const { state, report, quiet } = runOutcome(result, text, {
      messageId: m.id,
      stopReason: this.stopping ? "my runner was shut down" : `${ak.ownerName(ak.me)} paused me`,
      maxMinutes: cfg.limits.max_minutes,
    });

    const branch = currentBranch(worktree.clone, worktree.path) ?? worktree.branch;
    await this.updateRuns(job, { state, session_id: result.sessionId, branch, summary: report.slice(0, 16000), finished_at: now() });
    // A teammate's question, task or review request gets an answer, which wakes them; anything
    // else is a report, which wakes nobody (AK-90).
    const reply = replyAs([m, ...job.more.map((x) => x.message)], (id) => ak.isHuman(id));
    if (!quiet) await this.say(room.id, run.thread_root, reply.to, report, state === "done" ? reply.kind : "status");
    await ak.heartbeat(this.stateNow()).catch(() => undefined);
    // Cost is an API-price estimate (not a bill on a Claude subscription); keep it out of the room.
    this.log(`${ids} ${state}.${result.costUsd !== undefined ? ` (estimated API cost $${result.costUsd.toFixed(2)})` : ""}`);
  }

  /** A job's runs: the first message's, and those of the messages answered with it. */
  private async updateRuns(job: Job, patch: Parameters<AutoKolab["updateRun"]>[1]): Promise<void> {
    await this.ak.updateRun(job.run.id, patch);
    for (const x of job.more) await this.ak.updateRun(x.run.id, patch).catch((e) => this.log(`Couldn't update run ${x.run.id}: ${(e as Error).message}`));
  }


  // ------------------------------------------------------------ project board

  private async loadProjects(strict = false): Promise<void> {
    this.projectsLoadedAt = Date.now();
    const views = strict ? await ProjectView.all(this.ak.sb, this.ak.me.id) : await ProjectView.all(this.ak.sb, this.ak.me.id).catch(() => [] as ProjectView[]);
    const known = new Set(this.projects.map((p) => p.project.id));
    const changed = views.length !== this.projects.length || views.some((v) => !known.has(v.project.id));
    this.projects = views;
    if (!changed) return;
    for (const ch of this.ticketChannels) void this.ak.sb.removeChannel(ch);
    // A ticket moving to Review is noticed here, without anyone saying so in the room (AK-59).
    this.ticketChannels = views.map((v) =>
      v.onChange(() => {
        void this.checkReviews();
        void this.work();
      }),
    );
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

  /**
   * For a lead: merge approved PRs (AK-30, DEC-19). Each ticket in Review with an approved commit
   * is looked at once a minute at most; see mergeDecision for when it merges.
   */
  private async checkMerges(): Promise<void> {
    if (this.merging || this.stopping || this.ak.me.paused) return;
    this.merging = true;
    try {
      if (Date.now() - this.projectsLoadedAt > PROJECTS_RELOAD_MS) await this.loadProjects();
      for (const p of this.projects.filter((x) => x.iAmLead)) {
        for (const t of await p.approvedForMerge()) {
          if (Date.now() - (this.mergeCheckedAt.get(t.id) ?? 0) < MERGE_CHECK_MS) continue;
          this.mergeCheckedAt.set(t.id, Date.now());
          await this.checkMerge(p, t).catch((e) => this.log(`${t.key} merge: couldn't check: ${(e as Error).message}`));
        }
      }
    } catch (e) {
      this.log(`Couldn't check approved PRs: ${(e as Error).message}`);
    } finally {
      this.merging = false;
    }
  }

  /** Whether the lead's runner may start an automatic review now: the owner's switch, pause and the daily limit. */
  reviewsAllowed(): boolean {
    return this.cfg.auto_review && !this.ak.me.paused && !this.stopping && !this.overLimit() && !this.limitWait;
  }

  /**
   * For a lead: look at workers' PRs in Review with no approval (AK-59). Plain code: failing tests
   * go back to the worker, Captain's own tickets go to another agent, and only a passing commit
   * that hasn't been handled queues a review run. Each ticket is looked at once a minute at most,
   * or straight away when it changes.
   */
  private async checkReviews(): Promise<void> {
    if (this.checkingReviews || !this.reviewsAllowed()) return;
    this.checkingReviews = true;
    try {
      if (Date.now() - this.projectsLoadedAt > PROJECTS_RELOAD_MS) await this.loadProjects();
      for (const p of this.projects.filter((x) => x.iAmLead)) {
        for (const t of await p.waitingForReview()) {
          const seen = this.reviewCheckedAt.get(t.id);
          if (seen && seen.updated === t.updated_at && Date.now() - seen.at < MERGE_CHECK_MS) continue;
          if (this.reviewQueue.some((j) => j.ticket.id === t.id)) continue;
          this.reviewCheckedAt.set(t.id, { at: Date.now(), updated: t.updated_at });
          let pr: PrInfo;
          try {
            pr = ghPrView<PrInfo>(t.pr_url!);
          } catch (e) {
            this.log(`${t.key} review: couldn't check the PR: ${plainGhError((e as Error).message, `on ${this.ak.ownerName(this.ak.me)}'s machine`)}`);
            continue;
          }
          await this.recordPrFacts(p, t, pr);
          await this.checkReview(p, t, pr).catch((e) => this.log(`${t.key} review: ${(e as Error).message}`));
        }
      }
    } catch (e) {
      this.log(`Couldn't check PRs waiting for review: ${(e as Error).message}`);
    } finally {
      this.checkingReviews = false;
    }
    if (this.reviewQueue.length) void this.work();
  }

  /** One ticket waiting for review: see reviewDecision. Everything but `review` is done here, without the model. */
  private async checkReview(p: ProjectView, t: Ticket, pr: PrInfo): Promise<void> {
    const rec = this.ticketState().reviews?.[t.id];
    const d = reviewDecision(t, pr, this.ak.me.id, rec);
    const ask = async (q: string) => {
      if (t.needs_human !== q) await p.update(t.key, { needs_human: q });
    };
    if (d.noChecksSince !== undefined) {
      // No checks on this commit yet. That's never "handled": it's looked at again until checks
      // show up, and "No automatic tests ran" is said once, after the grace time.
      const asked = rec?.noChecks?.sha === d.sha && !!rec.noChecks.asked;
      const tell = d.action === "no_checks" && !asked;
      if (rec?.noChecks?.sha !== d.sha || tell) {
        this.rememberReview(t.id, { sha: rec?.sha ?? "", action: rec?.action ?? "wait", reviews: rec?.reviews ?? 0, noChecks: { sha: d.sha, since: d.noChecksSince, asked: asked || tell } });
      }
      if (tell) {
        this.log(`${t.key} review: no_checks · ${d.why}.`);
        await ask(NO_CHECKS_QUESTION);
      }
      return;
    }
    // Checks showed up: "No automatic tests ran" isn't true any more.
    if (rec?.noChecks) this.rememberReview(t.id, { sha: rec.sha, action: rec.action, reviews: rec.reviews });
    if (t.needs_human === NO_CHECKS_QUESTION && (pr.statusCheckRollup ?? []).length) {
      await p.update(t.key, { needs_human: null });
      t = { ...t, needs_human: null };
    }
    if (d.action === "wait") return;
    this.log(`${t.key} review: ${d.action} · ${d.why}.`);
    if (d.action === "review") {
      this.reviewQueue.push({ project: p, ticket: t, pr, sha: d.sha });
      return;
    }
    // Handled once per commit, whatever happens below.
    this.rememberReview(t.id, { sha: d.sha, action: d.action, reviews: rec?.reviews ?? 0 });
    const url = t.pr_url!;
    if (d.action === "limit") return ask(REVIEW_LIMIT_QUESTION);
    if (d.action === "tests_failed") {
      await p.comment(t.key, testsFailedComment(url, d.sha, d.failed ?? []));
      const stale = isMergeQuestion(t.needs_human) || isReviewQuestion(t.needs_human);
      await p.update(t.key, { status: "in_progress", ...(stale ? { needs_human: null } : {}) });
      return;
    }
    // ask_worker: Captain built it, so someone else has to approve it.
    await p.loadNames().catch(() => undefined);
    const reviewer = pickReviewer(p.agents(), t, this.ak.me.id);
    const room = this.projectRoom(p);
    if (!reviewer || !room) return ask(LEAD_BUILT_QUESTION);
    const n = Number(prNumber(url));
    await this.ak.room(room).post({ kind: "review", to: reviewer.id, body: askReviewMessage(t.key, t.title, url, d.sha, t.done_means), refs: { ...(n ? { pr: n } : {}), commit: d.sha } });
    this.log(`${t.key} review: asked ${reviewer.name} to review ${d.sha.slice(0, 7)}.`);
  }

  /** Set or (with undefined) forget what the runner did about a ticket waiting for review. */
  private rememberReview(ticketId: string, rec: ReviewRecord | undefined): void {
    const st = this.ticketState();
    const reviews = { ...(st.reviews ?? {}) };
    if (rec) reviews[ticketId] = rec;
    else delete reviews[ticketId];
    st.reviews = reviews;
    this.saveTicketState(st);
  }

  /**
   * Record what a run used for the Results page (AK-92), failed and limit-stopped runs included.
   * Never waits for the database and never fails the run: one before schema 20 just doesn't get it.
   * Any other failure is logged once and tried again on the next run (AK-93).
   */
  private recordRun(p: ProjectView | undefined, kind: RunKind, ticketId: string | null, result: EngineRun | undefined, startedAt: number): void {
    if (!p || !result || !this.isAgentRow) return;
    void p.recordRunUsage(runUsageRow(kind, ticketId, result, (Date.now() - startedAt) / 1000)).then(
      () => {
        this.runUsageFailing = false;
      },
      (e) => {
        if (!this.runUsageFailing) this.log(`Couldn't record what the ${kind} run used (trying again next run): ${(e as Error).message}`);
        this.runUsageFailing = true;
      },
    );
  }

  /** The next queued review, if reviews may run now. */
  private nextReview(): ReviewJob | null {
    if (!this.reviewsAllowed()) return null;
    return this.reviewQueue.shift() ?? null;
  }

  private projectRoom(p: ProjectView): Room | undefined {
    return p.project.room_id ? this.ak.roomById(p.project.room_id) : this.ak.rooms().find((r) => r.repo === p.project.repo);
  }

  /**
   * Write what GitHub says about the PR to the ticket for "How do you know?" (AK-57), when it
   * changed. Never stops a review or merge: a database before schema 18 just doesn't get it.
   */
  private async recordPrFacts(p: ProjectView, t: Ticket, pr: PrInfo): Promise<void> {
    const facts = prFacts(pr);
    if (samePrFacts(t.pr_facts, facts)) return;
    try {
      if (await p.recordPrFacts(t.id, facts)) t.pr_facts = facts;
    } catch (e) {
      this.log(`${t.key}: couldn't record the PR's tests and files: ${(e as Error).message}`);
    }
  }

  private async checkMerge(p: ProjectView, t: Ticket): Promise<void> {
    const rec = this.ticketState().merges?.[t.id];
    if (rec?.failedAt && rec.failedAt === t.updated_at) return; // a failed merge waits for the ticket to change
    const where = `on ${this.ak.ownerName(this.ak.me)}'s machine`;
    const url = t.pr_url!;
    const sha = t.approved_sha!;
    const policy = await p.mergePolicy();
    let d: MergeDecision;
    try {
      const pr = ghPrView<PrInfo>(url);
      d = mergeDecision(policy, pr, t, p.project.default_branch || "main");
      await this.recordPrFacts(p, t, pr);
    } catch (e) {
      const why = plainGhError((e as Error).message, where);
      d = { action: "wait", why: `gh: ${why}`, question: `${MERGE_GH_PREFIX} (PR #${prNumber(url)}): ${why}`.slice(0, 1000), risky: [] };
    }
    const sig = `${sha}|${d.action}|${d.question ?? d.why}`;
    if (d.action !== "merge" && rec?.sig === sig) return;
    const remember = (failedAt?: string) => {
      const st = this.ticketState();
      st.merges = { ...(st.merges ?? {}), [t.id]: { sig, ...(failedAt ? { failedAt } : {}) } };
      this.saveTicketState(st);
    };
    this.log(`${t.key} merge: ${d.action} · ${d.why}.`);

    if (d.action !== "merge") {
      const needs = mergeNeedsHuman(t.needs_human, d);
      if (needs !== undefined) await p.update(t.key, { needs_human: needs });
    }
    if (d.action === "wait" || d.action === "needs_ok") {
      remember();
      return;
    }
    if (d.action === "ask") {
      const room = this.projectRoom(p);
      const person = this.ak.mine().find((m) => m.kind === "human");
      if (!room) throw new Error("the project has no room to tell my person in");
      await this.ak.room(room).post({ kind: "status", to: person?.id ?? null, body: readyToMergeMessage(url, t.key) });
      remember();
      return;
    }
    const merged = ghPrMerge(url, sha);
    if (!merged.ok) {
      const why = plainGhError(merged.error, where);
      this.log(`${t.key} merge: failed · ${why}`);
      const after = await p.update(t.key, { needs_human: `${MERGE_FAILED_PREFIX} PR #${prNumber(url)}: ${why}`.slice(0, 1000) });
      remember(after.updated_at);
      return;
    }
    await p.update(t.key, { status: "done", ...(isMergeQuestion(t.needs_human) ? { needs_human: null } : {}) });
    await p.comment(t.key, mergedComment(sha, policy)).catch((e) => this.log(`Couldn't comment on ${t.key}: ${(e as Error).message}`));
    remember();
    this.log(`${t.key} merge: merged PR #${prNumber(url)} at ${sha.slice(0, 7)}.`);
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

    const clone = ensureClone(repo);
    if (!this.hooked.has(repo)) {
      installHook(clone, cfg.limits.protected_branches);
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
    let lastSha = headCommit(worktree.clone, worktree.path)?.sha;
    const timers = [
      setInterval(flushPlan, 3000),
      setInterval(() => {
        const h = headCommit(worktree.clone, worktree.path);
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
    this.recordRun(p, "build", t.id, result, startedAt);

    if (result.sessionId) {
      const s2 = this.ticketState();
      s2.sessions[t.id] = result.sessionId;
      this.saveTicketState(s2);
    }

    const raw = redactSecrets(result.finalText.trim()).slice(0, 12000);
    if (await this.waitForUsage(result, "ticket", job)) return;
    if (this.limitWait?.kind === "ticket") this.saveLimitWait(null);
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
      let pr = ourPr(o.pr) ?? ourPr(text.match(/https:\/\/github\.com\/[^\s)>\]]+\/pull\/\d+/i)?.[0]);
      const change: Parameters<ProjectView["update"]>[1] = {};
      if (o.question) change.needs_human = o.question;
      else if (o.status === "blocked") change.needs_human = "I'm blocked; see my last comment.";
      // The agent says it's ready. If it couldn't reach GitHub from where it runs, its work is still
      // only here, so the runner delivers it: opening the pull request the first time (AK-46), and
      // pushing to the same branch for follow-ups once there is one (AK-66). Nothing left: nothing done.
      let deliveryFailed = false;
      if (o.status === "review") {
        const existing = pr || after.pr_url || undefined;
        const shipped = this.deliver(t, worktree, repo, o.summary, text, existing);
        if ("pr" in shipped) {
          pr = shipped.pr;
          if (existing && shipped.commit) await p.comment(t.key, `Pushed the follow-up work (${shipped.commit}) to ${shipped.pr}.`).catch(() => undefined);
        } else if ("problem" in shipped) {
          change.needs_human = shipped.problem;
          deliveryFailed = true;
        } else if (shipped.note) await p.comment(t.key, shipped.note).catch(() => undefined);
      }
      // An earlier delivery failed and there's a pull request now: the note is out of date.
      if ((pr || after.pr_url) && after.needs_human?.startsWith(SHIP_FAILED_PREFIX) && change.needs_human === undefined) change.needs_human = null;
      if (o.summary && o.summary !== after.summary) change.summary = o.summary;
      if (pr && !after.pr_url) change.pr_url = pr;
      if (after.status === "in_progress" && movesToReview(o.status, !!pr, !!(pr || after.pr_url), deliveryFailed)) change.status = "review";
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

  /**
   * Commits and pushes what an agent said is done but couldn't deliver itself, and opens the pull
   * request the first time. With `existingPr`, it's follow-up work pushed to that pull request's
   * branch; an agent that pushed by itself leaves nothing to do here.
   */
  private deliver(
    t: Ticket,
    worktree: Worktree,
    repo: string,
    summary: string | undefined,
    message: string,
    existingPr?: string,
  ): { pr: string; commit?: string } | { problem: string } | { note: string | null } {
    const { ak, cfg } = this;
    const where = `on ${ak.ownerName(ak.me)}'s machine`;
    // Git is pointed at the clone's own record of this worktree, never at the `.git` link inside
    // the folder: the agent could have replaced that, and the runner isn't sandboxed.
    const gitDir = worktreeGitDir(worktree.clone, worktree.path);
    if (!gitDir) return { problem: shipNeedsHuman("commit", "not one of the runner's working copies", where) };
    const io = trustedIo(gitDir);
    let branch: string;
    let facts: { dirty: boolean; ahead: number; behind: number };
    // Follow-ups are measured against the branch as it is on GitHub now, so nothing there is overwritten.
    let fetched: boolean | Error = true;
    try {
      branch = io.git(worktree.path, "branch", "--show-current") || worktree.branch;
      if (existingPr) {
        try {
          fetched = fetchBranch(io, worktree.path, branch);
        } catch (e) {
          fetched = e as Error;
        }
      }
      facts = worktreeFacts(io, worktree.path, worktree.base, existingPr ? branch : undefined);
    } catch (e) {
      return { problem: shipNeedsHuman("commit", (e as Error).message, where) };
    }
    const plan = shipPlan({ declaredReview: true, hasPr: !!existingPr, ...facts, branch, base: worktree.base, protectedBranches: cfg.limits.protected_branches });
    if ("skip" in plan && plan.skip === "nothing") {
      if (existingPr) return { note: null };
      return { note: `I said ${t.key} was ready for review, but there's nothing to deliver: no changes and no new commits on ${branch}.` };
    }
    // There's work to push, but GitHub couldn't be asked what the branch holds: don't guess.
    if (fetched instanceof Error) return { problem: shipNeedsHuman("push", fetched.message, where) };
    if (fetched === false) return { problem: `${SHIP_FAILED_PREFIX} ${branch} is no longer on GitHub, so I didn't push the follow-up work. The pull request may have been closed.` };
    if ("skip" in plan) {
      if (plan.skip === "moved") return { problem: `${SHIP_FAILED_PREFIX} GitHub has ${facts.behind} commit${facts.behind === 1 ? "" : "s"} on ${branch} that this machine doesn't, so I didn't push the follow-up work over them. The two need putting together by hand.` };
      if (plan.skip === "protected") return { problem: `${SHIP_FAILED_PREFIX} the work is on ${branch}, which agents never push. It needs its own branch.` };
      return { note: null };
    }
    const title = `${t.key}: ${t.title}${existingPr ? " (follow-up)" : ""}`.slice(0, 200);
    const r = ship(io, { path: worktree.path, repo, branch, base: worktree.base, title, body: shipBody(ak.me.name, t.key, summary, message), steps: plan.steps, pr: existingPr });
    if (!r.ok) {
      this.log(`${t.key}: couldn't ${r.step}: ${redactSecrets(r.error).slice(0, 300)}`);
      return { problem: shipNeedsHuman(r.step, redactSecrets(r.error), where) };
    }
    let commit: string | undefined;
    try {
      commit = io.git(worktree.path, "rev-parse", "--short", "HEAD");
    } catch {
      commit = undefined;
    }
    this.log(`${t.key}: delivered for the agent (${r.did.join(", ")}): ${commit ?? ""} ${r.pr}`);
    return { pr: r.pr, commit };
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
    const clone = ensureClone(repo);
    if (!this.hooked.has(repo)) {
      installHook(clone, cfg.limits.protected_branches);
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
    this.recordRun(p, "question", t.id, result, startedAt);
    if (await this.waitForUsage(result, "triage", job)) {
      const reset = this.ticketState();
      delete reset.triaged?.[t.id];
      this.saveTicketState(reset);
      return;
    }
    if (this.limitWait?.kind === "triage") this.saveLimitWait(null);
    await this.setStatus(ak.me.paused ? "paused" : "idle");
    await ak.heartbeat(this.stateNow()).catch(() => undefined);
    const said = redactSecrets(result.finalText.trim()).split("\n")[0].slice(0, 200);
    this.log(`${t.key} question: ${result.aborted ? "stopped" : result.timedOut ? "hit the time limit" : result.isError ? "failed" : said || "done"}.`);
  }

  /**
   * The lead reviews one commit of a worker's PR (AK-59): a focused prompt and a read-only checkout
   * at that commit. Only the model's ticket_approve approves; the runner never does.
   */
  private async executeReview(job: ReviewJob): Promise<void> {
    const { ak, cfg } = this;
    const { project: p, sha, pr } = job;
    // The ticket may have moved on while this waited in the queue.
    const t = await p.ticket(job.ticket.key);
    if (t.status !== "review" || t.approved_sha || t.pr_url !== job.ticket.pr_url) return;
    // Handled once, whatever happens below, so a failing run can't loop; it counts toward the cap.
    const prev = this.ticketState().reviews?.[t.id];
    if (prev?.sha === sha) return;
    this.rememberReview(t.id, { sha, action: "review", reviews: (prev?.reviews ?? 0) + 1 });

    const repo = p.project.repo;
    if (!repo) return;
    const url = t.pr_url!;
    const where = `on ${ak.ownerName(ak.me)}'s machine`;
    const clone = ensureClone(repo);
    if (!this.hooked.has(repo)) {
      installHook(clone, cfg.limits.protected_branches);
      this.hooked.add(repo);
    }
    // Its own worktree at exactly this commit, never its person's checkout.
    const worktree = ensureTicketWorktree(ak.me.name, repo, "review", `ak/${ak.me.name}/review`);
    checkoutCommit(worktree, sha, prNumber(url));
    let diff: string;
    try {
      diff = ghPrDiff(url);
    } catch (e) {
      diff = `(gh couldn't get the diff: ${plainGhError((e as Error).message, where)} Read it in the checkout instead.)`;
    }
    const word = { success: "passed", pending: "running", failure: "failed" } as const;
    const prompt = buildReviewPrompt({
      myName: ak.me.name,
      ownerName: ak.ownerName(ak.me),
      projectName: p.project.name,
      key: t.key,
      title: t.title,
      description: t.description,
      doneMeans: t.done_means,
      prUrl: url,
      sha,
      checks: (pr.statusCheckRollup ?? []).map((c: PrCheck) => `${c.name ?? c.context ?? "a check"}: ${word[checkResult(c)]}`),
      files: (pr.files ?? []).map((f) => f.path),
      risky: riskyFiles(pr),
      diff: redactSecrets(diff),
      decisions: (await p.decisions()).filter((d) => !d.superseded_by).map((d) => `${d.key}: ${d.title}`),
      repoPath: worktree.path,
      base: p.project.default_branch || worktree.base,
    });
    const mcp = { command: process.execPath, args: mcpArgs(cfg.agent_id, undefined, p.project.slug) };
    const choice = await this.modelChoice();
    const inv = cfg.engine === "claude" ? claudeInvocation(cfg, mcp, null, choice) : codexInvocation(cfg, mcp, null, worktree.path, choice);
    const logFile = join(this.logDir, `${p.project.slug}-${t.key}-review-${Date.now()}.log`);

    // The newest comment before the run: a comment from Captain after it means it sent the ticket back.
    const lastCommentId = (await p.comments(t.id)).reduce((n, c) => Math.max(n, c.id), 0);
    const abort = new AbortController();
    this.current = { what: `the review of ${t.key}`, abort };
    await ak.heartbeat("working").catch(() => undefined);
    await this.setStatus("planning", `Reviewing ${t.key}`, t.id);
    this.log(`Reviewing ${t.key} at ${sha.slice(0, 7)} in ${p.project.name}.`);
    let result: EngineRun;
    const startedAt = Date.now();
    try {
      result = await runEngine({ cfg, inv, cwd: worktree.path, prompt, logFile, signal: abort.signal, onModel: this.reportModel(choice) });
    } finally {
      this.current = null;
      this.addUsage((Date.now() - startedAt) / 1000);
    }
    this.recordRun(p, "review", t.id, result, startedAt);
    if (await this.waitForUsage(result, "review", job)) {
      this.rememberReview(t.id, prev);
      return;
    }
    if (this.limitWait?.kind === "review") this.saveLimitWait(null);
    await this.setStatus(ak.me.paused ? "paused" : "idle");
    await ak.heartbeat(this.stateNow()).catch(() => undefined);
    if (result.aborted) {
      // Paused or shut down: that wasn't a review, so it runs again later and doesn't count.
      this.rememberReview(t.id, prev);
    } else if (result.timedOut || result.isError) {
      const why = result.timedOut ? `it hit the ${cfg.limits.max_minutes}-minute limit` : "the run failed";
      const after = await p.ticket(t.key).catch(() => t);
      if (!after.needs_human && !after.approved_sha) {
        await p.update(t.key, { needs_human: `${REVIEW_FAILED_PREFIX}: ${why}. Can you look, or check the log on ${ak.ownerName(ak.me)}'s computer?` }).catch(() => undefined);
      }
    } else {
      // It finished but neither approved nor sent it back: say so, or the ticket sits in Review unseen.
      try {
        const after = await p.ticket(t.key);
        if (reviewEndedUndecided(after, url, await p.comments(t.id), ak.me.id, lastCommentId)) {
          this.log(`${t.key} review: ended without a decision; asking a person.`);
          await p.update(t.key, { needs_human: REVIEW_UNDECIDED_QUESTION });
        }
      } catch (e) {
        this.log(`${t.key} review: couldn't check how it ended: ${(e as Error).message}`);
      }
    }
    const said = redactSecrets(result.finalText.trim()).split("\n")[0].slice(0, 200);
    this.log(`${t.key} review: ${result.aborted ? "stopped" : result.timedOut ? "hit the time limit" : result.isError ? "failed" : said || "done"}.`);
  }

  private async say(roomId: string, thread: number, to: string | null, body: string, kind: MessageKind = "status"): Promise<void> {
    try {
      await this.ak.room(roomId).post({ body, kind, to, thread });
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
    if (this.workTimer) clearTimeout(this.workTimer);
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
