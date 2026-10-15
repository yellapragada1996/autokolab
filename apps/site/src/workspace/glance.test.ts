import { describe, expect, it } from "vitest";
import { MERGE_OK_PREFIX, type Ticket, type TicketEvent } from "../lib/data";
import { needsYou, type CatchUp } from "./captain";
import { BIRCH, CAPTAIN, FJORD, ME, at, decision, ticket, workspace } from "./fixtures";
import { statusHere, agentRows, askItems, crew, dayIn, firstSentence, pulse, finishedWhen, isPhrase, outcomeOf, overview, partLine, plainPhrase, progressWord, resumeAt, sinceItems, sinceLine, stopReason, team, watch, withoutKeys, workTime, youLine } from "./glance";
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

describe("the team", () => {
  const stateOf = (ws: Workspace, id: string) => team(ws, NOW).agents.find((a) => a.id === id)!;

  it("says working and reviewing in blue", () => {
    const mine = ticket({ key: "SH-2", status: "in_progress", assignee_id: BIRCH });
    const theirs = ticket({ key: "SH-3", status: "review", assignee_id: BIRCH });
    const ws = workspace([mine, theirs]);
    run(ws, BIRCH, mine);
    run(ws, CAPTAIN, theirs);
    expect(stateOf(ws, BIRCH)).toMatchObject({ state: "working", label: "working", tone: "live" });
    expect(stateOf(ws, CAPTAIN)).toMatchObject({ state: "reviewing", label: "reviewing", tone: "live" });
  });

  it("says free when nothing is assigned, with how long, and idle when work is queued", () => {
    const ws = workspace([ticket({ key: "SH-2", status: "done", assignee_id: BIRCH, updated_at: at("11:20") }), ticket({ key: "SH-3", status: "ready", assignee_id: FJORD, updated_at: at("11:45") })]);
    seen(ws, BIRCH);
    seen(ws, FJORD);
    seen(ws, CAPTAIN);
    expect(stateOf(ws, BIRCH)).toMatchObject({ state: "free", label: "free · idle 40 min", tone: "quiet" });
    expect(stateOf(ws, FJORD)).toMatchObject({ state: "idle", label: "idle · 15 min", tone: "quiet" });
    // Nothing to time it from: just the word.
    expect(stateOf(ws, CAPTAIN).label).toBe("free");
  });

  it("counts idle time from the last run when that is later", () => {
    const ws = workspace([ticket({ key: "SH-2", status: "done", assignee_id: BIRCH, updated_at: at("09:00") })]);
    seen(ws, BIRCH, { effective_at: at("11:55") });
    expect(stateOf(ws, BIRCH).label).toBe("free · idle 5 min");
  });

  it("says stopped for a paused or blocked agent", () => {
    const ws = workspace([]);
    seen(ws, BIRCH, { status: "paused" });
    seen(ws, FJORD, { status: "blocked" });
    expect(stateOf(ws, BIRCH)).toMatchObject({ state: "stopped", label: "stopped", tone: "problem" });
    expect(stateOf(ws, FJORD).state).toBe("stopped");
  });

  it("says limit reached with the return time the runner reported, or the one in its note", () => {
    const ws = workspace([]);
    seen(ws, BIRCH, { waiting_until: "2026-10-10T13:40:00Z" });
    seen(ws, FJORD, { status_note: "Waiting for my usage limit to reset, about 5:40 am (UTC)" });
    expect(stateOf(ws, BIRCH)).toMatchObject({ state: "limit", tone: "problem" });
    expect(stateOf(ws, BIRCH).label).toMatch(/^limit reached · back about \d{1,2}:40 [ap]m$/);
    expect(stateOf(ws, FJORD).label).toMatch(/^limit reached · back about \d{1,2}:40 [ap]m$/);
    // A wait that has passed is over.
    seen(ws, BIRCH, { waiting_until: "2026-10-10T11:00:00Z" });
    expect(stateOf(ws, BIRCH).state).toBe("free");
  });

  it("says waiting on you in amber when the agent asked a person", () => {
    const ws = workspace([]);
    seen(ws, BIRCH, { status: "waiting_human" });
    expect(stateOf(ws, BIRCH)).toMatchObject({ state: "waiting", label: "waiting on you", tone: "needs" });
  });

  it("says offline after five minutes unseen, and not connected yet when never seen", () => {
    const ws = workspace([]);
    seen(ws, BIRCH, { last_seen_at: at("09:00") });
    expect(stateOf(ws, BIRCH)).toMatchObject({ state: "offline", label: "offline · 3 h" });
    expect(stateOf(ws, FJORD)).toMatchObject({ state: "offline", label: "not connected yet" });
  });

  it("shows time used only when the report is for today where the agent runs", () => {
    const ws = workspace([]);
    ws.people.profiles.get(ME)!.timezone = "UTC";
    seen(ws, BIRCH, { used_today_s: 4200, daily_limit_s: 10800, usage_day: "2026-10-10" });
    seen(ws, FJORD, { used_today_s: 4200, daily_limit_s: 10800, usage_day: "2026-10-09" });
    expect(stateOf(ws, BIRCH).usage).toEqual({ text: "1 h 10 of 3 h today", share: 4200 / 10800 });
    expect(stateOf(ws, FJORD).usage).toBeNull();
    expect(stateOf(ws, CAPTAIN).usage).toBeNull();
    seen(ws, BIRCH, { used_today_s: 20000 });
    expect(stateOf(ws, BIRCH).usage?.share).toBe(1);
    // The day is the owner's, not the viewer's: just past midnight in Auckland it is already the 11th.
    ws.people.profiles.get(ME)!.timezone = "Pacific/Auckland";
    expect(dayIn("Pacific/Auckland", NOW)).toBe("2026-10-11");
    expect(stateOf(ws, BIRCH).usage).toBeNull();
    expect(workTime(2400)).toBe("40 min");
    expect(workTime(3 * 3600)).toBe("3 h");
  });

  it("puts Captain first and says whose agent it is and its model on hover", () => {
    const ws = workspace([]);
    seen(ws, BIRCH, { effective_model: "claude-opus-5-5" });
    const t = team(ws, NOW);
    expect(t.agents.map((a) => a.name)).toEqual(["Captain", "Birch", "Fjord"]);
    expect(t.agents[1].hover).toBe("Raghav's agent · claude-opus-5-5");
    expect(t.agents[2].hover).toBe("Raghav's agent · model set on its machine");
  });

  it("lists each person as online or away, with their local time", () => {
    const ws = workspace([]);
    ws.people.profiles.get(ME)!.timezone = "UTC";
    ws.people.members.push({ actor_id: ME, actor_type: "human", role: "owner" }, { actor_id: CAPTAIN, actor_type: "agent", role: "member" });
    expect(team(ws, NOW).people).toEqual([{ id: ME, name: "Raghav", online: false, label: "away · 12:00 PM" }]);
    expect(team(ws, NOW, new Map([[ME, at("11:58")]])).people[0]).toMatchObject({ online: true, label: "online · 12:00 PM" });
    expect(team(ws, NOW, new Map([[ME, at("11:00")]])).people[0].online).toBe(false);
    // Whoever is looking is here.
    expect(team(ws, NOW, new Map(), ME).people[0].online).toBe(true);
    ws.people.profiles.get(ME)!.timezone = null;
    expect(team(ws, NOW).people[0].label).toBe("away");
  });
});

