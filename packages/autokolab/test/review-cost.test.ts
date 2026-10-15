import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseRunnerConfig } from "../src/runner/config.js";
import { chooseModel, chooseReviewModel } from "../src/runner/engines.js";
import { diffLines, earlierReview, lightReview, prLines, reviewFinding, type PrInfo } from "../src/runner/merge.js";
import { buildReviewPrompt } from "../src/runner/prompt.js";
import { diffSince } from "../src/runner/repos.js";

// Cheaper reviews (AK-117): a re-review reads only the new commits and the earlier finding, and a
// small change with nothing risky runs on the light model.

const AID = "11111111-2222-4333-8444-555555555555";
const cfgFor = (extra = "") => parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"\n${extra}`, "lee-claude");
const SHA = "c".repeat(40);
const OLD = "b".repeat(40);
const URL = "https://github.com/o/r/pull/7";
const LEAD = "lead-id";
const SQL = "packages/autokolab/sql/021_x.sql";

const pr = (files: string[], additions = 40, deletions = 10): PrInfo => ({
  state: "OPEN",
  headRefOid: SHA,
  files: files.map((path) => ({ path })),
  additions,
  deletions,
});

describe("the light review path", () => {
  it("takes small changes with nothing risky", () => {
    expect(lightReview(pr(["src/a.ts"]), 50, 150)).toEqual({ light: true, why: "50 changed lines, nothing risky" });
    expect(lightReview(pr(["src/a.ts"]), 150, 150).light).toBe(true);
  });

  it("never takes a risky change, however small", () => {
    for (const f of [SQL, ".github/workflows/ci.yml", "package.json", "src/auth/session.ts", "supabase/tests/policies.sql"]) {
      expect(lightReview(pr(["src/a.ts", f], 1, 0), 1, 150), f).toMatchObject({ light: false, why: `it touches ${f}` });
    }
    // The approval covers the whole PR, so a risky file outside the new commits still counts.
    expect(lightReview(pr(["src/a.ts", SQL]), 3, 150).light).toBe(false);
  });

  it("keeps big, unknown-size or empty changes on the full path, and can be turned off", () => {
    expect(lightReview(pr(["src/a.ts"]), 151, 150)).toMatchObject({ light: false, why: "151 changed lines" });
    expect(lightReview(pr(["src/a.ts"]), null, 150).light).toBe(false);
    expect(lightReview(pr([]), 5, 150).light).toBe(false);
    expect(lightReview({ files: null }, 5, 150).light).toBe(false);
    expect(lightReview(pr(["src/a.ts"]), 5, 0)).toMatchObject({ light: false, why: "light reviews are off" });
    expect(lightReview(pr(Array.from({ length: 100 }, (_, i) => `src/f${i}.ts`)), 5, 150).light).toBe(false);
  });

  it("counts a PR's lines from gh, and a diff's changed lines without headers", () => {
    expect(prLines(pr(["a"], 40, 10))).toBe(50);
    expect(prLines({})).toBeNull();
    expect(diffLines("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-old\n+new\n same\n+more")).toBe(3);
    expect(diffLines("")).toBe(0);
  });

  it("runs on review_model_small at low effort; full reviews keep the usual model", () => {
    const usual = { model: "opus", effort: "high" as const };
    expect(chooseReviewModel(cfgFor(), usual, true)).toEqual({ model: "sonnet", effort: "low" });
    expect(chooseReviewModel(cfgFor(), usual, false)).toEqual(usual);
    expect(chooseReviewModel(cfgFor(`[claude]\nreview_model_small = "haiku"\nreview_effort_small = "medium"`), usual, true)).toEqual({ model: "haiku", effort: "medium" });
    expect(chooseReviewModel(cfgFor(`[claude]\nreview_model_small = ""`), usual, true)).toEqual({ model: "opus", effort: "low" });
    const codex = parseRunnerConfig(`agent_id = "${AID}"\nengine = "codex"`, "lee-codex");
    expect(chooseReviewModel(codex, { model: "gpt-5-codex", effort: "high" }, true)).toEqual({ model: "gpt-5-codex", effort: "low" });
    // The owner's lock wins here too.
    const locked = cfgFor(`model_locked = true\n[claude]\nmodel = "opus"\neffort = "high"`);
    expect(chooseReviewModel(locked, chooseModel(locked, null), true)).toEqual({ model: "opus", effort: "high" });
  });

  it("has a 150-line threshold by default", () => {
    expect(cfgFor().review_small_lines).toBe(150);
    expect(cfgFor("review_small_lines = 0").review_small_lines).toBe(0);
  });
});

