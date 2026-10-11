import { describe, expect, it } from "vitest";
import { MERGE_OK_PREFIX, type Ticket } from "../lib/data";
import { needsYou, type CatchUp } from "./captain";
import { BIRCH, CAPTAIN, FJORD, ME, at, decision, ticket, workspace } from "./fixtures";
import { agentRows, finishedWhen, isPhrase, outcomeOf, overview, partLine, plainPhrase, progressWord, resumeAt, sinceItems, sinceLine, stopReason, withoutKeys, youLine } from "./overview";
import type { Workspace } from "./useWorkspace";

const NOW = new Date(at("12:00"));
const run = (ws: Workspace, id: string, current?: Ticket) => Object.assign(ws.agentOf(id)!, { status: "building", last_seen_at: at("11:59"), current_ticket_id: current?.id ?? null });
const seen = (ws: Workspace, id: string, over: Record<string, unknown> = {}) => Object.assign(ws.agentOf(id)!, { status: "idle", last_seen_at: at("11:59"), ...over });
const look = (ws: Workspace) => overview(ws, needsYou(ws, []), [], NOW);

const signIn = ticket({ key: "SH-1", type: "epic", title: "Google sign-in: one button", summary: "People can sign in with their Google account.", status: "in_progress" });
const pay = ticket({ key: "SH-10", type: "epic", title: "Card payments", status: "in_progress" });

describe("the plain phrase", () => {
  it("is a summary that starts with a lowercase -ing word", () => {
    expect(isPhrase("adding Apple Pay to the checkout")).toBe(true);
    expect(isPhrase("Adding Apple Pay")).toBe(false);
    expect(isPhrase("People can pay with Apple Pay.")).toBe(false);
    expect(isPhrase("fix the tax")).toBe(false);
    expect(isPhrase(null)).toBe(false);
  });

  it("falls back to the feature's name, then to the title in quotes", () => {
    const a = ticket({ key: "SH-2", parent_id: signIn.id, summary: "adding the Google button." });
    const b = ticket({ key: "SH-3", parent_id: signIn.id, summary: "Shoppers can sign in" });
    const c = ticket({ key: "SH-4", title: "Upgrade React" });
    const ws = workspace([signIn, a, b, c]);
    expect(plainPhrase(ws, a)).toBe("adding the Google button");
    expect(plainPhrase(ws, b)).toBe("working on Google sign-in");
    expect(plainPhrase(ws, c)).toBe("working on “Upgrade React”");
  });

  it("shows a part's outcome once done and its title otherwise", () => {
    expect(partLine(ticket({ key: "SH-2", title: "Add button", status: "done", summary: "people see a Google button." }))).toBe("People see a Google button");
    expect(partLine(ticket({ key: "SH-2", title: "Add button", status: "in_progress", summary: "adding the button" }))).toBe("Adding the button");
    expect(partLine(ticket({ key: "SH-2", title: "Add button", status: "in_progress", summary: "Done soon" }))).toBe("Add button");
  });

  it("uses a goal's summary as its outcome, else a short plain description", () => {
    expect(outcomeOf(signIn)).toBe("People can sign in with their Google account.");
    expect(outcomeOf(ticket({ key: "SH-9", type: "epic", description: "Paying takes under a minute.\n\nMore detail." }))).toBe("Paying takes under a minute.");
    expect(outcomeOf(ticket({ key: "SH-9", type: "epic", description: "**Context**\nlong" }))).toBeNull();
    expect(outcomeOf(ticket({ key: "SH-9", type: "epic" }))).toBeNull();
  });
});