describe("worth watching", () => {
  const sentBackEvent = (t: Ticket, when: string, id: number): TicketEvent => ({ id, ticket_id: t.id, actor_id: CAPTAIN, actor_type: "agent", kind: "status", data: { from: "review", to: "in_progress" }, created_at: at(when) });
  const failing = { sha: "a", checks: { passed: 3, total: 4, state: "failure" as const }, files: { total: 1, risky: [] }, additions: 1, deletions: 0 };

  it("is empty when nothing is off", () => {
    const ws = workspace([ticket({ key: "SH-2", status: "done" }), ticket({ key: "SH-3", status: "ready", assignee_id: BIRCH })]);
    seen(ws, BIRCH);
    expect(watch(ws, [], NOW)).toEqual([]);
  });

  it("names a change sent back by review twice or more, never by key", () => {
    const pay2 = ticket({ key: "SH-12", title: "Pay with Apple Pay", status: "in_progress", assignee_id: BIRCH });
    const once = ticket({ key: "SH-13", title: "Saved cards", status: "in_progress", assignee_id: BIRCH });
    const shipped = ticket({ key: "SH-14", title: "Receipts", status: "done" });
    const ws = workspace([pay2, once, shipped]);
    run(ws, BIRCH, pay2);
    const events = [sentBackEvent(pay2, "09:00", 1), sentBackEvent(pay2, "10:00", 2), sentBackEvent(once, "10:00", 3), sentBackEvent(shipped, "08:00", 4), sentBackEvent(shipped, "09:00", 5)];
    expect(watch(ws, events, NOW)).toEqual([{ text: "“Pay with Apple Pay” was sent back by review twice.", tone: "problem", key: "SH-12" }, { text: "Nothing is queued after the current work.", tone: "quiet" }]);
    expect(watch(ws, [...events, sentBackEvent(pay2, "11:00", 6)], NOW)[0].text).toBe("“Pay with Apple Pay” was sent back by review 3 times.");
  });

  it("says when a finished change has waited over 20 minutes for review", () => {
    const waiting = ticket({ key: "SH-2", title: "Add the Google button", status: "review", assignee_id: BIRCH, updated_at: at("11:55") });
    const fresh = ticket({ key: "SH-3", status: "review", assignee_id: BIRCH, updated_at: at("11:50") });
    const approved = ticket({ key: "SH-4", status: "review", assignee_id: BIRCH, updated_at: at("10:00"), approved_sha: "abc" });
    const ws = workspace([waiting, fresh, approved]);
    const moved: TicketEvent = { id: 1, ticket_id: waiting.id, actor_id: BIRCH, actor_type: "agent", kind: "status", data: { from: "in_progress", to: "review" }, created_at: at("11:15") };
    expect(watch(ws, [moved], NOW)).toEqual([{ text: "“Add the Google button” has waited 45 min for review.", tone: "quiet", key: "SH-2" }]);
    // Not while Captain is on it.
    run(ws, CAPTAIN, waiting);
    expect(watch(ws, [moved], NOW)).toEqual([]);
  });

  it("says when tests are failing on an open change", () => {
    const ws = workspace([ticket({ key: "SH-2", title: "Fix SH-9's tax", status: "review", approved_sha: "a", pr_facts: failing }), ticket({ key: "SH-9", title: "Ontario tax", status: "done", pr_facts: failing })]);
    expect(watch(ws, [], NOW)).toEqual([{ text: "Tests are failing on “Fix “Ontario tax”'s tax”.", tone: "problem", key: "SH-2" }]);
  });

  it("says when an agent with work hasn't been seen for over a day, or ever", () => {
    const ws = workspace([ticket({ key: "SH-2", status: "ready", assignee_id: BIRCH }), ticket({ key: "SH-3", status: "in_progress", assignee_id: FJORD })]);
    seen(ws, BIRCH, { last_seen_at: "2026-10-08T12:00:00Z" });
    expect(watch(ws, [], NOW)).toEqual([
      { text: "Birch has work assigned, but its computer hasn't been seen for 2 days.", tone: "problem", people: true },
      { text: "Fjord has work assigned, but its computer has never connected.", tone: "problem", people: true },
    ]);
    // Unseen with nothing to do is nobody's problem.
    expect(watch(workspace([]), [], NOW)).toEqual([]);
  });

  it("says when work piles up on one agent while another is free", () => {
    const ws = workspace([1, 2, 3].map((n) => ticket({ key: `SH-${n}`, status: "ready", assignee_id: BIRCH })));
    seen(ws, BIRCH);
    seen(ws, CAPTAIN);
    // Captain being free doesn't count: it plans and reviews.
    expect(watch(ws, [], NOW)).toEqual([]);
    seen(ws, FJORD);
    expect(watch(ws, [], NOW)).toEqual([{ text: "3 parts are waiting for Birch while Fjord is free.", tone: "quiet", people: true }]);
  });

  it("says when nothing is queued after the work being built, and only then", () => {
    const t = ticket({ key: "SH-2", status: "in_progress", assignee_id: BIRCH });
    const ws = workspace([t]);
    run(ws, BIRCH, t);
    expect(watch(ws, [], NOW)).toEqual([{ text: "Nothing is queued after the current work.", tone: "quiet" }]);
    const queued = workspace([t, ticket({ key: "SH-3", status: "ready", assignee_id: BIRCH })]);
    run(queued, BIRCH, t);
    expect(watch(queued, [], NOW)).toEqual([]);
  });

  it("puts the most serious first", () => {
    const bad = ticket({ key: "SH-2", title: "Checkout", status: "review", assignee_id: BIRCH, updated_at: at("11:00"), pr_facts: failing });
    const ws = workspace([bad]);
    seen(ws, BIRCH);
    const out = watch(ws, [sentBackEvent(bad, "09:00", 1), sentBackEvent(bad, "10:00", 2)], NOW);
    expect(out.map((i) => i.text)).toEqual(["Tests are failing on “Checkout”.", "“Checkout” was sent back by review twice.", "“Checkout” has waited 1 h for review."]);
    expect(out.map((i) => i.text).join(" ")).not.toMatch(/SH-\d/);
  });
});

