import { describe, expect, it } from "vitest";
import { MERGE_OK_PREFIX, laterOf, type TicketEvent } from "../lib/data";
import { BIRCH, FJORD, ME, at, ticket, workspace } from "./fixtures";
import { actionFor, activity, epicOf, goals, headline, plural } from "./story";

const event = (t: { id: string }, actor: string, kind: string, data: Record<string, unknown> = {}): TicketEvent => ({ id: 1, ticket_id: t.id, actor_id: actor, actor_type: "agent", kind, data, created_at: at("10:00") });

describe("the headline", () => {
  it("counts who is building, what shipped today and what needs a person", () => {
    const goal = ticket({ key: "SH-1", type: "epic", title: "Google sign-in", status: "in_progress" });
    const now = new Date(2026, 9, 10, 12, 0);
    const today = new Date(2026, 9, 10, 9, 0).toISOString();
    const yesterday = new Date(2026, 9, 9, 23, 0).toISOString();
    const ws = workspace([
      goal,
      ticket({ key: "SH-2", parent_id: goal.id, status: "in_progress", assignee_id: BIRCH }),
      ticket({ key: "SH-3", parent_id: goal.id, status: "in_progress", assignee_id: FJORD, needs_human: "Blue or green?" }),
      ticket({ key: "SH-4", status: "done", completed_at: today }),
      ticket({ key: "SH-5", status: "done", completed_at: yesterday }),
      ticket({ key: "SH-6", status: "review", needs_human: `${MERGE_OK_PREFIX} sql` }),
      ticket({ key: "SH-7", status: "canceled", needs_human: "old" }),
    ]);
    const h = headline(ws, now);
    expect(h.building).toMatchObject({ workers: 2, agentsOnly: true, tickets: 2 });
    expect(h.building!.epics.map((e) => e.key)).toEqual(["SH-1"]);
    expect(h.shipped).toBe(1);
    expect(h.needs).toBe(2);
  });

  it("has nobody building when nothing is in progress", () => {
    expect(headline(workspace([ticket({ key: "SH-1", status: "ready" })])).building).toBeNull();
  });

  it("notices when a person is building too", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "in_progress", assignee_id: ME, assignee_type: "human" }), ticket({ key: "SH-2", status: "in_progress", assignee_id: BIRCH })]);
    expect(headline(ws).building).toMatchObject({ workers: 2, agentsOnly: false });
  });
});

describe("goals", () => {
  it("finds a ticket's goal through its parents", () => {
    const goal = ticket({ key: "SH-1", type: "epic" });
    const story = ticket({ key: "SH-2", parent_id: goal.id });
    const sub = ticket({ key: "SH-3", parent_id: story.id });
    const ws = workspace([goal, story, sub, ticket({ key: "SH-4" })]);
    expect(epicOf(ws, sub)?.key).toBe("SH-1");
    expect(epicOf(ws, ws.byKey.get("SH-4")!)).toBeUndefined();
  });

  it("lists open goals most urgent first, then other work, with honest counts", () => {
    const waiting = ticket({ key: "SH-1", type: "epic", title: "Waiting", status: "in_progress" });
    const moving = ticket({ key: "SH-2", type: "epic", title: "Moving", status: "in_progress" });
    const fresh = ticket({ key: "SH-3", type: "epic", title: "Fresh", status: "backlog" });
    const shipped = ticket({ key: "SH-4", type: "epic", title: "Shipped", status: "done" });
    const ws = workspace([
      fresh,
      moving,
      waiting,
      shipped,
      ticket({ key: "SH-10", parent_id: waiting.id, status: "in_progress", assignee_id: BIRCH, needs_human: "Which one?" }),
      ticket({ key: "SH-11", parent_id: waiting.id, status: "done" }),
      ticket({ key: "SH-12", parent_id: waiting.id, status: "canceled" }),
      ticket({ key: "SH-20", parent_id: moving.id, status: "review", assignee_id: FJORD }),
      ticket({ key: "SH-30", parent_id: fresh.id, status: "ready" }),
      ticket({ key: "SH-40", status: "ready" }),
    ]);
    const list = goals(ws);
    expect(list.map((g) => [g.epic?.title ?? "Other work", g.state])).toEqual([
      ["Waiting", "waiting"],
      ["Moving", "moving"],
      ["Fresh", "not_started"],
      ["Other work", "not_started"],
    ]);
    expect(list[0]).toMatchObject({ done: 1, total: 2, who: [BIRCH] });
  });

  it("leaves out other work when all of it is done", () => {
    expect(goals(workspace([ticket({ key: "SH-1", status: "done" })]))).toEqual([]);
  });
});

