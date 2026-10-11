import { describe, expect, it } from "vitest";
import { MERGE_OK_PREFIX, type RunKind, type RunUsage, type Ticket, type TicketEvent } from "../lib/data";
import { BIRCH, CAPTAIN, FJORD, ME, decision, ticket, workspace } from "./fixtures";
import { CACHE_READ_WEIGHT, askKind, auditCsv, auditFileName, auditJson, auditRows, barsText, checkedText, dollars, duration, emptyText, headline, median, missingText, onTopText, percents, periodLine, periodOf, rangeOf, results, sentBackCaption, sharesText, tokens, usage, usageEmptyText, usageHeadline, weighted } from "./results";

// Sunday 11 Oct 2026, 3 pm, in whatever time zone the tests run in: the week began Monday 5 Oct.
const NOW = new Date(2026, 9, 11, 15, 0);
const local = (month: number, dayOfMonth: number, hour = 12, minute = 0) => new Date(2026, month - 1, dayOfMonth, hour, minute).toISOString();

let id = 0;
const event = (key: string, kind: string, when: string, data: Record<string, unknown> = {}, actor: string | null = BIRCH): TicketEvent => ({
  id: ++id,
  ticket_id: `t-${key}`,
  actor_id: actor,
  actor_type: actor === ME ? "human" : actor ? "agent" : null,
  kind,
  data,
  created_at: when,
});

const SHA = "3f9c2a71d0b84e6a95c1f2d7e8a0b4c6d5e7f912";
const tested = { sha: SHA, checks: { passed: 48, total: 48, state: "success" as const }, files: { total: 2, risky: [] }, additions: 9, deletions: 3 };

/** A ticket merged at `done`, started `minutes` before, reviewed and tested unless said otherwise. */
const merged = (key: string, done: string, minutes: number | null, over: Partial<Ticket> = {}) =>
  ticket({
    key,
    status: "done",
    pr_url: `https://github.com/ana/shop/pull/${key.split("-")[1]}`,
    assignee_id: BIRCH,
    assignee_type: "agent",
    completed_at: done,
    started_at: minutes === null ? null : new Date(Date.parse(done) - minutes * 60_000).toISOString(),
    approved_sha: SHA,
    approved_by: CAPTAIN,
    pr_facts: tested,
    ...over,
  });

describe("the period", () => {
  it("is this week unless the address says 4weeks", () => {
    expect(periodOf("")).toBe("week");
    expect(periodOf("?period=week")).toBe("week");
    expect(periodOf("?preview=workspace&period=4weeks")).toBe("4weeks");
    expect(periodOf("?period=year")).toBe("week");
  });

  it("starts on Monday at midnight, local time, and ends now", () => {
    const week = rangeOf("week", NOW);
    expect(week.from).toEqual(new Date(2026, 9, 5));
    expect(week.to).toBe(NOW);
    expect(rangeOf("4weeks", NOW).from).toEqual(new Date(2026, 8, 14));
    // On a Monday the week is that day alone.
    expect(rangeOf("week", new Date(2026, 9, 5, 0, 30)).from).toEqual(new Date(2026, 9, 5));
  });

  it("is written in words", () => {
    expect(periodLine(rangeOf("week", NOW))).toBe("Oct 5 – Oct 11 · this week");
    expect(periodLine(rangeOf("4weeks", NOW))).toBe("Sep 14 – Oct 11 · last 4 weeks");
  });
});

