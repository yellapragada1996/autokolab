import { describe, expect, it } from "vitest";
import type { PrFacts, Ticket } from "../lib/data";
import { andList, approvedFacts, changeCounts, evidence, riskyLine } from "./evidence";
import { BIRCH, CAPTAIN, FJORD, at, decision, ticket, workspace } from "./fixtures";

const decisions = [decision("DEC-12", "Agent limits are enforced by the helper", at("07:00")), decision("DEC-24", "Sessions live in Postgres", at("07:00"))];

describe("evidence rows", () => {
  it("builds every row from a full review, in the fixed order", () => {
    const t = ticket({
      key: "SH-7",
      assignee_id: BIRCH,
      approved_by: CAPTAIN,
      approved_sha: "9f3c2e1aa0b1c2d3",
      review: {
        summary: "Sessions move to Postgres.",
        line: { file: "db/004_sessions.sql", code: "+create table sessions", plain: "A new sessions table." },
        decisions: ["DEC-12", " dec-24 ", "DEC-12"],
        less_sure: "  The sign-out on deploy wasn't tried on a live site.  ",
      },
    });
    const rows = evidence(workspace([t], { decisions }), t);
    expect(rows.map((r) => r.kind)).toEqual(["review", "change", "decisions", "trail", "less_sure"]);
    expect(rows).toEqual([
      { kind: "review", text: "Reviewed by me at commit 9f3c2e1", sub: "Checked against the ticket's “done means”. Birch built it, so Birch couldn't approve it." },
      { kind: "change", text: "Sessions move to Postgres.", sub: "The line that matters is in db/004_sessions.sql", action: { label: "See the change", part: "change" } },
      { kind: "decisions", text: "Follows DEC-12 and DEC-24", decisions: ["DEC-12", "DEC-24"], sub: "Agent limits are enforced by the helper · Sessions live in Postgres" },
      { kind: "trail", text: "Every step of SH-7 is in the record", action: { label: "See the history", part: "history" } },
      { kind: "less_sure", text: "Where I'm less sure", sub: "The sign-out on deploy wasn't tried on a live site." },
    ]);
    expect(rows.some((r) => /test/i.test(r.text))).toBe(false);
  });

  it("leaves out rows a partial review has nothing for", () => {
    const t = ticket({ key: "SH-8", assignee_id: CAPTAIN, approved_by: FJORD, approved_sha: "abcdef0123", review: { question: "OK?", decisions: [" "], less_sure: "" } });
    const rows = evidence(workspace([t], { decisions }), t);
    expect(rows.map((r) => r.kind)).toEqual(["review", "trail", "less_sure"]);
    expect(rows[0]).toMatchObject({ text: "Reviewed by Fjord at commit abcdef0", sub: "Checked against the ticket's “done means”. I built it, so I couldn't approve it." });
    expect(rows[2].sub).toBe("Nothing I'm unsure about here.");
  });

  it("uses the line when there's no summary, and skips unknown decision titles", () => {
    const t = ticket({ key: "SH-9", review: { line: { file: "src/a.ts", code: "+x" }, decisions: ["DEC-99"], less_sure: "None." } });
    const rows = evidence(workspace([t], { decisions }), t);
    expect(rows.map((r) => r.kind)).toEqual(["change", "decisions", "trail", "less_sure"]);
    expect(rows[0]).toMatchObject({ text: "The line that matters is in src/a.ts", sub: undefined });
    expect(rows[1]).toMatchObject({ text: "Follows DEC-99", sub: undefined });
  });

  it("with no review, shows only the trail and says nobody has reviewed it", () => {
    const t = ticket({ key: "SH-10", assignee_id: BIRCH });
    expect(evidence(workspace([t]), t)).toEqual([
      { kind: "trail", text: "Every step of SH-10 is in the record", action: { label: "See the history", part: "history" } },
      { kind: "less_sure", text: "Where I'm less sure", sub: "Nobody has reviewed this yet." },
    ]);
  });

  it("an approval with no review notes doesn't claim nobody reviewed it", () => {
    const t = ticket({ key: "SH-11", approved_by: CAPTAIN, approved_sha: "1234567890" });
    const rows = evidence(workspace([t]), t);
    expect(rows.map((r) => r.kind)).toEqual(["review", "trail", "less_sure"]);
    expect(rows[0].sub).toBe("Checked against the ticket's “done means”.");
    expect(rows[2].sub).toBe("The review didn't record where it was less sure.");
  });

  describe("tests and change counts from the PR snapshot (AK-57)", () => {
    const SHA = "9f3c2e1aa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5";
    const facts = (extra: Partial<PrFacts> = {}): PrFacts => ({
      sha: SHA,
      checks: { passed: 48, total: 48, state: "success" },
      files: { total: 3, risky: ["db/004_sessions.sql"] },
      additions: 62,
      deletions: 4,
      checked_at: at("09:00"),
      ...extra,
    });
    const review = { summary: "Sessions move to Postgres.", line: { file: "db/004_sessions.sql", code: "+create table sessions" }, less_sure: "None." };
    const approved = (extra: Partial<Ticket> = {}) => ticket({ key: "SH-20", assignee_id: BIRCH, approved_by: CAPTAIN, approved_sha: SHA, review, pr_facts: facts(), ...extra });

    it("puts the Tests row first and the counts under What changes", () => {
      const t = approved();
      const rows = evidence(workspace([t]), t);
      expect(rows.map((r) => r.kind)).toEqual(["tests", "review", "change", "trail", "less_sure"]);
      expect(rows[0]).toEqual({ kind: "tests", tone: "green", text: "Tests: 48 of 48 passed on GitHub" });
      expect(rows[2]).toMatchObject({ text: "Sessions move to Postgres.", sub: "3 files, +62 −4. Needs a person's OK: db/004_sessions.sql · The line that matters is in db/004_sessions.sql" });
    });
    it("is coral when a test failed and blue while they run", () => {
      const failed = approved({ pr_facts: facts({ checks: { passed: 46, total: 48, state: "failure" } }) });
      expect(evidence(workspace([failed]), failed)[0]).toEqual({ kind: "tests", tone: "coral", text: "Tests: 46 of 48 passed on GitHub" });
      const running = approved({ pr_facts: facts({ checks: { passed: 31, total: 48, state: "pending" } }) });
      expect(evidence(workspace([running]), running)[0]).toEqual({ kind: "tests", tone: "blue", text: "Tests still running: 31 of 48 so far" });
    });
    it("says nothing about tests when none ran", () => {
      const t = approved({ pr_facts: facts({ checks: { passed: 0, total: 0, state: "pending" } }) });
      expect(evidence(workspace([t]), t).map((r) => r.kind)).toEqual(["review", "change", "trail", "less_sure"]);
    });
    it("leaves it all out for a snapshot of another commit, or none", () => {
      const before = ticket({ key: "SH-21", approved_by: CAPTAIN, approved_sha: SHA, review });
      for (const t of [
        approved({ pr_facts: facts({ sha: "b".repeat(40) }) }),
        approved({ approved_sha: null, approved_by: null }),
        approved({ pr_facts: null }),
        { ...before },
      ]) {
        const rows = evidence(workspace([t]), t);
        expect(rows.some((r) => r.kind === "tests"), t.key).toBe(false);
        expect(rows.find((r) => r.kind === "change")?.sub ?? "").not.toMatch(/files?, \+/);
        expect(approvedFacts(t)).toBeNull();
      }
    });
    it("makes the counts the main line when the review has nothing to say about the change", () => {
      const t = approved({ review: { less_sure: "None." }, pr_facts: facts({ files: { total: 1, risky: [] }, additions: 5, deletions: 0 }) });
      expect(evidence(workspace([t]), t).find((r) => r.kind === "change")).toEqual({ kind: "change", text: "What changes: 1 file, +5 −0", sub: undefined, action: { label: "See the change", part: "change" } });
    });
    it("names up to three risky files", () => {
      expect(changeCounts(facts())).toBe("3 files, +62 −4");
      expect(riskyLine(facts({ files: { total: 9, risky: [] } }))).toBeUndefined();
      expect(riskyLine(facts({ files: { total: 9, risky: ["a.sql", "b.sql"] } }))).toBe("Needs a person's OK: a.sql and b.sql");
      expect(riskyLine(facts({ files: { total: 9, risky: ["a.sql", "b.sql", "c.yml", "package.json", "d.sql"] } }))).toBe("Needs a person's OK: a.sql, b.sql, c.yml and 2 more");
    });
  });

  it("joins keys in plain English", () => {
    expect(andList([])).toBe("");
    expect(andList(["DEC-1"])).toBe("DEC-1");
    expect(andList(["DEC-1", "DEC-2", "DEC-3"])).toBe("DEC-1, DEC-2 and DEC-3");
  });
});
