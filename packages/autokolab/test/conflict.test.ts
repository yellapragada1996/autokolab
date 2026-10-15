import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MERGE_FAILED_PREFIX, isMergeQuestion } from "../src/core/projects.js";
import {
  MAX_CONFLICT_SEND_BACKS,
  PR_CONFLICTS,
  baseMergeNote,
  conflictComment,
  conflictDecision,
  conflictQuestion,
  conflictSendBackBase,
  isConflictQuestion,
  mergeDecision,
  mergeNeedsHuman,
  plainGhError,
  reviewDecision,
  type ConflictRecord,
  type PrInfo,
} from "../src/runner/merge.js";
import { ship, startBaseMerge, trustedIo, worktreeFacts, type ShipIo } from "../src/runner/ship.js";
import { worktreeGitDir } from "../src/runner/repos.js";

// AK-124: a PR that conflicts with main goes back to its builder, and only a person after 2 send-backs.

const URL = "https://github.com/ana/shop/pull/12";
const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40), D = "d".repeat(40);
const LEAD = "lead-id", WORKER = "worker-id";
const green = [{ name: "checks", status: "COMPLETED", conclusion: "SUCCESS" }];
const pr = (over: Partial<PrInfo> = {}): PrInfo => ({ number: 12, state: "OPEN", baseRefName: "main", headRefOid: A, mergeable: "MERGEABLE", statusCheckRollup: green, files: [{ path: "src/a.ts" }], ...over });
const ticket = { assignee_id: WORKER, built_by: [WORKER], needs_human: null };

