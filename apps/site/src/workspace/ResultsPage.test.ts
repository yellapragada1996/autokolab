import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TicketEvent } from "../lib/data";
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

  it("is one plain sentence when nothing merged, with no tiles", () => {
    const html = page([ticket({ key: "SH-1" })], []);
    expect(html).toContain("Nothing has merged this week yet.");
    expect(html).not.toMatch(/Sent back|Time to merge|By agent|Merged tickets/);
  });
});
