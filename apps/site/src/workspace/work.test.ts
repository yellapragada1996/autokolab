import { describe, expect, it } from "vitest";
import { MERGE_OK_PREFIX } from "../lib/data";
import { needsYou } from "./captain";
import { BIRCH, at, ticket, workspace } from "./fixtures";
import { boardMove, cardContext, cardLine, cardWords, shippedTime, workColumn, workHeadline, workNeed, WORK_COLUMNS } from "./work";

const now = new Date(2026, 9, 14, 12);

describe("Work card words", () => {
  it("uses any non-empty plain line, capitalised, else the original title", () => {
    expect(cardLine({ title: "Technical title", summary: "  shoppers can save a basket.  " })).toBe("Shoppers can save a basket.");
    expect(cardLine({ title: "Original title", summary: " \n " })).toBe("Original title");
    expect(cardLine({ title: "Original title" })).toBe("Original title");
  });

  it("names unfinished blockers by their plain lines, never by their keys", () => {
    const t = ticket({ key: "SH-1", title: "Remember me" });
    const blockers = [ticket({ key: "SH-2", summary: "saving sessions" }), ticket({ key: "SH-3", status: "done" }), ticket({ key: "SH-4", status: "canceled" })];
    expect(cardWords(t, blockers, [], undefined, now)).toEqual({ line: "Remember me", sub: "After Saving sessions", progress: null });
    expect(cardWords(t, blockers.slice(1), [], undefined, now).sub).toBeNull();
  });

  it("shows the current live step and completed share only while building", () => {
    const t = ticket({ key: "SH-1", status: "in_progress" });
    const ws = workspace([t], { steps: { "SH-1": [["Read the code", "done"], ["Running the tests", "now"], ["Open a PR", "todo"]] } });
    const steps = ws.steps.get(t.id)!;
    expect(cardWords(t, [], steps, undefined, now)).toMatchObject({ sub: "Running the tests · 2 of 3", progress: 1 / 3 });
    expect(cardWords({ ...t, status: "review" }, [], steps, undefined, now)).toMatchObject({ sub: null, progress: null });
    expect(cardWords(t, [], [], undefined, now).progress).toBeNull();
  });

  it("gives a real request precedence over live progress", () => {
    const t = ticket({ key: "SH-1", status: "in_progress", needs_human: "Which session store?" });
    const ws = workspace([t], { steps: { "SH-1": ["now"] } });
    const need = workNeed(t, needsYou(ws, []));
    expect(cardWords(t, [], ws.steps.get(t.id)!, need, now)).toMatchObject({ sub: "Answer a question", progress: null });
  });

  it("shows a merge time today, a calendar day earlier, and no invented time", () => {
    const today = new Date(2026, 9, 14, 10, 12).toISOString();
    const yesterday = new Date(2026, 9, 13, 23, 59).toISOString();
    expect(shippedTime(today, now)).toBe("Merged · 10:12");
    expect(shippedTime(yesterday, now)).toBe(`Merged · ${new Date(yesterday).toLocaleDateString([], { month: "short", day: "numeric" })}`);
    expect(shippedTime(null, now)).toBe("Merged");
    expect(shippedTime("invalid", now)).toBe("Merged");
    const done = ticket({ key: "SH-1", status: "done", completed_at: today });
    expect(cardWords(done, [], [], undefined, now).sub).toBe("Merged · 10:12");
  });

  it("shows the feature by agent and the assignee by feature", () => {
    const goal = ticket({ key: "SH-1", type: "epic", title: "Sign-in: Google and email" });
    const t = ticket({ key: "SH-2", parent_id: goal.id, assignee_id: BIRCH });
    const ws = workspace([goal, t]);
    expect(cardContext(ws, t, "assignee")).toBe("Sign-in");
    expect(cardContext(ws, t, "epic")).toBe(ws.nameOf(BIRCH));
    expect(cardContext(ws, { ...t, parent_id: null }, "assignee")).toBeNull();
  });
});

describe("Work columns and sentence", () => {
  it("moves open requests into Needs you, including requests on Later tickets", () => {
    const question = ticket({ key: "SH-1", status: "backlog", needs_human: "Which store?" });
    const merge = ticket({ key: "SH-2", status: "review", needs_human: `${MERGE_OK_PREFIX} SQL` });
    const ws = workspace([question, merge]);
    const needs = needsYou(ws, []);
    expect(workColumn(question, needs)).toBe("needs");
    expect(workColumn(merge, needs)).toBe("needs");
    expect(workNeed(merge, needs)?.action).toBe("OK a risky merge");
    expect(workColumn({ ...question, status: "done" }, needs)).toBe("done");
    expect(workColumn({ ...question, status: "canceled" }, needs)).toBe("canceled");
  });

  it("leaves runner problems and already answered merge requests out of Needs you", () => {
    const problem = ticket({ key: "SH-1", status: "in_progress", needs_human: "I couldn't start: no shell" });
    const answered = ticket({ key: "SH-2", status: "review", needs_human: `${MERGE_OK_PREFIX} SQL`, merge_ok_at: at("10:00"), merge_ok_by: "person" });
    const ws = workspace([problem, answered]);
    const needs = needsYou(ws, []);
    expect(workColumn(problem, needs)).toBe("in_progress");
    expect(workColumn(answered, needs)).toBe("review");
    const visible = WORK_COLUMNS.filter((c) => ws.tickets.some((t) => workColumn(t, needs) === c.id));
    expect(visible.map((c) => c.label)).toEqual(["Building", "In review"]);
  });

  it("uses the shared headline counts for building and waiting", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "in_progress", assignee_id: BIRCH }), ticket({ key: "SH-2", needs_human: "A question?" })]);
    Object.assign(ws.agentOf(BIRCH)!, { status: "building", last_seen_at: at("11:59") });
    expect(workHeadline(ws, new Date(at("12:00")))).toBe("1 agent building, 1 waiting on you.");
    expect(workHeadline(workspace([]), now)).toBe("Nobody building.");
    const stale = workspace([ticket({ key: "SH-3", status: "done", needs_human: "Old question" }), ticket({ key: "SH-4", needs_human: "I couldn't start: no shell" })]);
    expect(workHeadline(stale, now)).toBe("Nobody building.");
  });
});

describe("moving cards", () => {
  const t = ticket({ key: "SH-1", status: "ready", sort_order: 10 });
  const cell = [ticket({ key: "SH-2", sort_order: 2 }), ticket({ key: "SH-3", sort_order: 6 })];

  it("preserves reassignment, feature moves and ranking between columns", () => {
    expect(boardMove(t, { assignee_id: BIRCH }, cell, 1, "in_progress")).toEqual({ assignee_id: BIRCH, status: "in_progress", sort_order: 4 });
    expect(boardMove(t, { parent_id: "feature" }, cell, 0, "ready")).toEqual({ parent_id: "feature", sort_order: 1 });
    expect(boardMove(t, {}, cell, 2, "review")).toEqual({ status: "review", sort_order: 7 });
    expect(boardMove(t, {}, [], 0, "ready")).toEqual({});
  });

  it("never writes a virtual status or manufactures a person's question", () => {
    expect(boardMove(t, { assignee_id: BIRCH }, cell, 1, "needs")).toEqual({ assignee_id: BIRCH, sort_order: 4 });
  });
});