describe("conflicts found by Captain's runner (AK-124)", () => {
  it("sends a conflicting PR back before reviewing it, even with no checks", () => {
    expect(reviewDecision(ticket, pr({ mergeable: "CONFLICTING" }), LEAD, null)).toMatchObject({ action: "conflict", sha: A });
    expect(reviewDecision(ticket, pr({ mergeable: "CONFLICTING", statusCheckRollup: [] }), LEAD, null).action).toBe("conflict");
    // A commit already handled isn't sent back twice; a question for a person still holds it.
    expect(reviewDecision(ticket, pr({ mergeable: "CONFLICTING" }), LEAD, { sha: A, reviews: 0 }).action).toBe("wait");
    expect(reviewDecision({ ...ticket, needs_human: "Which colour?" }, pr({ mergeable: "CONFLICTING" }), LEAD, null).action).toBe("wait");
    // While GitHub hasn't worked it out, it's reviewed as usual.
    expect(reviewDecision(ticket, pr({ mergeable: "UNKNOWN" }), LEAD, null).action).toBe("review");
  });

  it("sends an approved PR back when it conflicts at merge time, without a question for a person", () => {
    const d = mergeDecision("auto_safe", pr({ mergeable: "CONFLICTING" }), { approved_sha: A, merge_ok_by: null }, "main");
    expect(d.action).toBe("conflict");
    expect(d.question).toBeUndefined();
    expect(mergeNeedsHuman(null, d)).toBeUndefined();
    // A merge that fails because main moved in between counts as a conflict too.
    expect(plainGhError("GraphQL: Pull Request is not mergeable (mergePullRequest)", "here")).toBe(PR_CONFLICTS);
  });

  it("sends the first conflict back, then the second, then asks a person on the third", () => {
    const first = conflictDecision(null, URL, A);
    expect(first).toEqual({ action: "send_back", next: { pr: URL, sentBack: 1, sha: A } });
    // The same commit seen again (the merge check after the review check, a restart): nothing new.
    expect(conflictDecision(first.next, URL, A.toUpperCase()).action).toBe("wait");
    const second = conflictDecision(first.next, URL, B);
    expect(second).toEqual({ action: "send_back", next: { pr: URL, sentBack: 2, sha: B } });
    const third = conflictDecision(second.next, URL, C);
    expect(third).toEqual({ action: "ask", next: { pr: URL, sentBack: MAX_CONFLICT_SEND_BACKS, sha: C } });
    expect(conflictDecision(third.next, URL, C).action).toBe("wait"); // asked once
    expect(conflictDecision(third.next, URL, D).action).toBe("ask");
  });

  it("starts over for a new PR", () => {
    const old: ConflictRecord = { pr: "https://github.com/ana/shop/pull/9", sentBack: 2, sha: A };
    expect(conflictDecision(old, URL, A)).toEqual({ action: "send_back", next: { pr: URL, sentBack: 1, sha: A } });
  });

  it("after a send-back, a pushed fix that merges cleanly is reviewed as a new commit", () => {
    const handled = { sha: A, reviews: 1 };
    expect(reviewDecision(ticket, pr({ headRefOid: B }), LEAD, handled)).toMatchObject({ action: "review", sha: B });
    // And still conflicting: back again.
    expect(reviewDecision(ticket, pr({ headRefOid: B, mergeable: "CONFLICTING" }), LEAD, handled).action).toBe("conflict");
  });

  it("tells the builder what to do, in a comment its runner recognises", () => {
    const c = conflictComment(URL, "main", 1);
    expect(c).toBe(
      "PR #12 conflicts with main; merge main into the branch, fix the conflicts, run the tests and push. I've moved it back to In progress (send-back 1 of 2). If you can't resolve it, set Needs you and say why. Captain reviews the new commit once it's pushed.",
    );
    expect(conflictSendBackBase(c)).toBe("main");
    expect(conflictSendBackBase(conflictComment(URL, "release/2.x", 2))).toBe("release/2.x");
    expect(conflictSendBackBase("Tests didn't pass on PR #12")).toBeNull();
    expect(conflictSendBackBase("PR #12 conflicts with --upload-pack=x; merge --upload-pack=x into the branch")).toBeNull();
  });

  it("asks a person one plain question, which a clean commit settles", () => {
    const q = conflictQuestion(URL, "main");
    expect(q).toBe(`${MERGE_FAILED_PREFIX}: PR #12 still conflicts with main after 2 send-backs to its builder. Can you resolve it, or tell the builder how?`);
    expect(isConflictQuestion(q)).toBe(true);
    expect(isMergeQuestion(q)).toBe(true); // so a review isn't held up by it
    expect(isConflictQuestion(`${MERGE_FAILED_PREFIX} PR #3: gh failed`)).toBe(false);
    expect(reviewDecision({ ...ticket, needs_human: q }, pr({ headRefOid: B }), LEAD, { sha: A, reviews: 1 }).action).toBe("review");
  });
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

describe("the builder's runner merges main in for a send-back (AK-124, AK-66)", () => {
  let root: string, remote: string, clone: string, wt: string, io: ShipIo;
  const job = { path: "", repo: "ana/shop", branch: "sh-3-colour", base: "main", title: "SH-3: Colour (follow-up)", body: "", steps: ["commit", "push"] as ("commit" | "push")[], pr: URL };

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "ak-conflict-")));
    remote = join(root, "remote.git");
    clone = join(root, "clone");
    wt = join(root, "wt");
    job.path = wt;
    git(root, "init", "-q", "--bare", "-b", "main", remote);
    git(root, "clone", "-q", remote, clone);
    for (const [k, v] of [["user.email", "t@example.com"], ["user.name", "T"], ["commit.gpgsign", "false"]]) git(clone, "config", k, v);
    writeFileSync(join(clone, "colour.txt"), "red\n");
    writeFileSync(join(clone, "size.txt"), "small\n");
    git(clone, "add", "-A");
    git(clone, "commit", "-q", "-m", "first");
    git(clone, "push", "-q", "-u", "origin", "main");
    git(clone, "worktree", "add", "-q", "-b", "sh-3-colour", wt, "origin/main");
    io = { git: trustedIo(worktreeGitDir(clone, wt)!).git, gh: () => ({ ok: true, out: "[]", err: "" }) };
    // The ticket's branch says blue; meanwhile main says green.
    writeFileSync(join(wt, "colour.txt"), "blue\n");
    git(wt, "commit", "-qam", "blue");
    git(wt, "push", "-q", "-u", "origin", "sh-3-colour");
    git(clone, "checkout", "-q", "main");
    writeFileSync(join(clone, "colour.txt"), "green\n");
    git(clone, "commit", "-qam", "green");
    git(clone, "push", "-q", "origin", "main");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("starts the merge and lists the files that conflict", () => {
    const r = startBaseMerge(io, wt, "main");
    expect(r).toEqual({ conflicts: ["colour.txt"] });
    expect(baseMergeNote("main", r)).toContain("These files have conflicts: colour.txt.");
    // Run again (a second comment, a restart): the merge under way is left alone.
    expect(startBaseMerge(io, wt, "main")).toEqual({ skipped: "there are unsaved changes" });
  });

  it("never commits files that still have conflict markers", () => {
    expect(readFileSync(join(wt, "colour.txt"), "utf8")).toContain("<<<<<<<");
    const r = ship(io, job);
    expect(r).toMatchObject({ ok: false, step: "commit" });
    expect(!r.ok && r.error).toContain("still have merge conflict markers");
  });

  it("finishes the merge for an agent that only fixed the files, and pushes it", () => {
    // What a sandboxed agent can do: edit the file, but not git add or commit.
    writeFileSync(join(wt, "colour.txt"), "blue-green\n");
    expect(worktreeFacts(io, wt, "main", "sh-3-colour")).toMatchObject({ dirty: true, behind: 0 });
    expect(ship(io, job)).toEqual({ ok: true, pr: URL, did: ["commit", "push"] });
    // A real merge commit: main is in the branch's history, so the PR no longer conflicts.
    expect(git(wt, "rev-list", "--parents", "-n", "1", "HEAD").split(" ")).toHaveLength(3);
    git(wt, "merge-base", "--is-ancestor", "origin/main", "HEAD");
    expect(git(remote, "show", "sh-3-colour:colour.txt")).toBe("blue-green");
  });

  it("commits a clean merge at once, and does nothing once main is in", () => {
    expect(startBaseMerge(io, wt, "main")).toEqual({ skipped: "the branch already has main" });
    git(clone, "checkout", "-q", "main");
    writeFileSync(join(clone, "size.txt"), "large\n");
    git(clone, "commit", "-qam", "large");
    git(clone, "push", "-q", "origin", "main");
    const r = startBaseMerge(io, wt, "main");
    expect(r).toEqual({ merged: true });
    expect(baseMergeNote("main", r)).toContain("merged into this branch cleanly");
    expect(readFileSync(join(wt, "size.txt"), "utf8")).toBe("large\n");
    const f = worktreeFacts(io, wt, "main", "sh-3-colour");
    expect(f.dirty).toBe(false);
    expect(f.ahead).toBeGreaterThan(0); // so the runner pushes it after the run
    expect(baseMergeNote("main", { skipped: "x" })).toBeNull();
  });
});
