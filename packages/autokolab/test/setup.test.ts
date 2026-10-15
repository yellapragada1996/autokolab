import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRunnerConfig } from "../src/runner/config.js";
import { buildTicketPrompt } from "../src/runner/prompt.js";
import { runSetup, setupScript } from "../src/runner/setup.js";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

describe("the repo's setup script (AK-123)", () => {
  let root: string;
  let gitDir: string;
  let cwd: string;
  let lines: string[];
  const run = (script: string | null, minutes = 1, signal?: AbortSignal) =>
    runSetup(script, { gitDir, cwd, minutes, onOutput: (l) => lines.push(l), signal });

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "ak-setup-")));
    gitDir = join(root, "gitdir");
    cwd = join(root, "wt");
    mkdirSync(gitDir);
    mkdirSync(cwd);
    lines = [];
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("does nothing when the repo has no script", async () => {
    expect(await run(null)).toEqual({ ran: false, why: "none" });
    expect(await run("  \n")).toEqual({ ran: false, why: "none" });
  });

  it("runs once in the worktree, with its output going to the log", async () => {
    const script = "echo hello\necho $((1+1)) > count\n";
    expect(await run(script)).toEqual({ ran: true, ok: true });
    expect(lines).toContain("hello");
    expect(readFileSync(join(cwd, "count"), "utf8").trim()).toBe("2");
    rmSync(join(cwd, "count"));
    expect(await run(script)).toEqual({ ran: false, why: "unchanged" });
    expect(existsSync(join(cwd, "count"))).toBe(false);
  });

  it("runs again when the script changed", async () => {
    await run("touch one\n");
    expect(await run("touch two\n")).toEqual({ ran: true, ok: true });
    expect(existsSync(join(cwd, "two"))).toBe(true);
  });

  it("reports a failure by its last line, and runs the same script again (AK-153)", async () => {
    const failing = "echo working\necho 'npm ERR! network down' >&2\nexit 3\n";
    expect(await run(failing)).toEqual({ ran: true, ok: false, problem: "npm ERR! network down" });
    // A failure isn't recorded, so the next attempt (the preflight retry) runs it again.
    expect(await run(failing)).toEqual({ ran: true, ok: false, problem: "npm ERR! network down" });
    // A success is recorded, so it isn't repeated.
    expect(await run("true\n")).toEqual({ ran: true, ok: true });
    expect(await run("true\n")).toEqual({ ran: false, why: "unchanged" });
    expect(await run("exit 4\n")).toEqual({ ran: true, ok: false, problem: "it exited with code 4" });
  });

  // The background sleep holds the output open: the run only ends in time if it's stopped too.
  it("stops a script that runs past its time limit, with what it started", async () => {
    expect(await run("sleep 30 &\nsleep 30\n", 0.005)).toEqual({ ran: true, ok: false, problem: "it took longer than 0.005 minutes" });
  }, 10_000);

  it("isn't recorded when it was paused, so it runs next time", async () => {
    const abort = new AbortController();
    const r = run("sleep 30\n", 1, abort.signal);
    setTimeout(() => abort.abort(), 100);
    expect(await r).toEqual({ ran: true, ok: false, problem: "it was stopped" });
    expect(await run("true\n")).toEqual({ ran: true, ok: true });
  }, 10_000);

  it("reads the script from the default branch on GitHub, not from the worktree", () => {
    const origin = join(root, "origin");
    const clone = join(root, "clone");
    git(root, "init", "-q", "-b", "main", origin);
    mkdirSync(join(origin, ".autokolab"));
    writeFileSync(join(origin, ".autokolab", "setup.sh"), "npm ci\n");
    git(origin, "add", ".");
    git(origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
    git(root, "clone", "-q", origin, clone);
    expect(setupScript(clone, "main")).toBe("npm ci\n");
    writeFileSync(join(clone, ".autokolab", "setup.sh"), "touch pwned\n");
    expect(setupScript(clone, "main")).toBe("npm ci\n");
    expect(setupScript(clone, "nope")).toBeNull();
  });

  it("puts one line about a failure in the agent's brief, and has a time limit in the toml", () => {
    const cfg = parseRunnerConfig(`agent_id = "00000000-0000-4000-8000-000000000000"\nengine = "claude"\n`, "a");
    expect(cfg.limits.setup_minutes).toBe(10);
    const wt = { clone: "/c", path: "/w", branch: "ak-1-x", base: "main", created: true };
    const ctx = { myName: "a", ownerName: "o", projectName: "P", key: "AK-1", brief: "", ticket: "", cfg, worktree: wt, followUp: false, newComments: null };
    expect(buildTicketPrompt(ctx)).not.toContain("setup script");
    expect(buildTicketPrompt({ ...ctx, setupFailed: "npm ERR! network down" })).toContain("setup script (.autokolab/setup.sh) failed in your worktree: npm ERR! network down");
    expect(buildTicketPrompt({ ...ctx, followUp: true, newComments: "x", setupFailed: "boom" })).toContain("failed in your worktree: boom");
  });
});
