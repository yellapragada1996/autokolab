import { spawn } from "node:child_process";
import { createWriteStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { isLocalProvider, LOCAL_PROVIDERS, providerKeyEnv, providerName } from "../core/providers.js";
import { EFFORTS, opencodeProvider, type Effort, type RunnerConfig } from "./config.js";

// Starts Claude Code, Codex or OpenCode headless with the task as its prompt, using their supported
// non-interactive modes (claude -p, codex exec, opencode run). The prompt goes in on stdin.

export interface McpLaunch {
  command: string; // node executable
  args: string[]; // [cli.js, "mcp", "--profile", name]
}

/** One item of the agent's own to-do list, as the board shows steps. */
export interface PlanStep {
  label: string;
  status: "todo" | "now" | "done";
}

/**
 * What one run used, exactly as the tool reports it. null means the tool didn't say: nothing here
 * is ever estimated or filled in.
 */
export interface RunUsage {
  /** Tokens read fresh: not from the cache and not written to it. */
  inputTokens: number | null;
  /** Tokens read from the cache. */
  cacheReadTokens: number | null;
  /** Tokens written to the cache. */
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  turns: number | null;
  /** The tool's own cost figure (Claude Code's API-price estimate); Codex gives none. */
  costUsd: number | null;
}

export const noUsage = (): RunUsage => ({ inputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null, turns: null, costUsd: null });

/** A whole, non-negative count, or null: anything else the tool printed isn't a number to trust. */
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const plus = (a: number | null, b: number | null): number | null => (b === null ? a : (a ?? 0) + b);

export interface EngineRun {
  /** The agent's latest to-do list (Codex's plan, Claude's TodoWrite), when it keeps one. */
  plan?: PlanStep[];
  /** The agent updated the ticket's steps itself with the AutoKolab tools in this run. */
  reportsSteps?: boolean;
  sessionId: string | null;
  finalText: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
  isError: boolean;
  costUsd?: number;
  /** The model the tool says it's running (Claude Code's init event); Codex doesn't say. */
  model?: string;
  /** What the run used (AK-92). runEngine always sets it; all nulls when the tool reported nothing. */
  usage?: RunUsage;
  /** The provider kept refusing for too many requests, so the run was stopped to wait (OpenCode). */
  rateLimited?: boolean;
  /** What the provider's error means, in plain words, when the run failed on one (OpenCode). */
  problem?: { kind: ProviderProblemKind; reason: string };
  /** Model steps (OpenCode) or tool calls (Codex) so far, counted for a reply's turn cap. */
  steps?: number;
  /** The run hit its turn cap (AK-116). */
  turnCapped?: boolean;
}

export interface EngineInvocation {
  bin: string;
  args: string[];
  /** Files to clean up afterwards. */
  tempDir: string;
  /** Where Codex writes its last message. */
  lastMessageFile?: string;
  /** Added to the engine's environment only: OpenCode's config file and the provider's key. */
  env?: Record<string, string>;
  /** Values that must never reach a log or a message (the key), replaced wherever they show up. */
  secrets?: string[];
  /** The model the engine was told to run, when the engine itself doesn't say (OpenCode). */
  model?: string;
  /** The session this run continues, if any. */
  resumed?: string | null;
  /** A reply run's turn cap (AK-116). Claude Code stops itself; Codex and OpenCode are stopped by runEngine. */
  maxTurns?: number;
}

/** A session's cost so far as Claude Code last reported it, and when (ms). */
export type SessionCosts = Record<string, { usd: number; at: number }>;

/** Session totals are kept this long: longer than any session is resumed. */
const SESSION_COST_KEEP_MS = 30 * 24 * 3600_000;

/**
 * This run's own cost (AK-115). Claude Code's total_cost_usd is the whole session's so far, so a
 * resumed run costs the difference from the total the session reported at the end of its last run,
 * and null when that total isn't known. OpenCode reports cost per step and Codex none, so theirs
 * are already this run's.
 */
export function ownCost(engine: RunnerConfig["engine"], total: number | null, resumed: string | null, known: SessionCosts): number | null {
  if (engine !== "claude" || total === null || !resumed) return total;
  const before = known[resumed]?.usd;
  if (before === undefined || total < before) return null;
  return Math.round((total - before) * 1e6) / 1e6;
}

/**
 * The session totals after a Claude Code run, dropping old ones. A run that reported no total leaves
 * its session's unknown, so the next run of it records null rather than this run's cost too.
 */
export function rememberSessionCost(known: SessionCosts, sessions: (string | null)[], total: number | null, now: number): SessionCosts {
  const kept: SessionCosts = Object.fromEntries(Object.entries(known).filter(([, s]) => now - s.at < SESSION_COST_KEEP_MS));
  for (const s of sessions) {
    if (!s) continue;
    if (total === null) delete kept[s];
    else kept[s] = { usd: total, at: now };
  }
  return kept;
}

/** Extra deny rules the runner always adds for Claude Code, derived from the owner's limits. */
export function claudeDenyRules(cfg: RunnerConfig): string[] {
  const rules = [
    "Bash(git push --force:*)",
    "Bash(git push -f:*)",
    "Bash(git push --force-with-lease:*)",
    "Bash(git push --no-verify:*)",
    "Bash(git commit --no-verify:*)",
    "Bash(git push --delete:*)",
    "Bash(git push origin --delete:*)",
    "Bash(git config core.hooksPath:*)",
  ];
  for (const b of cfg.limits.protected_branches) {
    rules.push(`Bash(git push origin ${b}:*)`, `Bash(git push -u origin ${b}:*)`, `Bash(git push origin HEAD:${b}:*)`);
  }
  for (const p of cfg.limits.deny_paths) {
    rules.push(`Read(**/${p})`, `Edit(**/${p})`, `Write(**/${p})`, `Bash(cat ${p}:*)`);
  }
  return [...new Set([...rules, ...cfg.claude.disallowed_tools])];
}

/** The model and effort one run uses; unset means the tool's own default. */
export interface ModelChoice {
  model?: string;
  effort?: Effort;
}

/** Effort when nothing sets one: both tools' own default, passed explicitly so it's always reported (AK-23). */
export const DEFAULT_EFFORT: Effort = "medium";

function engineToml(cfg: RunnerConfig) {
  return cfg.engine === "claude" ? cfg.claude : cfg.engine === "codex" ? cfg.codex : cfg.opencode;
}

/** The engine's name for messages: "Claude", "Codex", or the provider's name ("DeepSeek"). */
export function engineLabel(cfg: RunnerConfig): string {
  if (cfg.engine === "claude") return "Claude";
  if (cfg.engine === "codex") return "Codex";
  return providerName(opencodeProvider(cfg) ?? "the provider");
}

/**
 * Database first (set on AutoKolab by the owner or the project's lead), then the toml, then the
 * tool's own default model and medium effort, value by value. With model_locked the toml has the
 * last word (DEC-18).
 */
export function chooseModel(cfg: RunnerConfig, fromDb: { model: string | null; effort: string | null } | null): ModelChoice {
  const toml = engineToml(cfg);
  const db = cfg.model_locked ? null : fromDb;
  const effort = db?.effort && (EFFORTS as readonly string[]).includes(db.effort) ? (db.effort as Effort) : toml.effort ?? DEFAULT_EFFORT;
  return { model: db?.model || toml.model, effort };
}

/**
 * A reply to a teammate (AK-91) runs on the toml's reply_model and reply_effort, each falling back
 * to the run's usual choice. With model_locked the owner's usual model and effort win here too.
 */
export function chooseReplyModel(cfg: RunnerConfig, usual: ModelChoice): ModelChoice {
  if (cfg.model_locked) return usual;
  const toml = engineToml(cfg);
  return { model: toml.reply_model || usual.model, effort: toml.reply_effort ?? usual.effort };
}

/**
 * The lead's review (AK-117): a light one (small, nothing risky; see lightReview) runs on the toml's
 * review_model_small and review_effort_small, each falling back to the usual choice. Every other
 * review, and every review under model_locked, keeps the usual model and effort.
 */
export function chooseReviewModel(cfg: RunnerConfig, usual: ModelChoice, light: boolean): ModelChoice {
  if (!light || cfg.model_locked) return usual;
  const toml = engineToml(cfg);
  return { model: toml.review_model_small || usual.model, effort: toml.review_effort_small ?? usual.effort };
}

/**
 * A follower's reply run (AK-116) reads and answers but never changes the worktree: no edits, no
 * commits, no pushes, and it stops after reply_max_turns turns. Captain's replies stay as they are.
 */
export interface ReplyLimits {
  maxTurns: number;
}

/** What a read-only reply run may use in Claude Code: reading tools and read-only git and gh. */
export const CLAUDE_REPLY_TOOLS = [
  "Read", "Glob", "Grep", "WebFetch", "WebSearch",
  "Bash(git log:*)", "Bash(git diff:*)", "Bash(git show:*)", "Bash(git status:*)", "Bash(git branch:*)",
  "Bash(gh pr view:*)", "Bash(gh pr diff:*)", "Bash(gh pr checks:*)", "Bash(ls:*)", "Bash(rg:*)", "Bash(grep:*)",
];

/** Denied in a read-only reply run whatever the owner's permission mode, so bypassPermissions can't undo it. */
export const CLAUDE_REPLY_DENY = [
  "Edit", "Write", "NotebookEdit",
  "Bash(git commit:*)", "Bash(git push:*)", "Bash(git add:*)", "Bash(git reset:*)", "Bash(git checkout:*)",
  "Bash(git merge:*)", "Bash(git rebase:*)", "Bash(git restore:*)", "Bash(git stash:*)", "Bash(git switch:*)",
  "Bash(gh pr create:*)", "Bash(gh pr merge:*)", "Bash(gh pr edit:*)",
];

export function claudeInvocation(cfg: RunnerConfig, mcp: McpLaunch, resumeSession: string | null, choice: ModelChoice = chooseModel(cfg, null), reply?: ReplyLimits): EngineInvocation {
  const tempDir = mkdtempSync(join(tmpdir(), "autokolab-"));
  const mcpConfig = join(tempDir, "mcp.json");
  writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { autokolab: { command: mcp.command, args: mcp.args } } }));
  // In a reply, anything outside the short allow list is refused ("plan" is read-only already).
  const mode = reply && cfg.claude.permission_mode !== "plan" ? "default" : cfg.claude.permission_mode;
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", mode,
    "--max-turns", String(reply ? reply.maxTurns : cfg.limits.max_turns),
    "--mcp-config", mcpConfig,
  ];
  // On every launch, resumes included: a resumed session switches to the model given here (AK-7).
  if (choice.model) args.push("--model", choice.model);
  if (choice.effort) args.push("--effort", choice.effort);
  if (resumeSession) args.push("--resume", resumeSession);
  args.push("--allowedTools", ...(reply ? CLAUDE_REPLY_TOOLS : cfg.claude.allowed_tools), "mcp__autokolab");
  args.push("--disallowedTools", ...claudeDenyRules(cfg), ...(reply ? CLAUDE_REPLY_DENY : []));
  return { bin: cfg.claude_bin, args, tempDir };
}

