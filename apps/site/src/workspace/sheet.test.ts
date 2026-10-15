import { describe, expect, it, vi } from "vitest";
import { MERGE_OK_PREFIX, type TicketEvent } from "../lib/data";
import { parse, showHref } from "../lib/router";
import { BIRCH, CAPTAIN, ME, at, ticket, workspace } from "./fixtures";
import { changedFiles, changeTotals, historyTime, workHistory, workRows, workSummary } from "./sheet";
import { undoMessage, undoState } from "./sheet";
import { sha256Hex } from "./diffLink";
import { clock, type Turn } from "./captain";

describe("Undo in Show the work", () => {
  const done = ticket({ key: "SH-14", title: "Filter search by price", status: "done", pr_url: "https://github.com/ana/shop/pull/40" });

  it("is absent until a ticket is Done with a PR", () => {
    expect(undoState({ ...done, status: "review" }, [])).toEqual({ kind: "none" });
    expect(undoState({ ...done, pr_url: null }, [])).toEqual({ kind: "none" });
  });

  it("does not offer automatic undo after a person's merge OK", () => {
    expect(undoState({ ...done, merge_ok_at: at("09:00") }, [])).toEqual({ kind: "risky" });
  });

  it("shows when this person already asked Captain", () => {
    const asked: Turn = { id: 1, kind: "you", at: at("10:00"), body: undoMessage(done), thread: 1 };
    expect(undoState(done, [{ ...asked, kind: "captain" }, asked])).toEqual({ kind: "asked", at: at("10:00") });
    expect(undoState(done, [{ ...asked, body: "Undo SH-140 (different ticket)" }])).toEqual({ kind: "can" });
  });

  it("offers a request and gives Captain the exact revert instructions", () => {
    expect(undoState(done, [])).toEqual({ kind: "can" });
    expect(undoMessage(done)).toBe("Undo SH-14 (“Filter search by price”): please open a revert of https://github.com/ana/shop/pull/40 as a new ticket, through the normal tests, review and merge. If it changed the database, don't revert it; tell me why instead.");
  });
});

