import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseRunnerConfig } from "../src/runner/config.js";
import { codexInvocation, gitCommonDir } from "../src/runner/engines.js";
import { buildTicketPrompt } from "../src/runner/prompt.js";
import { SHIP_FAILED_PREFIX, looksPrivate, plainGitError, realIo, ship, shipBody, shipNeedsHuman, shipPlan, worktreeFacts, type ShipFacts, type ShipIo } from "../src/runner/ship.js";

const AID = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const facts = (over: Partial<ShipFacts> = {}): ShipFacts => ({ declaredReview: true, hasPr: false, dirty: false, ahead: 1, branch: "ak-33-switch", base: "main", protectedBranches: ["main", "prod"], ...over });

describe("what the runner delivers for an agent (AK-46)", () => {
  it("acts only when the agent said the work is ready and there's no pull request", () => {
    expect(shipPlan(facts({ declaredReview: false }))).toEqual({ skip: "not_asked" });
    expect(shipPlan(facts({ hasPr: true }))).toEqual({ skip: "has_pr" });
  });
  it("pushes and opens the pull request when the agent committed", () => {
    expect(shipPlan(facts())).toEqual({ steps: ["push", "open_pr"] });
  });
  it("commits first when changes are left uncommitted", () => {
    expect(shipPlan(facts({ dirty: true, ahead: 0 }))).toEqual({ steps: ["commit", "push", "open_pr"] });
    expect(shipPlan(facts({ dirty: true, ahead: 2 }))).toEqual({ steps: ["commit", "push", "open_pr"] });
  });
  it("does nothing when there's nothing to deliver", () => {
    expect(shipPlan(facts({ ahead: 0 }))).toEqual({ skip: "nothing" });
  });
  it("never pushes the default or a protected branch", () => {
    expect(shipPlan(facts({ branch: "main" }))).toEqual({ skip: "protected" });
    expect(shipPlan(facts({ branch: "prod" }))).toEqual({ skip: "protected" });
    expect(shipPlan(facts({ branch: "trunk", base: "trunk", protectedBranches: [] }))).toEqual({ skip: "protected" });
  });
  it("knows a local secret file from an example", () => {
    for (const p of [".env", "apps/site/.env.local", "certs/server.pem", "deploy/id_ed25519", "x.key"]) expect(looksPrivate(p), p).toBe(true);
    for (const p of [".env.example", "config/.env.sample", "src/env.ts", "docs/keys.md", "src/monkey.ts"]) expect(looksPrivate(p), p).toBe(false);
  });
  it("says in plain words which step failed", () => {
    const where = "on lee's machine";
    expect(shipNeedsHuman("push", "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.", where)).toBe(
      `${SHIP_FAILED_PREFIX} I couldn't push the branch. Git on lee's machine isn't signed in to GitHub. Comment here once it's fixed and I'll try again.`,
    );
    expect(shipNeedsHuman("open_pr", "To get started with GitHub CLI, please run:  gh auth login", where)).toContain("I couldn't open the pull request. gh on lee's machine isn't signed in to GitHub");
    expect(plainGitError("fatal: unable to access 'https://github.com/a/b/': Could not resolve host: github.com", where)).toBe("GitHub couldn't be reached on lee's machine.");
    expect(plainGitError(" ! [rejected] x -> x (fetch first)", where)).toBe("GitHub has commits on this branch that this machine doesn't.");
    expect(plainGitError("fatal: something odd happened", where)).toBe("something odd happened.");
    expect(plainGitError("", where)).toBe("git failed without saying why.");
  });
  it("writes a pull request description from what the agent said", () => {
    const body = shipBody("lee-codex", "SH-2", "Uploads retry on their own", "Added retries.\nTests pass.");
    expect(body.startsWith("Uploads retry on their own\n\nAdded retries.\nTests pass.\n\n---\n\n")).toBe(true);
    expect(body).toContain("Opened for SH-2 by lee-codex's runner");
    expect(shipBody("lee-codex", "SH-2", undefined, "").startsWith("---")).toBe(true);
  });
});

