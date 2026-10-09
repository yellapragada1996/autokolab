import { spawnSync } from "node:child_process";
import { MERGE_FAILED_PREFIX, MERGE_OK_PREFIX, MERGE_POLICY_LABEL, NO_CHECKS_QUESTION, type MergePolicy, type Ticket } from "../core/projects.js";

// The lead's approval and its runner's merge (AK-30, DEC-19). The decision is plain code, not a
// model run: the runner merges a PR only at the commit the lead approved, once every check passed
// and the project's merge setting allows it. GitHub is reached through `gh` on the lead's machine.

/** Changes that wait for a person's OK under auto_safe: database, CI, dependencies, and anything auth or secrets. */
export const RISKY_PATHS = {
  under: ["packages/autokolab/sql/", "supabase/", ".github/"],
  files: ["package.json", "package-lock.json"],
  containing: ["auth", "secret", "security"],
} as const;

export function isRiskyPath(path: string): boolean {
  const p = path.replace(/^\.?\/+/, "").toLowerCase();
  const name = p.split("/").pop() ?? p;
  return (
    RISKY_PATHS.under.some((d) => p.startsWith(d)) ||
    (RISKY_PATHS.files as readonly string[]).includes(name) ||
    RISKY_PATHS.containing.some((w) => p.includes(w))
  );
}

/** One entry of `statusCheckRollup`: a check run (Actions) or a commit status. */
export interface PrCheck {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string | null;
  state?: string;
}

/** `gh pr view --json state,headRefOid,mergeable,statusCheckRollup,files`. */
export interface PrInfo {
  state: string;
  headRefOid: string;
  mergeable?: string;
  statusCheckRollup?: PrCheck[] | null;
  files?: { path: string }[] | null;
}

export const MERGE_FIELDS = "state,headRefOid,mergeable,statusCheckRollup,files";
const GH_FILE_LIMIT = 100;

export type CheckResult = "success" | "pending" | "failure";

export function checkResult(c: PrCheck): CheckResult {
  if (c.state !== undefined && c.status === undefined) {
    // A commit status: SUCCESS, PENDING, EXPECTED, FAILURE or ERROR.
    return c.state === "SUCCESS" ? "success" : ["PENDING", "EXPECTED"].includes(c.state) ? "pending" : "failure";
  }
  if (c.status !== "COMPLETED") return "pending";
  return c.conclusion === "SUCCESS" ? "success" : "failure";
}

export type MergeAction = "wait" | "ask" | "needs_ok" | "merge";

export interface MergeDecision {
  action: MergeAction;
  /** One line for the runner log. */
  why: string;
  /** For needs_human, set once (wait and needs_ok only). */
  question?: string;
  /** The risky files in the PR. */
  risky: string[];
}

const short = (sha: string) => sha.slice(0, 7);