describe("Show the work sentences", () => {
  it("uses the review summary, then ticket summary, then title", () => {
    const t = ticket({ key: "SH-2", title: "Google sign-in", summary: "Added sign-in", review: { summary: "  Reviewed sign-in  ", less_sure: "None" } });
    expect(workSummary(t)).toBe("Reviewed sign-in");
    expect(workSummary({ ...t, review: null })).toBe("Added sign-in");
    expect(workSummary({ ...t, review: null, summary: null })).toBe("Google sign-in");
  });

  it("only shows rows with facts, and names the Captain and approved commit", () => {
    const t = ticket({ key: "SH-2", assignee_id: BIRCH, approved_by: CAPTAIN, approved_sha: "1234567890", approved_at: at("10:00"), needs_human: `${MERGE_OK_PREFIX} database` });
    const ws = workspace([t]);
    expect(workRows(ws, t)).toEqual([
      { label: "Built by", value: "Birch" },
      { label: "Reviewed by", value: "Captain", sha: "1234567", at: at("10:00") },
      { label: "Waiting on", value: "your OK to merge" },
    ]);
    expect(workRows(ws, ticket({ key: "SH-3" }))).toEqual([]);
  });

  it("gives The change its totals only for the approved commit (AK-57)", () => {
    const sha = "c".repeat(40);
    const pr_facts = { sha, checks: { passed: 48, total: 48, state: "success" as const }, files: { total: 3, risky: ["db/004_sessions.sql"] }, additions: 62, deletions: 4 };
    const t = ticket({ key: "SH-2", approved_sha: sha, pr_facts });
    expect(changeTotals(t)).toEqual({ counts: "3 files, +62 −4", risky: "Needs a person's OK: db/004_sessions.sql" });
    expect(changeTotals({ ...t, pr_facts: { ...pr_facts, files: { total: 1, risky: [] } } })).toEqual({ counts: "1 file, +62 −4", risky: undefined });
    expect(changeTotals({ ...t, approved_sha: "d".repeat(40) })).toBeNull();
    expect(changeTotals({ ...t, approved_sha: null })).toBeNull();
    expect(changeTotals({ ...t, pr_facts: undefined })).toBeNull();
  });

  it("lists the approved commit's changed files with a link each (AK-134)", () => {
    const sha = "c".repeat(40);
    const pr_facts = { sha, checks: { passed: 48, total: 48, state: "success" as const }, files: { total: 2, risky: [], list: [{ path: "src/a.ts", additions: 6, deletions: 0 }, { path: "src/b.ts", additions: 4, deletions: 1 }] }, additions: 10, deletions: 1 };
    const t = ticket({ key: "SH-2", pr_url: "https://github.com/ana/shop/pull/45", approved_sha: sha, pr_facts });
    const files = changedFiles(t);
    expect(files.map((f) => [f.path, f.additions, f.deletions])).toEqual([["src/a.ts", 6, 0], ["src/b.ts", 4, 1]]);
    expect(files[0].href).toBe(`https://github.com/ana/shop/pull/45/files#diff-${sha256Hex("src/a.ts")}`);
    // Only for the approved commit, and nothing before schema 27 (no list).
    expect(changedFiles({ ...t, approved_sha: "d".repeat(40) })).toEqual([]);
    expect(changedFiles({ ...t, pr_facts: { ...pr_facts, files: { total: 2, risky: [] } } })).toEqual([]);
  });

  it("shows open blockers when nothing else is waiting", () => {
    const t = ticket({ key: "SH-2" }), blocker = ticket({ key: "SH-1", title: "Session table" });
    const ws = workspace([t, blocker]);
    ws.blockersOf = () => [blocker];
    expect(workRows(ws, t)).toEqual([{ label: "Waiting on", value: "SH-1 Session table" }]);
  });

  it("orders database history and skips events without a line", () => {
    const ws = workspace([]);
    const event = (id: number, kind: string, data: Record<string, unknown> = {}): TicketEvent => ({ id, ticket_id: "t", actor_id: CAPTAIN, actor_type: "agent", kind, data, created_at: at(`09:0${id}`) });
    expect(workHistory(ws, [event(3, "step", { status: "todo" }), event(2, "status", { from: "ready", to: "in_progress" }), event(1, "created")])).toEqual([
      { id: 1, at: at("09:01"), text: "Captain created this ticket" },
      { id: 2, at: at("09:02"), text: "Captain moved it from Ready to In progress" },
    ]);
  });

  it("names a person and Captain, and capitalizes an event with no actor", () => {
    const ws = workspace([]);
    const event = (id: number, actor_id: string | null): TicketEvent => ({ id, ticket_id: "t", actor_id, actor_type: actor_id === ME ? "human" : actor_id ? "agent" : null, kind: "created", data: {}, created_at: at("09:00") });
    ws.nameOf = (id) => id === CAPTAIN ? "Agent's given name" : id === ME ? "Raghav" : "Someone";
    expect(workHistory(ws, [event(1, ME), event(2, CAPTAIN), event(3, null)]).map((e) => e.text)).toEqual([
      "Raghav created this ticket",
      "Captain created this ticket",
      "Created this ticket",
    ]);
  });

  it("shows only the time today, the date this year, and the year for older events", () => {
    const now = new Date(2026, 9, 10, 12);
    const today = new Date(2026, 9, 10, 8, 40).toISOString();
    const earlier = new Date(2026, 9, 9, 8, 40).toISOString();
    const lastYear = new Date(2025, 9, 9, 8, 40).toISOString();
    expect(historyTime(today, now)).toBe(clock(today));
    expect(historyTime(earlier, now)).toBe(`9 Oct, ${clock(earlier)}`);
    expect(historyTime(lastYear, now)).toBe(`9 Oct 2025, ${clock(lastYear)}`);
  });
});

describe("sheet route", () => {
  it("parses ticket and part while keeping the underlying page", () => {
    expect(parse("/p/shop/decisions", "?tab=guide&show=sh-2&part=history")).toMatchObject({ view: "guide", project: "shop", show: { key: "SH-2", part: "history" } });
    expect(parse("/p/shop/work", "?group=goal&show=SH-2&part=change")).toMatchObject({ view: "goals", show: { key: "SH-2", part: "change" } });
    expect(parse("/p/shop", "?show=SH-2")).toMatchObject({ show: { key: "SH-2", part: "summary" } });
    expect(parse("/p/shop", "?show=SH-2&part=bad")).toMatchObject({ show: { key: "SH-2", part: "summary" } });
    expect(parse("/p/shop", "?part=history")).not.toHaveProperty("show");
  });

  it("keeps page filters when making a shareable sheet link", () => {
    vi.stubGlobal("location", { href: "https://example.test/p/shop/decisions?tab=guide&preview=workspace" });
    expect(showHref("sh-2", "history")).toBe("/p/shop/decisions?tab=guide&preview=workspace&show=SH-2&part=history");
    vi.unstubAllGlobals();
  });
});
