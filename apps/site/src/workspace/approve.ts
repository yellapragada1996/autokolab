import { isReviewQuestion, type Ticket } from "../lib/data";

// A person approving a change on the website (AK-95): what they're shown first, built from the
// record. The commit is the PR head Captain's runner recorded with the tests (pr_facts, AK-57), so a
// person approves exactly what the tests ran on, or nothing.

export type ApproveState =
  /** Ready: the commit to approve and the tests line. */
  | { kind: "ready"; sha: string; tests: string }
  /** The person worked on it, so someone else has to approve it. */
  | { kind: "built"; why: string }
  /** It can't be approved here yet, and why, in one sentence. */
  | { kind: "not_yet"; why: string };

export const BUILT_IT = "You worked on this, so someone else has to approve it.";

/** "Tests: 48 of 48 passed on GitHub". */
export const testsLine = (passed: number, total: number) => `Tests: ${passed} of ${total} passed on GitHub`;

export function approveState(t: Pick<Ticket, "assignee_id" | "built_by" | "pr_facts">, me: string): ApproveState {
  if (t.assignee_id === me || (t.built_by ?? []).includes(me)) return { kind: "built", why: BUILT_IT };
  const f = t.pr_facts;
  if (!f || !/^[0-9a-f]{40}$/i.test(f.sha)) return { kind: "not_yet", why: "Captain hasn't recorded this pull request's tests yet, so it can't be approved here yet." };
  const { passed, total, state } = f.checks;
  if (!total) return { kind: "not_yet", why: "No automatic tests ran on this pull request, so it can't be approved here." };
  if (state === "pending") return { kind: "not_yet", why: `The tests are still running (${passed} of ${total} so far). It can be approved here once they pass.` };
  if (state !== "success" || passed < total) return { kind: "not_yet", why: `Tests failed on GitHub (${passed} of ${total} passed), so it can't be approved until they pass.` };
  return { kind: "ready", sha: f.sha.toLowerCase(), tests: testsLine(passed, total) };
}

/**
 * Where a change in Review stands against its last approval (AK-106). An approval only counts for the
 * exact commit it names, so once the runner records the tests for a newer commit, the change needs a
 * new one. Without a recorded commit there's nothing to check the approval against.
 */
export type Approval =
  /** Not in Review with a pull request. */
  | { kind: "none" }
  /** Never approved. */
  | { kind: "never" }
  /** Approved at the commit the runner last recorded. */
  | { kind: "current"; sha: string }
  /** Approved at an older commit than the one the runner last recorded. */
  | { kind: "moved"; approved: string; head: string }
  /** Approved, but the runner hasn't recorded which commit the pull request is at. */
  | { kind: "unknown"; approved: string };

type ApprovalFields = Pick<Ticket, "status" | "pr_url" | "approved_sha" | "pr_facts">;

export function approval(t: ApprovalFields): Approval {
  if (t.status !== "review" || !t.pr_url) return { kind: "none" };
  const approved = t.approved_sha?.trim().toLowerCase();
  if (!approved) return { kind: "never" };
  const head = t.pr_facts?.sha?.trim().toLowerCase();
  if (!head || !/^[0-9a-f]{40}$/.test(head)) return { kind: "unknown", approved };
  return head.startsWith(approved) ? { kind: "current", sha: approved } : { kind: "moved", approved, head };
}

/** Nobody has approved the commit that would merge, so the Approve button belongs here. */
export const needsApproval = (t: ApprovalFields) => !["none", "current"].includes(approval(t).kind);

/** A change in Review that waits for someone to approve it, because Captain can't or didn't (AK-95). */
export const waitsForApproval = (t: Ticket) => needsApproval(t) && isReviewQuestion(t.needs_human);

/** "Approved at 48e571b, but the change has moved on to 195f537 since. It needs a new approval." */
export const movedOnLine = (approved: string, head: string) =>
  `Approved at ${approved.slice(0, 7)}, but the change has moved on to ${head.slice(0, 7)} since. It needs a new approval.`;

/** "#41" for a GitHub pull request link; the link itself otherwise. */
export const prLabel = (url: string) => url.replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+).*$/, "#$1");