describe("merged", () => {
  const tickets = [
    merged("SH-1", local(10, 5, 0, 0), 60), // the first minute of the week
    merged("SH-2", local(10, 4, 23, 59), 60), // a minute before it
    merged("SH-3", local(9, 14, 0, 0), 60), // the first minute of the four weeks
    merged("SH-4", local(9, 13, 23, 59), 60),
    merged("SH-5", local(10, 11, 15, 0), 60), // now
    merged("SH-6", local(10, 11, 15, 1), 60), // after now
    merged("SH-7", local(10, 7), 60, { pr_url: null }), // finished without a pull request
    ticket({ key: "SH-8", status: "review", pr_url: "https://github.com/ana/shop/pull/8" }),
    merged("SH-9", local(10, 7), 60, { type: "epic" }),
  ];
  const ws = workspace(tickets);

  it("counts tickets that became Done in the period and have a pull request", () => {
    expect(results(ws, [], "week", NOW).merged.map((t) => t.key)).toEqual(["SH-1", "SH-5"]);
    expect(results(ws, [], "4weeks", NOW).merged.map((t) => t.key)).toEqual(["SH-1", "SH-2", "SH-3", "SH-5"]);
  });

  it("has a bar for each day of the week so far, Monday first", () => {
    const r = results(ws, [], "week", NOW);
    expect(r.bars.map((b) => `${b.label} ${b.count}`)).toEqual(["Mon 1", "Tue 0", "Wed 0", "Thu 0", "Fri 0", "Sat 0", "Sun 1"]);
    expect(results(ws, [], "week", new Date(2026, 9, 7, 9, 0)).bars.map((b) => b.label)).toEqual(["Mon", "Tue", "Wed"]);
    expect(barsText(r)).toBe("Merged tickets per day: Monday, Oct 5: 1; Tuesday, Oct 6: 0; Wednesday, Oct 7: 0; Thursday, Oct 8: 0; Friday, Oct 9: 0; Saturday, Oct 10: 0; Sunday, Oct 11: 1.");
  });

  it("has a bar for each of the four weeks", () => {
    const r = results(ws, [], "4weeks", NOW);
    expect(r.bars.map((b) => `${b.label} ${b.count}`)).toEqual(["Sep 14 1", "Sep 21 0", "Sep 28 1", "Oct 5 2"]);
    expect(barsText(r)).toBe("Merged tickets per week: Week of Sep 14: 1; Week of Sep 21: 0; Week of Sep 28: 1; Week of Oct 5: 2.");
  });
});

describe("time to merge", () => {
  it("is the median from started to completed, in plain words", () => {
    const ws = workspace([merged("SH-1", local(10, 6), 30), merged("SH-2", local(10, 7), 130), merged("SH-3", local(10, 8), 600)]);
    expect(duration(results(ws, [], "week", NOW).medianMs!)).toBe("2 h 10 min");
  });

  it("skips tickets without a start time, and is left out when none has one", () => {
    expect(results(workspace([merged("SH-1", local(10, 6), null), merged("SH-2", local(10, 7), 40)]), [], "week", NOW).medianMs).toBe(40 * 60_000);
    expect(results(workspace([merged("SH-1", local(10, 6), null)]), [], "week", NOW).medianMs).toBeNull();
  });

  it("takes the middle of an even number of values", () => {
    expect(median([10, 40, 20, 30])).toBe(25);
    expect(median([])).toBeNull();
  });

  it("reads as minutes, hours or days", () => {
    expect(duration(20_000)).toBe("under a minute");
    expect(duration(45 * 60_000)).toBe("45 min");
    expect(duration(120 * 60_000)).toBe("2 h");
    expect(duration(47 * 3_600_000 + 5 * 60_000)).toBe("47 h 5 min");
    expect(duration(76 * 3_600_000)).toBe("3 d 4 h");
    expect(duration(72 * 3_600_000)).toBe("3 d");
  });
});

