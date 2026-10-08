import { spawn } from "node:child_process";
import { createWriteStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { RunnerConfig } from "./config.js";

// Starts Claude Code or Codex headless with the task as its prompt, using their supported
// non-interactive modes (claude -p, codex exec). The prompt goes in on stdin.

export interface McpLaunch {
  command: string; // node executable
  args: string[]; // [cli.js, "mcp", "--profile", name]
}

export interface EngineRun {
  sessionId: string | null;
  finalText: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
  isError: boolean;
  costUsd?: number;
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

export function claudeInvocation(cfg: RunnerConfig, mcp: McpLaunch, resumeSession: string | null): EngineInvocation {
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
  if (cfg.claude.model) args.push("--model", cfg.claude.model);
  if (resumeSession) args.push("--resume", resumeSession);
  args.push("--allowedTools", ...cfg.claude.allowed_tools, "mcp__autokolab");
  args.push("--disallowedTools", ...claudeDenyRules(cfg));
  return { bin: cfg.claude_bin, args, tempDir };
}

const tomlStr = (s: string) => JSON.stringify(s); // JSON strings are valid TOML basic strings

export function codexInvocation(cfg: RunnerConfig, mcp: McpLaunch, resumeSession: string | null, cwd: string): EngineInvocation {
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
    ...(cfg.codex.model ? ["-c", `model=${tomlStr(cfg.codex.model)}`] : []),
  ];
  const common = ["--json", "--skip-git-repo-check", ...config, "--output-last-message", lastMessageFile];
  const args = resumeSession
    ? ["exec", "resume", ...common, resumeSession, "-"]
    : ["exec", ...common, "-C", cwd, "-s", cfg.codex.sandbox, "-"]; // "-": read the prompt from stdin
  return { bin: cfg.codex_bin, args, tempDir, lastMessageFile };
}

/** Pull session id / final text out of one JSON line of engine output. */
export function parseEvent(engine: RunnerConfig["engine"], line: string, run: EngineRun): void {
  let ev: Record<string, any>;
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  if (engine === "claude") {
    if (ev.type === "system" && ev.subtype === "init" && ev.session_id) run.sessionId = ev.session_id;
    if (ev.type === "result") {
      if (ev.session_id) run.sessionId = ev.session_id;
      if (typeof ev.result === "string") run.finalText = ev.result;
      run.isError = Boolean(ev.is_error) || (typeof ev.subtype === "string" && ev.subtype !== "success");
      if (!run.finalText && ev.subtype) run.finalText = `Run ended: ${ev.subtype}`;
      if (typeof ev.total_cost_usd === "number") run.costUsd = ev.total_cost_usd;
    }
  } else {
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
      parseEvent(cfg.engine, line, run);
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
