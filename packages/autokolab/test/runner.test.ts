import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Member, Message, Room } from "../src/core/types.js";
import { parseRunnerConfig, runnerTemplate } from "../src/runner/config.js";
import { claudeDenyRules, claudeInvocation, codexInvocation, parseEvent, runEngine, type EngineRun } from "../src/runner/engines.js";
import { installHook } from "../src/runner/githook.js";
import { buildPrompt, buildTicketPrompt, parseOutcome } from "../src/runner/prompt.js";
import { clonePath, ensureWorktree, pruneWorktrees, ticketBranch, type Worktree } from "../src/runner/repos.js";
import { defaultRules } from "../src/core/projects.js";

const mcp = { command: "/usr/bin/node", args: ["/opt/autokolab/cli.js", "mcp", "--profile", "lee-claude"] };
const AID = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";
const cfgFor = (extra = "") => parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"\n${extra}`, "lee-claude");
const wt: Worktree = { path: "/data/worktrees/lee-claude/ana-shop/t7", branch: "ak/lee-claude/t7", base: "main", created: true };
const freshRun = (): EngineRun => ({ sessionId: null, finalText: "", exitCode: null, timedOut: false, aborted: false, isError: false });
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

describe("runner limits", () => {
  it("parses the template join writes", () => {
    const cfg = parseRunnerConfig(runnerTemplate(AID, "codex"), "lee-codex");
    expect(cfg.engine).toBe("codex");
    expect(cfg.profile).toBe("lee-codex");
    expect(cfg.agent_id).toBe(AID);
    expect(cfg.limits.rules).toContain("Never deploy or publish anything.");
  });
  it("fills safe defaults", () => {
    const cfg = cfgFor();
    expect(cfg.limits.max_minutes).toBe(60);
    expect(cfg.limits.protected_branches).toContain("main");
    expect(cfg.limits.deny_paths).toContain(".env.prod");
    expect(cfg.codex.sandbox).toBe("workspace-write");
  });
  it("explains mistakes", () => {
    expect(() => parseRunnerConfig(`agent_id = "${AID}"\nengine = "gpt"`, "x")).toThrow(/engine/);
    expect(() => parseRunnerConfig(`engine = "claude"`, "x")).toThrow(/agent_id/);
    expect(() => parseRunnerConfig(`not toml [`, "x")).toThrow(/TOML/);
  });
});

