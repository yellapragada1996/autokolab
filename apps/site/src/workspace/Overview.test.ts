import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Route } from "../lib/router";
import { BIRCH, FJORD, ME, at, ticket, workspace } from "./fixtures";
import { team, watch } from "./glance";
import { TeamBlock, WorthWatching } from "./Overview";

// Overview's two bottom blocks as HTML, without a browser.

const NOW = new Date(at("12:00"));
const people: Route = { view: "people", project: "shop" };

describe("the Team block", () => {
  it("shows each agent's state, its time used with a bar, a link to People, and each person", () => {
    const ws = workspace([]);
    ws.people.profiles.get(ME)!.timezone = "UTC";
    ws.people.members.push({ actor_id: ME, actor_type: "human", role: "owner" });
    Object.assign(ws.agentOf(BIRCH)!, { last_seen_at: at("11:59"), used_today_s: 4200, daily_limit_s: 10800, usage_day: "2026-10-10", effective_model: "claude-opus-5-5" });
    Object.assign(ws.agentOf(FJORD)!, { last_seen_at: at("11:59"), status: "paused" });
    const html = renderToStaticMarkup(createElement(TeamBlock, { team: team(ws, NOW, new Map(), ME), people }));
    for (const text of ["Team", "Birch", "free", "1 h 10 of 3 h today", "width:39%", "Raghav&#x27;s agent · claude-opus-5-5", "Fjord", "stopped", "var(--coral)", "Raghav", "online · 12:00 PM", 'href="/p/shop/people"']) {
      expect(html).toContain(text);
    }
    // Only the agent that reported usage gets a bar.
    expect(html.match(/role="img"/g)).toHaveLength(1);
  });
});

describe("the Worth watching block", () => {
  it("says Nothing is off when there is nothing", () => {
    const html = renderToStaticMarkup(createElement(WorthWatching, { items: [], people }));
    expect(html).toContain("Nothing is off.");
    expect(html).not.toContain("<ul");
  });

  it("lists what is off in plain sentences and ends with Nothing else is off", () => {
    const failing = { sha: "a", checks: { passed: 3, total: 4, state: "failure" as const }, files: { total: 1, risky: [] }, additions: 1, deletions: 0 };
    const ws = workspace([ticket({ key: "SH-2", title: "Checkout", status: "review", approved_sha: "a", pr_facts: failing }), ticket({ key: "SH-3", status: "ready", assignee_id: BIRCH })]);
    const html = renderToStaticMarkup(createElement(WorthWatching, { items: watch(ws, [], NOW), people }));
    expect(html).toContain("Tests are failing on “Checkout”.");
    expect(html).toContain("Birch has work assigned, but its computer has never connected.");
    expect(html).toContain("Nothing else is off.");
    expect(html).not.toMatch(/SH-\d/);
  });
});
