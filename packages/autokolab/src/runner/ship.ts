import { gh, plainGhError, type BaseMerge } from "./merge.js";
import { trustedGit } from "./repos.js";

// Delivering an agent's work when the agent can't (AK-46). Some agents run in a sandbox that can't
// write the repository's Git data, reach GitHub or use `gh` (Codex on a company account). The runner
// isn't sandboxed and already has the machine's GitHub access, so when an agent says its ticket is
// ready for review and there is no pull request, the runner commits what's left, pushes the branch
// and opens the pull request. The decision is plain code, like the merge decision.
//
// The runner does this outside the sandbox, so nothing the agent could write may steer it:
// - The repository's Git folder (hooks, config) stays read-only for the agent. Codex is not given
//   it as a writable root, which is why the runner commits instead.
// - Git is pointed at that folder directly (GIT_DIR), found from the runner's clone and never from
//   the `.git` link inside the agent's folder, which the agent could have replaced.

export type ShipStep = "commit" | "push" | "open_pr";

export interface ShipFacts {
  /** The agent ended with `status: review`. */
  declaredReview: boolean;
  /**
   * The ticket, or the agent's message, already has a pull request: this is follow-up work for it
   * (AK-66), pushed to the same branch with no new pull request.
   */
  hasPr: boolean;
  /** The worktree has changes that aren't committed. */
  dirty: boolean;
  /** Commits here that GitHub doesn't have: on the branch when it's there, else on the default branch. */
  ahead: number;
  /** Commits on the branch on GitHub that the worktree doesn't have. */
  behind?: number;
  branch: string;
  base: string;
  protectedBranches: string[];
}

export type ShipPlan = { steps: ShipStep[] } | { skip: "not_asked" | "nothing" | "moved" | "protected" };

/** What the runner does for the agent. It only acts when the agent said the work is ready. */
export function shipPlan(f: ShipFacts): ShipPlan {
  if (!f.declaredReview) return { skip: "not_asked" };
  if (!f.dirty && f.ahead <= 0) return { skip: "nothing" };
  // Someone else pushed to the branch: the work has to be put together by hand, never overwritten.
  if ((f.behind ?? 0) > 0) return { skip: "moved" };
  if (f.branch === f.base || f.protectedBranches.includes(f.branch)) return { skip: "protected" };
  return { steps: [...(f.dirty ? (["commit"] as const) : []), "push", ...(f.hasPr ? [] : (["open_pr"] as const))] };
}

/**
 * Whether a finished run moves its ticket to Review. `status: review` does once there's a pull
 * request, whoever pushed, unless the runner's delivery failed. With no ending block, a pull request
 * link in the agent's message does.
 */
export function movesToReview(status: string | undefined, prInMessage: boolean, hasPr: boolean, deliveryFailed: boolean): boolean {
  if (status === "review") return hasPr && !deliveryFailed;
  return !status && prInMessage;
}

/** Files that are never delivered on an agent's behalf: local secrets. Examples and templates are fine. */
export function looksPrivate(path: string): boolean {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  if (/\.(example|sample|template|dist)$/.test(name)) return false;
  return (
    /^\.env(\..+)?$/.test(name) ||
    /^\.(envrc|npmrc|netrc|pypirc|pgpass|git-credentials)$/.test(name) ||
    /\.(pem|p12|pfx|key|tfvars|jks|keystore)$/.test(name) ||
    /^id_(rsa|dsa|ecdsa|ed25519)$/.test(name) ||
    /^(credentials|kubeconfig)$/.test(name) ||
    /^(credentials|secrets?)\.(json|ya?ml|toml|env)$/.test(name)
  );
}

/**
 * Paths from `git status --porcelain -z`: what a commit of everything would add or change (not
 * deletions). `-z` gives the names as they are, with no quoting or escaping to undo.
 */
export function changedPaths(porcelainZ: string): string[] {
  const entries = porcelainZ.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.length <= 3) continue;
    const xy = e.slice(0, 2);
    if (/[RC]/.test(xy)) i++; // a rename or copy is followed by the name it came from
    if (!xy.includes("D")) paths.push(e.slice(3));
  }
  return paths;
}

const STEP_WORDS: Record<ShipStep, string> = {
  commit: "commit the changes",
  push: "push the branch",
  open_pr: "open the pull request",
};

export const SHIP_FAILED_PREFIX = "Couldn't open the pull request:";

/** The "Needs you" note when a step fails. `where`: "on raghavendra's machine". */
export function shipNeedsHuman(step: ShipStep, error: string, where: string): string {
  const why = step === "open_pr" ? plainGhError(error, where) : plainGitError(error, where);
  return `${SHIP_FAILED_PREFIX} I couldn't ${STEP_WORDS[step]}. ${why} Comment here once it's fixed and I'll try again.`.slice(0, 1000);
}