describe("resume times", () => {
  it("finds the next time in the agent's own zone", () => {
    expect(resumeAt("Waiting for my usage limit to reset, about 5:40 am (UTC)", NOW)?.toISOString()).toBe("2026-10-11T05:40:00.000Z");
    expect(resumeAt("resets 1:20pm (Europe/Stockholm)", NOW)?.toISOString()).toBe("2026-10-11T11:20:00.000Z");
    expect(resumeAt("Creating profiles", NOW)).toBeNull();
  });
});

describe("at a glance (AK-111)", () => {
  it("counts working, needing you, stopped and free agents, keeping idle and waiting agents out of the tiles", () => {
    const building = ticket({ key: "SH-2", status: "in_progress", assignee_id: BIRCH, summary: "adding Google sign-in" });
    const ws = workspace([building]);
    run(ws, BIRCH, building);
    seen(ws, FJORD, { status: "paused" });
    seen(ws, CAPTAIN);
    const t = team(ws, NOW);
    expect(pulse(t, 3)).toEqual({ working: 1, needs: 3, stopped: 1, free: 1, offline: 0 });
  });

  it("lists the team working first, with what each is doing as a sentence and no ticket key", () => {
    const building = ticket({ key: "SH-2", status: "in_progress", assignee_id: BIRCH, summary: "adding Google sign-in" });
    const ws = workspace([building]);
    run(ws, BIRCH, building);
    seen(ws, CAPTAIN);
    const rows = crew(team(ws, NOW), agentRows(ws, NOW));
    expect(rows[0]).toMatchObject({ name: "Birch", word: "Working", doing: "Adding Google sign-in" });
    expect(rows.find((r) => r.name === "Captain")).toMatchObject({ word: "Free", doing: "Nothing assigned", feature: null });
    expect(JSON.stringify(rows.map(({ key: _key, ...r }) => r))).not.toMatch(/SH-\d/);
  });

  it("words what needs the person by kind, oldest first, naming the agent instead of I", () => {
    const merge = ticket({ key: "SH-3", title: "Add the sessions table", summary: "adding the sessions table", status: "review", assignee_id: BIRCH, needs_human: `${MERGE_OK_PREFIX} Everyone signs out once. OK?`, updated_at: at("11:00") });
    const stuck = ticket({ key: "SH-4", title: "Store sessions", status: "in_progress", assignee_id: FJORD, needs_human: "I couldn't start: SH-3 isn't merged yet.", updated_at: at("11:30") });
    const ws = workspace([merge, stuck]);
    const items = askItems(ws, needsYou(ws, []), [], NOW);
    expect(items.map((i) => i.title)).toEqual(["OK to merge: Adding the sessions table", "Fjord couldn't start: “Add the sessions table” isn't merged yet."]);
    expect(items[0].sub).toBe("Fixes and upkeep · waiting 1 h");
    expect(JSON.stringify(items.map(({ key: _key, ...i }) => i))).not.toMatch(/SH-\d/);
  });

  it("cuts a question to its first sentence and about a line", () => {
    expect(firstSentence("Redis or Postgres? Postgres is simpler.")).toBe("Redis or Postgres?");
    expect(firstSentence("x".repeat(200), 20)).toHaveLength(20);
  });
});