/** "a, b, c and 4 more". */
export function shortList(items: string[], max = 5): string {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

/** What the lead's runner does with an approved ticket in Review, given the PR as GitHub sees it. */
export function mergeDecision(policy: MergePolicy, pr: PrInfo, ticket: Pick<Ticket, "approved_sha" | "merge_ok_by">): MergeDecision {
  const files = (pr.files ?? []).map((f) => f.path);
  // gh lists at most 100 files, so a bigger PR can't be shown to be safe.
  const risky = [...files.filter(isRiskyPath), ...(files.length >= GH_FILE_LIMIT ? [`${GH_FILE_LIMIT}+ files, too many to check`] : [])];
  const wait = (why: string, question?: string): MergeDecision => ({ action: "wait", why, question, risky });
  const approved = ticket.approved_sha?.toLowerCase();
  if (pr.state !== "OPEN") return wait(`the PR is ${pr.state.toLowerCase()}`);
  if (!approved) return wait("not approved");
  if (pr.headRefOid.toLowerCase() !== approved) return wait(`the PR moved to ${short(pr.headRefOid)} after the lead approved ${short(approved)}; it needs a new approval`);
  if (pr.mergeable === "CONFLICTING") return wait("the PR has conflicts", `${MERGE_FAILED_PREFIX}: the PR has conflicts with its base branch. Merge the base branch into it, then the lead approves the new commit.`);
  if (pr.mergeable !== "MERGEABLE") return wait("GitHub hasn't worked out yet whether it can merge");
  const checks = pr.statusCheckRollup ?? [];
  if (!checks.length) return wait("no checks ran", NO_CHECKS_QUESTION);
  const name = (c: PrCheck) => c.name ?? c.context ?? "a check";
  const failed = checks.filter((c) => checkResult(c) === "failure");
  if (failed.length) return wait(`${shortList(failed.map(name))} didn't pass`);
  const pending = checks.filter((c) => checkResult(c) === "pending");
  if (pending.length) return wait(`${shortList(pending.map(name))} still running`);
  if (policy === "ask") return { action: "ask", why: "approved and green; a person merges (setting: ask)", risky };
  if (policy === "auto_safe" && risky.length && !ticket.merge_ok_by) {
    return { action: "needs_ok", why: `risky files: ${shortList(risky)}`, question: `${MERGE_OK_PREFIX} ${shortList(risky)}`.slice(0, 1000), risky };
  }
  return { action: "merge", why: `approved ${short(approved)} and green (setting: ${policy})`, risky };
}

// ------------------------------------------------------------------ messages

export function prNumber(url: string): string {
  return url.match(/\/pull\/(\d+)/)?.[1] ?? "?";
}

/** What ticket_approve says, worded for the project's setting. */
export function approvalMessage(prUrl: string, sha: string, policy: MergePolicy): string {
  const at = `Approved PR #${prNumber(prUrl)} at ${short(sha)}`;
  const setting = `(setting: ${MERGE_POLICY_LABEL[policy]})`;
  if (policy === "ask") return `${at}. Once tests pass, a person is told it's ready to merge ${setting}.`;
  if (policy === "auto_safe") return `${at}; it will merge when tests pass ${setting}. Changes to the database, CI, dependencies or auth wait for a person's OK first.`;
  return `${at}; it will merge when tests pass ${setting}.`;
}

export function readyToMergeMessage(prUrl: string, key: string): string {
  return `PR #${prNumber(prUrl)} (${key}) is approved and tests pass: ready for you to merge. ${prUrl}`;
}

export function mergedComment(sha: string, policy: MergePolicy): string {
  return `Merged automatically: tests passed, lead approved commit ${short(sha)} (setting: ${MERGE_POLICY_LABEL[policy]}).`;
}

/** gh's error, in plain words. `where`: "on raghavendra's machine". */
export function plainGhError(stderr: string, where: string): string {
  const s = stderr.trim();
  if (/ENOENT/.test(s)) return `gh isn't installed ${where}.`;
  if (/auth login|not logged|authentication/i.test(s)) return `gh ${where} isn't signed in to GitHub (run \`gh auth login\`).`;
  if (/permission|forbidden|403|must have (write|admin)|not authorized/i.test(s)) return `the GitHub account gh uses ${where} can't merge in this repo (it needs write access).`;
  if (/conflict|not mergeable/i.test(s)) return "the PR has conflicts with its base branch.";
  if (/head.*(changed|modified|match)|expected head/i.test(s)) return "the PR got a new commit just before merging; the lead needs to approve it again.";
  return s.split("\n").find((l) => l.trim())?.trim().slice(0, 300) || "gh failed without saying why.";
}

// ------------------------------------------------------------------ gh

const GH_ENV = { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" };

function gh(args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("gh", args, { encoding: "utf8", env: GH_ENV, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) return { ok: false, out: "", err: `gh: ${r.error.message}` };
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** `gh pr view <url> --json <fields>`. Throws gh's error as is (pass it through plainGhError). */
export function ghPrView<T = PrInfo>(url: string, fields = MERGE_FIELDS): T {
  const r = gh(["pr", "view", url, "--json", fields]);
  if (!r.ok) throw new Error(r.err || "gh pr view failed");
  return JSON.parse(r.out) as T;
}

/** A merge commit, only if the PR's head is still the approved commit. */
export function ghPrMerge(url: string, sha: string): { ok: true } | { ok: false; error: string } {
  const r = gh(["pr", "merge", url, "--merge", "--match-head-commit", sha]);
  return r.ok ? { ok: true } : { ok: false, error: r.err || r.out || "gh pr merge failed" };
}
