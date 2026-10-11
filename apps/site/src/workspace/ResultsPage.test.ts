import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RunUsage, TicketEvent } from "../lib/data";
import { BIRCH, CAPTAIN, ticket, workspace } from "./fixtures";
import { Results } from "./ResultsPage";

// The page as HTML, without a browser: what it shows for a period with work in it and for an empty one.

// Wednesday 7 Oct 2026, 3 pm, in whatever time zone the tests run in.
const NOW = new Date(2026, 9, 7, 15, 0);
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();
const SHA = "3f9c2a71d0b84e6a95c1f2d7e8a0b4c6d5e7f912";

const page = (tickets: Parameters<typeof workspace>[0], events: TicketEvent[]) => renderToStaticMarkup(createElement(Results, { ws: { ...workspace(tickets), demoEvents: events }, at: NOW }));

describe("the Results page", () => {
  it("shows the headline, the tiles, the chart in words, where people were asked and a row per builder", () => {
    const done = ticket({ key: "SH-1", status: "done", pr_url: "https://github.com/ana/shop/pull/1", assignee_id: BIRCH, assignee_type: "agent", started_at: minutesAgo(31), completed_at: minutesAgo(1), approved_sha: SHA, approved_by: CAPTAIN });
    const html = page(
      [done],
      [
        { id: 1, ticket_id: done.id, actor_id: CAPTAIN, actor_type: "agent", kind: "approval", data: { to: SHA }, created_at: minutesAgo(3) },
        { id: 2, ticket_id: done.id, actor_id: BIRCH, actor_type: "agent", kind: "needs_human", data: { note: "Which page?" }, created_at: minutesAgo(2) },
      ],
    );
    expect(html).toContain("1 ticket merged this week, reviewed. You were asked once.");
    for (const text of ["This week", "Last 4 weeks", "Export audit report", "CSV", "JSON", "Time to merge", "30 min", "Sent back", "Merged tickets per day:", "Where you were asked", "Answer a question", "By agent", "Birch", "1 approved", "How these are counted"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toMatch(/baseline|solo|per hour|hours worked|yourself/i);
  });

  it("shows where the usage went: the sentence, a row per kind, coordination, the tickets by name and a row per agent", () => {
    const done = ticket({ key: "SH-1", title: "Sort search by newest", status: "done", pr_url: "https://github.com/ana/shop/pull/1", assignee_id: BIRCH, assignee_type: "agent", started_at: minutesAgo(31), completed_at: minutesAgo(1), approved_sha: SHA, approved_by: CAPTAIN });
    const ran = (id: number, kind: RunUsage["kind"], agent: string, ticketId: string | null, output: number | null): RunUsage => ({
      id, agent_id: agent, ticket_id: ticketId, kind, model: null, input_tokens: null, cache_read_tokens: null, cache_write_tokens: null, output_tokens: output, turns: null, seconds: 60, cost_usd: output === null ? null : 1.25, created_at: minutesAgo(10),
    });
    const runs = [ran(1, "build", BIRCH, done.id, 80_000), ran(2, "review", CAPTAIN, done.id, 12_000), ran(3, "reply", CAPTAIN, null, 8000)];
    const html = renderToStaticMarkup(createElement(Results, { ws: { ...workspace([done]), demoEvents: [], demoUsage: runs }, at: NOW }));
    for (const text of ["Where the usage went", "Building took 80% of the usage; reviewing 12%, agents talking 8%.", "80% · 1 run", "25% on top of building", "Per merged ticket", "100k tokens", "Most usage went on", "Sort search by newest", "92k", "Usage by agent", "Birch", "as the engine reports it", "$3.75", "How usage is counted"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("report usage");
    // A run that reported nothing is said plainly, and the cost goes: not every run gave one.
    const withSilent = renderToStaticMarkup(createElement(Results, { ws: { ...workspace([done]), demoEvents: [], demoUsage: [...runs, ran(4, "build", BIRCH, done.id, null)] }, at: NOW }));
    expect(withSilent).toContain("1 of 4 runs didn&#x27;t report usage.");
    expect(withSilent).not.toContain("as the engine reports it");
    // The section's own text never names a ticket by key.
    expect(html.slice(html.indexOf("Where the usage went"))).not.toMatch(/SH-\d/);
  });

  it("says in one sentence that no usage was reported, also when nothing merged", () => {
    const html = page([ticket({ key: "SH-1" })], []);
    expect(html).toContain("Where the usage went");
    expect(html).toContain("No runs have reported usage this week yet.");
    expect(html).not.toMatch(/on top of building|Usage by agent|How usage is counted/);
  });

  it("is one plain sentence when nothing merged, with no tiles", () => {
    const html = page([ticket({ key: "SH-1" })], []);
    expect(html).toContain("Nothing has merged this week yet.");
    expect(html).not.toMatch(/Sent back|Time to merge|By agent|Merged tickets/);
  });
});
