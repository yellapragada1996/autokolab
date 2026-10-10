import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  readState,
  updateNow,
  aheadCheck,
  allIdle,
  autoUpdateOn,
  buildSteps,
  holdAll,
  installDir,
  installRoot,
  isUpstreamRemote,
  rollbackSteps,
  runningAsService,
  statusLine,
  toAnnounce,
  updatable,
  updatedLine,
  type CloneFacts,
  type Hosted,
} from "../src/setup/update.js";

const facts = (extra: Partial<CloneFacts> = {}): CloneFacts => ({
  root: "/home/ana/.autokolab",
  installDir: "/home/ana/.autokolab",
  origin: "https://github.com/yellapragada1996/autokolab.git",
  branch: "main",
  dirty: false,
  ...extra,
});

describe("which copy updates itself", () => {
  it("finds the repo folder from the built cli", () => {
    expect(installRoot("/home/ana/.autokolab/packages/autokolab/dist/cli.js")).toBe("/home/ana/.autokolab");
  });
  it("uses ~/.autokolab unless AUTOKOLAB_DIR says otherwise", () => {
    expect(installDir({}, "/home/ana")).toBe("/home/ana/.autokolab");
    expect(installDir({ AUTOKOLAB_DIR: "/opt/ak" }, "/home/ana")).toBe("/opt/ak");
  });
  it("knows the public repo by https or ssh", () => {
    expect(isUpstreamRemote("https://github.com/yellapragada1996/autokolab.git")).toBe(true);
    expect(isUpstreamRemote("https://github.com/Yellapragada1996/AutoKolab")).toBe(true);
    expect(isUpstreamRemote("git@github.com:yellapragada1996/autokolab.git")).toBe(true);
    expect(isUpstreamRemote("https://github.com/someone/autokolab.git")).toBe(false);
    expect(isUpstreamRemote("https://github.com/yellapragada1996/autokolab-fork.git")).toBe(false);
  });
  it("updates only the installed clone of the public repo, on main, unedited", () => {
    expect(updatable(facts())).toEqual({ ok: true });
    expect(updatable(facts({ root: "/home/ana/Documents/Projects/AutoKolab" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/developer copy/) });
    expect(updatable(facts({ origin: null }))).toMatchObject({ ok: false, reason: expect.stringMatching(/isn't a git clone/) });
    expect(updatable(facts({ origin: "https://github.com/someone/else.git" }))).toMatchObject({ ok: false });
    expect(updatable(facts({ branch: "ak-31-x" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/branch ak-31-x/) });
    expect(updatable(facts({ dirty: true }))).toMatchObject({ ok: false, reason: expect.stringMatching(/local changes/) });
  });
});

describe("is there an update", () => {
  it("compares with origin/main", () => {
    expect(aheadCheck(0, 0)).toBe("up-to-date");
    expect(aheadCheck(2, 0)).toBe("up-to-date");
    expect(aheadCheck(0, 3)).toBe("behind");
    expect(aheadCheck(1, 3)).toBe("diverged");
  });
});

describe("applying only when idle", () => {
  const runner = (idle: boolean) => {
    const r = { held: false, idle: () => idle, holdIfIdle: () => (idle ? (r.held = true) : false), release: () => void (r.held = false), note: () => undefined, stop: async () => undefined };
    return r satisfies Hosted & { idle(): boolean };
  };
  it("is idle only when no runner has a run in progress", () => {
    expect(allIdle([runner(true), runner(true)])).toBe(true);
    expect(allIdle([runner(true), runner(false)])).toBe(false);
    expect(allIdle([])).toBe(true);
  });
  it("holds every runner or none", () => {
    const all = [runner(true), runner(true)];
    expect(holdAll(all)).toBe(true);
    expect(all.every((r) => r.held)).toBe(true);
    const some = [runner(true), runner(false), runner(true)];
    expect(holdAll(some)).toBe(false);
    expect(some.some((r) => r.held)).toBe(false);
  });
  it("only restarts itself when it is the background service", () => {
    expect(runningAsService({ AUTOKOLAB_SERVICE: "1" })).toBe(true);
    expect(runningAsService({ XPC_SERVICE_NAME: "com.autokolab.runner" })).toBe(true);
    expect(runningAsService({})).toBe(false);
  });
});

describe("building and going back", () => {
  it("builds like install.sh, without opening the app", () => {
    expect(buildSteps("npm")).toEqual([
      ["npm", "ci", "--no-audit", "--no-fund", "--loglevel=error"],
      ["npm", "run", "build", "--silent"],
    ]);
    expect(buildSteps("npm").flat().join(" ")).not.toMatch(/install\.sh|open/);
  });
  it("rolls back to the previous commit and rebuilds it", () => {
    const steps = rollbackSteps("abc1234def", "npm");
    expect(steps[0]).toEqual(["git", "reset", "--hard", "--quiet", "abc1234def"]);
    expect(steps.slice(1)).toEqual(buildSteps("npm"));
  });
});

describe("updating a real clone", () => {
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const dir = mkdtempSync(join(tmpdir(), "ak-update-"));
  const upstream = join(dir, "upstream");
  const clone = join(dir, "clone");
  // A tiny project whose build fails while a file named BROKEN exists.
  const pkg = { name: "fake", version: "1.0.0", scripts: { build: `node -e "process.exit(require('fs').existsSync('BROKEN') ? 1 : 0)"` } };
  const lock = { name: "fake", version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name: "fake", version: "1.0.0" } } };
  const commit = (msg: string, files: Record<string, string>) => {
    for (const [f, body] of Object.entries(files)) writeFileSync(join(upstream, f), body);
    git(upstream, "add", "-A");
    git(upstream, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", msg);
  };

  beforeAll(() => {
    process.env.XDG_STATE_HOME = join(dir, "state");
    mkdirSync(upstream);
    git(upstream, "init", "-q", "-b", "main");
    commit("one", { "package.json": JSON.stringify(pkg), "package-lock.json": JSON.stringify(lock) });
    git(dir, "clone", "-q", upstream, clone);
  });

  it("is up to date when origin/main hasn't moved", async () => {
    expect(await updateNow({ root: clone, anyClone: true })).toMatchObject({ kind: "up-to-date" });
  });
  it("waits while a run is in progress, without touching anything", async () => {
    commit("two", { "a.txt": "2" });
    const before = git(clone, "rev-parse", "HEAD");
    expect(await updateNow({ root: clone, anyClone: true, claimIdle: () => false })).toMatchObject({ kind: "waiting" });
    expect(git(clone, "rev-parse", "HEAD")).toBe(before);
  });
  it("pulls and builds when idle", async () => {
    const r = await updateNow({ root: clone, anyClone: true, claimIdle: () => true });
    expect(r).toMatchObject({ kind: "updated", version: git(upstream, "rev-parse", "--short", "HEAD") });
    expect(readState().version).toBe(git(upstream, "rev-parse", "--short", "HEAD"));
  });
  it("goes back to the previous commit when the build fails", async () => {
    const before = git(clone, "rev-parse", "HEAD");
    commit("three", { BROKEN: "yes" });
    const r = await updateNow({ root: clone, anyClone: true, claimIdle: () => true });
    expect(r).toMatchObject({ kind: "failed", reason: expect.stringMatching(/build.*failed.*Still running/s) });
    expect(git(clone, "rev-parse", "HEAD")).toBe(before);
    expect(existsSync(join(clone, "BROKEN"))).toBe(false);
    expect(readState()).toMatchObject({ failed: true });
  });
  it("stops when local commits mean it can't fast-forward", async () => {
    writeFileSync(join(clone, "local.txt"), "mine");
    git(clone, "add", "-A");
    git(clone, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "local");
    const head = git(clone, "rev-parse", "HEAD");
    expect(await updateNow({ root: clone, anyClone: true, claimIdle: () => true })).toMatchObject({ kind: "failed", reason: expect.stringMatching(/can't fast-forward/) });
    expect(git(clone, "rev-parse", "HEAD")).toBe(head);
  });
});

describe("reporting", () => {
  it("announces each version once", () => {
    expect(toAnnounce({})).toBeNull();
    expect(toAnnounce({ version: "d585ddd" })).toBe("d585ddd");
    expect(toAnnounce({ version: "d585ddd", announced: "d585ddd" })).toBeNull();
    expect(toAnnounce({ version: "9806e10", announced: "d585ddd" })).toBe("9806e10");
  });
  it("says it in plain English", () => {
    expect(updatedLine("raghavendra", "d585ddd", "darwin")).toBe("Updated AutoKolab on raghavendra's Mac to d585ddd.");
    expect(updatedLine("jamesblack", "d585ddd", "linux")).toBe("Updated AutoKolab on jamesblack's Linux computer to d585ddd.");
  });
  it("is on unless turned off", () => {
    expect(autoUpdateOn({})).toBe(true);
    expect(autoUpdateOn({ auto_update: true })).toBe(true);
    expect(autoUpdateOn({ auto_update: false })).toBe(false);
  });
  it("shows the last update in status", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(statusLine(true, { version: "d585ddd", updated_at: "2026-10-09T10:00:00Z" }, now)).toBe("Updates: automatic (last: d585ddd, 2h ago)");
    expect(statusLine(true, {}, now)).toBe("Updates: automatic (none yet)");
    expect(statusLine(false, {}, now)).toMatch(/^Updates: off/);
  });
});