const tomlStr = (s: string) => JSON.stringify(s); // JSON strings are valid TOML basic strings

export function codexInvocation(cfg: RunnerConfig, mcp: McpLaunch, resumeSession: string | null, cwd: string, choice: ModelChoice = chooseModel(cfg, null), reply?: ReplyLimits): EngineInvocation {
  const tempDir = mkdtempSync(join(tmpdir(), "autokolab-"));
  const lastMessageFile = join(tempDir, "last-message.txt");
  // A reply can't write anything; Codex has no turn limit, so runEngine counts and stops it.
  const sandbox = reply ? "read-only" : cfg.codex.sandbox;
  // Settings go through -c, which both `codex exec` and `codex exec resume` accept
  // (resume doesn't take -C / -s; the working directory comes from the process itself).
  const config = [
    "-c", 'approval_policy="never"',
    "-c", `sandbox_mode=${tomlStr(sandbox)}`,
    "-c", `sandbox_workspace_write.network_access=${cfg.codex.network}`,
    "-c", `mcp_servers.autokolab.command=${tomlStr(mcp.command)}`,
    "-c", `mcp_servers.autokolab.args=[${mcp.args.map(tomlStr).join(",")}]`,
    // Model and effort go with the other -c settings, after `resume` on a resume. Whether Codex
    // honours them there or only before `resume` is being checked in AK-20.
    ...(choice.model ? ["-c", `model=${tomlStr(choice.model)}`] : []),
    ...(choice.effort ? ["-c", `model_reasoning_effort=${tomlStr(choice.effort)}`] : []),
  ];
  const common = ["--json", "--skip-git-repo-check", ...config, "--output-last-message", lastMessageFile];
  const args = resumeSession
    ? ["exec", "resume", ...common, resumeSession, "-"]
    : ["exec", ...common, "-C", cwd, "-s", sandbox, "-"]; // "-": read the prompt from stdin
  return { bin: cfg.codex_bin, args, tempDir, lastMessageFile };
}

