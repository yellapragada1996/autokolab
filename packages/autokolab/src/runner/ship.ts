import { execFileSync } from "node:child_process";
import { gh, plainGhError } from "./merge.js";

// Delivering an agent's work when the agent can't (AK-46). Some agents run in a sandbox that can't
// write the repository's Git data, reach GitHub or use `gh` (Codex on a company account). The runner
// isn't sandboxed and already has the machine's GitHub access, so when an agent says its ticket is
// ready for review and there is no pull request, the runner commits what's left, pushes the branch
// and opens the pull request. The decision is plain code, like the merge decision.

export type ShipStep = "commit" | "push" | "open_pr";

export interface ShipFacts {
  /** The agent ended with `status: review`. */
  declaredReview: boolean;
  /** The ticket, or the agent's message, already has a pull request. */
  hasPr: boolean;
  /** The worktree has changes that aren't committed. */
  dirty: boolean;
  /** Commits on the branch that the default branch on GitHub doesn't have. */
  ahead: number;
  branch: string;
  base: string;
  protectedBranches: string[];
}

export type ShipPlan = { steps: ShipStep[] } | { skip: "not_asked" | "has_pr" | "nothing" | "protected" };

/** What the runner does for the agent. It only acts when the agent said the work is ready. */
export function shipPlan(f: ShipFacts): ShipPlan {
  if (!f.declaredReview) return { skip: "not_asked" };
  if (f.hasPr) return { skip: "has_pr" };
  if (!f.dirty && f.ahead <= 0) return { skip: "nothing" };
  if (f.branch === f.base || f.protectedBranches.includes(f.branch)) return { skip: "protected" };
  return { steps: [...(f.dirty ? (["commit"] as const) : []), "push", "open_pr"] };
}

/** Files that are never committed on an agent's behalf: local secrets. Examples and templates are fine. */
export function looksPrivate(path: string): boolean {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  if (/\.(example|sample|template|dist)$/.test(name)) return false;
  return /^\.env(\..+)?$/.test(name) || /\.(pem|p12|pfx|key)$/.test(name) || /^id_(rsa|dsa|ecdsa|ed25519)$/.test(name);
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
  const line = s.split("\n").find((l) => l.trim() && !/^(hint|remote):?\s*$/i.test(l.trim()))?.trim();
  return line ? `${line.replace(/^(fatal|error):\s*/i, "").slice(0, 300).replace(/\.?$/, ".")}` : "git failed without saying why.";
}

export interface ShipIo {
  /** Runs git in the worktree; throws with git's message on failure. */
  git(cwd: string, ...args: string[]): string;
  gh(args: string[]): { ok: boolean; out: string; err: string };
}

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
};

export const realIo: ShipIo = {
  git: (cwd, ...args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }).trim();
    } catch (e) {
      const x = e as { stderr?: string; stdout?: string; message: string };
      throw new Error((x.stderr || x.stdout || x.message).toString().trim());
    }
  },
  gh,
};

/** What the worktree holds that GitHub's default branch doesn't. */
export function worktreeFacts(io: ShipIo, path: string, base: string): { dirty: boolean; ahead: number } {
  const dirty = io.git(path, "status", "--porcelain") !== "";
  let ahead = 0;
  try {
    ahead = Number(io.git(path, "rev-list", "--count", `origin/${base}..HEAD`)) || 0;
  } catch {
    // No such remote branch yet: whatever is here is new.
    ahead = Number(io.git(path, "rev-list", "--count", "HEAD")) || 0;
  }
  return { dirty, ahead };
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
}

export type ShipResult = { ok: true; pr: string; did: ShipStep[] } | { ok: false; step: ShipStep; error: string };

const PR_URL = /https:\/\/github\.com\/[^\s)>\]]+\/pull\/\d+/i;

/** Carries out the plan, stopping at the first step that fails. */
export function ship(io: ShipIo, job: ShipJob): ShipResult {
  const did: ShipStep[] = [];
  for (const step of job.steps) {
    try {
      if (step === "commit") {
        io.git(job.path, "add", "-A");
        const staged = io.git(job.path, "diff", "--cached", "--name-only").split("\n").filter(Boolean);
        const secret = staged.filter(looksPrivate);
        if (secret.length) {
          io.git(job.path, "reset", "-q");
          throw new Error(`These look like local secrets, so I didn't commit anything: ${secret.slice(0, 5).join(", ")}. Remove them or add them to .gitignore.`);
        }
        if (staged.length) io.git(job.path, "commit", "-q", "-m", job.title);
      } else if (step === "push") {
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