describe("times you were asked", () => {
  it("sorts a note the way the Captain page does", () => {
    expect(askKind(`${MERGE_OK_PREFIX} Is one sign-out OK?`)).toBe("risky_merge");
    expect(askKind("I stopped: hit the 60-minute limit.")).toBe("problem");
    expect(askKind("Couldn't merge: the branch has conflicts.")).toBe("problem");
    expect(askKind("Redis or Postgres for sessions?")).toBe("question");
  });

  it("counts each time Needs you was set in the period, by kind", () => {
    const ws = workspace([ticket({ key: "SH-1" }), ticket({ key: "SH-2" })]);
    const events = [
      event("SH-1", "needs_human", local(10, 6), { note: `${MERGE_OK_PREFIX} Is one sign-out OK?` }),
      event("SH-2", "needs_human", local(10, 6), { note: `${MERGE_OK_PREFIX} OK to add the column?` }),
      event("SH-1", "needs_human", local(10, 7), { note: "Redis or Postgres?" }),
      event("SH-1", "needs_human", local(10, 8), { note: "I'm blocked: can't push." }),
      event("SH-1", "needs_human", local(10, 4), { note: "Asked last week" }),
      event("SH-1", "comment", local(10, 7)),
    ];
    const r = results(ws, events, "week", NOW);
    expect(r.asked.total).toBe(4);
    expect(r.asked.kinds).toEqual([
      { kind: "risky_merge", label: "OK a risky merge", count: 2 },
      { kind: "question", label: "Answer a question", count: 1 },
      { kind: "problem", label: "Look at a problem", count: 1 },
    ]);
    expect(results(ws, events, "4weeks", NOW).asked.total).toBe(5);
  });

  it("leaves out kinds that didn't happen", () => {
    const r = results(workspace([ticket({ key: "SH-1" })]), [event("SH-1", "needs_human", local(10, 7), { note: "Which page?" })], "week", NOW);
    expect(r.asked.kinds.map((k) => k.kind)).toEqual(["question"]);
  });
});

describe("sent back", () => {
  const ws = workspace([
    ticket({ key: "SH-1", assignee_id: BIRCH }),
    ticket({ key: "SH-2", assignee_id: FJORD }),
    ticket({ key: "SH-3", assignee_id: FJORD }),
  ]);
  const events = [
    event("SH-1", "status", local(10, 6), { from: "review", to: "in_progress" }),
    event("SH-1", "status", local(10, 7), { from: "review", to: "in_progress" }), // twice: still one ticket
    event("SH-2", "status", local(10, 7), { from: "done", to: "in_progress" }),
    event("SH-3", "status", local(10, 7), { from: "ready", to: "in_progress" }),
    event("SH-3", "status", local(10, 1), { from: "review", to: "in_progress" }), // last week
  ];

  it("counts tickets a review sent back and tickets reopened after Done", () => {
    const r = results(ws, events, "week", NOW);
    expect(r.sentBack).toEqual({ total: 2, byReview: 1, reopened: 1 });
    expect(sentBackCaption(r)).toBe("1 after review · 1 reopened after done");
    expect(results(ws, events, "4weeks", NOW).sentBack.total).toBe(3);
  });
});

describe("by agent", () => {
  it("has a row for everyone who built something, and approvals on Captain's row", () => {
    const ws = workspace([
      merged("SH-1", local(10, 6), 30),
      merged("SH-2", local(10, 7), 90),
      merged("SH-3", local(10, 7), 20, { assignee_id: ME, assignee_type: "human" }),
      ticket({ key: "SH-4", status: "in_progress", assignee_id: FJORD }),
    ]);
    const events = [
      event("SH-4", "status", local(10, 8), { from: "review", to: "in_progress" }, CAPTAIN),
      event("SH-1", "approval", local(10, 6), { to: SHA }, CAPTAIN),
      event("SH-2", "approval", local(10, 7), { to: SHA }, CAPTAIN),
      event("SH-2", "approval", local(10, 7), { to: null, reason: "pr_changed" }, CAPTAIN),
      event("SH-3", "approval", local(10, 7), { to: SHA }, ME),
    ];
    expect(results(ws, events, "week", NOW).agents).toEqual([
      { id: BIRCH, captain: false, merged: 2, medianMs: 60 * 60_000, sentBack: 0, approvals: 0 },
      { id: ME, captain: false, merged: 1, medianMs: 20 * 60_000, sentBack: 0, approvals: 0 },
      { id: FJORD, captain: false, merged: 0, medianMs: null, sentBack: 1, approvals: 0 },
      { id: CAPTAIN, captain: true, merged: 0, medianMs: null, sentBack: 0, approvals: 2 },
    ]);
  });

  it("has no rows when nobody built or approved anything", () => {
    expect(results(workspace([ticket({ key: "SH-1", assignee_id: BIRCH })]), [], "week", NOW).agents).toEqual([]);
  });
});

