import { describe, expect, it } from "vitest";
import { ticket, workspace, BIRCH } from "./fixtures";
import { approveState, approval } from "./approve";
import { mergeQuestion, lookTitle, type Need } from "./captain";
import { outcomeOf, watch } from "./glance";
import { results } from "./results";

const SHA = "a".repeat(40);
const checks = { passed: 8, total: 8, state: "success" as const };

describe("lightweight tickets", () => {
  it("keeps exact-commit approval and Results counts without full PR snapshots", () => {
    const t = ticket({ key: "SH-1", status: "review", pr_url: "https://github.com/team/repo/pull/1", approved_sha: SHA, assignee_id: BIRCH, description: undefined, done_means: undefined, checks, checks_sha: SHA });
    expect(approveState(t, "reviewer")).toMatchObject({ kind: "ready", sha: SHA });
    expect(approval(t)).toEqual({ kind: "current", sha: SHA });
    expect(approval({ ...t, checks_sha: "b".repeat(40) }).kind).toBe("moved");
    const now = new Date(2026, 9, 10, 15);
    const done = { ...t, status: "done" as const, completed_at: now.toISOString() };
    expect(results(workspace([done]), [], "week", now).tested).toBe(1);
  });

  it("keeps failing check warnings and merge questions, and tolerates absent descriptions", () => {
    const t = ticket({ key: "SH-1", status: "review", description: undefined, done_means: undefined, checks: { passed: 7, total: 8, state: "failure" }, checks_sha: SHA, review_question: "Save the existing records first?", review_summary: "People keep their existing records." });
    expect(watch(workspace([t]), [], new Date())).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("Tests are failing") })]));
    expect(mergeQuestion({ ticket: t } as Need)).toBe("Save the existing records first?");
    expect(lookTitle(t)).toBe("People keep their existing records.");
    expect(outcomeOf({ ...t, type: "epic", summary: "Existing records remain available." })).toBe("Existing records remain available.");
    expect(outcomeOf({ ...t, type: "epic" })).toBeNull();
  });
});