/**
 * The "provider/model" an OpenCode run uses. A bare model id gets the agent's provider. A model from
 * another provider is refused: the agent's key only works with its own provider.
 */
export function opencodeModel(cfg: RunnerConfig, choice: ModelChoice): string {
  const provider = opencodeProvider(cfg)!;
  const model = choice.model || cfg.opencode.model;
  if (!model) throw new Error(`I don't know which ${providerName(provider)} model to use. Set model in the [opencode] part of my runner file.`);
  if (!model.includes("/")) return `${provider}/${model}`;
  const [asked] = model.split("/");
  if (asked !== provider) throw new Error(`I was asked to run ${model}, but my API key is for ${providerName(provider)}. Pick a ${providerName(provider)} model for me.`);
  return model;
}

/**
 * OpenCode's permission rules from the owner's limits (the same ones Claude Code gets as deny rules):
 * no force-push, no --no-verify, no pushing to protected branches, no reading or changing the
 * forbidden paths, and nothing outside the working folder. The last matching rule wins.
 */
export function opencodePermissions(cfg: RunnerConfig): Record<string, unknown> {
  const pathRules: Record<string, string> = { "*": "allow" };
  for (const p of cfg.limits.deny_paths) {
    pathRules[p] = "deny";
    pathRules[`**/${p}`] = "deny";
  }
  const bash: Record<string, string> = { "*": "allow" };
  for (const c of [
    "git push --force", "git push -f", "git push --force-with-lease", "git push --no-verify", "git commit --no-verify",
    "git push --delete", "git push origin --delete", "git config core.hooksPath",
  ]) bash[`${c}*`] = "deny";
  for (const b of cfg.limits.protected_branches) {
    for (const c of [`git push origin ${b}`, `git push -u origin ${b}`, `git push origin HEAD:${b}`]) bash[`${c}*`] = "deny";
  }
  for (const p of cfg.limits.deny_paths) bash[`cat ${p}*`] = "deny";
  return { "*": "allow", read: pathRules, edit: { ...pathRules }, bash, external_directory: "deny" };
}

