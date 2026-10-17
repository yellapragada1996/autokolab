import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BIRCH, CAPTAIN, FJORD, at, ticket, workspace } from "./fixtures";
import { Sidebar } from "./Workspace";
import { overviewGlance } from "./glance";
import { keepOverviewSnapshot, Overview, OverviewContent, type OverviewSnapshot } from "./Overview";
import type { CaptainRoom } from "./useCaptainRoom";
import { keepUnchangedWorkspace } from "./useWorkspace";
import type { Need } from "./captain";

const now = new Date(at("12:00"));
const goal = () => ticket({ key: "SH-1", type: "epic", title: "Checkout: cards", status: "in_progress" });
const room = { room: null, needs: [], plans: [], loadError: "" } as unknown as CaptainRoom;
function scene() {
  const g = goal();
  const t = ticket({ key: "SH-2", title: "Saved cards", parent_id: g.id, status: "in_progress", assignee_id: BIRCH, assignee_type: "agent", summary: "adding saved cards to checkout" });
  const ws = workspace([g, t], { steps: { "SH-2": ["done", "done", "now", "todo", "todo"] } });
  for (const a of ws.people.agents.values()) a.last_seen_at = at("11:59");
  Object.assign(ws.agentOf(BIRCH)!, { status: "building", current_ticket_id: t.id });
  return ws;
}
const snapshot = (ws = scene(), needs: Need[] = []): OverviewSnapshot => ({ view: overviewGlance(ws, needs, [], now), at: now });
const plain = (html: string) => html.replace(/<[^>]*>/g, "").replace(/\u00a0/g, " ");
const render = (value: OverviewSnapshot | null, failed = false) => renderToStaticMarkup(createElement(OverviewContent, { snapshot: value, failed }));

describe("Overview v5 composition", () => {
  it("shows a heading, goal, real agent steps and all idle agents without old summaries", () => {
    const html = render(snapshot());
    expect(plain(html)).toContain("Birch is working on Checkout.");
    expect(html).toContain("adding saved cards to checkout");
    expect(html).toContain("step 3 of 5");
    expect(html).toContain("Not working right now");
    expect(html).toContain(">Captain</span>");
    expect(html).toContain(">Fjord</span>");
    for (const old of ["Next from Captain", "Delivered today", "Updated just now", "See the team", "Needs you</h2>"]) expect(html).not.toContain(old);
    expect(html).toContain('href="/p/shop/work/SH-2"');
    expect(html).toContain('href="/p/shop/work?group=goal"');
    expect(html).toContain('href="/p/shop/people"');
  });

  it("puts three newest requests before the headline and links overflow to the oldest", () => {
    const needs: Need[] = Array.from({ length: 5 }, (_, i) => ({ key: `ask:${i}`, kind: "captain_question", action: "Answer", question: `Question ${i}?`, ticket: null, turnId: i, since: at(`11:0${i}`) }));
    const html = render(snapshot(scene(), needs));
    expect(html.indexOf("Needs you</h2>")).toBeLessThan(html.indexOf('class="headline"'));
    expect(html.indexOf("Question 4?")).toBeLessThan(html.indexOf("Question 3?"));
    expect(html).toContain("Question 2?");
    expect(html).not.toContain("Question 1?");
    expect(html).toContain('href="/p/shop#need-ask%3A0">and 2 more in Captain →');
    expect(html).toContain("Answer in Captain →");
    expect(html).toContain("Captain is asking · 56 min");
    expect((html.match(/class="row need"/g) ?? [])).toHaveLength(3);
    expect(html).not.toContain("<button class=\"row need\"");
  });

  it("hides empty sections and shows the new-project croc and connection link", () => {
    const ws = workspace([]);
    ws.people.agents.clear(); ws.project.lead_agent_id = null;
    const html = render(snapshot(ws));
    expect(html).toContain("Nothing is connected yet.");
    expect(html).toContain('href="/p/shop/people">Connect your computer</a> to bring in Captain.');
    expect(html).toContain('class="croc new"');
    for (const empty of ['class="needs"', 'class="cards"', 'class="free', 'class="part"']) expect(html).not.toContain(empty);
  });

  it("shows the calm croc without cards for goals finished before today", () => {
    const ws = scene();
    ws.tickets[1].status = "done"; ws.tickets[1].completed_at = "2026-10-09T12:00:00Z";
    Object.assign(ws.agentOf(BIRCH)!, { status: "idle", current_ticket_id: null });
    const html = render(snapshot(ws));
    expect(html).toContain("All 1 goal is done.");
    expect(html).toContain("No agents are working right now.");
    expect(html).toContain('class="croc calm"');
    expect(html).not.toContain('class="cards"');
  });

  it("uses one native disclosure per goal with matching ids and ticket links", () => {
    const html = render(snapshot());
    const id = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}" hidden=""`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Checkout: 1 in progress. Show its 1 ticket.");
    expect(html).toContain('class="gs u"');
    expect(html).toContain('class="t-meta u">In progress · Birch · step 3 of 5');
    expect(html).toContain('aria-hidden="true"');
  });

  it("retains long user names and titles in accessible text and title attributes", () => {
    const ws = scene();
    const name = "Birch-with-an-extremely-long-agent-name-that-should-not-widen-the-card";
    ws.agentOf(BIRCH)!.display_name = name;
    ws.tickets[0].title = "Guest checkout with saved cards and international billing";
    ws.tickets[1].title = "A very long ticket title for saved cards, including fallback payment methods";
    const html = render(snapshot(ws));
    expect(html).toContain(`title="${name}"`);
    expect(html).toContain(`title="${ws.tickets[1].title}"`);
    expect(html).toContain(`title="${ws.tickets[0].title}"`);
  });
});

