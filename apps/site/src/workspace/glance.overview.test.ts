import { describe, expect, it } from "vitest";
import { agent, at, BIRCH, CAPTAIN, FJORD, ticket, workspace } from "./fixtures";
import { overviewAgents, overviewGlance, overviewHeadings } from "./glance";
import { needsYou, type Need, type Plan } from "./captain";
import { progressCounts } from "./overview-parts/GoalProgress";

const now = new Date(at("12:00"));
function setup() {
  const g = ticket({ key: "SH-1", title: "Checkout: cards", type: "epic", status: "in_progress", sort_order: 1 });
  const parts = [
    ticket({ key: "SH-2", title: "Cart", status: "done", parent_id: g.id, completed_at: at("09:00") }),
    ticket({ key: "SH-3", title: "Cards", status: "in_progress", parent_id: g.id, assignee_id: BIRCH, assignee_type: "agent", sort_order: 3 }),
    ticket({ key: "SH-4", title: "Guests", status: "in_progress", parent_id: g.id, assignee_id: FJORD, assignee_type: "agent", needs_human: "Save guest cards?", sort_order: 4 }),
    ticket({ key: "SH-5", title: "Receipts", status: "in_progress", parent_id: g.id, needs_human: "I stopped: GitHub couldn't be reached.", sort_order: 5 }),
    ticket({ key: "SH-6", title: "Discounts", status: "ready", parent_id: g.id, sort_order: 6 }),
  ];
  const ws = workspace([g, ...parts], { steps: { "SH-3": ["done", "now", "todo"], "SH-4": ["done", "todo"] } });
  for (const a of ws.people.agents.values()) a.last_seen_at = at("11:59");
  Object.assign(ws.agentOf(BIRCH)!, { status: "building", current_ticket_id: parts[1].id });
  Object.assign(ws.agentOf(FJORD)!, { status: "waiting_human", current_ticket_id: parts[2].id });
  return ws;
}
const view = (ws = setup()) => overviewGlance(ws, needsYou(ws, []), [], now);

