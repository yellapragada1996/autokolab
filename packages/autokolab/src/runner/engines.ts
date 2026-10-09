import { spawn } from "node:child_process";
import { createWriteStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { EFFORTS, type Effort, type RunnerConfig } from "./config.js";

// Starts Claude Code or Codex headless with the task as its prompt, using their supported
// non-interactive modes (claude -p, codex exec). The prompt goes in on stdin.

export interface McpLaunch {
  command: string; // node executable
  args: string[]; // [cli.js, "mcp", "--profile", name]
}

/** One item of the agent's own to-do list, as the board shows steps. */
export interface PlanStep {
  label: string;
  status: "todo" | "now" | "done";
}

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
}

export interface EngineInvocation {
  bin: string;
  args: string[];
  /** Files to clean up afterwards. */
  tempDir: string;
  /** Where Codex writes its last message. */
  lastMessageFile?: string;
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

/**
 * Database first (set on AutoKolab by the owner or the project's lead), then the toml, then the
 * tool's own default, value by value. With model_locked the toml has the last word (DEC-18).
 */
export function chooseModel(cfg: RunnerConfig, fromDb: { model: string | null; effort: string | null } | null): ModelChoice {
  const toml = cfg.engine === "claude" ? cfg.claude : cfg.codex;
  const db = cfg.model_locked ? null : fromDb;
  const effort = db?.effort && (EFFORTS as readonly string[]).includes(db.effort) ? (db.effort as Effort) : toml.effort;
  return { model: db?.model || toml.model, effort };
}

export function claudeInvocation(cfg: RunnerConfig, mcp: McpLaunch, resumeSession: string | null, choice: ModelChoice = chooseModel(cfg, null)): EngineInvocation {
  const tempDir = mkdtempSync(join(tmpdir(), "autokolab-"));
  const mcpConfig = join(tempDir, "mcp.json");
  writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { autokolab: { command: mcp.command, args: mcp.args } } }));
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", cfg.claude.permission_mode,
    "--max-turns", String(cfg.limits.max_turns),
    "--mcp-config", mcpConfig,
  ];
  // On every launch, resumes included: a resumed session switches to the model given here (AK-7).
  if (choice.model) args.push("--model", choice.model);
  if (choice.effort) args.push("--effort", choice.effort);
  if (resumeSession) args.push("--resume", resumeSession);
  args.push("--allowedTools", ...cfg.claude.allowed_tools, "mcp__autokolab");
  args.push("--disallowedTools", ...claudeDenyRules(cfg));
  return { bin: cfg.claude_bin, args, tempDir };
}

const tomlStr = (s: string) => JSON.stringify(s); // JSON strings are valid TOML basic strings

export function codexInvocation(cfg: RunnerConfig, mcp: McpLaunch, resumeSession: string | null, cwd: string, choice: ModelChoice = chooseModel(cfg, null)): EngineInvocation {
  const tempDir = mkdtempSync(join(tmpdir(), "autokolab-"));
  const lastMessageFile = join(tempDir, "last-message.txt");
  // Settings go through -c, which both `codex exec` and `codex exec resume` accept
  // (resume doesn't take -C / -s; the working directory comes from the process itself).
  const config = [
    "-c", 'approval_policy="never"',
    "-c", `sandbox_mode=${tomlStr(cfg.codex.sandbox)}`,
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
    : ["exec", ...common, "-C", cwd, "-s", cfg.codex.sandbox, "-"]; // "-": read the prompt from stdin
  return { bin: cfg.codex_bin, args, tempDir, lastMessageFile };
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

/** Pull session id / final text / the agent's plan out of one JSON line of engine output. */
export function parseEvent(engine: RunnerConfig["engine"], line: string, run: EngineRun): void {
  let ev: Record<string, any>;
  try {
    ev = JSON.parse(line);
  } catch {
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
      if (!run.finalText && ev.subtype) run.finalText = `Run ended: ${ev.subtype}`;
      if (typeof ev.total_cost_usd === "number") run.costUsd = ev.total_cost_usd;
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
    if (ev.type === "turn.failed" || ev.type === "error") {
      run.isError = true;
      const msg = ev.error?.message ?? ev.message;
      if (msg) run.finalText = `${run.finalText ? run.finalText + "\n\n" : ""}Error: ${msg}`;
    }
  }
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
  const run: EngineRun = { sessionId: null, finalText: "", exitCode: null, timedOut: false, aborted: false, isError: false };
  const log = createWriteStream(opts.logFile, { flags: "a" });
  log.write(`# ${new Date().toISOString()} ${inv.bin} ${inv.args.join(" ")}\n# prompt:\n${prompt}\n# output:\n`);

  try {
    const child = spawn(inv.bin, inv.args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true, // own process group, so a stop also ends the agent's child processes
      env: { ...process.env, AUTOKOLAB_RUNNER: "1", GIT_TERMINAL_PROMPT: "0" },
    });

    const killGroup = (sig: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, sig);
      } catch {
        /* already gone */
      }
    };
    const stop = (why: "timeout" | "abort") => {
      if (why === "timeout") run.timedOut = true;
      else run.aborted = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), 10_000).unref();
    };
    const timer = setTimeout(() => stop("timeout"), cfg.limits.max_minutes * 60_000);
    const onAbort = () => stop("abort");
    opts.signal.addEventListener("abort", onAbort, { once: true });

    child.stdin.end(prompt);
    createInterface({ input: child.stdout }).on("line", (line) => {
      log.write(line + "\n");
      const before = run.plan;
      const modelBefore = run.model;
      parseEvent(cfg.engine, line, run);
      if (run.plan && run.plan !== before) opts.onPlan?.(run.plan, run);
      if (run.model && run.model !== modelBefore) opts.onModel?.(run.model);
      opts.onLine?.(line);
    });
    let stderrTail = "";
    child.stderr.on("data", (d: Buffer) => {
      log.write(d);
      stderrTail = (stderrTail + d.toString()).slice(-2000);
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
    if (run.exitCode !== 0 && !run.timedOut && !run.aborted) {
      run.isError = true;
      if (!run.finalText) run.finalText = stderrTail.trim() || `${inv.bin} exited with code ${run.exitCode}`;
    }
  } finally {
    log.end();
    rmSync(inv.tempDir, { recursive: true, force: true });
  }
  return run;
}