describe("re-reviews", () => {
  it("build on the last send-back of an older commit of the same PR", () => {
    const reviewed = { sha: OLD, pr: URL, finding: "The test for the empty list is missing." };
    expect(earlierReview({ reviewed }, URL, SHA)).toEqual(reviewed);
    expect(earlierReview({ reviewed }, URL, OLD)).toBeUndefined();
    expect(earlierReview({ reviewed }, URL, OLD.toUpperCase())).toBeUndefined();
    expect(earlierReview({ reviewed }, "https://github.com/o/r/pull/8", SHA)).toBeUndefined();
    expect(earlierReview({ reviewed: { ...reviewed, finding: " " } }, URL, SHA)).toBeUndefined();
    expect(earlierReview({}, URL, SHA)).toBeUndefined();
    expect(earlierReview(null, URL, SHA)).toBeUndefined();
  });

  it("take the finding from the lead's comments during that review", () => {
    const comments = [
      { id: 3, author_id: LEAD, body: "Earlier answer." },
      { id: 5, author_id: "worker", body: "Done." },
      { id: 7, author_id: LEAD, body: " The empty list isn't tested. " },
      { id: 6, author_id: LEAD, body: "Missing: docs." },
    ];
    expect(reviewFinding(comments, LEAD, 4)).toBe("Missing: docs.\n\nThe empty list isn't tested.");
    expect(reviewFinding(comments, LEAD, 7)).toBe("");
    expect(reviewFinding([{ id: 9, author_id: LEAD, body: "x".repeat(10_000) }], LEAD, 0).length).toBe(4000);
  });

  it("show the earlier finding and only the new diff", () => {
    const base = {
      myName: "ana-claude",
      ownerName: "ana",
      projectName: "Shop",
      key: "SH-9",
      title: "Dark mode",
      description: "Add a dark mode toggle.",
      doneMeans: ["Toggle works"],
      prUrl: URL,
      sha: SHA,
      checks: ["checks: passed"],
      files: ["src/theme.ts"],
      risky: [],
      diff: "+the fix",
      decisions: [],
      repoPath: "/w/review",
      base: "main",
    };
    const p = buildReviewPrompt({ ...base, earlier: { sha: OLD, finding: "The empty list isn't tested." } });
    expect(p).toContain(`after you sent it back at ${OLD.slice(0, 7)}`);
    expect(p).toContain(`=== What you said when you sent it back at ${OLD} ===\nThe empty list isn't tested.`);
    expect(p).toContain(`=== The diff since ${OLD} ===\n+the fix`);
    expect(p).toContain("don't review it again from scratch");
    expect(p).toContain(`ticket_approve key=SH-9 sha=${SHA}`);
    expect(buildReviewPrompt({ ...base, earlier: { sha: OLD, finding: "x" }, diff: "y".repeat(70_000) })).toContain(`git diff ${OLD}..HEAD -- <file>`);
    const first = buildReviewPrompt(base);
    expect(first).not.toContain("sent it back");
    expect(first).toContain("=== The diff ===\n+the fix");
  });
});

describe("the diff since the last reviewed commit", () => {
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  let root: string;
  let clone: string;
  let wt: { clone: string; path: string };
  const commit = (file: string, text: string) => {
    writeFileSync(join(clone, file), text);
    git(clone, "add", file);
    git(clone, "commit", "-q", "-m", file);
    return git(clone, "rev-parse", "HEAD");
  };
  const checkout = (sha: string) => git(wt.path, "switch", "-q", "--detach", sha);

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "ak-rereview-")));
    clone = join(root, "clone");
    git(root, "init", "-q", "-b", "main", clone);
    commit("base.txt", "base\n");
    wt = { clone, path: join(root, "review") };
    git(clone, "worktree", "add", "-q", "--detach", wt.path);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("is only the new commits", () => {
    git(clone, "switch", "-q", "-c", "feature");
    const reviewed = commit("a.txt", "first try\n");
    const fixed = commit("b.txt", "the fix\n");
    checkout(fixed);
    const d = diffSince(wt, reviewed)!;
    expect(d).toContain("+the fix");
    expect(d).not.toContain("first try");
    expect(diffLines(d)).toBe(1);
  });

  it("is null after a rebase, a merge, or for a commit Git doesn't have, so the whole PR is reviewed", () => {
    git(clone, "switch", "-q", "main");
    const other = commit("c.txt", "elsewhere\n");
    checkout(other);
    expect(diffSince(wt, git(clone, "rev-parse", "feature"))).toBeNull();
    git(clone, "switch", "-q", "feature");
    const before = git(clone, "rev-parse", "HEAD");
    git(clone, "merge", "-q", "--no-edit", "main");
    checkout(git(clone, "rev-parse", "HEAD"));
    expect(diffSince(wt, before)).toBeNull();
    expect(diffSince(wt, "d".repeat(40))).toBeNull();
    expect(diffSince({ clone, path: root }, before)).toBeNull();
  });
});
