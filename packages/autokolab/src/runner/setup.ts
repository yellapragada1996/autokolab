import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// A repo's setup script (AK-123): `.autokolab/setup.sh`, run once in each new ticket worktree before
// the agent's first run, so the agent doesn't spend its run installing packages. It runs again only
// when the script changes.
//
// The script is read from the default branch on GitHub (origin/<base>) through the clone, never from
// the worktree: the runner isn't sandboxed, and an agent can write anything in its worktree. A
// change to the script runs only once it's reviewed and merged. Whether it ran is recorded in the
// worktree's real Git folder, which the agent can't write either.

export const SETUP_SCRIPT = ".autokolab/setup.sh";
const RECORD = "autokolab-setup";

export type SetupResult =
  | { ran: false; why: "none" | "unchanged" }
  | { ran: true; ok: true }
  | { ran: true; ok: false; problem: string };

/** The setup script on the default branch, or null if the repo has none. */
export function setupScript(clone: string, base: string): string | null {
  try {
    return execFileSync("git", ["show", `origin/${base}:${SETUP_SCRIPT}`], { cwd: clone, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export interface SetupOptions {
  /** The worktree's real Git folder: where the run is recorded. */
  gitDir: string;
  /** The worktree: where the script runs. */
  cwd: string;
  minutes: number;
  /** Each line the script prints. */
  onOutput: (line: string) => void;
  signal?: AbortSignal;
  /** Added to the script's environment: the run's ticket and ports (AK-125). */
  env?: Record<string, string>;
}

const hash = (script: string) => createHash("sha256").update(script).digest("hex");

/** Run `script` in the worktree unless this exact script already ran there. Never throws. */
export async function runSetup(script: string | null, opts: SetupOptions): Promise<SetupResult> {
  if (!script?.trim()) return { ran: false, why: "none" };
  const record = join(opts.gitDir, RECORD);
  const sum = hash(script);
  if (existsSync(record) && readFileSync(record, "utf8").trim() === sum) return { ran: false, why: "unchanged" };

  const file = join(opts.gitDir, `${RECORD}.sh`);
  writeFileSync(file, script, { mode: 0o700 });
  const problem = await new Promise<string | null>((resolve) => {
    let last = "";
    let partial = "";
    const out = (chunk: Buffer) => {
      const lines = (partial + chunk.toString()).split(/\r?\n/);
      partial = lines.pop() ?? "";
      for (const l of lines) line(l);
    };
    const line = (l: string) => {
      opts.onOutput(l);
      if (l.trim()) last = l.trim();
    };
    // Its own process group, so a time limit or a pause stops what it started (npm and its children) too.
    const child = spawn("sh", [file], { cwd: opts.cwd, env: { ...process.env, ...opts.env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stopped: string | null = null;
    const stop = (why: string) => {
      if (stopped) return;
      stopped = why;
      const kill = (sig: NodeJS.Signals) => {
        try {
          process.kill(-child.pid!, sig);
        } catch {
          /* already gone */
        }
      };
      kill("SIGTERM");
      setTimeout(() => kill("SIGKILL"), 5000).unref();
    };
    const timer = setTimeout(() => stop(`it took longer than ${opts.minutes} minute${opts.minutes === 1 ? "" : "s"}`), opts.minutes * 60_000);
    const onAbort = () => stop("it was stopped");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", out);
    child.stderr.on("data", out);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve(e.message);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (partial) line(partial);
      if (stopped) resolve(stopped);
      else resolve(code === 0 ? null : last || `it exited with code ${code}`);
    });
  });
  // Recorded either way, so a failing script isn't retried on every run, only once it changes.
  // A pause isn't a result: the script runs again next time.
  if (!opts.signal?.aborted) writeFileSync(record, `${sum}\n`);
  return problem === null ? { ran: true, ok: true } : { ran: true, ok: false, problem: problem.slice(0, 300) };
}
