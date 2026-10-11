import { spawnSync } from "node:child_process";
import { MAX_AUTO_REVIEWS, MERGE_FAILED_PREFIX, MERGE_OK_PREFIX, MERGE_POLICY_LABEL, NOTHING_UNSURE, NO_CHECKS_QUESTION, REVIEW_FAILED_PREFIX, isMergeQuestion, isReviewQuestion, type Comment, type MergePolicy, type Review, type ReviewerCandidate, type Ticket } from "../core/projects.js";

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

/** `gh pr view --json number,state,baseRefName,headRefOid,mergeable,statusCheckRollup,files`. */
export interface PrInfo {
  number?: number;
  state: string;
  /** The branch the PR merges into. */
  baseRefName?: string;
  headRefOid: string;
  mergeable?: string;
  statusCheckRollup?: PrCheck[] | null;
  files?: { path: string }[] | null;
}

export const MERGE_FIELDS = "number,state,baseRefName,headRefOid,mergeable,statusCheckRollup,files";
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

/** The PR's files that wait for a person's OK under auto_safe. */
export function riskyFiles(pr: Pick<PrInfo, "files">): string[] {
  const files = (pr.files ?? []).map((f) => f.path);
  // gh lists at most 100 files, so a bigger PR can't be shown to be safe.
  return [...files.filter(isRiskyPath), ...(files.length >= GH_FILE_LIMIT ? [`${GH_FILE_LIMIT}+ files, too many to check`] : [])];
}

// ------------------------------------------------------------------ automatic reviews (AK-59)

export type ReviewAction = "wait" | "tests_failed" | "review" | "ask_worker" | "no_checks" | "limit";

export interface ReviewDecision {
  action: ReviewAction;
  /** One line for the runner log. */
  why: string;
  /** The PR's head commit the decision is about. */
  sha: string;
  /** For tests_failed: the checks that didn't pass. */
  failed?: string[];
  /** The PR has no checks yet: when the runner first saw this commit without any (ms), for the record. */
  noChecksSince?: number;
}

/** What the lead's runner last did about a ticket waiting for review, kept across restarts. */
export interface ReviewRecord {
  /** The head commit last handled ("" for none yet). no_checks never counts as handled. */
  sha: string;
  action: ReviewAction;
  /** Automatic review runs started for this ticket, over all its commits. */
  reviews: number;
  /** A commit seen with no checks: since when (ms), and whether "No automatic tests ran" was set for it. */
  noChecks?: { sha: string; since: number; asked?: boolean };
}

/** How long a commit may have no checks before the runner says so: GitHub takes a while to register them. */
export const NO_CHECKS_GRACE_MS = 5 * 60_000;

/** The lead built it: it's the assignee, or one of the past builders (schema 17; missing means just the assignee). */
export function leadBuilt(ticket: Pick<Ticket, "assignee_id" | "built_by">, leadId: string): boolean {
  return ticket.assignee_id === leadId || (ticket.built_by ?? []).includes(leadId);
}

/**
 * What the lead's runner does about a ticket in Review with a PR and no approval, given the PR as
 * GitHub sees it and what it already did for this ticket. Plain code: the model only runs for
 * `review`, once per commit, and at most MAX_AUTO_REVIEWS times per ticket.
 */
export function reviewDecision(
  ticket: Pick<Ticket, "assignee_id" | "built_by" | "needs_human">,
  pr: PrInfo,
  leadId: string,
  handled: Pick<ReviewRecord, "sha" | "reviews" | "noChecks"> | null | undefined,
  now = Date.now(),
  maxReviews = MAX_AUTO_REVIEWS,
): ReviewDecision {
  const sha = pr.headRefOid.toLowerCase();
  const d = (action: ReviewAction, why: string, failed?: string[]): ReviewDecision => ({ action, why, sha, ...(failed ? { failed } : {}) });
  if (pr.state !== "OPEN") return d("wait", `the PR is ${pr.state.toLowerCase()}`);
  if (handled?.sha.toLowerCase() === sha) return d("wait", `${short(sha)} was already handled`);
  // Someone is already waiting on a person here; a review now would talk over them.
  if (ticket.needs_human && !isMergeQuestion(ticket.needs_human) && !isReviewQuestion(ticket.needs_human)) return d("wait", "it has a question for a person");
  const checks = pr.statusCheckRollup ?? [];
  if (!checks.length) {
    // A PR opened seconds ago has no checks yet either, so give GitHub time before saying so.
    const since = handled?.noChecks?.sha.toLowerCase() === sha ? handled.noChecks.since : now;
    if (now - since < NO_CHECKS_GRACE_MS) return { ...d("wait", "no checks yet; giving GitHub time to start them"), noChecksSince: since };
    return { ...d("no_checks", `no checks ran in ${Math.round((now - since) / 60_000)} minutes`), noChecksSince: since };
  }
  const name = (c: PrCheck) => c.name ?? c.context ?? "a check";
  const failed = checks.filter((c) => checkResult(c) === "failure").map(name);
  if (failed.length) return d("tests_failed", `${shortList(failed)} didn't pass`, failed);
  const pending = checks.filter((c) => checkResult(c) === "pending");
  if (pending.length) return d("wait", `${shortList(pending.map(name))} still running`);
  if (leadBuilt(ticket, leadId)) return d("ask_worker", "the lead built it, so it can't approve it");
  if ((handled?.reviews ?? 0) >= maxReviews) return d("limit", `already reviewed ${maxReviews} times`);
  return d("review", `tests passed at ${short(sha)}`);
}