/** git's error, in plain words. */
export function plainGitError(err: string, where: string): string {
  const s = err.trim();
  if (/ENOENT/.test(s)) return `git isn't installed ${where}.`;
  if (/permission denied \(publickey\)|could not read from remote|authentication failed|could not read username/i.test(s)) return `Git ${where} isn't signed in to GitHub.`;
  if (/could not resolve host|network is unreachable|connection timed out|failed to connect/i.test(s)) return `GitHub couldn't be reached ${where}.`;
  if (/non-fast-forward|\[rejected\]|fetch first/i.test(s)) return "GitHub has commits on this branch that this machine doesn't.";
  if (/protected branch|pre-push|hook declined/i.test(s)) return "The push was refused by a branch rule.";
  if (/local secrets/i.test(s)) return s;
  if (/not a git repository|not one of the runner's/i.test(s)) return "This folder is no longer one of the runner's working copies.";
  const line = s.split("\n").find((l) => l.trim() && !/^(hint|remote):?\s*$/i.test(l.trim()))?.trim();
  return line ? `${line.replace(/^(fatal|error):\s*/i, "").slice(0, 300).replace(/\.?$/, ".")}` : "git failed without saying why.";
}

export interface ShipIo {
  /** Runs git in the worktree; throws with git's message on failure. */
  git(cwd: string, ...args: string[]): string;
  gh(args: string[]): { ok: boolean; out: string; err: string };
}

/** Git run against a known Git folder (`trustedGit` in repos.ts), and this machine's `gh`. */
export function trustedIo(gitDir: string): ShipIo {
  return { git: trustedGit(gitDir), gh };
}

/**
 * Brings this machine's copy of the branch on GitHub up to date, so a branch that moved there is
 * seen. False when GitHub has no such branch; throws when GitHub can't be asked.
 */
export function fetchBranch(io: ShipIo, path: string, branch: string): boolean {
  try {
    io.git(path, "fetch", "-q", "--no-tags", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`);
    return true;
  } catch (e) {
    if (/couldn't find remote ref/i.test((e as Error).message)) return false;
    throw e;
  }
}

const hasRef = (io: ShipIo, path: string, ref: string) => {
  try {
    io.git(path, "rev-parse", "--verify", "-q", `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
};

/**
 * What the worktree holds that GitHub doesn't. With `branch`, and this machine knows that branch on
 * GitHub, it's measured against it (follow-up work, AK-66), including what GitHub has that the
 * worktree doesn't; otherwise against the default branch.
 */
export function worktreeFacts(io: ShipIo, path: string, base: string, branch?: string): { dirty: boolean; ahead: number; behind: number } {
  const dirty = io.git(path, "status", "--porcelain") !== "";
  const count = (range: string) => Number(io.git(path, "rev-list", "--count", range)) || 0;
  if (branch && hasRef(io, path, `origin/${branch}`)) return { dirty, ahead: count(`origin/${branch}..HEAD`), behind: count(`HEAD..origin/${branch}`) };
  let ahead = 0;
  try {
    ahead = count(`origin/${base}..HEAD`);
  } catch {
    // No such remote branch yet: whatever is here is new.
    ahead = count("HEAD");
  }
  return { dirty, ahead, behind: 0 };
}

/**
 * For a PR sent back because it conflicts with its base (AK-124): merge the base branch as it is on
 * GitHub into the worktree, before the builder's run. An agent whose sandbox can't write the Git
 * folder can't start a merge itself, and fixing the files alone wouldn't make a merge commit; this
 * way it only fixes the files and the runner's commit finishes the merge. A clean merge is
 * committed at once. Anything unsaved, or a merge already under way, is left alone.
 */
export function startBaseMerge(io: ShipIo, path: string, base: string): BaseMerge {
  if (io.git(path, "status", "--porcelain") !== "") return { skipped: "there are unsaved changes" };
  if (hasRef(io, path, "MERGE_HEAD")) return { skipped: "a merge is already under way" };
  io.git(path, "fetch", "-q", "--no-tags", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`);
  try {
    io.git(path, "merge-base", "--is-ancestor", `origin/${base}`, "HEAD");
    return { skipped: `the branch already has ${base}` };
  } catch {
    // Not in yet: merge it.
  }
  try {
    io.git(path, "merge", "--no-edit", "-q", `origin/${base}`);
    return { merged: true };
  } catch (e) {
    const conflicts = io.git(path, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
    if (!conflicts.length) throw e;
    return { conflicts };
  }
}

/** Files of an unfinished merge that still have conflict markers: committing them would finish the merge broken. */
function conflictMarkers(io: ShipIo, path: string): string[] {
  const unmerged = [...new Set(io.git(path, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean))];
  if (!unmerged.length) return [];
  try {
    return io.git(path, "grep", "-l", "-E", "^(<<<<<<<|>>>>>>>)( |$)", "--", ...unmerged).split("\n").filter(Boolean);
  } catch {
    return []; // git grep found none
  }
}

export interface ShipJob {
  path: string;
  repo: string;
  branch: string;
  base: string;
  /** "AK-12: Add retries to the uploader": the commit message and the pull request's title. */
  title: string;
  body: string;
  steps: ShipStep[];
  /** The pull request the branch already has, for follow-up work (no `open_pr` step). */
  pr?: string;
}

export type ShipResult = { ok: true; pr: string; did: ShipStep[] } | { ok: false; step: ShipStep; error: string };

const shown = (paths: string[]) => `${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ` and ${paths.length - 5} more` : ""}`;

/**
 * Every file added or changed by any commit the push would send: the ones neither the default
 * branch nor the branch itself on GitHub has (all of them, if neither is known). Each commit is read
 * on its own, because a file added in one commit and deleted in the next is still in what gets pushed.
 */
function pushedPaths(io: ShipIo, path: string, base: string, branch: string): string[] {
  const known = [`origin/${base}`, `origin/${branch}`].filter((ref) => hasRef(io, path, ref));
  const out = io.git(path, "log", "-z", "--format=", "--name-only", "-c", "--diff-filter=AMRC", "HEAD", ...(known.length ? ["--not", ...known] : []));
  return [...new Set(out.split(/[\0\n]/).filter(Boolean))];
}

const PR_URL = /https:\/\/github\.com\/[^\s)>\]]+\/pull\/\d+/i;

/** Carries out the plan, stopping at the first step that fails. */
export function ship(io: ShipIo, job: ShipJob): ShipResult {
  const did: ShipStep[] = [];
  for (const step of job.steps) {
    try {
      if (step === "commit") {
        // Checked before anything is staged, so a refusal leaves the folder exactly as it was.
        const secret = changedPaths(io.git(job.path, "status", "--porcelain", "-z", "--untracked-files=all")).filter(looksPrivate);
        if (secret.length) throw new Error(`These look like local secrets, so I didn't commit anything: ${shown(secret)}. Remove them or add them to .gitignore.`);
        const markers = conflictMarkers(io, job.path);
        if (markers.length) throw new Error(`These files still have merge conflict markers, so I didn't commit anything: ${shown(markers)}.`);
        io.git(job.path, "add", "-A");
        if (io.git(job.path, "diff", "--cached", "--name-only")) io.git(job.path, "commit", "-q", "-m", job.title);
      } else if (step === "push") {
        // Commits the agent made itself get the same check as the ones made here.
        const secret = pushedPaths(io, job.path, job.base, job.branch).filter(looksPrivate);
        if (secret.length) throw new Error(`These look like local secrets, so I didn't push anything: ${shown(secret)}. They're in the branch's commits; deleting the file isn't enough, the commits have to be redone without it.`);
        io.git(job.path, "push", "-q", "-u", "origin", `HEAD:refs/heads/${job.branch}`);
      } else {
        const found = io.gh(["pr", "list", "--repo", job.repo, "--head", job.branch, "--state", "open", "--json", "url", "--limit", "1"]);
        let url = found.ok ? ((JSON.parse(found.out || "[]") as { url?: string }[])[0]?.url ?? null) : null;
        if (!url) {
          const made = io.gh(["pr", "create", "--repo", job.repo, "--base", job.base, "--head", job.branch, "--title", job.title, "--body", job.body]);
          if (!made.ok) throw new Error(made.err || made.out || "gh pr create failed");
          url = made.out.match(PR_URL)?.[0] ?? null;
          if (!url) throw new Error(`gh didn't say where the pull request is: ${made.out.trim().slice(0, 200)}`);
        }
        return { ok: true, pr: url, did: [...did, step] };
      }
      did.push(step);
    } catch (e) {
      return { ok: false, step, error: (e as Error).message };
    }
  }
  if (job.pr) return { ok: true, pr: job.pr, did };
  return { ok: false, step: "open_pr", error: "The plan had no pull request step." };
}

/** The pull request's description: what the agent said, and one line on who opened it. */
export function shipBody(agent: string, key: string, summary: string | undefined, message: string): string {
  const said = message.trim().slice(0, 6000);
  return [
    ...(summary ? [summary] : []),
    ...(said ? [said] : []),
    "---",
    `Opened for ${key} by ${agent}'s runner: the agent finished the work but couldn't reach GitHub from where it runs.`,
  ].join("\n\n");
}
