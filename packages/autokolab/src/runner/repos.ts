import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { dataDir, readConfigFile } from "../core/config.js";
import { which } from "../setup/agents.js";

// The runner keeps its own clone of each repo and gives every task thread its own git worktree
// and branch. Agents never share a working copy, and the owner's own checkouts are never touched.
//   ~/.local/share/autokolab/repos/<owner>/<name>                 managed clone
//   ~/.local/share/autokolab/worktrees/<agent>/<owner>-<name>/t<thread>

const NON_INTERACTIVE = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: NON_INTERACTIVE, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);

// The runner isn't sandboxed, and a sandboxed agent can write anything inside its own worktree,
// including replacing the `.git` link with Git data of its own (hooks, core.fsmonitor, aliases,
// core.sshCommand). So Git is never run in a worktree through that link: it's pointed at the
// worktree's real Git folder (GIT_DIR), found from the clone's own records, which the agent can't
// write. `git()` above is for the clone only.

/**
 * The Git folder for one of the clone's worktrees, read from the clone's own records
 * (`<clone>/.git/worktrees/<name>/gitdir`), which an agent can't write. Null if `path` isn't one.
 */
export function worktreeGitDir(clone: string, path: string): string | null {
  const root = join(clone, ".git", "worktrees");
  if (!existsSync(root)) return null;
  for (const name of readdirSync(root)) {
    try {
      const link = readFileSync(join(root, name, "gitdir"), "utf8").trim(); // "<worktree>/.git"
      if (real(dirname(link)) === real(path)) return join(root, name);
    } catch {
      // Not a worktree record.
    }
  }
  return null;
}

/** Git run against a known Git folder, whatever the `.git` link inside the working copy says. */
export function trustedGit(gitDir: string): (cwd: string, ...args: string[]) => string {
  return (cwd, ...args) => {
    try {
      const env = { ...NON_INTERACTIVE, GIT_DIR: gitDir, GIT_WORK_TREE: cwd };
      // Only the end is trimmed: `status --porcelain` lines can start with a space that matters.
      return execFileSync("git", args, { cwd, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }).trimEnd();
    } catch (e) {
      const x = e as { stderr?: string; stdout?: string; message: string };
      throw new Error((x.stderr || x.stdout || x.message).toString().trim());
    }
  };
}

export const NOT_A_WORKTREE = "not one of the runner's working copies";

/** Git for one of the clone's worktrees. Throws, without running Git, if the clone has no record of the folder. */
function worktreeGit(clone: string, path: string): (...args: string[]) => string {
  const gitDir = worktreeGitDir(clone, path);
  if (!gitDir) throw new Error(`${path} is ${NOT_A_WORKTREE}.`);
  const run = trustedGit(gitDir);
  return (...args) => run(path, ...args);
}

export function cloneUrls(repo: string): string[] {
  return [`git@github.com:${repo}.git`, `https://github.com/${repo}.git`];
}

/** Which way (if any) this machine can read the repo: "gh", an SSH/HTTPS URL, or null. */
export function findAccess(repo: string): string | null {
  if (which("gh") && spawnSync("gh", ["repo", "view", repo, "--json", "name"], { stdio: "ignore", timeout: 20_000 }).status === 0) return "gh";
  for (const url of cloneUrls(repo)) {
    const r = spawnSync("git", ["ls-remote", "--heads", url], { env: NON_INTERACTIVE, stdio: "ignore", timeout: 20_000 });
    if (r.status === 0) return url;
  }
  return null;
}

export function clonePath(repo: string): string {
  return join(dataDir(), "repos", ...repo.split("/"));
}

/** This computer's copy of the repo: the one chosen in setup, else a managed clone made on first use. */
export function ensureClone(repo: string): string {
  const chosen = readConfigFile().repos?.[repo];
  if (chosen && existsSync(join(chosen, ".git"))) return chosen;
  const path = clonePath(repo);
  if (existsSync(join(path, ".git"))) return path;
  mkdirSync(dirname(path), { recursive: true });
  const access = findAccess(repo);
  if (!access) {
    throw new Error(`This machine can't read github.com/${repo}. Accept the GitHub invite to the repo (or log in with \`gh auth login\`), then try again.`);
  }
  if (access === "gh") execFileSync("gh", ["repo", "clone", repo, path, "--", "--quiet"], { env: NON_INTERACTIVE, stdio: "ignore" });
  else execFileSync("git", ["clone", "--quiet", access, path], { env: NON_INTERACTIVE, stdio: "ignore" });
  return path;
}