export const REVIEW_UNDECIDED_QUESTION = `${REVIEW_FAILED_PREFIX}: the review ended without a decision. Can you look?`;

/**
 * After a review run that finished normally: did it leave the ticket with no decision? That's when
 * it's still in Review at the same PR, unapproved, with no "Needs you" and no comment from the lead
 * after `lastCommentId` (the newest comment before the run). Then nobody would be told otherwise.
 */
export function reviewEndedUndecided(
  after: Pick<Ticket, "status" | "pr_url" | "approved_sha" | "needs_human">,
  prUrl: string,
  comments: Pick<Comment, "id" | "author_id">[],
  leadId: string,
  lastCommentId: number,
): boolean {
  if (after.status !== "review" || after.pr_url !== prUrl || after.approved_sha || after.needs_human) return false;
  return !comments.some((c) => c.id > lastCommentId && c.author_id === leadId);
}

/**
 * Who to ask to review a ticket the lead built: an agent that didn't build it. The database lets
 * another agent approve only a ticket the lead is the assignee of, so otherwise nobody. Claude Code
 * agents first (an agent reporting through the ending block can't call ticket_approve, and the
 * runner can't tell which Codex agents do), then idle, then online ones.
 */
export function pickReviewer(agents: ReviewerCandidate[], ticket: Pick<Ticket, "assignee_id" | "built_by">, leadId: string): ReviewerCandidate | null {
  if (ticket.assignee_id !== leadId) return null;
  const builders = new Set([ticket.assignee_id, ...(ticket.built_by ?? [])]);
  const score = (a: ReviewerCandidate) => (a.vendor === "claude" ? 4 : 0) + (a.online && a.status === "idle" ? 2 : 0) + (a.online ? 1 : 0);
  const eligible = agents.filter((a) => a.id !== leadId && !builders.has(a.id) && a.status !== "paused");
  return eligible.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function testsFailedComment(prUrl: string, sha: string, failed: string[]): string {
  return `Tests didn't pass on PR #${prNumber(prUrl)} at commit ${short(sha)}: ${shortList(failed)}. It needs a fix and a new push; I've moved it back to In progress. Captain reviews again once the tests pass.`;
}

export function askReviewMessage(key: string, title: string, prUrl: string, sha: string, doneMeans: string[]): string {
  const done = doneMeans.length ? doneMeans.map((x) => `- ${x}`).join("\n") : "(none written)";
  return `Please review ${key} (${title}). Captain built it, so it can't approve it itself.
PR: ${prUrl}
Commit: ${sha}

Done means:
${done}

Read the diff and the checks. If it's right, approve it with ticket_approve key=${key} sha=${sha} and the evidence fields. If not, ticket_comment on ${key} with what's missing.`;
}

/**
 * "Needs you" for a risky merge: the reviewer's question when it recorded one (AK-45), then the
 * files that make it risky. Without a question, the files alone, as before.
 */
export function mergeOkQuestion(risky: string[], question?: string | null): string {
  const q = question?.trim();
  return `${MERGE_OK_PREFIX} ${q ? `${q} (${shortList(risky)})` : shortList(risky)}`.slice(0, 1000);
}

/**
 * What the lead's runner does with an approved ticket in Review, given the PR as GitHub sees it.
 * `defaultBranch` is the project's: a PR stacked on another ticket's branch would merge there
 * instead, so it waits until it's retargeted.
 */
export function mergeDecision(policy: MergePolicy, pr: PrInfo, ticket: Pick<Ticket, "approved_sha" | "merge_ok_by" | "review">, defaultBranch: string): MergeDecision {
  const risky = riskyFiles(pr);
  const wait = (why: string, question?: string): MergeDecision => ({ action: "wait", why, question, risky });
  const approved = ticket.approved_sha?.toLowerCase();
  if (pr.state !== "OPEN") return wait(`the PR is ${pr.state.toLowerCase()}`);
  if (pr.baseRefName && pr.baseRefName !== defaultBranch) {
    const n = pr.number ?? "?";
    const fix = `retarget it with \`gh pr edit ${n} --base ${defaultBranch}\``;
    return wait(`the PR targets ${pr.baseRefName}, not ${defaultBranch}`, `${MERGE_FAILED_PREFIX}: PR #${n} targets ${pr.baseRefName}, not ${defaultBranch}; ${fix}.`.slice(0, 1000));
  }
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
    return { action: "needs_ok", why: `risky files: ${shortList(risky)}`, question: mergeOkQuestion(risky, ticket.review?.question), risky };
  }
  return { action: "merge", why: `approved ${short(approved)} and green (setting: ${policy})`, risky };
}