describe("Overview loading and refresh stability", () => {
  it("shows static skeletons while loading and a retry on first-load failure", () => {
    const loading = render(null);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading your project…");
    expect((loading.match(/class="sk-card"/g) ?? [])).toHaveLength(2);
    const failed = render(null, true);
    expect(failed).toContain("Couldn’t load this project.");
    expect(failed).toContain("Try again");
    expect(failed).not.toContain('class="sk-card"');
    expect(failed).toContain('role="alert"');
  });

  it("keeps last known content and timestamp on incomplete and failed refreshes", () => {
    const first = snapshot();
    expect(keepOverviewSnapshot(first, null, "p1")).toBe(first);
    const html = render(keepOverviewSnapshot(first, null, "p1"), true);
    expect(html).toContain("Couldn’t refresh. This is how things were at ");
    expect(html).toContain('class="ov stale"');
    expect(plain(html)).toContain("Birch is working on Checkout.");
    expect(html).not.toContain("Loading your project");
    expect(keepOverviewSnapshot(first, null, "another-project")).toBeNull();
  });

  it("keeps the existing workspace when polling returns identical records", () => {
    const first = scene();
    const refresh = { ...first, tickets: [...first.tickets], steps: new Map(first.steps), people: { ...first.people, agents: new Map(first.people.agents) } };
    expect(keepUnchangedWorkspace(first, refresh)).toBe(first);
  });

  it("renders identical data identically, without waiting for or fetching history", () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    try {
      const ws = scene();
      const html = () => renderToStaticMarkup(createElement(Overview, { ws, me: "person-raghav", cr: room }));
      expect(plain(html())).toContain("Birch is working on Checkout.");
      expect(html()).not.toContain("Loading your project");
      expect(html()).toBe(html());
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
describe("project navigation", () => {
  it("shows Captain, Overview, Team and Project in that order, with the old destinations in the menu", () => {
    const ws = workspace([]);
    const html = renderToStaticMarkup(createElement(Sidebar, {
      needs: 0, project: ws.project, projects: [ws.project],
      route: { view: "overview", project: "shop" },
      onSignOut: () => undefined,
    }));
    expect(html.indexOf('>Captain</a>')).toBeLessThan(html.indexOf('>Overview</a>'));
    expect(html.indexOf('>Overview</a>')).toBeLessThan(html.indexOf('>Team</a>'));
    expect(html.indexOf('>Team</a>')).toBeLessThan(html.indexOf('<summary>Project</summary>'));
    for (const path of ["/p/shop/work", "/p/shop/room", "/p/shop/decisions", "/p/shop/decisions?tab=guide", "/p/shop/results", "/p/shop/settings", "/p/shop/people"]) {
      expect(html).toContain(`href="${path}"`);
    }
  });
});