describe("status in this project", () => {
  const setup = () => {
    const t = ticket({ key: "SH-90", status: "in_progress", assignee_id: BIRCH, title: "Local work" });
    const ws = workspace([t]);
    run(ws, BIRCH, t);
    return { ws, t, a: ws.agentOf(BIRCH)! };
  };
  it("keeps the note and ticket for this project", () => {
    const { ws, t, a } = setup();
    Object.assign(a, { status_project_id: ws.project.id, status_note: "Making profiles" });
    expect(statusHere(a, ws.project.id, ws.byId, NOW)).toMatchObject({ elsewhere: false, status_note: "Making profiles", current_ticket_id: t.id });
    expect(team(ws, NOW).agents.find((x) => x.id === BIRCH)?.state).toBe("working");
    expect(agentRows(ws, NOW).find((x) => x.agentId === BIRCH)?.key).toBe(t.key);
  });
  it.each(["building", "planning", "waiting_human", "blocked", "idle"] as const)("hides another project's %s status and counts it as busy", (status) => {
    const { ws, a } = setup();
    Object.assign(a, { status, status_project_id: "other", status_note: "Secret project title", current_ticket_id: "foreign-ticket" });
    expect(statusHere(a, ws.project.id, ws.byId, NOW)).toMatchObject({ elsewhere: true, status_note: null, current_ticket_id: null });
    const t = team(ws, NOW);
    expect(t.agents.find((x) => x.id === BIRCH)).toMatchObject({ state: "elsewhere", label: "Busy in another project" });
    const rows = agentRows(ws, NOW);
    expect(rows.some((x) => x.agentId === BIRCH)).toBe(false);
    expect(crew(t, rows).find((x) => x.id === BIRCH)).toMatchObject({ doing: "Busy in another project", key: null, feature: null });
    expect(look(ws).state).not.toBe("working");
    expect(JSON.stringify({ t, rows, watch: watch(ws, [], NOW) })).not.toContain("Secret project title");
  });
  it("recognises a foreign ticket from old helpers, even if a project id claims it is local", () => {
    const { ws, a } = setup();
    Object.assign(a, { current_ticket_id: "foreign-ticket", status_project_id: ws.project.id });
    expect(statusHere(a, ws.project.id, ws.byId, NOW).elsewhere).toBe(true);
    a.status_project_id = null;
    expect(statusHere(a, ws.project.id, ws.byId, NOW).elsewhere).toBe(true);
    expect(team(ws, NOW).agents.find((x) => x.id === BIRCH)?.state).toBe("elsewhere");
  });
  it("keeps old helpers' unscoped status when there is no foreign ticket", () => {
    const { ws, a } = setup();
    Object.assign(a, { status_project_id: null, current_ticket_id: null, status_note: "Planning here" });
    expect(statusHere(a, ws.project.id, ws.byId, NOW)).toMatchObject({ elsewhere: false, status_note: "Planning here" });
    expect(agentRows(ws, NOW).find((x) => x.agentId === BIRCH)?.key).toBe("SH-90");
  });
  it.each(["offline", "paused"] as const)("shows agent-wide %s without foreign text or a ticket", (status) => {
    const { ws, a } = setup();
    Object.assign(a, { status, status_project_id: "other", status_note: "Secret title", current_ticket_id: "foreign-ticket" });
    expect(statusHere(a, ws.project.id, ws.byId, NOW)).toMatchObject({ elsewhere: false, status, status_note: null, current_ticket_id: null });
    expect(team(ws, NOW).agents.find((x) => x.id === BIRCH)?.state).toBe(status === "offline" ? "offline" : "stopped");
  });
  it("keeps usage-limit waits, reset time and today's usage across projects", () => {
    const { ws, a } = setup();
    Object.assign(a, { status: "idle", status_project_id: "other", current_ticket_id: "foreign-ticket",
      status_note: "Secret title. Waiting for my usage limit to reset, about 5:40 pm (UTC)",
      waiting_until: at("17:40"), usage_day: "2026-10-10", used_today_s: 3600, daily_limit_s: 7200 });
    const scoped = statusHere(a, ws.project.id, ws.byId, NOW);
    expect(scoped).toMatchObject({ elsewhere: false, status_note: "Waiting for my usage limit to reset, about 5:40 pm (UTC)", current_ticket_id: null });
    expect(team(ws, NOW).agents.find((x) => x.id === BIRCH)).toMatchObject({ state: "limit", usage: { text: "1 h of 2 h today" } });
    a.waiting_until = null;
    expect(team(ws, NOW).agents.find((x) => x.id === BIRCH)?.state).toBe("limit");
  });
  it("does not suggest moving work to an agent busy elsewhere", () => {
    const waiting = Array.from({ length: 4 }, (_, i) => ticket({ key: `SH-${90 + i}`, assignee_id: FJORD }));
    const ws = workspace(waiting);
    seen(ws, BIRCH, { status: "planning", status_project_id: "other" });
    expect(watch(ws, [], NOW).some((x) => x.text.includes("Birch is free"))).toBe(false);
  });
});


it("hides a ticket explicitly known to belong to a different project", () => {
  const t = ticket({ key: "OTHER-1", project_id: "other", title: "Private title" });
  const ws = workspace([t]);
  const a = run(ws, BIRCH, t);
  expect(statusHere(a, ws.project.id, ws.byId, NOW)).toMatchObject({ elsewhere: true, current_ticket_id: null });
});

it("normalises a stale heartbeat to offline even when the status still says building", () => {
  const ws = workspace([]);
  const a = run(ws, BIRCH);
  a.last_seen_at = at("10:00");
  expect(statusHere(a, ws.project.id, ws.byId, NOW).status).toBe("offline");
});