describe("the headline", () => {
  const asks = (n: number) => Array.from({ length: n }, () => event("SH-1", "needs_human", local(10, 7), { note: "Which page?" }));

  it("says how many merged, how they were checked and how often a person was asked", () => {
    const ws = workspace([merged("SH-1", local(10, 6), 30), merged("SH-2", local(10, 7), 30)]);
    expect(headline(results(ws, asks(4), "week", NOW))).toBe("2 tickets merged this week, all reviewed and tested. You were asked 4 times.");
    expect(headline(results(ws, asks(1), "4weeks", NOW))).toBe("2 tickets merged in the last 4 weeks, all reviewed and tested. You were asked once.");
    expect(headline(results(workspace([merged("SH-1", local(10, 6), 30)]), [], "week", NOW))).toBe("1 ticket merged this week, reviewed and tested. You weren't asked anything.");
  });

  it("only claims what the record shows", () => {
    const untested = merged("SH-2", local(10, 7), 30, { pr_facts: null });
    const otherCommit = merged("SH-2", local(10, 7), 30, { pr_facts: { ...tested, sha: "0".repeat(40) } });
    const unreviewed = merged("SH-3", local(10, 7), 30, { approved_sha: null });
    expect(checkedText(results(workspace([merged("SH-1", local(10, 6), 30), untested]), [], "week", NOW))).toBe("all reviewed");
    expect(checkedText(results(workspace([merged("SH-1", local(10, 6), 30), otherCommit]), [], "week", NOW))).toBe("all reviewed");
    expect(checkedText(results(workspace([merged("SH-1", local(10, 6), 30), untested, unreviewed]), [], "week", NOW))).toBe("2 of 3 reviewed");
  });

  it("is one plain sentence when nothing merged", () => {
    const ws = workspace([ticket({ key: "SH-1" })]);
    expect(emptyText(results(ws, [], "week", NOW))).toBe("Nothing has merged this week yet.");
    expect(emptyText(results(ws, [], "4weeks", NOW))).toBe("Nothing has merged in the last 4 weeks.");
  });
});