/** A read-only reply run's OpenCode rules (AK-116): no edits, and only commands that read. */
export function opencodeReplyPermissions(cfg: RunnerConfig): Record<string, unknown> {
  const base = opencodePermissions(cfg);
  const bash: Record<string, string> = { "*": "deny" };
  for (const c of ["git log", "git diff", "git show", "git status", "git branch", "gh pr view", "gh pr diff", "gh pr checks", "ls", "rg", "grep"]) bash[`${c}*`] = "allow";
  for (const c of ["git branch -d", "git branch -D", "git branch -m", "git branch -M"]) bash[`${c}*`] = "deny";
  return { ...base, edit: "deny", bash };
}

/**
 * OpenCode run headless with JSON events (DEC-26). Its settings go in a config file named by
 * OPENCODE_CONFIG; the key goes only into the engine's environment, under the provider's variable.
 * Logs at ERROR level go to stderr: they're the only place a rate limit or an unknown model shows.
 */
export function opencodeInvocation(cfg: RunnerConfig, mcp: McpLaunch, resumeSession: string | null, key: string | undefined, choice: ModelChoice = chooseModel(cfg, null), reply?: ReplyLimits): EngineInvocation {
  const provider = opencodeProvider(cfg)!;
  const local = isLocalProvider(provider);
  const keyEnv = local ? null : providerKeyEnv(provider, cfg.opencode.key_env);
  if (!local && !keyEnv) throw new Error(`I don't know where OpenCode reads a ${providerName(provider)} key from. Set key_env in the [opencode] part of my runner file.`);
  if (!local && !key) throw new Error(`I don't have an API key on this computer. Add one with \`autokolab key set\`.`);
  const model = opencodeModel(cfg, choice);
  const tempDir = mkdtempSync(join(tmpdir(), "autokolab-"));
  const configFile = join(tempDir, "opencode.json");
  writeFileSync(configFile, JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    autoupdate: false,
    share: "disabled",
    mcp: { autokolab: { type: "local", command: [mcp.command, ...mcp.args], enabled: true } },
    permission: reply ? opencodeReplyPermissions(cfg) : opencodePermissions(cfg),
    ...(local ? { provider: localProviderConfig(cfg, provider, model) } : {}),
  }));
  const args = ["run", "--format", "json", "--print-logs", "--log-level", "ERROR", "-m", model];
  if (cfg.opencode.variant) args.push("--variant", cfg.opencode.variant);
  if (resumeSession) args.push("--session", resumeSession);
  const env: Record<string, string> = { OPENCODE_CONFIG: configFile };
  if (keyEnv && key) env[keyEnv] = key;
  return { bin: cfg.opencode_bin, args, tempDir, env, secrets: key ? [key] : [], model };
}