describe("prompt", () => {
  const me = { name: "lee-claude", kind: "agent" } as Member;
  const sender = { name: "ana-claude", kind: "agent" } as Member;
  const room = { name: "shop-app", repo: "ana/shop-app" } as Room;
  const message = { id: 7, thread_id: null, kind: "task", body: "Build the Zones API", refs: { branch: "zones-api" } } as unknown as Message;
  const base = { me, ownerName: "lee", myRole: "follower", room, sender, senderRole: "lead", message, instructors: ["ana-claude", "ana"], cfg: cfgFor(), worktree: wt };

  it("includes the task, the worktree, the limits and how to report", () => {
    const p = buildPrompt({ ...base, followUp: false });
    expect(p).toContain("Build the Zones API");
    expect(p).toContain("running unattended");
    expect(p).toContain(wt.path);
    expect(p).toContain("branch ak/lee-claude/t7");
    expect(p).toMatch(/Never commit to, push to or merge into: main/);
    expect(p).toContain(".env.prod");
    expect(p).toContain('start with "BLOCKED:"');
    expect(p).toContain("ana-claude, ana");
    expect(p).toContain("Rules lee set");
    expect(p).toMatch(/push your branch early and often/);
    expect(p).toContain("work_log");
    expect(p).toContain("git diff origin/main...origin/<branch>");
  });
  it("follow-ups say so", () => {
    const p = buildPrompt({ ...base, message: { ...message, id: 9, thread_id: 7 }, followUp: true });
    expect(p).toMatch(/^New message in AutoKolab thread #7/);
  });
});

describe("tickets", () => {
  it("names branches after the ticket", () => {
    expect(ticketBranch("SH-12", "Add Google sign-in!")).toBe("sh-12-add-google-sign-in");
    expect(ticketBranch("SH-3", "  ")).toBe("sh-3");
    expect(ticketBranch("SH-4", "a very long title that goes on and on and on forever")).toBe("sh-4-a-very-long-title-that-goes");
  });
  it("briefs a fresh ticket with the guide, the ticket and the rules", () => {
    const p = buildTicketPrompt({ myName: "builder", ownerName: "ana", projectName: "Shop", key: "SH-2", brief: "# Shop\n## Rules\n- be kind", ticket: "SH-2 · Add Google sign-in", cfg: cfgFor(), worktree: wt, followUp: false, newComments: null });
    expect(p).toContain("You are builder, ana's AI agent");
    expect(p).toContain("- be kind");
    expect(p).toContain("SH-2 · Add Google sign-in");
    expect(p).toContain("Never commit to, push to or merge into: main");
    expect(p).toContain("ticket_update key=SH-2 status=review");
  });
  it("continues a ticket with people's comments", () => {
    const p = buildTicketPrompt({ myName: "builder", ownerName: "ana", projectName: "Shop", key: "SH-2", brief: "", ticket: "", cfg: cfgFor(), worktree: wt, followUp: true, newComments: "ana: use the blue button" });
    expect(p.startsWith("New comments on SH-2")).toBe(true);
    expect(p).toContain("ana: use the blue button");
    expect(p).not.toContain("Project brief");
  });
  it("reads the ending block", () => {
    const o = parseOutcome("Added the button.\n\n```autokolab\nstatus: review\npr: https://github.com/ana/shop/pull/12\nquestion: none\nnew_ticket: Add retries\nnew_ticket: <title of follow-up work you found>\n```");
    expect(o).toEqual({ body: "Added the button.", status: "review", pr: "https://github.com/ana/shop/pull/12", newTickets: ["Add retries"] });
    expect(parseOutcome("```autokolab\nstatus: In progress\nquestion: Redis or Postgres?\n```")).toMatchObject({ status: "in_progress", question: "Redis or Postgres?" });
    expect(parseOutcome("no block here")).toEqual({ body: "no block here", newTickets: [] });
  });
  it("asks for the ending block", () => {
    const p = buildTicketPrompt({ myName: "b", ownerName: "ana", projectName: "Shop", key: "SH-2", brief: "", ticket: "", cfg: cfgFor(), worktree: wt, followUp: false, newComments: null });
    expect(p).toContain("```autokolab");
  });
  it("has default rules that protect the default branch", () => {
    expect(defaultRules("trunk")).toContain("Never push to trunk");
  });
});

describe("the agent's own plan", () => {
  it("reads Codex's to-do list", () => {
    const run = freshRun();
    const items = [{ text: "Read the code", completed: true }, { text: "Add the button", completed: false }, { text: "Test it", completed: false }];
    parseEvent("codex", JSON.stringify({ type: "item.updated", item: { type: "todo_list", items } }), run);
    expect(run.plan).toEqual([
      { label: "Read the code", status: "done" },
      { label: "Add the button", status: "now" },
      { label: "Test it", status: "todo" },
    ]);
    expect(run.reportsSteps).toBeUndefined();
    parseEvent("codex", JSON.stringify({ type: "item.completed", item: { type: "mcp_tool_call", server: "autokolab", tool: "ticket_steps", status: "completed" } }), run);
    expect(run.reportsSteps).toBe(true);
  });
  it("reads Claude's TodoWrite", () => {
    const run = freshRun();
    const todos = [{ content: "Plan", status: "completed" }, { content: "Build", status: "in_progress" }, { content: "Ship", status: "pending" }];
    parseEvent("claude", JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "TodoWrite", input: { todos } }] } }), run);
    expect(run.plan?.map((s) => s.status)).toEqual(["done", "now", "todo"]);
  });
});