describe("the audit export", () => {
  const ws = workspace([ticket({ key: "SH-1", title: 'Fix the "tax", for Ontario' }), ticket({ key: "SH-2", title: "=SUM(A1)" })], {
    decisions: [decision("DEC-1", "Postgres for everything", local(10, 8)), decision("CON-2", "Session cookie", local(10, 9), { kind: "contract", created_by: ME }), decision("DEC-3", "Older", local(10, 1))],
  });
  const events = [
    event("SH-1", "created", local(10, 5, 9), { status: "ready" }, CAPTAIN),
    event("SH-1", "assignee", local(10, 5, 9, 1), { from: null, to: BIRCH }, CAPTAIN),
    event("SH-1", "status", local(10, 5, 10), { from: "ready", to: "in_progress" }),
    event("SH-1", "pr", local(10, 5, 11), { url: "https://github.com/ana/shop/pull/1" }),
    event("SH-1", "needs_human", local(10, 5, 12), { note: "Which rate?" }),
    event("SH-1", "approval", local(10, 6, 9), { to: SHA }, CAPTAIN),
    event("SH-1", "approval", local(10, 6, 9, 30), { to: null, reason: "pr_changed" }),
    event("SH-1", "merge_ok", local(10, 6, 10), { by: ME }, ME),
    event("SH-1", "status", local(10, 6, 11), { from: "review", to: "done" }, CAPTAIN),
    event("SH-2", "created", local(10, 7), { status: "backlog" }, null),
    event("SH-2", "created", local(10, 1), { status: "backlog" }, CAPTAIN), // before the period
    event("SH-9", "comment", local(10, 7, 13), {}, FJORD), // a ticket that's gone
  ];
  const range = rangeOf("week", NOW);
  const rows = auditRows(ws, events, range);

  it("has one row per event and decision in the period, oldest first, saying what happened", () => {
    expect(rows.map((r) => `${r.key}|${r.event}|${r.detail}`)).toEqual([
      "SH-1|Created|Ready",
      "SH-1|Assigned|to Birch",
      "SH-1|Status changed|Ready → In progress",
      "SH-1|Pull request opened|https://github.com/ana/shop/pull/1",
      "SH-1|Asked a person|Which rate?",
      `SH-1|Approved|commit ${SHA}`,
      "SH-1|Approval cleared|the pull request changed",
      "SH-1|Merge OK'd|by Raghav",
      "SH-1|Done|Review → Done",
      "SH-2|Created|Backlog",
      "|Commented|",
      "DEC-1|Decision recorded|",
      "CON-2|Contract recorded|",
    ]);
    expect(rows.map((r) => r.time)).toEqual([...rows.map((r) => r.time)].sort());
    expect(rows[5].commit).toBe(SHA);
  });

  it("says who did it and whether that's a person or an agent", () => {
    expect([rows[0].actor, rows[0].actor_kind]).toEqual(["Captain", "agent"]);
    expect([rows[7].actor, rows[7].actor_kind]).toEqual(["Raghav", "person"]);
    expect([rows[9].actor, rows[9].actor_kind]).toEqual(["AutoKolab", ""]);
    expect([rows[12].actor, rows[12].actor_kind]).toEqual(["Raghav", "person"]);
    expect(rows[0].time).toBe(local(10, 5, 9));
  });

  it("writes CSV a spreadsheet opens safely", () => {
    const lines = auditCsv(rows).split("\r\n");
    expect(lines[0]).toBe("time,type,key,title,event,detail,commit,actor,actor_kind");
    expect(lines).toHaveLength(rows.length + 2); // header, rows, and the final line break
    expect(lines[1]).toBe(`${local(10, 5, 9)},ticket,SH-1,"Fix the ""tax"", for Ontario",Created,Ready,,Captain,agent`);
    expect(lines[10]).toContain(",'=SUM(A1),");
  });

  it("writes JSON with the events and the decisions apart", () => {
    const json = JSON.parse(auditJson(ws, rows, range));
    expect(json.project).toBe("Shop");
    expect(json.from).toBe(range.from.toISOString());
    expect(json.events).toHaveLength(11);
    expect(json.events[5]).toEqual({ time: local(10, 6, 9), key: "SH-1", title: 'Fix the "tax", for Ontario', event: "Approved", detail: `commit ${SHA}`, commit: SHA, actor: "Captain", actor_kind: "agent" });
    expect(json.decisions).toEqual([
      { time: local(10, 8), key: "DEC-1", title: "Postgres for everything", event: "Decision recorded", actor: "Captain", actor_kind: "agent" },
      { time: local(10, 9), key: "CON-2", title: "Session cookie", event: "Contract recorded", actor: "Raghav", actor_kind: "person" },
    ]);
  });

  it("names the files after the project and the dates", () => {
    expect(auditFileName("shop", range, "csv")).toBe("shop-audit-2026-10-05-to-2026-10-11.csv");
    expect(auditFileName("shop", rangeOf("4weeks", NOW), "json")).toBe("shop-audit-2026-09-14-to-2026-10-11.json");
  });
});