/**
 * What "Needs you" becomes after a decision: its question if it has one, null to clear a merge
 * question the decision no longer asks (checks showed up, gh works again), undefined to leave it.
 */
export function mergeNeedsHuman(current: string | null, d: Pick<MergeDecision, "action" | "question">): string | null | undefined {
  if (d.question) return current === d.question ? undefined : d.question;
  if (isMergeQuestion(current) && (d.action === "wait" || d.action === "ask")) return null;
  return undefined;
}

/**
 * ticket_approve's guard: the commit the lead reviewed (a full sha or a prefix of 7+ characters)
 * must still be the PR's head. Returns why not, or null when it is (or no sha was given).
 */
export function reviewedShaProblem(prUrl: string, head: string, reviewed?: string): string | null {
  if (!reviewed) return null;
  const r = reviewed.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(r)) return `"${reviewed}" isn't a commit id: pass the full sha or its first 7+ characters.`;
  if (head.toLowerCase().startsWith(r)) return null;
  return `PR #${prNumber(prUrl)} is now at ${short(head)}, not the ${short(r)} you reviewed; review the new commit first.`;
}

/** ticket_approve's evidence fields, flat so they're easy for an agent to fill in. */
export interface ApproveArgs {
  less_sure?: string;
  summary?: string;
  question?: string;
  line_file?: string;
  line_code?: string;
  line_plain?: string;
  decisions?: string[];
}

/**
 * The review ticket_approve records, or why it can't approve yet (AK-45). `risky`: the PR's files
 * that wait for a person's OK. A person decides from what's written here, so it has to say
 * something: where the reviewer is less sure, always, and for a risky change a real question.
 */
export function reviewFrom(a: ApproveArgs, risky: string[]): { review: Review } | { problem: string } {
  const text = (s?: string) => s?.trim() || undefined;
  const lessSure = text(a.less_sure);
  if (!lessSure) return { problem: `Not approved yet. Say where you're less sure (less_sure): what you couldn't run or check. If there's nothing, pass "${NOTHING_UNSURE}"` };
  const question = text(a.question);
  if (risky.length && !question) {
    return { problem: `Not approved yet. This PR touches ${shortList(risky)}, so a person has to OK it before it merges. Pass question: what happens to existing users or data, then one yes/no question about this change.` };
  }
  if (question && !question.endsWith("?")) return { problem: "Not approved yet. The question has to be one a person can answer yes or no, so end it with a question mark." };
  if (question && /^(is it |is this )?(ok|okay|fine|safe)( to merge)?( this| it)?\?$/i.test(question)) {
    return { problem: "Not approved yet. Make the question about this change: say what happens to existing users or data, then ask." };
  }
  const file = text(a.line_file);
  const code = a.line_code?.trimEnd() || undefined;
  if (!file !== !code?.trim()) return { problem: "Not approved yet. The line that matters needs both line_file and line_code." };
  const plain = text(a.line_plain);
  const decisions = (a.decisions ?? []).map((d) => d.trim().toUpperCase()).filter(Boolean);
  return {
    review: {
      ...(text(a.summary) ? { summary: text(a.summary) } : {}),
      ...(question ? { question } : {}),
      ...(file && code ? { line: { file, code, ...(plain ? { plain } : {}) } } : {}),
      ...(decisions.length ? { decisions: [...new Set(decisions)] } : {}),
      less_sure: lessSure,
    },
  };
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

export function gh(args: string[], maxBuffer = 1024 * 1024): { ok: boolean; out: string; err: string } {
  const r = spawnSync("gh", args, { encoding: "utf8", env: GH_ENV, timeout: 60_000, maxBuffer, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) return { ok: false, out: "", err: `gh: ${r.error.message}` };
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** `gh pr view <url> --json <fields>`. Throws gh's error as is (pass it through plainGhError). */
export function ghPrView<T = PrInfo>(url: string, fields = MERGE_FIELDS): T {
  const r = gh(["pr", "view", url, "--json", fields]);
  if (!r.ok) throw new Error(r.err || "gh pr view failed");
  return JSON.parse(r.out) as T;
}

/** `gh pr diff <url>`: the PR's whole diff. Throws gh's error as is. */
export function ghPrDiff(url: string): string {
  const r = gh(["pr", "diff", url], 64 * 1024 * 1024);
  if (!r.ok) throw new Error(r.err || "gh pr diff failed");
  return r.out;
}

/** A merge commit, only if the PR's head is still the approved commit. */
export function ghPrMerge(url: string, sha: string): { ok: true } | { ok: false; error: string } {
  const r = gh(["pr", "merge", url, "--merge", "--match-head-commit", sha]);
  return r.ok ? { ok: true } : { ok: false, error: r.err || r.out || "gh pr merge failed" };
}
