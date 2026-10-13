import type { Ticket } from "../lib/data";

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

/** "#41" for a GitHub pull request link; the link itself otherwise. */
export const prLabel = (url: string) => url.replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+).*$/, "#$1");