describe("where the usage went", () => {
  let runId = 0;
  /** One run. `used` is its output tokens unless the four counts are given; null means its tool reported nothing. */
  const ran = (kind: RunKind, agent: string, key: string | null, when: string, used: number | null | Partial<RunUsage>, cost: number | null = 0.5): RunUsage => ({
    id: ++runId,
    agent_id: agent,
    ticket_id: key ? `t-${key}` : null,
    kind,
    model: used === null ? null : "claude-opus-5-5",
    input_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    output_tokens: typeof used === "number" ? used : null,
    turns: used === null ? null : 12,
    seconds: 600,
    cost_usd: used === null ? null : cost,
    created_at: when,
    ...(used !== null && typeof used === "object" ? used : {}),
  });

  const ws = workspace([
    merged("SH-1", local(10, 7), 60, { summary: "Shoppers can pay with Apple Pay." }),
    merged("SH-2", local(10, 8), 60, { title: "Sort search by newest" }),
    merged("SH-3", local(9, 20), 60, { title: "Remember the last search" }),
  ]);
  // This week: building 78,000, reviewing 9,000, agents talking 11,000, questions 2,000.
  const week = [
    ran("build", BIRCH, "SH-1", local(10, 6), { input_tokens: 1000, cache_read_tokens: 100_000, cache_write_tokens: 5000, output_tokens: 4000 }),
    ran("build", FJORD, "SH-2", local(10, 7), 58_000),
    ran("review", CAPTAIN, "SH-1", local(10, 7, 9), 9000),
    ran("reply", CAPTAIN, null, local(10, 8), 6000),
    ran("reply", BIRCH, null, local(10, 8, 13), 5000),
    ran("question", CAPTAIN, "SH-2", local(10, 9), 2000),
  ];

  it("weights a token read from the cache at one tenth and the rest in full", () => {
    expect(CACHE_READ_WEIGHT).toBe(0.1);
    expect(weighted({ input_tokens: 1000, cache_read_tokens: 100_000, cache_write_tokens: 5000, output_tokens: 4000 })).toBe(20_000);
    expect(weighted({ input_tokens: null, cache_read_tokens: 50, cache_write_tokens: null, output_tokens: null })).toBe(5);
    // A tool that gives some counts and not others is counted for what it gave.
    expect(weighted({ input_tokens: 315, cache_read_tokens: 24_448, cache_write_tokens: null, output_tokens: 122 })).toBeCloseTo(2881.8);
    expect(weighted({ input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0 })).toBe(0);
  });

  it("is never estimated: a run with no token counts has no usage", () => {
    expect(weighted({ input_tokens: null, cache_read_tokens: null, cache_write_tokens: null, output_tokens: null })).toBeNull();
    // Not even from how long it ran or what it cost.
    expect(weighted(ran("build", BIRCH, "SH-1", local(10, 6), null))).toBeNull();
  });

  it("shares the usage by kind of run, with the run counts", () => {
    const u = usage(ws, week, "week", NOW);
    expect(u.total).toBe(100_000);
    expect(u.kinds).toEqual([
      { kind: "build", label: "Building", runs: 2, tokens: 78_000, percent: 78 },
      { kind: "review", label: "Reviewing", runs: 1, tokens: 9000, percent: 9 },
      { kind: "reply", label: "Agents talking", runs: 2, tokens: 11_000, percent: 11 },
      { kind: "question", label: "Questions", runs: 1, tokens: 2000, percent: 2 },
    ]);
    expect(usageHeadline(u)).toBe("Building took 78% of the usage; reviewing 9%, agents talking 11%, questions 2%.");
    expect(sharesText(u)).toBe("Usage by kind of run: Building: 78%, 2 runs; Reviewing: 9%, 1 run; Agents talking: 11%, 2 runs; Questions: 2%, 1 run.");
    expect(usageEmptyText(u)).toBeNull();
    expect(missingText(u)).toBeNull();
  });

  it("counts coordination as everything that isn't building, on top of building", () => {
    const u = usage(ws, week, "week", NOW);
    // 22,000 of reviewing, talking and questions over 78,000 of building.
    expect(u.onTop).toBe(28);
    expect(onTopText(u)).toBe("28% on top of building");
    const noBuilding = usage(ws, week.filter((r) => r.kind !== "build"), "week", NOW);
    expect(noBuilding.onTop).toBeNull();
    expect(onTopText(noBuilding)).toBeNull();
    expect(usageHeadline(noBuilding)).toBe("None of the usage went on building; reviewing 41%, agents talking 50%, questions 9%.");
    expect(usageHeadline(usage(ws, week.filter((r) => r.kind === "build"), "week", NOW))).toBe("Building took 100% of the usage.");
  });

  it("gives the usage per merged ticket and names the three tickets it went on, without keys", () => {
    const u = usage(ws, week, "week", NOW);
    // SH-1 and SH-2 merged this week; SH-3 merged in September.
    expect(u.mergedCount).toBe(2);
    expect(u.perMerged).toBe(50_000);
    expect(u.top.map((t) => [t.name, t.tokens])).toEqual([
      ["Sort search by newest", 60_000],
      ["Shoppers can pay with Apple Pay", 29_000],
    ]);
    const many = usage(ws, [...week, ran("build", BIRCH, "SH-3", local(10, 9), 70_000), ran("build", BIRCH, "SH-gone", local(10, 9), 99_000)], "week", NOW);
    expect(many.top.map((t) => t.name)).toEqual(["Remember the last search", "Sort search by newest", "Shoppers can pay with Apple Pay"]);
    expect(JSON.stringify(many.top.map((t) => t.name))).not.toMatch(/SH-\d/);
    // Nothing merged: there's no average to give.
    expect(usage(workspace([]), week, "week", NOW).perMerged).toBeNull();
  });

  it("shares it by agent, most usage first", () => {
    expect(usage(ws, week, "week", NOW).agents).toEqual([
      { id: FJORD, runs: 1, tokens: 58_000, percent: 58 },
      { id: BIRCH, runs: 2, tokens: 25_000, percent: 25 },
      { id: CAPTAIN, runs: 3, tokens: 17_000, percent: 17 },
    ]);
  });

  it("says how many runs didn't report, and keeps them out of the shares", () => {
    const u = usage(ws, [...week, ran("build", FJORD, "SH-2", local(10, 9), null), ran("reply", FJORD, null, local(10, 9), null)], "week", NOW);
    expect(u.runs).toBe(8);
    expect(u.missing).toBe(2);
    expect(missingText(u)).toBe("2 of 8 runs didn't report usage.");
    expect(u.total).toBe(100_000);
    expect(u.kinds.map((k) => [k.kind, k.runs, k.percent])).toEqual([["build", 3, 78], ["review", 1, 9], ["reply", 3, 11], ["question", 1, 2]]);
    expect(u.agents.find((a) => a.id === FJORD)).toEqual({ id: FJORD, runs: 3, tokens: 58_000, percent: 58 });
  });

  it("shows the engine's cost only when every run in the period gave one", () => {
    expect(usage(ws, week, "week", NOW).costUsd).toBe(3);
    expect(usage(ws, [...week, ran("review", CAPTAIN, "SH-2", local(10, 9), 100, null)], "week", NOW).costUsd).toBeNull();
    expect(usage(ws, [...week, ran("build", FJORD, "SH-2", local(10, 9), null)], "week", NOW).costUsd).toBeNull();
    expect(dollars(3)).toBe("$3.00");
  });

  it("counts only the chosen period", () => {
    const older = ran("build", BIRCH, "SH-3", local(9, 20), 100_000);
    expect(usage(ws, [...week, older], "week", NOW).total).toBe(100_000);
    const four = usage(ws, [...week, older], "4weeks", NOW);
    expect(four.total).toBe(200_000);
    expect(four.kinds[0]).toMatchObject({ kind: "build", runs: 3, percent: 89 });
    expect(four.mergedCount).toBe(3);
  });

  it("is one plain sentence when nothing was reported", () => {
    expect(usageEmptyText(usage(ws, [], "week", NOW))).toBe("No runs have reported usage this week yet.");
    expect(usageEmptyText(usage(ws, [], "4weeks", NOW))).toBe("No runs have reported usage in the last 4 weeks.");
    const silent = usage(ws, [ran("build", FJORD, "SH-2", local(10, 9), null), ran("reply", FJORD, null, local(10, 9), null)], "week", NOW);
    expect(usageEmptyText(silent)).toBe("None of the 2 runs this week reported usage.");
    expect(missingText(silent)).toBeNull();
    expect(silent.kinds.map((k) => k.percent)).toEqual([0, 0]);
  });

  it("writes whole percents that add up to 100, and short token counts", () => {
    expect(percents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percents([78_000, 9000, 11_000, 2000])).toEqual([78, 9, 11, 2]);
    expect(percents([0, 0])).toEqual([0, 0]);
    expect(percents([])).toEqual([]);
    expect([940, 12_400, 50_000, 340_200, 999_600, 3_100_000].map(tokens)).toEqual(["940", "12.4k", "50k", "340k", "1M", "3.1M"]);
  });
});
