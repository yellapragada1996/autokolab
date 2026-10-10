import { describe, expect, it, vi } from "vitest";
import { MERGE_OK_PREFIX, type TicketEvent } from "../lib/data";
import { parse, showHref } from "../lib/router";
import { BIRCH, CAPTAIN, at, ticket, workspace } from "./fixtures";
import { workHistory, workRows, workSummary } from "./showWork";
import { undoMessage, undoState } from "./showWork";
import type { Turn } from "./captain";

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
      { id: 1, at: at("09:01"), text: "created this ticket" },
      { id: 2, at: at("09:02"), text: "moved it from Ready to In progress" },
    ]);
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