export function defaultBranch(clone: string): string {
  try {
    return git(clone, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
  } catch {
    try {
      git(clone, "remote", "set-head", "origin", "--auto");
      return git(clone, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
    } catch {
      return "main";
    }
  }
}

export interface Worktree {
  /** The clone this is a worktree of: where its real Git folder is. */
  clone: string;
  path: string;
  branch: string;
  base: string;
  created: boolean;
}

export function worktreePath(agent: string, repo: string, threadRoot: number): string {
  return join(dataDir(), "worktrees", agent, repo.replace("/", "-"), `t${threadRoot}`);
}

/** The worktree for this agent's task thread; follow-ups in the thread reuse it. */
export function ensureWorktree(agent: string, repo: string, threadRoot: number): Worktree {
  return attachWorktree(ensureClone(repo), worktreePath(agent, repo, threadRoot), `ak/${agent}/t${threadRoot}`, join(dataDir(), "worktrees", agent));
}

/** The worktree for one ticket, on the ticket's branch (continuing it if it's already on GitHub). */
export function ensureTicketWorktree(agent: string, repo: string, key: string, branch: string): Worktree {
  return attachWorktree(ensureClone(repo), join(dataDir(), "worktrees", agent, repo.replace("/", "-"), key), branch, join(dataDir(), "worktrees", agent));
}

/** "VV-12" + "Add Google sign-in!" → "vv-12-add-google-sign-in". */
export function ticketBranch(key: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").split("-").slice(0, 6).join("-");
  return `${key.toLowerCase()}${slug ? `-${slug}` : ""}`.slice(0, 60).replace(/-+$/, "");
}

/** Where `branch` is checked out among the clone's worktrees, if anywhere. */
export function worktreeWithBranch(clone: string, branch: string): string | null {
  let path: string | null = null;
  for (const line of git(clone, "worktree", "list", "--porcelain").split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
    else if (line === `branch refs/heads/${branch}` && path) return path;
  }
  return null;
}

/**
 * `agentRoot`: this agent's worktrees. If the branch is already checked out in one of them (say a
 * room thread made it and a ticket now continues it), that worktree lets go of it when it has
 * nothing unsaved, or is used as is when it does, instead of `git worktree add` failing.
 */
export function attachWorktree(clone: string, path: string, branch: string, agentRoot: string): Worktree {
  const base = defaultBranch(clone);
  if (worktreeGitDir(clone, path)) {
    // A follow-up: bring in what others have pushed since, without touching the work.
    try {
      worktreeGit(clone, path)("fetch", "--quiet", "--prune", "origin");
    } catch {
      /* offline: work from what we have */
    }
    return { clone, path, branch: currentBranch(clone, path) ?? branch, base, created: false };
  }
  // A folder that's there but that the clone has no record of isn't a worktree, whatever it holds.
  if (existsSync(path) && readdirSync(path).length) throw new Error(`${path} is ${NOT_A_WORKTREE}. Move or delete that folder, then try again.`);
  try {
    git(clone, "fetch", "--quiet", "--prune", "origin");
  } catch {
    /* work from what we have */
  }
  git(clone, "worktree", "prune");
  mkdirSync(dirname(path), { recursive: true });
  const has = (ref: string) => spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: clone }).status === 0;
  const other = has(`refs/heads/${branch}`) ? worktreeWithBranch(clone, branch) : null;
  if (other) {
    const o = real(other);
    if (!o.startsWith(real(agentRoot) + sep)) {
      throw new Error(`Branch ${branch} is already checked out at ${other}, outside this agent's worktrees. Switch that checkout to another branch, then try again.`);
    }
    const inOther = worktreeGit(clone, o);
    if (inOther("status", "--porcelain")) return { clone, path: o, branch, base, created: false };
    inOther("switch", "--quiet", "--detach");
  }
  if (has(`refs/heads/${branch}`)) git(clone, "worktree", "add", path, branch);
  else if (has(`refs/remotes/origin/${branch}`)) git(clone, "worktree", "add", "-b", branch, path, `origin/${branch}`);
  else git(clone, "worktree", "add", "-b", branch, path, `origin/${base}`);
  return { clone, path, branch, base, created: true };
}

/**
 * Put one of the runner's worktrees at exactly `sha` (a PR's head), detached, with nothing else in
 * it: for reading only, like the lead's review checkout (AK-59). GitHub serves a PR's commits under
 * refs/pull/<n>/head, so this works for PRs from forks too.
 */
export function checkoutCommit(wt: Pick<Worktree, "clone" | "path">, sha: string, pr?: string): void {
  const g = worktreeGit(wt.clone, wt.path);
  const has = () => {
    try {
      g("cat-file", "-e", `${sha}^{commit}`);
      return true;
    } catch {
      return false;
    }
  };
  if (!has() && pr) {
    try {
      g("fetch", "--quiet", "origin", `refs/pull/${pr}/head`);
    } catch {
      /* try the commit itself below */
    }
  }
  if (!has()) g("fetch", "--quiet", "origin", sha);
  g("switch", "--quiet", "--detach", "--discard-changes", sha);
  g("clean", "-fdq");
}

/**
 * What changed from `from` to the commit checked out in a worktree (AK-117). Null, so the whole PR
 * is reviewed instead, when `from` isn't an ancestor (a rebase or force-push), when the new commits
 * include a merge (it brings in other people's changes), or when Git can't say.
 */