/**
 * A model on this computer (Ollama) through OpenCode's OpenAI-compatible adapter: OpenCode only knows
 * the models it's told about, so the run's model is listed. No key.
 */
export function localProviderConfig(cfg: RunnerConfig, provider: string, model: string): Record<string, unknown> {
  const base = (cfg.opencode.base_url ?? LOCAL_PROVIDERS[provider].baseUrl).replace(/\/+$/, "");
  const id = model.slice(provider.length + 1);
  return {
    [provider]: {
      npm: "@ai-sdk/openai-compatible",
      name: providerName(provider),
      options: { baseURL: `${base}/v1` },
      models: { [id]: { name: id } },
    },
  };
}

/** The invocation for the agent's engine. OpenCode needs the agent's key (unless its model is local); the others never get one. */
export function engineInvocation(cfg: RunnerConfig, mcp: McpLaunch, resumeSession: string | null, cwd: string, choice: ModelChoice, key?: () => string, reply?: ReplyLimits): EngineInvocation {
  const inv = (() => {
    if (cfg.engine === "claude") return claudeInvocation(cfg, mcp, resumeSession, choice, reply);
    if (cfg.engine === "codex") return codexInvocation(cfg, mcp, resumeSession, cwd, choice, reply);
    if (isLocalProvider(opencodeProvider(cfg)!)) return opencodeInvocation(cfg, mcp, resumeSession, undefined, choice, reply);
    if (!key) throw new Error("OpenCode needs the agent's key.");
    return opencodeInvocation(cfg, mcp, resumeSession, key(), choice, reply);
  })();
  return { ...inv, resumed: resumeSession, ...(reply ? { maxTurns: reply.maxTurns } : {}) };
}

const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);

/** Codex's todo_list items → steps: done ones, then the first open one is "now". */
function codexPlan(items: { text?: string; completed?: boolean }[]): PlanStep[] {
  let nowSet = false;
  return items
    .filter((i) => typeof i.text === "string" && i.text.trim())
    .map((i) => {
      if (i.completed) return { label: clip(i.text!), status: "done" as const };
      const status = nowSet ? ("todo" as const) : ("now" as const);
      nowSet = true;
      return { label: clip(i.text!), status };
    });
}

/** Claude's TodoWrite todos → steps. */
function claudePlan(todos: { content?: string; status?: string }[]): PlanStep[] {
  return todos
    .filter((t) => typeof t.content === "string" && t.content.trim())
    .map((t) => ({ label: clip(t.content!), status: t.status === "completed" ? "done" : t.status === "in_progress" ? "now" : "todo" }));
}

/** OpenCode's todowrite todos → steps (its statuses: pending, in_progress, completed, cancelled). */
function opencodePlan(todos: { content?: string; status?: string }[]): PlanStep[] {
  return todos
    .filter((t) => typeof t.content === "string" && t.content.trim() && t.status !== "cancelled")
    .map((t) => ({ label: clip(t.content!), status: t.status === "completed" ? "done" : t.status === "in_progress" ? "now" : "todo" }));
}

