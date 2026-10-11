import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApproveChange } from "./Approve";
import { LEAD_BUILT_QUESTION, REVIEW_FAILED_PREFIX, REVIEW_LIMIT_QUESTION, waitsForApproval, type PrFacts } from "../lib/data";
import { approveState, BUILT_IT, prLabel } from "./approve";
import { BIRCH, CAPTAIN, ME, ticket } from "./fixtures";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const facts = (checks: PrFacts["checks"], sha = SHA): PrFacts => ({ sha, checks, files: { total: 3, risky: [] }, additions: 10, deletions: 2 });
const green = facts({ passed: 48, total: 48, state: "success" });

describe("approving as a person", () => {
  it("is ready at the commit the runner recorded, after its tests passed", () => {
    const t = ticket({ key: "SH-1", assignee_id: CAPTAIN, built_by: [CAPTAIN], pr_facts: facts({ passed: 48, total: 48, state: "success" }, SHA.toUpperCase()) });
    expect(approveState(t, ME)).toEqual({ kind: "ready", sha: SHA, tests: "Tests: 48 of 48 passed on GitHub" });
  });

  it("is refused to anyone who worked on it, or holds it now", () => {
    expect(approveState(ticket({ key: "SH-1", assignee_id: BIRCH, built_by: [BIRCH, ME], pr_facts: green }), ME)).toEqual({ kind: "built", why: BUILT_IT });
    expect(approveState(ticket({ key: "SH-1", assignee_id: ME, built_by: [], pr_facts: green }), ME).kind).toBe("built");
    // A database before schema 17 has no built_by: only the assignee counts.
    expect(approveState(ticket({ key: "SH-1", assignee_id: BIRCH, built_by: undefined, pr_facts: green }), ME).kind).toBe("ready");
  });

  it("waits until there are recorded tests, and they all passed", () => {
    const why = (f: PrFacts | null) => approveState(ticket({ key: "SH-1", assignee_id: BIRCH, pr_facts: f }), ME);
    expect(why(null)).toEqual({ kind: "not_yet", why: "Captain hasn't recorded this pull request's tests yet, so it can't be approved here yet." });
    expect(why(facts({ passed: 0, total: 0, state: "success" }))).toEqual({ kind: "not_yet", why: "No automatic tests ran on this pull request, so it can't be approved here." });
    expect(why(facts({ passed: 31, total: 48, state: "pending" }))).toEqual({ kind: "not_yet", why: "The tests are still running (31 of 48 so far). It can be approved here once they pass." });
    expect(why(facts({ passed: 40, total: 48, state: "failure" }))).toEqual({ kind: "not_yet", why: "Tests failed on GitHub (40 of 48 passed), so it can't be approved until they pass." });
    expect(why(facts({ passed: 48, total: 48, state: "success" }, "abc1234")).kind).toBe("not_yet");
  });

  it("knows which changes wait for an approval", () => {
    const waiting = (over: Parameters<typeof ticket>[0]) => waitsForApproval(ticket({ status: "review", pr_url: "https://github.com/a/b/pull/7", ...over }));
    expect(waiting({ key: "SH-1", needs_human: LEAD_BUILT_QUESTION })).toBe(true);
    expect(waiting({ key: "SH-1", needs_human: REVIEW_LIMIT_QUESTION })).toBe(true);
    expect(waiting({ key: "SH-1", needs_human: `${REVIEW_FAILED_PREFIX}: the run stopped.` })).toBe(true);
    expect(waiting({ key: "SH-1", needs_human: "Redis or Postgres?" })).toBe(false);
    expect(waiting({ key: "SH-1", needs_human: LEAD_BUILT_QUESTION, approved_sha: SHA })).toBe(false);
    expect(waiting({ key: "SH-1", needs_human: LEAD_BUILT_QUESTION, pr_url: null })).toBe(false);
    expect(waiting({ key: "SH-1", needs_human: LEAD_BUILT_QUESTION, status: "in_progress" })).toBe(false);
  });

  it("shows the plain line, the tests, the commit and the PR before the button, or one sentence instead", () => {
    const html = (t: Parameters<typeof ticket>[0]) => renderToStaticMarkup(createElement(ApproveChange, { t: ticket(t), me: ME, id: "a", onApprove: () => undefined }));
    const ready = html({ key: "SH-1", title: "Tidy the emails", summary: "Order emails show one table", assignee_id: CAPTAIN, built_by: [CAPTAIN], pr_url: "https://github.com/ana/shop/pull/45", pr_facts: green });
    for (const text of ["Order emails show one table", "Tests: 48 of 48 passed on GitHub", "a1b2c3d", "Pull request #45", "Anything you&#x27;re unsure about?", "Approve this change"]) expect(ready).toContain(text);
    const built = html({ key: "SH-1", assignee_id: CAPTAIN, built_by: [CAPTAIN, ME], pr_facts: green });
    expect(built).toContain(BUILT_IT.replace("'", "&#x27;"));
    expect(built).not.toContain("Approve this change");
    expect(html({ key: "SH-1", assignee_id: CAPTAIN, pr_facts: null })).not.toContain("<button");
  });

  it("names a pull request by its number", () => {
    expect(prLabel("https://github.com/ana/shop/pull/41")).toBe("#41");
    expect(prLabel("https://github.com/ana/shop/pull/41/files")).toBe("#41");
    expect(prLabel("https://example.com/x")).toBe("https://example.com/x");
  });
});
