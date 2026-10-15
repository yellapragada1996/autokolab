import { spawn, spawnSync } from "node:child_process";
import { LEAD_BUILT_QUESTION, MAX_AUTO_REVIEWS, MERGE_FAILED_PREFIX, MERGE_OK_PREFIX, MERGE_POLICY_LABEL, NOTHING_UNSURE, NO_CHECKS_QUESTION, REVIEW_FAILED_PREFIX, changesScreens, isMergeQuestion, isReviewQuestion, reviewLook, type Comment, type MergePolicy, type PrFacts, type Review, type ReviewerCandidate, type Ticket } from "../core/projects.js";

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
  files?: { path: string; additions?: number; deletions?: number }[] | null;
  /** How many files the PR changes; `files` lists at most 100. */
  changedFiles?: number;
  additions?: number;
  deletions?: number;
}

export const MERGE_FIELDS = "number,state,baseRefName,headRefOid,mergeable,statusCheckRollup,files,changedFiles,additions,deletions";
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

export type MergeAction = "wait" | "ask" | "needs_ok" | "merge" | "conflict";

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

// ------------------------------------------------------------------ PR facts (AK-57)

/**
 * What the lead's runner records about a PR it looked at, so the website can say "Tests: 48 of 48
 * passed on GitHub" and how big the change is without calling GitHub (schema 18).
 */
export function prFacts(pr: PrInfo): PrFacts {
  const results = (pr.statusCheckRollup ?? []).map(checkResult);
  const state = results.includes("failure") ? "failure" : results.includes("pending") || !results.length ? "pending" : "success";
  const count = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0);
  return {
    sha: pr.headRefOid.toLowerCase(),
    checks: { passed: results.filter((r) => r === "success").length, total: results.length, state },
    files: {
      total: Math.max(count(pr.changedFiles), (pr.files ?? []).length),
      risky: riskyFiles(pr).slice(0, 20).map((f) => f.slice(0, 300)),
      // Each changed file with its own +/−, so "Show the work" can list and link them (AK-134).
      // gh lists at most 100 files; the database keeps the same cap.
      list: (pr.files ?? []).slice(0, 100).map((f) => ({ path: f.path.slice(0, 300), additions: count(f.additions), deletions: count(f.deletions) })),
    },
    additions: count(pr.additions),
    deletions: count(pr.deletions),
  };
}

/** Every changed file with its counts, as one string, so two lists compare cleanly. */
const fileListKey = (list: PrFacts["files"]["list"]): string =>
  (list ?? []).map((f) => `${f.path}:${f.additions}:${f.deletions}`).join("\n");

/** The stored facts say the same as the new ones (when they were recorded doesn't count). */
export function samePrFacts(stored: PrFacts | null | undefined, next: PrFacts): boolean {
  if (!stored) return false;
  const a = stored.checks, b = next.checks;
  return (
    stored.sha === next.sha &&
    a?.passed === b.passed && a?.total === b.total && a?.state === b.state &&
    stored.files?.total === next.files.total &&
    (stored.files?.risky ?? []).join("\n") === next.files.risky.join("\n") &&
    fileListKey(stored.files?.list) === fileListKey(next.files.list) &&
    stored.additions === next.additions &&
    stored.deletions === next.deletions
  );
}

// ------------------------------------------------------------------ automatic reviews (AK-59)

export type ReviewAction = "wait" | "tests_failed" | "conflict" | "review" | "ask_worker" | "no_checks" | "limit";

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
  /** The last commit a review run sent back, on which PR, and what the lead said (AK-117). */
  reviewed?: EarlierReview;
}

/** A review that sent a ticket back: the next one looks only at what changed since (AK-117). */
export interface EarlierReview {
  sha: string;
  pr: string;
  finding: string;
}

/** About this much of the lead's earlier finding goes into a re-review. */
export const FINDING_LIMIT = 4000;

/** What the lead said on the ticket during a review run: its comments after `afterId`, oldest first. */
export function reviewFinding(comments: Pick<Comment, "id" | "author_id" | "body">[], leadId: string, afterId: number): string {
  return comments
    .filter((c) => c.id > afterId && c.author_id === leadId)
    .sort((a, b) => a.id - b.id)
    .map((c) => c.body.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, FINDING_LIMIT);
}