/** OpenCode's events: step_start, tool_use, text, step_finish (tokens and cost per step) and error. */
function parseOpencode(ev: Record<string, any>, run: EngineRun): void {
  if (typeof ev.sessionID === "string" && ev.sessionID) run.sessionId = ev.sessionID;
  const part = ev.part && typeof ev.part === "object" ? ev.part : {};
  if (ev.type === "tool_use") {
    const done = part.state?.status === "completed";
    if (part.tool === "todowrite" && Array.isArray(part.state?.input?.todos)) run.plan = opencodePlan(part.state.input.todos);
    // MCP tools show as <server>_<tool>.
    if (part.tool === "autokolab_ticket_steps" && done) run.reportsSteps = true;
  }
  // The last text is the final message.
  if (ev.type === "text" && typeof part.text === "string" && part.text.trim()) run.finalText = part.text;
  // Each step is one model call; its reasoning tokens are billed as output.
  if (ev.type === "step_finish") {
    run.steps = (run.steps ?? 0) + 1;
    const t = part.tokens && typeof part.tokens === "object" ? part.tokens : {};
    const was = run.usage ?? noUsage();
    const out = count(t.output);
    const reasoning = count(t.reasoning);
    const cost = typeof part.cost === "number" && Number.isFinite(part.cost) && part.cost >= 0 ? part.cost : null;
    run.usage = {
      inputTokens: plus(was.inputTokens, count(t.input)),
      cacheReadTokens: plus(was.cacheReadTokens, count(t.cache?.read)),
      cacheWriteTokens: plus(was.cacheWriteTokens, count(t.cache?.write)),
      outputTokens: plus(was.outputTokens, out === null && reasoning === null ? null : (out ?? 0) + (reasoning ?? 0)),
      turns: plus(was.turns, 1),
      costUsd: plus(was.costUsd, cost),
    };
    if (run.usage.costUsd !== null) run.costUsd = run.usage.costUsd;
  }
  if (ev.type === "error") {
    run.isError = true;
    const data = ev.error?.data ?? {};
    const msg = [typeof data.message === "string" ? data.message : ev.error?.name, typeof data.statusCode === "number" ? `(HTTP ${data.statusCode})` : ""].filter(Boolean).join(" ");
    if (msg) run.finalText = `${run.finalText ? run.finalText + "\n\n" : ""}Error: ${msg}`;
  }
}

export type ProviderProblemKind = "key" | "credit" | "model" | "rate";

/**
 * What a provider's error means, in plain words, from the run's output and OpenCode's error log:
 * a rejected key, no credit, a model that doesn't exist, or a rate limit. Null when it's none of them.
 */
export function providerProblem(output: string, provider: string, model: string): { kind: ProviderProblemKind; reason: string } | null {
  const name = providerName(provider);
  // Before rate limits: OpenAI says "exceeded your current quota" with a 429 when the money ran out.
  if (/insufficient[ _](balance|credit|funds|quota)|exceeded your current quota|credit balance is too low|out of credits?|payment required|HTTP 402\b|statusCode":?402/i.test(output)) {
    return { kind: "credit", reason: `my ${name} account has no credit left; add credit on ${name}'s site` };
  }
  if (/ProviderModelNotFoundError|model[_ ]not[_ ](found|exist)|model .{0,80}(does not|doesn't) exist|unknown model|invalid model|no such model/i.test(output)) {
    return { kind: "model", reason: `${name} doesn't have the model ${model}; pick another model for me` };
  }
  if (/HTTP 401\b|HTTP 403\b|statusCode":?40[13]|authentication[ _]fail|invalid[ _-]?api[ _-]?key|incorrect api key|api key (is )?(invalid|not valid)|unauthori[sz]ed/i.test(output)) {
    return { kind: "key", reason: `${name} rejected my API key; set a new one with \`autokolab key set\`` };
  }
  if (/rate[ _-]?limit|too many requests|HTTP 429\b|statusCode":?429/i.test(output)) {
    return { kind: "rate", reason: `${name} is limiting how fast I can send requests` };
  }
  return null;
}

/** Codex items that are one tool call each: what a reply's turn cap counts for Codex. */
const CODEX_TOOL_ITEMS = ["command_execution", "mcp_tool_call", "file_change", "web_search"];

/** Pull session id / final text / the agent's plan out of one JSON line of engine output. */
export function parseEvent(engine: RunnerConfig["engine"], line: string, run: EngineRun): void {
  let ev: Record<string, any>;
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  if (engine === "opencode") {
    parseOpencode(ev, run);
    return;
  }
  if (engine === "claude") {
    if (ev.type === "system" && ev.subtype === "init") {
      if (ev.session_id) run.sessionId = ev.session_id;
      if (typeof ev.model === "string" && ev.model) run.model = ev.model;
    }
    if (ev.type === "result") {
      if (ev.session_id) run.sessionId = ev.session_id;
      if (typeof ev.result === "string") run.finalText = ev.result;
      run.isError = Boolean(ev.is_error) || (typeof ev.subtype === "string" && ev.subtype !== "success");
      if (ev.subtype === "error_max_turns") run.turnCapped = true;
      if (!run.finalText && ev.subtype) run.finalText = `Run ended: ${ev.subtype}`;
      if (typeof ev.total_cost_usd === "number") run.costUsd = ev.total_cost_usd;
      const u = ev.usage && typeof ev.usage === "object" ? ev.usage : {};
      run.usage = {
        inputTokens: count(u.input_tokens),
        cacheReadTokens: count(u.cache_read_input_tokens),
        cacheWriteTokens: count(u.cache_creation_input_tokens),
        outputTokens: count(u.output_tokens),
        turns: count(ev.num_turns),
        costUsd: typeof ev.total_cost_usd === "number" && Number.isFinite(ev.total_cost_usd) && ev.total_cost_usd >= 0 ? ev.total_cost_usd : null,
      };
    }
    if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
      for (const c of ev.message.content) {
        if (c?.type !== "tool_use") continue;
        if (c.name === "TodoWrite" && Array.isArray(c.input?.todos)) run.plan = claudePlan(c.input.todos);
        if (c.name === "mcp__autokolab__ticket_steps") run.reportsSteps = true;
      }
    }
  } else {
    const item = ev.item;
    if (item && /^item\.(started|updated|completed)$/.test(ev.type)) {
      if (item.type === "todo_list" && Array.isArray(item.items)) run.plan = codexPlan(item.items);
      if (ev.type === "item.started" && CODEX_TOOL_ITEMS.includes(item.type)) run.steps = (run.steps ?? 0) + 1;
      if (item.type === "mcp_tool_call" && item.server === "autokolab" && item.tool === "ticket_steps" && ev.type === "item.completed" && item.status !== "failed") {
        run.reportsSteps = true;
      }
    }
    if (ev.type === "thread.started" && ev.thread_id) run.sessionId = ev.thread_id;
    if (ev.type === "session_configured" && ev.session_id) run.sessionId = ev.session_id;
    if (ev.msg?.type === "session_configured" && ev.msg.session_id) run.sessionId = ev.msg.session_id;
    if (ev.type === "item.completed" && ev.item?.type === "agent_message" && typeof ev.item.text === "string") {
      run.finalText = ev.item.text;
    }
    // Codex reports tokens when a turn ends; its input_tokens counts the cached ones too. It says
    // nothing about cache writes, turns or cost, so those stay null.
    if (ev.type === "turn.completed" && ev.usage && typeof ev.usage === "object") {
      const input = count(ev.usage.input_tokens);
      const cached = count(ev.usage.cached_input_tokens);
      const was = run.usage ?? noUsage();
      run.usage = {
        ...was,
        inputTokens: plus(was.inputTokens, input === null ? null : Math.max(0, input - (cached ?? 0))),
        cacheReadTokens: plus(was.cacheReadTokens, cached),
        outputTokens: plus(was.outputTokens, count(ev.usage.output_tokens)),
      };
    }
    if (ev.type === "turn.failed" || ev.type === "error") {
      run.isError = true;
      const msg = ev.error?.message ?? ev.message;
      if (msg) run.finalText = `${run.finalText ? run.finalText + "\n\n" : ""}Error: ${msg}`;
    }
  }
}

