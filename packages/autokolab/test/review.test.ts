import { describe, expect, it } from "vitest";
import { LEAD_APPROVAL, MERGE_OK_PREFIX, NOTHING_UNSURE, REVIEW_EVIDENCE, isMergeQuestion, leadGuide } from "../src/core/projects.js";
import { mergeDecision, mergeNeedsHuman, mergeOkQuestion, reviewFrom, riskyFiles, type PrInfo } from "../src/runner/merge.js";

// What a reviewer records with its approval (AK-45): the evidence people read instead of the diff.

const SQL = "packages/autokolab/sql/017_provider.sql";
const QUESTION = "Existing sessions keep working and get an empty provider. OK to add the column?";

describe("what ticket_approve records", () => {
  it("always needs where the reviewer is less sure", () => {
    const r = reviewFrom({ summary: "Sessions remember the provider" }, []);
    expect("problem" in r && r.problem).toContain("Say where you're less sure (less_sure)");
    expect("problem" in r && r.problem).toContain(NOTHING_UNSURE);
    expect(reviewFrom({ less_sure: "   " }, [])).toHaveProperty("problem");
    expect(reviewFrom({ less_sure: NOTHING_UNSURE }, [])).toEqual({ review: { less_sure: NOTHING_UNSURE } });
  });

  it("needs a question when the change is risky, and names the files", () => {
    const r = reviewFrom({ less_sure: "I didn't run it on real data." }, [SQL, "package.json"]);
    expect("problem" in r && r.problem).toContain(`This PR touches ${SQL}, package.json, so a person has to OK it`);
    expect(reviewFrom({ less_sure: "x", question: QUESTION }, [SQL])).toEqual({ review: { question: QUESTION, less_sure: "x" } });
  });

  it("refuses a question that isn't one, or isn't about the change", () => {
    expect(reviewFrom({ less_sure: "x", question: "This adds a column." }, [SQL])).toHaveProperty("problem");
    for (const q of ["OK to merge?", "ok to merge this?", "Is it safe to merge?", "Okay?"]) {
      const r = reviewFrom({ less_sure: "x", question: q }, [SQL]);
      expect("problem" in r && r.problem, q).toContain("Make the question about this change");
    }
    // A question is welcome on a safe change too.
    expect(reviewFrom({ less_sure: "x", question: "The button moves to the left. OK?" }, [])).toHaveProperty("review");
  });

  it("builds the review from the flat fields, trimmed", () => {
    const r = reviewFrom(
      {
        less_sure: " I didn't run it on real data. ",
        summary: " Sessions remember which provider signed you in ",
        question: QUESTION,
        line_file: ` ${SQL} `,
        line_code: "  alter table sessions add column provider text;\n",
        line_plain: " Adds one empty column. ",
        decisions: ["dec-19", "CON-15", "DEC-19"],
      },
      [SQL],
    );
    expect(r).toEqual({
      review: {
        summary: "Sessions remember which provider signed you in",
        question: QUESTION,
        line: { file: SQL, code: "  alter table sessions add column provider text;", plain: "Adds one empty column." },
        decisions: ["DEC-19", "CON-15"],
        less_sure: "I didn't run it on real data.",
      },
    });
  });

  it("needs both halves of the line that matters", () => {
    expect(reviewFrom({ less_sure: "x", line_file: "a.ts" }, [])).toHaveProperty("problem");
    expect(reviewFrom({ less_sure: "x", line_code: "x = 1" }, [])).toHaveProperty("problem");
    expect(reviewFrom({ less_sure: "x", line_plain: "only the meaning" }, [])).toEqual({ review: { less_sure: "x" } });
  });
});

describe("the question a person sees for a risky merge", () => {
  const SHA = "a".repeat(40);
  const pr = (files: string[]): PrInfo => ({
    state: "OPEN",
    headRefOid: SHA,
    mergeable: "MERGEABLE",
    baseRefName: "main",
    statusCheckRollup: [{ __typename: "CheckRun", name: "checks", status: "COMPLETED", conclusion: "SUCCESS" }],
    files: files.map((path) => ({ path })),
  });

  it("is the reviewer's question, then the files", () => {
    expect(mergeOkQuestion([SQL], QUESTION)).toBe(`${MERGE_OK_PREFIX} ${QUESTION} (${SQL})`);
    expect(mergeOkQuestion([SQL], "  ")).toBe(`${MERGE_OK_PREFIX} ${SQL}`);
    expect(mergeOkQuestion([SQL])).toBe(`${MERGE_OK_PREFIX} ${SQL}`);
    expect(isMergeQuestion(mergeOkQuestion([SQL], QUESTION))).toBe(true);
    expect(mergeOkQuestion([SQL], "x".repeat(2000) + "?").length).toBe(1000);
  });

  it("is what the runner puts in Needs you", () => {
    const withReview = { approved_sha: SHA, merge_ok_by: null, review: { question: QUESTION, less_sure: "x" } };
    const d = mergeDecision("auto_safe", pr(["README.md", SQL]), withReview, "main");
    expect(d).toMatchObject({ action: "needs_ok", question: `${MERGE_OK_PREFIX} ${QUESTION} (${SQL})`, risky: [SQL] });
    // Set once, then left alone; replaced if the old file-list question is still there.
    expect(mergeNeedsHuman(null, d)).toBe(d.question);
    expect(mergeNeedsHuman(d.question!, d)).toBeUndefined();
    expect(mergeNeedsHuman(`${MERGE_OK_PREFIX} ${SQL}`, d)).toBe(d.question);
  });

  it("falls back to the files when the approval came without a review", () => {
    for (const t of [{ approved_sha: SHA, merge_ok_by: null }, { approved_sha: SHA, merge_ok_by: null, review: null }, { approved_sha: SHA, merge_ok_by: null, review: { less_sure: "x" } }]) {
      expect(mergeDecision("auto_safe", pr([SQL]), t, "main").question).toBe(`${MERGE_OK_PREFIX} ${SQL}`);
    }
  });

  it("merges once a person OK'd it, and never asks under the other settings", () => {
    const t = { approved_sha: SHA, merge_ok_by: null, review: { question: QUESTION, less_sure: "x" } };
    expect(mergeDecision("auto_safe", pr([SQL]), { ...t, merge_ok_by: "someone" }, "main").action).toBe("merge");
    expect(mergeDecision("auto_all", pr([SQL]), t, "main").action).toBe("merge");
    expect(mergeDecision("ask", pr([SQL]), t, "main").action).toBe("ask");
  });

  it("lists a PR's risky files, and treats 100+ files as risky", () => {
    expect(riskyFiles(pr(["README.md", SQL, "src/auth.ts"]))).toEqual([SQL, "src/auth.ts"]);
    expect(riskyFiles(pr(["README.md"]))).toEqual([]);
    expect(riskyFiles({ files: null })).toEqual([]);
    expect(riskyFiles(pr(Array.from({ length: 100 }, (_, i) => `src/f${i}.ts`)))).toEqual(["100+ files, too many to check"]);
  });
});

describe("the lead's guidance", () => {
  it("explains how to write each field", () => {
    expect(LEAD_APPROVAL).toContain(REVIEW_EVIDENCE);
    expect(leadGuide("Shop", ["ana"])).toContain(REVIEW_EVIDENCE);
    for (const word of ["less_sure (always)", NOTHING_UNSURE, "summary:", "question (required when the PR touches the database, CI, dependencies, auth or secrets)", 'never just "OK to merge?"', "line_file, line_code, line_plain", "decisions:", "rather than persuade"]) {
      expect(REVIEW_EVIDENCE, word).toContain(word);
    }
  });
});
