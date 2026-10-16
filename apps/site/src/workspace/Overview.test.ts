import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BIRCH, at, ticket, workspace } from "./fixtures";
import { Sidebar } from "./Workspace";
import { overviewGlance } from "./glance";

const now = new Date(at("12:00"));
const glance = (ws: ReturnType<typeof workspace>) => overviewGlance(ws, [], [], [], now);
const goal = () => ticket({ key: "SH-1", type: "epic", title: "Checkout: cards", status: "in_progress" });

describe("approved Overview situations", () => {
  it("shows the two setup steps on a brand-new project", () => {
    const ws = workspace([]);
    ws.project.lead_agent_id = null;
    const view = glance(ws);
    expect(view.state).toBe("new");
    expect(view.sentence).toBe("Nothing has started yet. Connect Captain, then tell it what you want to make.");
    expect(view.goals).toHaveLength(0);
  });

  it("skips the connection step when Captain is already connected", () => {
    const view = glance(workspace([]));
    expect(view.state).toBe("new");
    expect(view.sentence).toBe("Nothing has started yet. Tell Captain what you want to make.");
  });

  it("says which goal is moving while an agent works", () => {
    const g = goal();
    const task = ticket({ key: "SH-2", title: "Receipt emails", parent_id: g.id, status: "in_progress", assignee_id: BIRCH, assignee_type: "agent" });
    const ws = workspace([g, task]);
    Object.assign(ws.agentOf(BIRCH)!, { status: "building", current_ticket_id: task.id, last_seen_at: at("11:59") });
    const view = glance(ws);
    expect(view.state).toBe("busy");
    expect(view.sentence).toContain("Checkout is moving.");
    expect(view.sentence).toContain("nothing needs you");
    expect(view.team[0].name).toBe("Birch");
  });

  it("puts a real request ahead of the work", () => {
    const g = goal();
    const task = ticket({ key: "SH-2", title: "Saved cards", parent_id: g.id, status: "in_progress", assignee_id: BIRCH });
    const ws = workspace([g, task]);
    const view = overviewGlance(ws, [{ key: task.key, kind: "ticket_question", action: "Answer a question", question: "Should guests use saved cards?", ticket: task, turnId: null, since: at("11:00") }], [], [], now);
    expect(view.state).toBe("needed");
    expect(view.sentence).toContain("Checkout is waiting on your answer.");
    expect(view.requests).toHaveLength(1);
    expect(view.next).toContain("as soon as you answer");
  });

  it("says Captain owns a failing check", () => {
    const g = goal();
    const task = ticket({ key: "SH-2", title: "Payment retries", parent_id: g.id, status: "review", checks: { passed: 2, total: 3, state: "failure" } });
    const view = glance(workspace([g, task]));
    expect(view.state).toBe("problem");
    expect(view.sentence).toContain("Captain is handling it; you do not need to act.");
    expect(view.problem?.key).toBe(task.key);
  });

  it("shows a runner problem without an amber request", () => {
    const g = goal();
    const task = ticket({ key: "SH-2", title: "Payment retries", parent_id: g.id, status: "in_progress" });
    const view = overviewGlance(workspace([g, task]), [{ key: task.key, kind: "problem", action: "Look at a problem", question: "I stopped: tests failed.", ticket: task, turnId: null, since: at("11:00") }], [], [], now);
    expect(view.state).toBe("problem");
    expect(view.requests).toHaveLength(0);
    expect(view.sentence).toContain("Captain is handling it");
  });

  it("says when current work is done and shows today's delivery", () => {
    const g = goal();
    const task = ticket({ key: "SH-2", title: "Saved cards", parent_id: g.id, status: "done", completed_at: at("10:00"), summary: "Saved cards now appear at checkout." });
    const view = glance(workspace([g, task]));
    expect(view.state).toBe("calm");
    expect(view.sentence).toBe("The current work is done. Nothing is in progress, and nothing needs you.");
    expect(view.delivered[0].text).toBe("Saved cards now appear at checkout.");
    expect(view.goals[0]).toMatchObject({ done: 1, total: 1 });
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
