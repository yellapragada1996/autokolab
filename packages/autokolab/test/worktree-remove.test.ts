import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `pruneWorktrees` ends with `git worktree remove <path>`, run from the clone. These pin down that
// Git itself never uses Git data an agent planted in that folder (AK-47 review follow-up).
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

describe("git worktree remove, run from the clone", () => {
  let root: string;
  let clone: string;
  let script: string;
  let proof: string;

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "ak-wtremove-")));
    clone = join(root, "clone");
    git(root, "init", "-q", "-b", "main", clone);
    git(clone, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
    proof = join(root, "proof");
    script = join(root, "evil.sh");
    writeFileSync(script, `#!/bin/sh\ntouch ${JSON.stringify(proof)}\n`, { mode: 0o755 });
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const remove = (path: string) => spawnSync("git", ["worktree", "remove", path], { cwd: clone, encoding: "utf8" });

  it("refuses a folder whose .git link was replaced by a repository, without running its settings or hooks", () => {
    const path = join(root, "wa");
    git(clone, "worktree", "add", "-q", "--detach", path);
    rmSync(join(path, ".git"), { recursive: true, force: true });
    git(path, "init", "-q");
    git(path, "config", "core.fsmonitor", script);
    writeFileSync(join(path, ".git", "hooks", "post-checkout"), `#!/bin/sh\ntouch ${JSON.stringify(proof)}\n`, { mode: 0o755 });
    // It works: plain Git in that folder runs the program.
    git(path, "status");
    expect(existsSync(proof)).toBe(true);
    rmSync(proof);

    const r = remove(path);
    expect(r.status).not.toBe(0);
    expect(existsSync(path)).toBe(true);
    expect(existsSync(proof)).toBe(false);
  });

  it("refuses a folder whose .git link points somewhere else, without running that repository's settings", () => {
    const path = join(root, "wb");
    const evil = join(root, "evil");
    git(clone, "worktree", "add", "-q", "--detach", path);
    git(root, "init", "-q", evil);
    git(evil, "config", "core.fsmonitor", script);
    writeFileSync(join(path, ".git"), `gitdir: ${join(evil, ".git")}\n`);

    const r = remove(path);
    expect(r.status).not.toBe(0);
    expect(existsSync(path)).toBe(true);
    expect(existsSync(proof)).toBe(false);
  });

  it("removes an untouched worktree", () => {
    const path = join(root, "wc");
    git(clone, "worktree", "add", "-q", "--detach", path);
    expect(remove(path).status).toBe(0);
    expect(existsSync(path)).toBe(false);
  });
});