describe("delivering from a real worktree", () => {
  let root: string, remote: string, clone: string, wt: string;
  const ghCalls: string[][] = [];
  let open: string | null = null;
  let ghCreate: { ok: boolean; out: string; err: string } = { ok: true, out: "https://github.com/ana/shop/pull/7\n", err: "" };
  const io: ShipIo = {
    git: realIo.git,
    gh: (args) => {
      ghCalls.push(args);
      if (args[1] === "list") return { ok: true, out: JSON.stringify(open ? [{ url: open }] : []), err: "" };
      return ghCreate;
    },
  };
  const job = (steps: ("commit" | "push" | "open_pr")[]) => ({ path: wt, repo: "ana/shop", branch: "sh-2-retries", base: "main", title: "SH-2: Add retries", body: "body", steps });

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "ak-ship-")));
    remote = join(root, "remote.git");
    clone = join(root, "clone");
    wt = join(root, "wt");
    git(root, "init", "-q", "--bare", "-b", "main", remote);
    git(root, "clone", "-q", remote, clone);
    for (const [k, v] of [["user.email", "t@example.com"], ["user.name", "T"], ["commit.gpgsign", "false"]]) git(clone, "config", k, v);
    writeFileSync(join(clone, "README.md"), "hi\n");
    git(clone, "add", "-A");
    git(clone, "commit", "-q", "-m", "first");
    git(clone, "push", "-q", "-u", "origin", "main");
    git(clone, "worktree", "add", "-q", "-b", "sh-2-retries", wt, "origin/main");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("sees nothing to deliver in a fresh worktree", () => {
    expect(worktreeFacts(io, wt, "main")).toEqual({ dirty: false, ahead: 0 });
  });

  it("refuses to commit local secrets, and leaves the work as it was", () => {
    writeFileSync(join(wt, "retry.ts"), "export const retries = 3;\n");
    writeFileSync(join(wt, ".env"), "TOKEN=not-a-real-one\n");
    const r = ship(io, job(["commit", "push", "open_pr"]));
    expect(r).toMatchObject({ ok: false, step: "commit" });
    expect(!r.ok && r.error).toContain(".env");
    expect(git(wt, "diff", "--cached", "--name-only")).toBe("");
    expect(worktreeFacts(io, wt, "main")).toEqual({ dirty: true, ahead: 0 });
    rmSync(join(wt, ".env"));
  });

  it("commits what's left, pushes the branch and opens the pull request", () => {
    expect(worktreeFacts(io, wt, "main")).toEqual({ dirty: true, ahead: 0 });
    ghCalls.length = 0;
    const r = ship(io, job(["commit", "push", "open_pr"]));
    expect(r).toEqual({ ok: true, pr: "https://github.com/ana/shop/pull/7", did: ["commit", "push", "open_pr"] });
    expect(git(wt, "log", "-1", "--format=%s")).toBe("SH-2: Add retries");
    expect(git(remote, "log", "-1", "--format=%s", "sh-2-retries")).toBe("SH-2: Add retries");
    expect(git(remote, "show", "--stat", "--format=", "sh-2-retries")).toContain("retry.ts");
    expect(worktreeFacts(io, wt, "main")).toEqual({ dirty: false, ahead: 1 });
    expect(ghCalls[1]).toEqual(["pr", "create", "--repo", "ana/shop", "--base", "main", "--head", "sh-2-retries", "--title", "SH-2: Add retries", "--body", "body"]);
  });

  it("uses the pull request that's already open for the branch", () => {
    open = "https://github.com/ana/shop/pull/7";
    ghCalls.length = 0;
    expect(ship(io, job(["push", "open_pr"]))).toEqual({ ok: true, pr: open, did: ["push", "open_pr"] });
    expect(ghCalls).toHaveLength(1);
    open = null;
  });

  it("stops at the step that fails and says which", () => {
    ghCreate = { ok: false, out: "", err: "gh: To get started with GitHub CLI, please run:  gh auth login" };
    expect(ship(io, job(["push", "open_pr"]))).toMatchObject({ ok: false, step: "open_pr" });
    ghCreate = { ok: true, out: "Done.\n", err: "" };
    expect(ship(io, job(["push", "open_pr"]))).toMatchObject({ ok: false, step: "open_pr" });
    git(wt, "remote", "set-url", "origin", join(root, "gone.git"));
    writeFileSync(join(wt, "more.ts"), "export {};\n");
    const r = ship(io, job(["commit", "push", "open_pr"]));
    expect(r).toMatchObject({ ok: false, step: "push" });
    expect(git(wt, "log", "-1", "--format=%s")).toBe("SH-2: Add retries"); // the commit stays, ready for the next try
    git(wt, "remote", "set-url", "origin", remote);
  });

  it("lets Codex write the repository's Git folder, so it can commit in a worktree", () => {
    expect(gitCommonDir(wt)).toBe(join(clone, ".git"));
    expect(gitCommonDir(root)).toBeNull();
    const mcp = { command: "/usr/bin/node", args: ["cli.js", "mcp"] };
    const cfg = parseRunnerConfig(`agent_id = "${AID}"\nengine = "codex"`, "lee-codex");
    const want = `sandbox_workspace_write.writable_roots=[${JSON.stringify(join(clone, ".git"))}]`;
    expect(codexInvocation(cfg, mcp, null, wt).args).toContain(want);
    expect(codexInvocation(cfg, mcp, "thread-9", wt).args).toContain(want);
    expect(codexInvocation(cfg, mcp, null, root).args.join(" ")).not.toContain("writable_roots");
    const readOnly = parseRunnerConfig(`agent_id = "${AID}"\nengine = "codex"\n[codex]\nsandbox = "read-only"`, "lee-codex");
    expect(codexInvocation(readOnly, mcp, null, wt).args.join(" ")).not.toContain("writable_roots");
  });
});

describe("the ticket prompt", () => {
  it("tells an agent that can't reach GitHub to leave the work and end with status: review", () => {
    const cfg = parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"`, "lee-claude");
    const p = buildTicketPrompt({ myName: "b", ownerName: "ana", projectName: "Shop", key: "SH-2", brief: "", ticket: "", cfg, worktree: { path: "/tmp/wt", branch: "sh-2-retries", base: "main", created: true }, followUp: false, newComments: null });
    expect(p).toContain("If you can't commit, push or open the pull request from where you run");
    expect(p).toContain("pushes sh-2-retries and opens the pull request for you");
  });
});