describe("engine command lines", () => {
  it("claude: headless, stream-json, MCP config, deny rules, resume", () => {
    const inv = claudeInvocation(cfgFor(), mcp, "sess-1");
    expect(inv.args.slice(0, 3)).toEqual(["-p", "--output-format", "stream-json"]);
    expect(inv.args).toContain("--resume");
    expect(inv.args).toContain("mcp__autokolab");
    const deny = inv.args.slice(inv.args.indexOf("--disallowedTools") + 1);
    expect(deny).toContain("Bash(git push --force:*)");
    expect(deny).toContain("Bash(git push origin main:*)");
    expect(deny).toContain("Read(**/.env.prod)");
  });
  it("deny rules include the owner's extras once", () => {
    const rules = claudeDenyRules(cfgFor(`[claude]\ndisallowed_tools = ["WebFetch", "Bash(git push --force:*)"]`));
    expect(rules).toContain("WebFetch");
    expect(rules.filter((r) => r === "Bash(git push --force:*)")).toHaveLength(1);
  });
  it("codex: exec in the worktree, MCP via -c, prompt on stdin, resume", () => {
    const cfg = parseRunnerConfig(`agent_id = "${AID}"\nengine = "codex"`, "lee-codex");
    const first = codexInvocation(cfg, mcp, null, "/tmp/wt");
    expect(first.args[0]).toBe("exec");
    expect(first.args.slice(first.args.indexOf("-C"), first.args.indexOf("-C") + 2)).toEqual(["-C", "/tmp/wt"]);
    expect(first.args).toContain('mcp_servers.autokolab.command="/usr/bin/node"');
    expect(first.args).toContain('mcp_servers.autokolab.args=["/opt/autokolab/cli.js","mcp","--profile","lee-claude"]');
    expect(first.args).toContain('sandbox_mode="workspace-write"');
    expect(first.args.at(-1)).toBe("-");
    // `codex exec resume` takes neither -C nor -s: everything goes through -c.
    const next = codexInvocation(cfg, mcp, "thread-9", "/tmp/wt");
    expect(next.args.slice(0, 2)).toEqual(["exec", "resume"]);
    expect(next.args).not.toContain("-C");
    expect(next.args).not.toContain("-s");
    expect(next.args).toContain('sandbox_mode="workspace-write"');
    expect(next.args.slice(-2)).toEqual(["thread-9", "-"]);
  });
});

describe("parsing engine output", () => {
  it("claude result", () => {
    const run = freshRun();
    parseEvent("claude", JSON.stringify({ type: "system", subtype: "init", session_id: "s1" }), run);
    parseEvent("claude", JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Opened PR #12", session_id: "s1", total_cost_usd: 0.42 }), run);
    expect(run).toMatchObject({ sessionId: "s1", finalText: "Opened PR #12", isError: false, costUsd: 0.42 });
  });
  it("claude max turns is an error", () => {
    const run = freshRun();
    parseEvent("claude", JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, session_id: "s2" }), run);
    expect(run.isError).toBe(true);
    expect(run.finalText).toMatch(/error_max_turns/);
  });
  it("codex events", () => {
    const run = freshRun();
    parseEvent("codex", JSON.stringify({ type: "thread.started", thread_id: "t1" }), run);
    parseEvent("codex", JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Done, PR #3" } }), run);
    parseEvent("codex", "not json", run);
    expect(run).toMatchObject({ sessionId: "t1", finalText: "Done, PR #3", isError: false });
  });
});