/** Refusals for too many requests in a row before an OpenCode run is stopped to wait. */
export const RATE_LIMIT_STOP_AFTER = 3;

/** An OpenCode error-log line saying the main agent's request was rate-limited (not its title helper's). */
export function isRateLimitLog(line: string): boolean {
  return /level=ERROR/.test(line) && !/\bsmall=true\b/.test(line) && /rate[ _-]?limit|too many requests|\b429\b/i.test(line);
}

/** Replaces each secret value wherever it shows up. */
export function scrubber(secrets: string[] = []): (s: string) => string {
  const values = secrets.filter((x) => x.length >= 8);
  return (s) => values.reduce((t, v) => t.split(v).join("[redacted]"), s);
}

/**
 * A reply run past its turn cap, for the engines without a cap of their own (Claude Code has
 * --max-turns). Once only: a run already being stopped isn't stopped again.
 */
export function overTurnCap(engine: RunnerConfig["engine"], run: Pick<EngineRun, "steps" | "turnCapped">, maxTurns: number | undefined): boolean {
  return engine !== "claude" && maxTurns !== undefined && !run.turnCapped && (run.steps ?? 0) > maxTurns;
}

export async function runEngine(opts: {
  cfg: RunnerConfig;
  inv: EngineInvocation;
  /** Working directory: the task's worktree. */
  cwd: string;
  prompt: string;
  logFile: string;
  signal: AbortSignal;
  onLine?: (line: string) => void;
  /** Called whenever the agent's to-do list changes. */
  onPlan?: (plan: PlanStep[], run: EngineRun) => void;
  /** Called when the tool says which model it's running. */
  onModel?: (model: string) => void;
}): Promise<EngineRun> {
  const { cfg, inv, prompt } = opts;
  const run: EngineRun = { sessionId: null, finalText: "", exitCode: null, timedOut: false, aborted: false, isError: false, usage: noUsage() };
  if (inv.model) run.model = inv.model;
  const scrub = scrubber(inv.secrets);
  const log = createWriteStream(opts.logFile, { flags: "a" });
  log.write(`# ${new Date().toISOString()} ${inv.bin} ${inv.args.join(" ")}\n# prompt:\n${prompt}\n# output:\n`);

  try {
    const child = spawn(inv.bin, inv.args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true, // own process group, so a stop also ends the agent's child processes
      env: { ...process.env, AUTOKOLAB_RUNNER: "1", GIT_TERMINAL_PROMPT: "0", ...inv.env },
    });
    if (run.model) opts.onModel?.(run.model);

    const killGroup = (sig: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, sig);
      } catch {
        /* already gone */
      }
    };
    const stop = (why: "timeout" | "abort" | "rate" | "turns") => {
      if (why === "timeout") run.timedOut = true;
      else if (why === "abort") run.aborted = true;
      else if (why === "turns") run.turnCapped = true;
      else run.rateLimited = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), 10_000).unref();
    };
    const timer = setTimeout(() => stop("timeout"), cfg.limits.max_minutes * 60_000);
    const onAbort = () => stop("abort");
    opts.signal.addEventListener("abort", onAbort, { once: true });

    child.stdin.end(prompt);
    createInterface({ input: child.stdout }).on("line", (raw) => {
      const line = scrub(raw);
      log.write(line + "\n");
      const before = run.plan;
      const modelBefore = run.model;
      parseEvent(cfg.engine, line, run);
      if (run.plan && run.plan !== before) opts.onPlan?.(run.plan, run);
      if (run.model && run.model !== modelBefore) opts.onModel?.(run.model);
      if (overTurnCap(cfg.engine, run, inv.maxTurns)) stop("turns");
      opts.onLine?.(line);
    });
    let stderrTail = "";
    let rateErrors = 0;
    createInterface({ input: child.stderr }).on("line", (raw) => {
      const line = scrub(raw);
      log.write(line + "\n");
      stderrTail = (stderrTail + line + "\n").slice(-2000);
      // A run stopped before its first event still has a session to continue later.
      if (cfg.engine === "opencode" && !run.sessionId) run.sessionId = line.match(/\bsession\.id=(ses_\w+)/)?.[1] ?? null;
      // OpenCode retries a rate-limited provider on its own, for as long as it takes, and says so only
      // in its error log. After a few refusals in a row the run stops, to wait like a usage limit.
      if (cfg.engine === "opencode" && !run.rateLimited && isRateLimitLog(line) && ++rateErrors >= RATE_LIMIT_STOP_AFTER) stop("rate");
    });

    run.exitCode = await new Promise<number | null>((resolve) => {
      child.on("error", (e) => {
        stderrTail += `\n${e.message}`;
        resolve(null);
      });
      child.on("close", (code) => resolve(code));
    });
    clearTimeout(timer);
    opts.signal.removeEventListener("abort", onAbort);

    if (inv.lastMessageFile) {
      try {
        const last = readFileSync(inv.lastMessageFile, "utf8").trim();
        if (last) run.finalText = last;
      } catch {
        /* not written */
      }
    }
    if (cfg.engine === "opencode" && (run.isError || run.exitCode !== 0) && !run.timedOut && !run.aborted) {
      const problem = providerProblem(`${run.finalText}\n${stderrTail}`, opencodeProvider(cfg) ?? "", inv.model ?? "");
      if (problem) run.problem = problem;
      if (problem?.kind === "rate") run.rateLimited = true;
    }
    if (run.rateLimited) {
      run.isError = true;
      run.problem ??= providerProblem("rate limit", opencodeProvider(cfg) ?? "", inv.model ?? "")!;
      if (!run.finalText.trim()) run.finalText = `Stopped: ${run.problem.reason}.`;
    }
    if (run.exitCode !== 0 && !run.timedOut && !run.aborted) {
      run.isError = true;
      if (!run.finalText) run.finalText = stderrTail.trim() || `${inv.bin} exited with code ${run.exitCode}`;
    }
    run.finalText = scrub(run.finalText);
  } finally {
    rmSync(inv.tempDir, { recursive: true, force: true });
    // Wait for the log to reach the disk, so it's complete once the run is.
    await new Promise<void>((done) => log.end(() => done()));
  }
  return run;
}