export function diffSince(wt: Pick<Worktree, "clone" | "path">, from: string): string | null {
  try {
    const g = worktreeGit(wt.clone, wt.path);
    g("merge-base", "--is-ancestor", from, "HEAD");
    if (g("rev-list", "--merges", `${from}..HEAD`)) return null;
    return g("diff", "--no-color", "--no-ext-diff", from, "HEAD");
  } catch {
    return null;
  }
}

/** The latest commit in a worktree: its id and first line. */
export function headCommit(clone: string, path: string): { sha: string; subject: string } | null {
  try {
    const [sha, ...subject] = worktreeGit(clone, path)("log", "-1", "--format=%H %s").split(" ");
    return { sha, subject: subject.join(" ") };
  } catch {
    return null;
  }
}

export function currentBranch(clone: string, path: string): string | null {
  try {
    return worktreeGit(clone, path)("branch", "--show-current") || null;
  } catch {
    return null;
  }
}

/** Every clone the runner may have made worktrees from: the managed ones and the ones chosen in setup. */
function knownClones(): string[] {
  const clones = Object.values(readConfigFile().repos ?? {});
  const root = join(dataDir(), "repos");
  for (const owner of existsSync(root) ? readdirSync(root) : []) {
    try {
      for (const name of readdirSync(join(root, owner))) clones.push(join(root, owner, name));
    } catch {
      /* not a folder */
    }
  }
  return [...new Set(clones)];
}

/**
 * Remove this agent's worktrees that haven't been touched for `days` and have nothing unsaved:
 * a clean working tree and no commits that aren't on the remote.
 */
export function pruneWorktrees(agent: string, days = 14): number {
  const root = join(dataDir(), "worktrees", agent);
  if (!existsSync(root)) return 0;
  let removed = 0;
  const cutoff = Date.now() - days * 86400_000;
  const clones = knownClones();
  for (const repoDir of readdirSync(root)) {
    for (const t of readdirSync(join(root, repoDir))) {
      const path = join(root, repoDir, t);
      try {
        if (statSync(path).mtimeMs > cutoff) continue;
        // Which clone it belongs to comes from the clones' records, never from the folder itself.
        const clone = clones.find((c) => worktreeGitDir(c, path));
        if (!clone) continue;
        const inPath = worktreeGit(clone, path);
        if (inPath("status", "--porcelain")) continue;
        if (inPath("rev-list", "HEAD", "--not", "--remotes")) continue;
        git(clone, "worktree", "remove", path);
        removed++;
      } catch {
        /* leave anything we can't judge */
      }
    }
  }
  return removed;
}

/**
 * Serialize clone changes across slots AND helper processes on this computer. Git's own locks
 * protect individual commands, but fetch + branch lookup + worktree add must stay together.
 * A live holder never expires during a slow fetch. A dead process's lock can be reclaimed.
 */
export async function withRepoLock<T>(repo: string, fn: () => T | Promise<T>, signal?: AbortSignal): Promise<T> {
  const chosen = readConfigFile().repos?.[repo];
  const clone = chosen && existsSync(join(chosen, ".git")) ? chosen : clonePath(repo);
  return withCloneLock(clone, fn, signal);
}

export async function withCloneLock<T>(clone: string, fn: () => T | Promise<T>, signal?: AbortSignal): Promise<T> {
  // Outside .git so creating the clone itself is protected too.
  const lock = `${real(clone)}.autokolab-lock`;
  mkdirSync(dirname(lock), { recursive: true });
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    if (signal?.aborted) throw new Error("This run was stopped while waiting for the repo.");
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "pid"), String(process.pid));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      // Only one helper reclaims dead holders, and it re-reads the owner under that guard.
      // Otherwise two waiters could both see a dead pid, and the second delete a new live lock.
      const reaper = `${lock}.reclaim`;
      let reclaiming = false;
      try {
        mkdirSync(reaper);
        reclaiming = true;
        let pid = 0;
        try { pid = Number(readFileSync(join(lock, "pid"), "utf8")); } catch { /* holder is writing it */ }
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); }
          catch (err) { if ((err as NodeJS.ErrnoException).code === "ESRCH") rmSync(lock, { recursive: true, force: true }); }
        } else if (Date.now() - statSync(lock).mtimeMs > 30_000) rmSync(lock, { recursive: true, force: true });
      } catch {
        // Reclaiming only does synchronous filesystem calls. Recover its own crash window too.
        if (!reclaiming) {
          try { if (Date.now() - statSync(reaper).mtimeMs > 30_000) rmSync(reaper, { recursive: true, force: true }); } catch { /* released */ }
        }
      } finally {
        if (reclaiming) rmSync(reaper, { recursive: true, force: true });
      }
      if (Date.now() > deadline) throw new Error("Another run kept this repo busy for five minutes. Try again shortly.");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    if (signal?.aborted) throw new Error("This run was stopped while waiting for the repo.");
    return await fn();
  }
  finally { rmSync(lock, { recursive: true, force: true }); }
}