describe("runEngine with a fake agent", () => {
  const dir = mkdtempSync(join(tmpdir(), "ak-engine-"));
  const fake = join(dir, "fake-claude.mjs");
  writeFileSync(
    fake,
    `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", async () => {
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "fake-1" }));
  if (input.includes("SLOW")) await new Promise((r) => setTimeout(r, 60000));
  const blocked = input.includes("deploy to prod");
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "fake-1",
    result: blocked ? "BLOCKED: deploying is outside my limits" : "Did it in " + process.cwd().split("/").pop() + ", runner=" + process.env.AUTOKOLAB_RUNNER }));
});
`,
    { mode: 0o755 },
  );
  const cfg = parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"\nclaude_bin = "${fake}"\n[limits]\nmax_minutes = 1`, "p");
  const go = (prompt: string, signal = new AbortController().signal, c = cfg) =>
    runEngine({ cfg: c, inv: claudeInvocation(c, mcp, null), cwd: dir, prompt, logFile: join(dir, `${Math.random()}.log`), signal });

  it("runs in the worktree and reports", async () => {
    const run = await go("hello");
    expect(run).toMatchObject({ exitCode: 0, sessionId: "fake-1", isError: false });
    expect(run.finalText).toBe(`Did it in ${dir.split("/").pop()}, runner=1`);
  });
  it("passes BLOCKED through", async () => {
    expect((await go("please deploy to prod")).finalText).toMatch(/^BLOCKED:/);
  });
  it("stops when aborted (pause / kill switch)", async () => {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 300);
    const t0 = Date.now();
    const run = await go("SLOW", ctl.signal);
    expect(run.aborted).toBe(true);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it("reports a missing binary", async () => {
    const run = await go("x", undefined, { ...cfg, claude_bin: join(dir, "nope") });
    expect(run.isError).toBe(true);
    expect(run.finalText).toMatch(/ENOENT|exited/);
  });
});

describe("worktrees per task thread", () => {
  const root = mkdtempSync(join(tmpdir(), "ak-wt-"));
  const oldData = process.env.XDG_DATA_HOME;
  const repo = "ana/shop-app";
  beforeAll(() => {
    process.env.XDG_DATA_HOME = join(root, "data");
    const remote = join(root, "remote.git");
    const seed = join(root, "seed");
    git(root, "init", "-q", "--bare", "-b", "main", remote);
    git(root, "init", "-q", "-b", "main", seed);
    git(seed, "config", "user.email", "t@example.com");
    git(seed, "config", "user.name", "t");
    writeFileSync(join(seed, "README.md"), "hi");
    git(seed, "add", ".");
    git(seed, "commit", "-qm", "init");
    git(seed, "push", "-q", remote, "main");
    // Stand-in for the managed clone the runner would make from GitHub.
    mkdirSync(join(clonePath(repo), ".."), { recursive: true });
    git(root, "clone", "-q", remote, clonePath(repo));
  });
  afterAll(() => {
    process.env.XDG_DATA_HOME = oldData;
  });

  it("gives each thread its own worktree and branch, reused for follow-ups", () => {
    const a = ensureWorktree("lee-claude", repo, 7);
    expect(a.created).toBe(true);
    expect(a.branch).toBe("ak/lee-claude/t7");
    expect(a.base).toBe("main");
    expect(existsSync(join(a.path, "README.md"))).toBe(true);
    expect(git(a.path, "branch", "--show-current")).toBe("ak/lee-claude/t7");

    const again = ensureWorktree("lee-claude", repo, 7);
    expect(again).toMatchObject({ path: a.path, created: false });

    const b = ensureWorktree("lee-codex", repo, 7);
    expect(b.path).not.toBe(a.path);
  });

  it("keeps a renamed branch on follow-ups", () => {
    const a = ensureWorktree("lee-claude", repo, 8);
    git(a.path, "branch", "-m", "zones-api");
    expect(ensureWorktree("lee-claude", repo, 8).branch).toBe("zones-api");
  });

  it("prunes only old, clean, fully pushed worktrees", () => {
    const clean = ensureWorktree("pruner", repo, 1);
    const dirty = ensureWorktree("pruner", repo, 2);
    writeFileSync(join(dirty.path, "wip.txt"), "unsaved");
    const old = new Date(Date.now() - 30 * 86400_000);
    utimesSync(clean.path, old, old);
    utimesSync(dirty.path, old, old);
    expect(pruneWorktrees("pruner", 14)).toBe(1);
    expect(existsSync(clean.path)).toBe(false);
    expect(existsSync(dirty.path)).toBe(true);
  });
});

describe("pre-push guard", () => {
  const push = (cwd: string, env: Record<string, string>, ...args: string[]) =>
    spawnSync("git", ["push", ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });

  it("blocks agents from protected branches and force-pushes, not humans", () => {
    const root = mkdtempSync(join(tmpdir(), "ak-hook-"));
    const remote = join(root, "remote.git");
    const ws = join(root, "ws");
    git(root, "init", "-q", "--bare", remote);
    git(root, "init", "-q", "-b", "main", ws);
    git(ws, "config", "user.email", "t@example.com");
    git(ws, "config", "user.name", "t");
    git(ws, "remote", "add", "origin", remote);
    writeFileSync(join(ws, "a.txt"), "1");
    git(ws, "add", ".");
    git(ws, "commit", "-qm", "one");
    git(ws, "push", "-q", "origin", "main");

    expect(installHook(ws, ["main", "prod"])).toBe("installed");
    expect(installHook(ws, ["main", "prod"])).toBe("updated");

    const agent = { AUTOKOLAB_RUNNER: "1" };
    git(ws, "checkout", "-qb", "feature");
    writeFileSync(join(ws, "a.txt"), "2");
    git(ws, "commit", "-qam", "two");
    expect(push(ws, agent, "origin", "feature").status).toBe(0);
    const toMain = push(ws, agent, "origin", "feature:main");
    expect(toMain.status).not.toBe(0);
    expect(toMain.stderr).toMatch(/protected branch 'main'/);

    git(ws, "reset", "-q", "--hard", "HEAD~1");
    writeFileSync(join(ws, "b.txt"), "3");
    git(ws, "add", ".");
    git(ws, "commit", "-qm", "rewrite");
    const forced = push(ws, agent, "--force", "origin", "feature");
    expect(forced.status).not.toBe(0);
    expect(forced.stderr).toMatch(/force-push/);

    expect(push(ws, {}, "--force", "origin", "feature").status).toBe(0);
  });
});