describe("Overview data from project records", () => {
  it("orders all agents Captain first then name, regardless of status, steps or fetch order", () => {
    const ws = setup();
    for (const name of ["Zebra", "Amber", "Moss", "Oriole", "Tern", "Wren", "Nora", "Lark", "Finch", "Jay"]) ws.people.agents.set(name, agent(name, name));
    const expected = ["Captain", "Amber", "Birch", "Finch", "Fjord", "Jay", "Lark", "Moss", "Nora", "Oriole", "Tern", "Wren", "Zebra"];
    expect(view(ws).team.map(a => a.name)).toEqual(expected);
    ws.people.agents = new Map([...ws.people.agents].reverse());
    ws.agentOf(BIRCH)!.status = "paused";
    expect(view(ws).team.map(a => a.name)).toEqual(expected);
  });

  it("keeps each planned step's actual state and does not invent a current step", () => {
    const result = view();
    expect(result.team.find(a => a.id === BIRCH)).toMatchObject({ state: "working", word: "Working", step: 2 });
    expect(result.team.find(a => a.id === FJORD)).toMatchObject({ state: "waiting", word: "Waiting on you", step: null });
    expect(result.team.find(a => a.id === FJORD)!.steps.map(s => s.status)).toEqual(["done", "todo"]);
  });

  it.each([
    ["building", "Working"], ["waiting_human", "Waiting on you"], ["blocked", "Stopped"], ["paused", "Paused"], ["idle", "Idle"], ["offline", "Offline · 1 min"],
  ] as const)("maps %s to the truthful state word %s", (status, word) => {
    const ws = setup(); ws.agentOf(BIRCH)!.status = status;
    expect(view(ws).team.find(a => a.id === BIRCH)?.word).toBe(word);
  });

  it("distinguishes a reported limit and a live review from idle or stopped", () => {
    const ws = setup();
    Object.assign(ws.agentOf(BIRCH)!, { status: "idle", waiting_until: at("13:00") });
    expect(view(ws).team.find(a => a.id === BIRCH)?.word).toBe("Limit reached");
    const task = ws.byKey.get("SH-3")!; task.status = "review";
    Object.assign(ws.agentOf(CAPTAIN)!, { status: "building", current_ticket_id: task.id });
    expect(view(ws).team[0]).toMatchObject({ name: "Captain", word: "Reviewing", goalId: "t-SH-1" });
    expect(overviewHeadings([view(ws).team[0]], view(ws).goals, null, 0)[0].text).toBe("Captain is reviewing Checkout.");
  });

  it("does not leak another project's ticket or status note", () => {
    const ws = setup();
    Object.assign(ws.agentOf(BIRCH)!, { status_project_id: "other", status_note: "Secret other-project task", current_ticket_id: "other-task" });
    const a = overviewAgents(ws, now).find(a => a.id === BIRCH)!;
    expect(a).toMatchObject({ key: null, goalId: null, doing: "Working in another project" });
    expect(JSON.stringify(a)).not.toContain("Secret");
    expect(a.state).not.toBe("working");
  });

  it("orders the five segment shapes with matching counts and no zero legend entries", () => {
    const result = view();
    expect(result.goals[0].tickets.map(t => t.segment)).toEqual(["d", "u", "w", "x", "t"]);
    expect(progressCounts(result.goals[0]).map(x => `${x.count} ${x.word}`)).toEqual(["1 done", "1 in progress", "1 waiting on you", "1 stopped", "1 to go"]);
    expect(result.goals[0].tickets[1].detail).toBe("Birch · step 2 of 3");
    expect(result.goals[0].tickets[3].description).toContain("GitHub couldn't be reached");
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({ text: "Save guest cards?", meta: "Fjord is waiting · 4 h", action: "Answer in Captain" });
  });

  it("keeps check failures visible without inventing a failing-test count or Captain action", () => {
    const ws = setup();
    ws.byKey.get("SH-3")!.checks = { state: "failure", passed: 2, total: 3 };
    const t = view(ws).goals[0].tickets.find(t => t.key === "SH-3")!;
    expect(t.description).toContain("Checks failed");
    expect(t.description).not.toContain("test");
    expect(view(ws).headings.map(x => x.text).join(" ")).not.toContain("Captain is handling");
  });

  it("shows paused and offline tickets honestly without changing in-progress to to-go", () => {
    const ws = setup(); ws.agentOf(BIRCH)!.status = "paused";
    expect(view(ws).goals[0].tickets.find(t => t.key === "SH-3")).toMatchObject({ segment: "u", detail: "Birch · paused" });
    ws.agentOf(BIRCH)!.status = "offline";
    expect(view(ws).team.find(a => a.id === BIRCH)).toMatchObject({ goalId: null, doing: "" });
    ws.byKey.get("SH-6")!.assignee_id = BIRCH;
    expect(view(ws).goals[0].tickets.find(t => t.key === "SH-6")?.detail).toBe("To go · Birch, offline");
    expect(view(ws).headings.map(x => x.text)).toContain("Birch is offline with 2 tickets waiting.");
  });

  it("keeps nested tasks and unparented work instead of silently omitting them", () => {
    const ws = setup();
    const nested = ticket({ key: "SH-7", parent_id: "t-SH-3", sort_order: 7 });
    const loose = ticket({ key: "SH-8", parent_id: null, sort_order: 8 });
    for (const t of [nested, loose]) { ws.tickets.push(t); ws.byId.set(t.id, t); ws.byKey.set(t.key, t); }
    const result = view(ws);
    expect(result.goals[0].tickets.map(t => t.key)).toContain("SH-7");
    expect(result.goals[1]).toMatchObject({ id: "fixes", name: "Fixes and upkeep" });
  });

  it("keeps finished goals for today, then hides them, with no empty goal cards", () => {
    const ws = setup();
    for (const t of ws.tickets.filter(t => t.type !== "epic")) { t.status = "done"; t.completed_at = at("10:00"); }
    ws.tickets.push(ticket({ key: "SH-9", type: "epic", title: "Empty plan" }));
    expect(view(ws).goals).toHaveLength(1);
    expect(view(ws).goals[0].finished).toBe(at("10:00"));
    expect(overviewGlance(ws, [], [], new Date("2026-10-11T12:00:00Z")).goals).toHaveLength(0);
  });

  it("renders question, plan and risky merge labels from the existing request list", () => {
    const ws = setup();
    const needs: Need[] = [
      { key: "plan:9", kind: "plan", question: "OK the Search plan?", action: "OK", turnId: 9, ticket: null, since: at("11:50") },
      { key: "merge:1", kind: "risky_merge", question: "OK to merge?", action: "OK", turnId: null, ticket: ws.tickets[1], since: at("11:35") },
      { key: "ask:8", kind: "captain_question", question: "What next?", action: "Answer", turnId: 8, ticket: null, since: at("11:00") },
    ];
    const plan = { turnId: 9, tickets: ws.tickets.slice(1), status: "pending" } as Plan;
    const result = overviewGlance(ws, needs, [plan], now);
    expect(result.requests.map(r => [r.meta, r.action])).toEqual([
      ["Captain’s plan · 5 tickets · 10 min", "Review the plan in Captain"],
      ["Captain is asking · 25 min", "Review in Captain"],
      ["Captain is asking · 1 h", "Answer in Captain"],
    ]);
    expect(JSON.stringify(result.requests)).not.toContain("about a day");
    expect(JSON.stringify(result.requests)).not.toContain("database");
  });

  it("derives each setup stage from real connection records", () => {
    const ws = workspace([]); ws.people.agents.clear(); ws.project.lead_agent_id = null;
    expect(view(ws).headings[0].text).toBe("Nothing is connected yet.");
    ws.project.lead_agent_id = CAPTAIN; ws.people.agents.set(CAPTAIN, agent(CAPTAIN, "Captain"));
    expect(view(ws).headings[0].text).toBe("Captain is here, but nobody builds yet.");
    ws.people.agents.set(BIRCH, agent(BIRCH, "Birch"));
    expect(view(ws).headings[0].text).toBe("Nothing has started yet.");
    ws.project.lead_agent_id = null;
    expect(view(ws).headings[0].text).toBe("Captain hasn’t been chosen yet.");
    expect(view(ws).headings[1].link?.to).toBe("people");
  });

  it("gives identical output for the same records even when the fetched arrays reorder", () => {
    const ws = setup(); const before = view(ws);
    ws.tickets.reverse(); ws.people.agents = new Map([...ws.people.agents].reverse());
    expect(view(ws)).toEqual(before);
  });
});
