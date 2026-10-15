import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { areaOverlaps, areasOverlap, areaWaits, areaWaitText, cleanAreas } from "../src/core/areas.js";
import { mustGiveWay, readyToStart, type Ticket } from "../src/core/projects.js";

const ME = "agent-me";
let n = 0;
function ticket(key: string, over: Partial<Ticket> = {}): Ticket {
  n++;
  return {
    id: `t-${key}`,
    project_id: "p",
    number: Number(key.split("-")[1]),
    key,
    title: key,
    description: "",
    type: "task",
    priority: "none",
    status: "ready",
    labels: [],
    parent_id: null,
    assignee_id: ME,
    assignee_type: "agent",
    reporter_id: "lead",
    done_means: [],
    branch: null,
    pr_url: null,
    needs_human: null,
    sort_order: n,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("areas overlap (AK-126)", () => {
  it("finds overlapping globs and paths", () => {
    expect(areaOverlaps("packages/autokolab/src/runner/**", "packages/autokolab/src/runner/runner.ts")).toBe(true);
    expect(areaOverlaps("packages/autokolab/src/runner/**", "packages/autokolab/src/**")).toBe(true);
    expect(areaOverlaps("packages/autokolab/src/runner", "packages/autokolab/src/runner/merge.ts")).toBe(true);
    expect(areaOverlaps("./apps/site/", "apps/site/src/workspace/TicketPage.tsx")).toBe(true);
    expect(areaOverlaps("**/*.sql", "packages/autokolab/sql/026_ticket_areas.sql")).toBe(true);
    expect(areaOverlaps("apps/site/src/*.ts", "apps/site/src/main.ts")).toBe(true);
    expect(areaOverlaps("apps/*/src/**", "apps/site/src/lib/data.ts")).toBe(true);
    expect(areaOverlaps("src/*.test.ts", "src/data.*")).toBe(true);
    expect(areaOverlaps("GUIDE.md", "GUIDE.md")).toBe(true);
  });

  it("keeps separate areas apart", () => {
    expect(areaOverlaps("packages/autokolab/src/runner/**", "apps/site/**")).toBe(false);
    expect(areaOverlaps("packages/autokolab/src/runner/**", "packages/autokolab/src/mcp/server.ts")).toBe(false);
    expect(areaOverlaps("GUIDE.md", "README.md")).toBe(false);
    expect(areaOverlaps("apps/site/src/*.ts", "apps/site/src/main.css")).toBe(false);
    expect(areaOverlaps("apps/site/src/*.ts", "apps/site/src/lib/data.ts")).toBe(false);
    expect(areaOverlaps("**/*.sql", "packages/autokolab/src/cli.ts")).toBe(false);
    expect(areaOverlaps("src/*.ts", "src/*.css")).toBe(false);
    expect(areaOverlaps("apps/site", "apps/site-old")).toBe(false);
  });

  it("an empty list never overlaps", () => {
    expect(areasOverlap([], ["apps/site/**"])).toBe(false);
    expect(areasOverlap(["apps/site/**"], [])).toBe(false);
    expect(areasOverlap(null, undefined)).toBe(false);
    expect(areaOverlaps("  ", "apps/**")).toBe(false);
  });

  it("cleans what the tools are given", () => {
    expect(cleanAreas([" a/** ", "", "a/**", "b.md"])).toEqual(["a/**", "b.md"]);
  });
});

describe("choosing the next ticket (AK-126)", () => {
  const busy = ticket("AK-1", { status: "in_progress", assignee_id: "agent-other", areas: ["packages/autokolab/src/runner/**"] });

  it("skips a ticket whose areas overlap one in progress, and says what it waits for", () => {
    const t = ticket("AK-2", { areas: ["packages/autokolab/src/runner/runner.ts"], priority: "high" });
    const other = ticket("AK-3", { areas: ["apps/site/**"] });
    const { ready, waiting } = readyToStart([busy, t, other], [], ME);
    expect(ready.map((x) => x.key)).toEqual(["AK-3"]);
    expect(waiting.map((w) => [w.ticket.key, areaWaitText(w.on)])).toEqual([["AK-2", "waiting for AK-1 (same files)"]]);
  });

  it("waits for a ticket in Review whose PR hasn't merged", () => {
    const review = { ...busy, status: "review" as const, pr_url: "https://github.com/o/r/pull/1" };
    const t = ticket("AK-4", { areas: ["packages/autokolab/src/runner/**"] });
    expect(readyToStart([review, t], [], ME).ready).toEqual([]);
  });

  it("starts a ticket with no overlap, or with no areas at all", () => {
    const apart = ticket("AK-5", { areas: ["GUIDE.md"] });
    const none = ticket("AK-6", { areas: [] });
    const old = ticket("AK-7");
    expect(readyToStart([busy, apart, none, old], [], ME).ready.map((x) => x.key)).toEqual(["AK-5", "AK-6", "AK-7"]);
    expect(areaWaits(none, [busy])).toEqual([]);
  });

  it("picks it up again once the other ticket is done", () => {
    const t = ticket("AK-8", { areas: ["packages/autokolab/src/runner/**"] });
    expect(readyToStart([busy, t], [], ME).ready).toEqual([]);
    for (const status of ["done", "canceled", "ready", "backlog"] as const) {
      expect(readyToStart([{ ...busy, status }, t], [], ME).ready.map((x) => x.key)).toEqual(["AK-8"]);
    }
  });

  it("ignores epics and itself", () => {
    const epic = ticket("AK-9", { type: "epic", status: "in_progress", areas: ["**"] });
    const t = ticket("AK-10", { areas: ["src/**"] });
    expect(readyToStart([epic, t], [], ME).ready.map((x) => x.key)).toEqual(["AK-10"]);
  });

  it("still waits for blockers", () => {
    const first = ticket("AK-11", { status: "review", assignee_id: "agent-other" });
    const t = ticket("AK-12");
    expect(readyToStart([first, t], [{ ticket_id: t.id, blocked_by: first.id }], ME).ready).toEqual([]);
  });

  it("of two overlapping tickets claimed at once, the later one gives way", () => {
    const a = ticket("AK-20", { status: "in_progress", areas: ["src/**"] });
    const b = ticket("AK-21", { status: "in_progress", assignee_id: "agent-other", areas: ["src/a.ts"] });
    expect(mustGiveWay(a, [a, b])).toEqual([]);
    expect(mustGiveWay(b, [a, b]).map((x) => x.key)).toEqual(["AK-20"]);
  });
});

describe("the website's copy", () => {
  it("is the same code as the helper's", () => {
    const body = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8").replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
    expect(body("../../../apps/site/src/lib/areas.ts")).toBe(body("../src/core/areas.ts"));
  });
});
