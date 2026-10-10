import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
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

const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);

/**
 * `agentRoot`: this agent's worktrees. If the branch is already checked out in one of them (say a
 * room thread made it and a ticket now continues it), that worktree lets go of it when it has
 * nothing unsaved, or is used as is when it does, instead of `git worktree add` failing.
 */
export function attachWorktree(clone: string, path: string, branch: string, agentRoot: string): Worktree {
  const base = defaultBranch(clone);
  if (existsSync(join(path, ".git"))) {
    // A follow-up: bring in what others have pushed since, without touching the work.
    try {
      git(path, "fetch", "--quiet", "--prune", "origin");
    } catch {
      /* offline: work from what we have */
    }
    return { path, branch: currentBranch(path) ?? branch, base, created: false };
  }
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
    if (git(o, "status", "--porcelain")) return { path: o, branch, base, created: false };
    git(o, "switch", "--quiet", "--detach");
  }
  if (has(`refs/heads/${branch}`)) git(clone, "worktree", "add", path, branch);
  else if (has(`refs/remotes/origin/${branch}`)) git(clone, "worktree", "add", "-b", branch, path, `origin/${branch}`);
  else git(clone, "worktree", "add", "-b", branch, path, `origin/${base}`);
  return { path, branch, base, created: true };
}

/** The latest commit in a worktree: its id and first line. */
export function headCommit(path: string): { sha: string; subject: string } | null {
  try {
    const [sha, ...subject] = git(path, "log", "-1", "--format=%H %s").split(" ");
    return { sha, subject: subject.join(" ") };
  } catch {
    return null;
  }
}

export function currentBranch(path: string): string | null {
  try {
    return git(path, "branch", "--show-current") || null;
  } catch {
    return null;
  }
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
  for (const repoDir of readdirSync(root)) {
    for (const t of readdirSync(join(root, repoDir))) {
      const path = join(root, repoDir, t);
      try {
        if (statSync(path).mtimeMs > cutoff) continue;
        if (git(path, "status", "--porcelain")) continue;
        if (git(path, "rev-list", "HEAD", "--not", "--remotes")) continue;
        const clone = git(path, "rev-parse", "--path-format=absolute", "--git-common-dir").replace(/\/\.git$/, "");
        git(clone, "worktree", "remove", path);
        removed++;
      } catch {
        /* leave anything we can't judge */
      }
    }
  }
  return removed;
}