describe("the state and headline", () => {
  it("is Working when an agent runs, naming the features, never keys", () => {
    const a = ticket({ key: "SH-2", parent_id: signIn.id, status: "in_progress", assignee_id: BIRCH, assignee_type: "agent" });
    const b = ticket({ key: "SH-11", parent_id: pay.id, status: "in_progress", assignee_id: FJORD, assignee_type: "agent" });
    const ws = workspace([signIn, pay, a, b]);
    run(ws, BIRCH, a);
    run(ws, FJORD, b);
    const l = look(ws);
    expect(l.state).toBe("working");
    expect(l.headline).toBe("The team is building Google sign-in and Card payments.");
    expect(l.headline).not.toMatch(/SH-/);
  });

  it("counts the rest as more features past two", () => {
    const goals = [signIn, pay, ticket({ key: "SH-20", type: "epic", title: "Search" }), ticket({ key: "SH-30", type: "epic", title: "Wishlists" })];
    const parts = goals.map((g, i) => ticket({ key: `SH-${100 + i}`, parent_id: g.id, status: "in_progress", assignee_id: ME, assignee_type: "human" }));
    expect(look(workspace([...goals, ...parts])).headline).toBe("The team is building Google sign-in, Card payments and 2 more features.");
  });

  it("is Working when a person holds work in progress", () => {
    const ws = workspace([signIn, ticket({ key: "SH-2", parent_id: signIn.id, status: "in_progress", assignee_id: ME, assignee_type: "human" })]);
    expect(look(ws)).toMatchObject({ state: "working", headline: "The team is building Google sign-in." });
  });

  it("is Waiting on you when nobody runs and something needs the person", () => {
    const ws = workspace([
      signIn,
      pay,
      ticket({ key: "SH-2", parent_id: signIn.id, status: "in_progress", assignee_id: BIRCH, needs_human: "Blue or green?" }),
      ticket({ key: "SH-11", parent_id: pay.id, status: "review", needs_human: `${MERGE_OK_PREFIX} OK? (db/x.sql)` }),
    ]);
    expect(look(ws)).toMatchObject({ state: "waiting", headline: "2 features can't move until you answer." });
  });

  it("names the one feature that waits", () => {
    const ws = workspace([signIn, ticket({ key: "SH-2", parent_id: signIn.id, status: "in_progress", assignee_id: BIRCH, needs_human: "Blue or green?" })]);
    expect(look(ws).headline).toBe("Google sign-in can't move until you answer.");
  });

  it("is Paused until the time an agent's note gives", () => {
    const t = ticket({ key: "SH-11", parent_id: pay.id, status: "in_progress", assignee_id: FJORD });
    const ws = workspace([pay, t]);
    seen(ws, FJORD, { status_note: "Waiting for my usage limit to reset, about 5:40 am (UTC)", current_ticket_id: t.id });
    const l = look(ws);
    expect(l.state).toBe("paused");
    expect(l.resumes?.toISOString()).toBe("2026-10-11T05:40:00.000Z");
    expect(l.headline).toMatch(/^Work is paused until about .+\. Nothing for you to do\.$/);
  });

  it("is Paused on a feature when no resume time is known", () => {
    const ws = workspace([pay, ticket({ key: "SH-11", parent_id: pay.id, status: "in_progress", assignee_id: FJORD })]);
    expect(look(ws)).toMatchObject({ state: "paused", headline: "Work has stopped on Card payments." });
  });

  it("is Idle with what comes next, or with everything finished", () => {
    const later = ticket({ key: "SH-40", type: "epic", title: "Order history", status: "backlog" });
    const ws = workspace([signIn, ticket({ key: "SH-2", parent_id: signIn.id, status: "done", completed_at: at("09:00") }), later, ticket({ key: "SH-41", parent_id: later.id, status: "backlog" })]);
    expect(look(ws)).toMatchObject({ state: "idle", headline: "Nothing is being built. Next up: Order history." });
    expect(look(workspace([signIn, ticket({ key: "SH-2", parent_id: signIn.id, status: "done", completed_at: at("09:00") })]))).toMatchObject({ state: "idle", headline: "Everything planned is finished." });
  });
});

