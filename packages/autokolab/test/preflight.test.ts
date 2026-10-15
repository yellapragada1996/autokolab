import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { envStopKind } from "../src/core/projects.js";
import { trustedGit, worktreeGitDir } from "../src/runner/repos.js";
import {
  PREFLIGHT_PASS_TTL_MS,
  PREFLIGHT_RETRY_MS,
  PreflightCache,
  checkPreflight,
  preflightDue,
  preflightQuestion,
  type PreflightHold,
  type PreflightIo,
  type PreflightKind,
} from "../src/runner/preflight.js";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A preflight io that passes everything, recording each command; override one field to fail a check. */
const io = (over: Partial<PreflightIo> = {}): PreflightIo & { calls: string[][] } => {
  const calls: string[][] = [];
  return {
    git: (_cwd, ...args) => {
      calls.push(args);
      return "";
    },
    hasGh: false,
    gh: () => ({ ok: true, out: "", err: "" }),
    token: () => "abc123",
    calls,
    ...over,
  };
};

const fail = (what: string) => () => {
  throw new Error(what);
};

describe("the preflight before a build starts (AK-153)", () => {
  it("passes when git writes, GitHub is reachable and setup succeeded", () => {
    const i = io();
    expect(checkPreflight(i, "/w")).toEqual({ ok: true });
    // A temp ref is created and removed, then GitHub is asked over origin.
    expect(i.calls).toEqual([
      ["update-ref", "refs/autokolab-preflight/abc123", "HEAD"],
      ["update-ref", "-d", "refs/autokolab-preflight/abc123"],
      ["ls-remote", "--heads", "origin"],
    ]);
  });

  it("fails as env_setup first when the setup script failed, without running anything", () => {
    const i = io();
    expect(checkPreflight(i, "/w", "npm ERR! network down")).toEqual({ ok: false, kind: "env_setup", why: "npm ERR! network down" });
    expect(i.calls).toEqual([]);
  });

  it("fails as env_git when the Git folder can't be written", () => {
    const i = io({ git: fail("fatal: unable to create '/w/.git/index.lock': Read-only file system") });
    expect(checkPreflight(i, "/w")).toEqual({ ok: false, kind: "env_git", why: "fatal: unable to create '/w/.git/index.lock': Read-only file system" });
  });

  it("fails as env_network when GitHub can't be reached, and still removes the temp ref", () => {
    const i = io({
      git: (cwd, ...args) => {
        i.calls.push(args);
        if (args[0] === "ls-remote") throw new Error("fatal: unable to access 'https://github.com/a/b/': Could not resolve host: github.com");
        return "";
      },
    });
    expect(checkPreflight(i, "/w")).toMatchObject({ ok: false, kind: "env_network" });
    expect(i.calls.map((c) => c[0])).toEqual(["update-ref", "update-ref", "ls-remote"]);
  });

  it("fails as env_auth when gh isn't signed in, and only checks gh when it's installed", () => {
    const g = io({ hasGh: true, gh: () => ({ ok: false, out: "", err: "To get started with GitHub CLI, please run: gh auth login" }) });
    expect(checkPreflight(g, "/w")).toEqual({ ok: false, kind: "env_auth", why: "To get started with GitHub CLI, please run: gh auth login" });

    let checked = false;
    const noGh = io({ hasGh: false, gh: () => ((checked = true), { ok: true, out: "", err: "" }) });
    expect(checkPreflight(noGh, "/w")).toEqual({ ok: true });
    expect(checked).toBe(false);
  });

  it("writes one plain sentence per failure class for the machine's owner", () => {
    const kinds: PreflightKind[] = ["env_git", "env_network", "env_auth", "env_setup"];
    for (const kind of kinds) {
      const q = preflightQuestion("a-codex", "ana", kind);
      expect(q).toMatch(/^a-codex's .+; ana needs to fix its settings, and I'll retry\.$/);
      // Recognised again by the AK-149 stop detector, so the lead never triages it.
      expect(envStopKind(q), kind).not.toBeNull();
    }
    expect(preflightQuestion("a-codex", "ana", "env_git")).toContain("can't write to git");
    expect(preflightQuestion("a-codex", "ana", "env_network")).toContain("can't reach GitHub");
    expect(preflightQuestion("a-codex", "ana", "env_auth")).toContain("gh isn't signed in");
    expect(preflightQuestion("a-codex", "ana", "env_setup")).toContain("setup script failed");
  });
});

describe("caching a passing preflight (AK-153)", () => {
  it("trusts a pass for its window, and forgets it after", () => {
    const cache = new PreflightCache();
    expect(cache.fresh("/w")).toBe(false);
    cache.pass("/w", 1000);
    expect(cache.fresh("/w", 1000 + PREFLIGHT_PASS_TTL_MS - 1)).toBe(true);
    expect(cache.fresh("/w", 1000 + PREFLIGHT_PASS_TTL_MS)).toBe(false);
    expect(cache.fresh("/other", 2000)).toBe(false);
    cache.pass("/w", 2000);
    cache.clear("/w");
    expect(cache.fresh("/w", 2001)).toBe(false);
  });
});

describe("retrying held builds without the model (AK-153)", () => {
  const hold = (until: number): PreflightHold => ({ project: "p", key: "AK-1", until, kind: "env_network", question: "q" });

  it("picks only the holds whose ten minutes are up", () => {
    const holds = { a: hold(1000), b: hold(9000) };
    expect(preflightDue(holds, 500)).toEqual([]);
    expect(preflightDue(holds, 1000)).toEqual(["a"]);
    expect(preflightDue(holds, 10_000)).toEqual(["a", "b"]);
    expect(PREFLIGHT_RETRY_MS).toBe(10 * 60_000);
  });
});

describe("the preflight against a real worktree (AK-153)", () => {
  let root: string;
  let remote: string;
  let clone: string;
  let wt: string;

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "ak-preflight-")));
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
    git(clone, "worktree", "add", "-q", "-b", "ak-1-work", wt, "origin/main");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("passes against a real clone and leaves no temp ref behind", () => {
    const gitRun = trustedGit(worktreeGitDir(clone, wt)!);
    const real: PreflightIo = { git: gitRun, hasGh: false, gh: () => ({ ok: true, out: "", err: "" }), token: () => "test" };
    expect(checkPreflight(real, wt)).toEqual({ ok: true });
    expect(git(clone, "for-each-ref", "--format=%(refname)", "refs/autokolab-preflight/")).toBe("");
  });

  it("fails as env_network when origin can't be reached", () => {
    const gitRun = trustedGit(worktreeGitDir(clone, wt)!);
    const real: PreflightIo = { git: gitRun, hasGh: false, gh: () => ({ ok: true, out: "", err: "" }), token: () => "test" };
    git(wt, "remote", "set-url", "origin", join(root, "gone.git"));
    try {
      expect(checkPreflight(real, wt)).toMatchObject({ ok: false, kind: "env_network" });
    } finally {
      git(wt, "remote", "set-url", "origin", remote);
    }
  });
});
