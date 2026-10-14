import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Route } from "../lib/router";
import { BIRCH, FJORD, ME, at, ticket, workspace } from "./fixtures";
import { crew, team, watch } from "./glance";
import { CrewTable, OffPanel } from "./Overview";

// Overview's team table and "Something's off" panel as HTML, without a browser.

const NOW = new Date(at("12:00"));
const people: Route = { view: "people", project: "shop" };

describe("the team table", () => {
  it("shows each agent once with its state in a word, its time used with a bar, its owner on hover, and each person", () => {
    const ws = workspace([]);
    ws.people.profiles.get(ME)!.timezone = "UTC";
    ws.people.members.push({ actor_id: ME, actor_type: "human", role: "owner" });
    Object.assign(ws.agentOf(BIRCH)!, { last_seen_at: at("11:59"), used_today_s: 4200, daily_limit_s: 10800, usage_day: "2026-10-10", effective_model: "claude-opus-5-5" });
    Object.assign(ws.agentOf(FJORD)!, { last_seen_at: at("11:59"), status: "paused" });
    const t = team(ws, NOW, new Map(), ME);
    const html = renderToStaticMarkup(createElement(CrewTable, { rows: crew(t, []), people: t, peoplePage: people }));
    for (const text of ["Birch", "Free", "Nothing assigned", "1 h 10 of 3 h", "width:39%", "Raghav&#x27;s agent · claude-opus-5-5", "Fjord", "Stopped", "var(--coral)", "Raghav", "online · 12:00 PM"]) {
      expect(html).toContain(text);
    }
    // Only the agent that reported usage gets a bar.
    expect(html.match(/role="img" aria-label="1 h 10/g)).toHaveLength(1);
    // No ticket keys.
    expect(html).not.toMatch(/SH-\d/);
  });

  it("offers to connect agents when there are none", () => {
    const ws = workspace([]);
    ws.people.agents.clear();
    const t = team(ws, NOW);
    const html = renderToStaticMarkup(createElement(CrewTable, { rows: crew(t, []), people: { ...t, people: [] }, peoplePage: people }));
    expect(html).toContain("No agents yet.");
    expect(html).toContain('href="/p/shop/connect"');
  });
});

describe("the Something's off panel", () => {
  it("lists what is off in plain sentences, with no ticket keys", () => {
    const failing = { sha: "a", checks: { passed: 3, total: 4, state: "failure" as const }, files: { total: 1, risky: [] }, additions: 1, deletions: 0 };
    const ws = workspace([ticket({ key: "SH-2", title: "Checkout", status: "review", approved_sha: "a", pr_facts: failing }), ticket({ key: "SH-3", status: "ready", assignee_id: BIRCH })]);
    const html = renderToStaticMarkup(createElement(OffPanel, { items: watch(ws, [], NOW), people }));
    expect(html).toContain("Something&#x27;s off");
    expect(html).toContain("Tests are failing on “Checkout”.");
    expect(html).toContain("Birch has work assigned, but its computer has never connected.");
    expect(html).not.toMatch(/SH-\d/);
  });
});