describe("what each agent is doing", () => {
  it("says a running agent's plain phrase, its feature, step and time", () => {
    const t = ticket({ key: "SH-2", parent_id: signIn.id, status: "in_progress", assignee_id: BIRCH, summary: "adding the Google button", started_at: at("11:00") });
    const ws = workspace([signIn, t], { steps: { "SH-2": ["done", "done", "now", "todo", "todo"] } });
    run(ws, BIRCH, t);
    const [row] = agentRows(ws, NOW);
    expect(row).toMatchObject({ name: "Birch", kind: "running", doing: "is adding the Google button" });
    expect(row.detail).toBe("Google sign-in · step 3 of 5 · 3 h");
  });

  it("says Captain is reviewing someone's work on a feature", () => {
    const t = ticket({ key: "SH-2", parent_id: signIn.id, status: "review", assignee_id: BIRCH, pr_facts: { sha: "a", checks: { passed: 4, total: 4, state: "success" }, files: { total: 1, risky: [] }, additions: 1, deletions: 0 }, updated_at: at("11:50") });
    const ws = workspace([signIn, t]);
    run(ws, CAPTAIN, t);
    const [row] = agentRows(ws, NOW);
    expect(row).toMatchObject({ name: "Captain", kind: "reviewing", doing: "is reviewing Birch's work on Google sign-in", detail: "Google sign-in · tests passed · 10 min" });
  });

  it("says why a stopped agent stopped and when it resumes", () => {
    const t = ticket({ key: "SH-11", parent_id: pay.id, status: "in_progress", assignee_id: FJORD, updated_at: at("11:30") });
    const ws = workspace([pay, t]);
    seen(ws, FJORD, { status_note: "Waiting for my usage limit to reset, about 5:40 am (UTC)", current_ticket_id: t.id });
    const [row] = agentRows(ws, NOW);
    expect(row).toMatchObject({ kind: "stopped", doing: "stopped while working on Card payments" });
    expect(row.detail).toMatch(/^Card payments · usage limit · resumes about .+ by itself · 30 min$/);
  });

  it("takes a stop's reason from the runner's note in Needs you", () => {
    const t = ticket({ key: "SH-11", title: "Apple Pay", status: "in_progress", assignee_id: FJORD, needs_human: "I stopped: hit the 60-minute limit. Where it got to: half." });
    const [row] = agentRows(workspace([t]), NOW);
    expect(row).toMatchObject({ kind: "stopped", doing: "stopped while working on “Apple Pay”" });
    expect(row.detail).toMatch(/^Fixes and upkeep · hit the 60-minute limit · /);
    expect(stopReason("I stopped: hit the 60-minute limit. Where it got to: half.")).toBe("hit the 60-minute limit");
  });

  it("says an agent waits for the person's answer", () => {
    const t = ticket({ key: "SH-2", parent_id: signIn.id, status: "in_progress", assignee_id: BIRCH, summary: "adding the Google button", needs_human: "Blue or green?" });
    const [row] = agentRows(workspace([signIn, t]), NOW);
    expect(row).toMatchObject({ kind: "waiting", doing: "is waiting for your answer before adding the Google button" });
  });

  it("leaves out idle agents and puts the most recent first, with no keys in the words", () => {
    const a = ticket({ key: "SH-2", parent_id: signIn.id, status: "in_progress", assignee_id: BIRCH, updated_at: at("10:00") });
    const b = ticket({ key: "SH-11", parent_id: pay.id, status: "in_progress", assignee_id: FJORD, updated_at: at("11:00") });
    const rows = agentRows(workspace([signIn, pay, a, b, ticket({ key: "SH-3", status: "ready", assignee_id: CAPTAIN })]), NOW);
    expect(rows.map((r) => r.name)).toEqual(["Fjord", "Birch"]);
    expect(rows.every((r) => !/SH-\d/.test(r.doing + r.detail))).toBe(true);
  });
});

describe("Now, Next and Done", () => {
  it("puts features in their columns with words for progress", () => {
    const search = ticket({ key: "SH-20", type: "epic", title: "Search" });
    const orders = ticket({ key: "SH-30", type: "epic", title: "Order history" });
    const parts = [
      ticket({ key: "SH-2", parent_id: signIn.id, status: "done", completed_at: at("09:00") }),
      ticket({ key: "SH-3", parent_id: signIn.id, status: "in_progress", assignee_id: BIRCH }),
      ticket({ key: "SH-4", parent_id: signIn.id, status: "ready" }),
      ticket({ key: "SH-21", parent_id: search.id, status: "done", completed_at: at("10:00") }),
      ticket({ key: "SH-31", parent_id: orders.id, status: "backlog" }),
      ticket({ key: "SH-50", title: "Upgrade React", status: "ready" }),
    ];
    const ws = workspace([signIn, search, orders, ...parts]);
    run(ws, BIRCH, parts[1]);
    const { features } = look(ws);
    expect(features.now.map((f) => f.name)).toEqual(["Google sign-in"]);
    expect(features.now[0]).toMatchObject({ word: "Under way", status: "Under way · Birch on it", tone: "live", count: "1 of 3 parts done", outcome: "People can sign in with their Google account." });
    expect(features.next.map((f) => [f.name, f.status])).toEqual([
      ["Order history", "Not started"],
      ["Fixes and upkeep", "Not started"],
    ]);
    expect(features.done.map((f) => [f.name, f.status])).toEqual([["Search", "Finished today"]]);
    expect(features.now[0].parts.map((p) => [p.state, p.who])).toEqual([
      ["Done", null],
      ["Being built", "Birch"],
      ["Up next", null],
    ]);
  });

  it("marks stopped work coral with the resume time", () => {
    const t = ticket({ key: "SH-11", parent_id: pay.id, status: "in_progress", assignee_id: FJORD });
    const ws = workspace([pay, t, ticket({ key: "SH-12", parent_id: pay.id, status: "ready" })]);
    seen(ws, FJORD, { status_note: "Waiting for my usage limit to reset, about 5:40 am (UTC)", current_ticket_id: t.id });
    expect(look(ws).features.now[0]).toMatchObject({ tone: "problem", stopped: true, status: expect.stringMatching(/^Just started · paused until about .+$/) });
  });

  it("says what a feature that hasn't started waits for", () => {
    const later = ticket({ key: "SH-40", type: "epic", title: "Order history" });
    const first = ticket({ key: "SH-11", parent_id: pay.id, status: "ready" });
    const waits = ticket({ key: "SH-41", parent_id: later.id, status: "backlog" });
    const ws = { ...workspace([pay, later, first, waits]), blockersOf: (id: string) => (id === waits.id ? [first] : []) };
    const next = look(ws).features.next;
    expect(next.find((f) => f.name === "Order history")?.status).toBe("Planned · starts after Card payments");
    const plan = { goals: [{ goal: later, tickets: [waits] }], status: "pending" } as unknown as Parameters<typeof overview>[2][number];
    expect(overview(ws, [], [plan], NOW).features.next.find((f) => f.name === "Order history")).toMatchObject({ status: "Waiting for your OK to start", tone: "needs" });
  });

  it("uses the right progress word for each share", () => {
    const shares = [[0, 8], [1, 5], [1, 4], [2, 5], [3, 6], [3, 5], [7, 10], [9, 10]];
    expect(shares.map(([d, t]) => progressWord(d, t))).toEqual(["Just started", "Just started", "Under way", "Under way", "Half done", "Half done", "Nearly done", "Nearly done"]);
  });

  it("says when a feature finished in words", () => {
    const now = new Date(2026, 9, 15, 12, 0);
    expect(finishedWhen(new Date(2026, 9, 15, 8, 0).toISOString(), now)).toBe("Finished today");
    expect(finishedWhen(new Date(2026, 9, 14, 8, 0).toISOString(), now)).toBe("Finished yesterday");
    expect(finishedWhen(new Date(2026, 9, 13, 8, 0).toISOString(), now)).toBe("Finished Tuesday");
    expect(finishedWhen(new Date(2026, 9, 1, 8, 0).toISOString(), now)).toBe("Finished 1 Oct");
  });
});