describe("what a person is asked to do", () => {
  it("is named in plain words", () => {
    expect(actionFor(ticket({ key: "SH-1", status: "review", needs_human: `${MERGE_OK_PREFIX} sql` }))).toBe("OK a risky merge");
    expect(actionFor(ticket({ key: "SH-2", needs_human: "Blue or green?" }))).toBe("Answer a question");
    expect(actionFor(ticket({ key: "SH-3", status: "review", pr_url: "https://github.com/a/b/pull/1" }))).toBe("Review a PR");
    expect(actionFor(ticket({ key: "SH-4", status: "review" }))).toBe("Review the work");
  });
});

describe("activity", () => {
  const ws = workspace([]);
  const t = ticket({ key: "SH-1", status: "done", pr_url: "https://github.com/a/b/pull/1" });

  it("is a sentence around the ticket", () => {
    expect(activity(ws, event(t, BIRCH, "status", { from: "ready", to: "in_progress" }), t)).toEqual({ verb: "started on" });
    expect(activity(ws, event(t, BIRCH, "status", { from: "review", to: "done" }), t)).toEqual({ verb: "merged", after: "(auto-merge)" });
    expect(activity(ws, event(t, ME, "status", { from: "review", to: "done" }), t)).toEqual({ verb: "merged", after: undefined });
    expect(activity(ws, event(t, ME, "assignee", { to: FJORD }), t)).toEqual({ verb: "gave", after: "to Fjord" });
    expect(activity(ws, event(t, ME, "needs_human", { note: `${MERGE_OK_PREFIX} sql` }), t)).toEqual({ verb: "asked for an OK to merge" });
  });

  it("leaves out bookkeeping", () => {
    expect(activity(ws, event(t, BIRCH, "branch", { branch: "x" }), t)).toBeNull();
    expect(activity(ws, event(t, BIRCH, "assignee", { to: BIRCH }), t)).toBeNull();
    expect(activity(ws, event(t, BIRCH, "approval", { to: null, reason: "pr_changed" }), t)).toBeNull();
  });

  it("says what shipped when the ticket has a summary", () => {
    const done = ticket({ key: "SH-2", status: "done", pr_url: "https://github.com/a/b/pull/2", summary: "Checkout remembers your card" });
    expect(activity(ws, event(done, BIRCH, "status", { from: "review", to: "done" }), done)?.outcome).toBe("Shipped: Checkout remembers your card");
    expect(activity(ws, event(done, BIRCH, "status", { from: "in_progress", to: "review" }), done)?.outcome).toBe("Up for review: Checkout remembers your card");
    expect(activity(ws, event(done, BIRCH, "status", { from: "ready", to: "in_progress" }), done)?.outcome).toBeUndefined();
  });
});

describe("small helpers", () => {
  it("writes counts in plain words", () => {
    expect(plural(1, "agent")).toBe("1 agent");
    expect(plural(3, "agent")).toBe("3 agents");
    expect(plural(2, "person", "people")).toBe("2 people");
  });

  it("picks the later of two times", () => {
    expect(laterOf(at("09:00"), at("10:00"))).toBe(at("10:00"));
    expect(laterOf(at("10:00"), at("09:00"))).toBe(at("10:00"));
    expect(laterOf(null, at("09:00"))).toBe(at("09:00"));
    expect(laterOf(at("09:00"), undefined)).toBe(at("09:00"));
    expect(laterOf(null, null)).toBeNull();
  });
});