/** The earlier review a review of `sha` on `prUrl` builds on, if there's one for an older commit of the same PR. */
export function earlierReview(rec: Pick<ReviewRecord, "reviewed"> | null | undefined, prUrl: string, sha: string): EarlierReview | undefined {
  const r = rec?.reviewed;
  return r && r.pr === prUrl && r.sha.toLowerCase() !== sha.toLowerCase() && r.finding.trim() ? r : undefined;
}

/** Changed lines in a unified diff: added plus removed, without the file headers. */
export function diffLines(diff: string): number {
  let n = 0;
  for (const line of diff.split("\n")) {
    if ((line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"))) n++;
  }
  return n;
}

/** The PR's added plus removed lines, if gh said. */
export function prLines(pr: Pick<PrInfo, "additions" | "deletions">): number | null {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  return ok(pr.additions) && ok(pr.deletions) ? pr.additions + pr.deletions : null;
}

/**
 * Whether a review may take the light path (AK-117): at most `maxLines` changed lines to read
 * (the PR's, or on a re-review the new commits'), and nothing risky anywhere in the PR, since the
 * approval covers all of it. Anything unknown takes the full path.
 */
export function lightReview(pr: Pick<PrInfo, "files">, lines: number | null, maxLines: number): { light: boolean; why: string } {
  if (maxLines <= 0) return { light: false, why: "light reviews are off" };
  const risky = riskyFiles(pr);
  if (risky.length) return { light: false, why: `it touches ${shortList(risky, 3)}` };
  if (!(pr.files ?? []).length) return { light: false, why: "gh listed no files" };
  if (lines === null) return { light: false, why: "gh didn't say how big it is" };
  if (lines > maxLines) return { light: false, why: `${lines} changed lines` };
  return { light: true, why: `${lines} changed lines, nothing risky` };
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
  // Before the checks: GitHub often runs none on a PR it can't merge, and a review would be wasted (AK-124).
  if (pr.mergeable === "CONFLICTING") return d("conflict", "the PR has conflicts");
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

// ------------------------------------------------------------------ conflicts (AK-124)

/** How many times a PR that conflicts with its base goes back to its builder before a person is asked. */
export const MAX_CONFLICT_SEND_BACKS = 2;

/** What the lead's runner did about a ticket's conflicts, kept across restarts: on which PR, how often, and the last commit. */
export interface ConflictRecord {
  pr: string;
  sentBack: number;
  sha: string;
}

export type ConflictAction = "send_back" | "ask" | "wait";

/**
 * A PR conflicts with its base at `sha`: send it back to its builder, or after MAX_CONFLICT_SEND_BACKS
 * send-backs of the same PR ask a person. A commit already handled waits. A new PR starts over.
 */
export function conflictDecision(rec: ConflictRecord | null | undefined, prUrl: string, sha: string, max = MAX_CONFLICT_SEND_BACKS): { action: ConflictAction; next: ConflictRecord } {
  const s = sha.toLowerCase();
  const same = rec?.pr === prUrl ? rec : undefined;
  if (same?.sha.toLowerCase() === s) return { action: "wait", next: same };
  const sentBack = same?.sentBack ?? 0;
  if (sentBack >= max) return { action: "ask", next: { pr: prUrl, sentBack, sha: s } };
  return { action: "send_back", next: { pr: prUrl, sentBack: sentBack + 1, sha: s } };
}

export function conflictComment(prUrl: string, base: string, sentBack: number, max = MAX_CONFLICT_SEND_BACKS): string {
  return `PR #${prNumber(prUrl)} conflicts with ${base}; merge ${base} into the branch, fix the conflicts, run the tests and push. I've moved it back to In progress (send-back ${sentBack} of ${max}). If you can't resolve it, set Needs you and say why. Captain reviews the new commit once it's pushed.`;
}

/** The base branch a send-back comment names, or null when the comment isn't one. */
export function conflictSendBackBase(body: string): string | null {
  const m = body.match(/^PR #\d+ conflicts with ([\w./-]+); merge \1 into the branch/);
  return m && !m[1]!.startsWith("-") ? m[1]! : null;
}

export function conflictQuestion(prUrl: string, base: string, max = MAX_CONFLICT_SEND_BACKS): string {
  return `${MERGE_FAILED_PREFIX}: PR #${prNumber(prUrl)} still conflicts with ${base} after ${max} send-backs to its builder. Can you resolve it, or tell the builder how?`;
}

export function isConflictQuestion(text: string | null | undefined): boolean {
  return !!text && text.startsWith(`${MERGE_FAILED_PREFIX}: PR #`) && text.includes(" send-backs to its builder.");
}

/** What the builder's run is told after its runner started merging the base branch in (AK-124). */
export function baseMergeNote(base: string, r: BaseMerge): string | null {
  if ("skipped" in r) return null;
  if ("merged" in r) return `${base} merged into this branch cleanly, as a new commit. Run the tests, fix anything that broke, and push.`;
  return `I started merging ${base} into this branch. These files have conflicts: ${shortList(r.conflicts, 10)}. Fix them and remove the conflict markers, run the tests, then commit (that finishes the merge) and push. If you can't commit or push from where you run, leave the files fixed and end with status: review; the runner commits and pushes.`;
}

export type BaseMerge = { merged: true } | { conflicts: string[] } | { skipped: string };

export function askReviewMessage(key: string, title: string, prUrl: string, sha: string, doneMeans: string[], files: string[] = [], base = "the default branch"): string {
  const done = doneMeans.length ? doneMeans.map((x) => `- ${x}`).join("\n") : "(none written)";
  const look = changesScreens(files) ? `\n\n${reviewLook("a checkout of that commit", base)}` : "";
  return `Please review ${key} (${title}). Captain built it, so it can't approve it itself.
PR: ${prUrl}
Commit: ${sha}

Done means:
${done}

Read the diff and the checks. If it's right, approve it with ticket_approve key=${key} sha=${sha} and the evidence fields. If not, ticket_comment on ${key} with what's missing.${look}`;
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
  // Its builder fixes it (AK-124): see conflictDecision.
  if (pr.mergeable === "CONFLICTING") return { action: "conflict", why: "the PR has conflicts", risky };
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
  // Approved and green: a review question ("Captain built this…", "couldn't finish reviewing") is answered (AK-100).
  if (isReviewQuestion(current) && d.action === "ask") return null;
  return undefined;
}

/** The runner's own questions a merge settles: the ticket is done, so neither its merge nor its review waits on a person (AK-100). */
export const settledByMerge = (current: string | null): boolean => isMergeQuestion(current) || isReviewQuestion(current);

/**
 * "Needs you" when the runner moves a review on: null clears one of its review questions this step
 * settles, undefined leaves it. A new review of a new commit settles a failed or undecided one; asking
 * another agent to approve settles "Captain built this, so a person or another agent has to approve
 * it" (an agent can do it, so a person isn't asked). Anyone else's question is left alone (AK-100).
 */
export function reviewNeedsHuman(current: string | null, step: "review" | "asked_reviewer"): null | undefined {
  if (!isReviewQuestion(current)) return undefined;
  if (step === "review") return current!.startsWith(REVIEW_FAILED_PREFIX) ? null : undefined;
  return current === LEAD_BUILT_QUESTION ? null : undefined;
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

/** What plainGhError says when the PR can't merge for conflicts: its builder is asked to fix it (AK-124). */
export const PR_CONFLICTS = "the PR has conflicts with its base branch.";

/** gh's error, in plain words. `where`: "on raghavendra's machine". */
export function plainGhError(stderr: string, where: string): string {
  const s = stderr.trim();
  if (/ENOENT/.test(s)) return `gh isn't installed ${where}.`;
  if (/auth login|not logged|authentication/i.test(s)) return `gh ${where} isn't signed in to GitHub (run \`gh auth login\`).`;
  if (/permission|forbidden|403|must have (write|admin)|not authorized/i.test(s)) return `the GitHub account gh uses ${where} can't merge in this repo (it needs write access).`;
  if (/conflict|not mergeable/i.test(s)) return PR_CONFLICTS;
  if (/head.*(changed|modified|match)|expected head/i.test(s)) return "the PR got a new commit just before merging; the lead needs to approve it again.";
  return s.split("\n").find((l) => l.trim())?.trim().slice(0, 300) || "gh failed without saying why.";
}

// ------------------------------------------------------------------ gh

const GH_ENV = { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" };
const GH_TIMEOUT_MS = 60_000;

/** What a gh call gave back. `timedOut`: it was stopped or ended without an exit status, so it may have done its work anyway. */
export interface GhResult {
  ok: boolean;
  out: string;
  err: string;
  timedOut?: boolean;
}

export function gh(args: string[], maxBuffer = 1024 * 1024): GhResult {
  const r = spawnSync("gh", args, { encoding: "utf8", env: GH_ENV, timeout: GH_TIMEOUT_MS, maxBuffer, stdio: ["ignore", "pipe", "pipe"] });
  const timedOut = (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT" || (!r.error && r.status === null);
  if (r.error) return { ok: false, out: "", err: `gh: ${r.error.message}`, timedOut };
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "", timedOut };
}

/**
 * Runs a command without blocking the runner (AK-119): a slow gh, or a machine that slept mid-call,
 * no longer holds up reading the room. Stopped after `timeout` ms.
 */
export function runAsync(bin: string, args: string[], opts: { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv } = {}): Promise<GhResult> {
  const { timeout = GH_TIMEOUT_MS, maxBuffer = 1024 * 1024, env = process.env } = opts;
  return new Promise((resolve) => {
    let out = "", err = "", killed = false, done = false;
    const finish = (r: GhResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const child = spawn(bin, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const stop = () => {
      killed = true;
      child.kill("SIGTERM");
    };
    const timer = setTimeout(stop, timeout);
    child.stdout.setEncoding("utf8").on("data", (s: string) => {
      out += s;
      if (out.length > maxBuffer) stop();
    });
    child.stderr.setEncoding("utf8").on("data", (s: string) => {
      err += s;
    });
    child.on("error", (e) => finish({ ok: false, out: "", err: `${bin}: ${e.message}`, timedOut: false }));
    child.on("close", (code) => {
      if (killed && out.length > maxBuffer) return finish({ ok: false, out: "", err: `${bin}: output too long`, timedOut: false });
      if (killed || code === null) return finish({ ok: false, out, err: err || `${bin}: timed out after ${Math.round(timeout / 1000)}s`, timedOut: true });
      finish({ ok: code === 0, out, err, timedOut: false });
    });
  });
}

export function ghAsync(args: string[], maxBuffer = 1024 * 1024): Promise<GhResult> {
  return runAsync("gh", args, { maxBuffer, env: GH_ENV });
}

/** `gh pr view <url> --json <fields>`. Throws gh's error as is (pass it through plainGhError). */
export function ghPrView<T = PrInfo>(url: string, fields = MERGE_FIELDS): T {
  const r = gh(["pr", "view", url, "--json", fields]);
  if (!r.ok) throw new Error(r.err || "gh pr view failed");
  return JSON.parse(r.out) as T;
}

/** ghPrView without blocking the runner. */
export async function ghPrViewAsync<T = PrInfo>(url: string, fields = MERGE_FIELDS): Promise<T> {
  const r = await ghAsync(["pr", "view", url, "--json", fields]);
  if (!r.ok) throw new Error(r.err || "gh pr view failed");
  return JSON.parse(r.out) as T;
}

/** `gh pr diff <url>`: the PR's whole diff. Throws gh's error as is. */
export function ghPrDiff(url: string): string {
  const r = gh(["pr", "diff", url], 64 * 1024 * 1024);
  if (!r.ok) throw new Error(r.err || "gh pr diff failed");
  return r.out;
}

/** A merge commit, only if the PR's head is still the approved commit. Doesn't block the runner. */
export async function ghPrMerge(url: string, sha: string): Promise<{ ok: true } | { ok: false; error: string; timedOut: boolean }> {
  const r = await ghAsync(["pr", "merge", url, "--merge", "--match-head-commit", sha]);
  return r.ok ? { ok: true } : { ok: false, error: r.err || r.out || "gh pr merge failed", timedOut: !!r.timedOut };
}

/** The PR is merged, and at the approved commit. */
export function mergedAt(pr: Pick<PrInfo, "state" | "headRefOid"> | null | undefined, sha: string): boolean {
  return pr?.state === "MERGED" && pr.headRefOid.toLowerCase() === sha.toLowerCase();
}

export type MergeFailure = { result: "merged" } | { result: "retry" } | { result: "failed" };

/**
 * After `gh pr merge` failed or timed out (AK-119): what the PR's state says happened. `after` is
 * the PR read again (null if that failed too); `retried` says this commit's merge already timed out
 * once. Merged at the approved commit counts as merged, whatever gh said. A timeout is tried once
 * more on the next look before a person is asked; anything else is a real failure.
 */
export function afterMergeFailure(failure: { timedOut: boolean }, after: Pick<PrInfo, "state" | "headRefOid"> | null, sha: string, retried: boolean): MergeFailure {
  if (mergedAt(after, sha)) return { result: "merged" };
  if (failure.timedOut && !retried) return { result: "retry" };
  return { result: "failed" };
}