describe("the You line and since you last looked", () => {
  it("is one line with the count, what it holds up and the longest wait", () => {
    const ws = workspace([signIn, ticket({ key: "SH-2", parent_id: signIn.id, status: "in_progress", needs_human: "Blue or green?", updated_at: at("11:49") })]);
    const you = youLine(ws, needsYou(ws, []), [], NOW);
    expect(you?.text).toBe("1 answer is waiting on you. It holds up Google sign-in. 11 min.");
    expect(youLine(ws, [], [], NOW)).toBeNull();
  });

  it("speaks of features finished, decisions and problems", () => {
    const search = ticket({ key: "SH-20", type: "epic", title: "Search" });
    const ws = workspace([search, signIn, ticket({ key: "SH-21", parent_id: search.id, status: "done" }), ticket({ key: "SH-2", parent_id: signIn.id, status: "done" }), ticket({ key: "SH-3", parent_id: signIn.id, status: "ready" })], { decisions: [decision("DEC-1", "Postgres", at("10:00"))] });
    const c: CatchUp = {
      awayMs: 2 * 3600_000,
      shipped: [{ text: "a", at: at("10:00"), ref: "SH-21" }, { text: "b", at: at("10:00"), ref: "SH-2" }],
      decided: [{ text: "Postgres", at: at("10:00"), ref: "DEC-1" }],
      problems: [{ text: "Birch couldn't continue", at: at("10:00") }],
    };
    expect(sinceLine(ws, c)).toBe("Since you last looked, 2 h ago: Search was finished, Google sign-in moved forward, 1 decision was recorded, 1 problem came up.");
    expect(sinceLine(ws, { awayMs: 3600_000, shipped: [], decided: [], problems: [] })).toBeNull();
    expect(sinceLine(ws, null)).toBeNull();
  });
});

describe("no ticket keys", () => {
  it("swaps keys in written text for the tickets' titles", () => {
    const ws = workspace([ticket({ key: "SH-3", title: "Remember me" }), ticket({ key: "SH-4", title: "Pick the store" })]);
    expect(withoutKeys(ws, "SH-3 needs the table from SH-4, not SH-99")).toBe("“Remember me” needs the table from “Pick the store”, not SH-99");
    const c: CatchUp = { awayMs: 3600_000, shipped: [], decided: [], problems: [{ text: "Fjord couldn't continue: SH-3 waits", at: at("10:00") }] };
    expect(sinceItems(ws, c).map((i) => i.text)).toEqual(["Fjord couldn't continue: “Remember me” waits"]);
  });
});

describe("resume times", () => {
  it("finds the next time in the agent's own zone", () => {
    expect(resumeAt("Waiting for my usage limit to reset, about 5:40 am (UTC)", NOW)?.toISOString()).toBe("2026-10-11T05:40:00.000Z");
    expect(resumeAt("resets 1:20pm (Europe/Stockholm)", NOW)?.toISOString()).toBe("2026-10-11T11:20:00.000Z");
    expect(resumeAt("Creating profiles", NOW)).toBeNull();
  });
});
