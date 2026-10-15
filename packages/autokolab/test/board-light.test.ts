import { describe, expect, it } from "vitest";
import { LIGHT_COLUMNS, ProjectView, type Project, type Ticket } from "../src/core/projects.js";
import { Runner } from "../src/runner/runner.js";

// AK-146: the runner reads a light ticket list for scheduling, asks only for new comments, and skips
// a tick when realtime saw no change, so an idle runner stops pulling the whole board every 30s.

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: "select" | "update" | "insert" | "delete";
  cols?: string;
  filters: [string, unknown][];
  gt?: [string, number];
  order?: [string | undefined, { ascending?: boolean } | undefined];
  limit?: number;
  patch?: Row;
  rows?: Row | Row[];
}

/** A tiny stand-in for the PostgREST builder: the same chains the ProjectView uses, thenable. */
function fakeSb(tables: Record<string, Row[]>, opts: { lightMissing?: boolean } = {}) {
  const calls: Call[] = [];
  const resolve = (call: Call) => {
    // A database before schema 26 has no `areas`, so the light column list fails.
    if (call.cols === LIGHT_COLUMNS && opts.lightMissing) return { data: null, error: { code: "42703", message: 'column "areas" does not exist' } };
    const match = (r: Row) => call.filters.every(([k, v]) => (Array.isArray(v) ? (v as unknown[]).includes(r[k]) : r[k] === v));
    let rows = [...(tables[call.table] ?? [])];
    if (call.op === "update") {
      const updated = rows.filter(match);
      for (const r of updated) Object.assign(r, call.patch);
      return { data: updated, error: null };
    }
    rows = rows.filter(match);
    if (call.gt) rows = rows.filter((r) => Number(r[call.gt![0]]) > call.gt![1]);
    if (call.order?.[0]) {
      const [k, opts] = call.order;
      rows.sort((a, b) => (opts?.ascending === false ? Number(b[k!]) - Number(a[k!]) : Number(a[k!]) - Number(b[k!])));
    }
    if (call.limit !== undefined) rows = rows.slice(0, call.limit);
    return { data: rows, error: null };
  };
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const q: Record<string, unknown> = {
      select: (cols: string) => ((call.cols = cols), q),
      update: (patch: Row) => ((call.op = "update"), (call.patch = patch), q),
      insert: (rows: Row | Row[]) => ((call.op = "insert"), (call.rows = rows), q),
      delete: () => ((call.op = "delete"), q),
      eq: (k: string, v: unknown) => (call.filters.push([k, v]), q),
      in: (k: string, v: unknown[]) => (call.filters.push([k, v]), q),
      gt: (k: string, v: number) => ((call.gt = [k, v]), q),
      order: (k?: string, opts?: { ascending?: boolean }) => ((call.order = [k, opts]), q),
      limit: (n: number) => ((call.limit = n), q),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resolve(call)).then(res, rej),
    };
    return q;
  };
  return { from, calls };
}

const project = { id: "p-1", name: "Test", ticket_prefix: "AK", default_branch: "main", lead_agent_id: null } as Project;
function view(sb: unknown, meId = "me"): ProjectView {
  return Object.assign(Object.create(ProjectView.prototype), { sb, meId, project, names: new Map(), agentInfo: new Map() }) as ProjectView;
}

const ticket = (id: string, key: string, change: Row = {}): Row => ({
  id, project_id: "p-1", number: Number(key.split("-")[1]), key, title: `${key} title`, description: "long text that scheduling doesn't need",
  type: "task", priority: "none", status: "ready", assignee_id: "me", sort_order: 1, areas: [], needs_human: null,
  approved_sha: null, pr_url: null, branch: null, updated_at: "2026-10-15T10:00:00Z", ...change,
});

describe("the light ticket list (AK-146)", () => {
  it("reads only the scheduling columns, then keeps them until something changes", async () => {
    const sb = fakeSb({ tickets: [ticket("t-1", "AK-1")] });
    const v = view(sb);
    const reads = () => sb.calls.filter((c) => c.table === "tickets" && c.op === "select");
    const rows = await v.ticketsLight();
    expect(reads()[0].cols).toBe(LIGHT_COLUMNS);
    expect(rows.map((r) => r.key)).toEqual(["AK-1"]);
    expect((rows[0] as unknown as { description?: string }).description).toBe("long text that scheduling doesn't need");
    // A second look costs nothing while nothing has changed.
    await v.ticketsLight();
    expect(reads()).toHaveLength(1);
    expect(v.boardFresh()).toBe(true);
    // Realtime says something changed: the next look refetches.
    v.invalidateLight();
    expect(v.boardFresh()).toBe(false);
    await v.ticketsLight();
    expect(reads()).toHaveLength(2);
  });

  it("falls back to the full list on a database before schema 26 (no areas column)", async () => {
    const sb = fakeSb({ tickets: [ticket("t-1", "AK-1")] }, { lightMissing: true });
    const v = view(sb);
    const rows = await v.ticketsLight();
    expect(rows.map((r) => r.key)).toEqual(["AK-1"]);
    // Once it knows, it reads the full list and doesn't try the light columns again.
    await v.ticketsLight(true);
    expect(sb.calls.filter((c) => c.cols === LIGHT_COLUMNS)).toHaveLength(1);
  });
});

describe("only new comments (AK-146)", () => {
  it("asks each of my open tickets for comments after the id already handled", async () => {
    const sb = fakeSb({
      tickets: [
        ticket("t-1", "AK-1", { status: "in_progress" }),
        ticket("t-2", "AK-2", { status: "review" }),
        ticket("t-3", "AK-3", { status: "in_progress", assignee_id: "other" }),
      ],
      ticket_comments: [
        { id: 3, ticket_id: "t-1", author_id: "ana", author_type: "human", body: "old", created_at: "" },
        { id: 7, ticket_id: "t-1", author_id: "bob", author_type: "agent", body: "new", created_at: "" },
        { id: 4, ticket_id: "t-2", author_id: "ana", author_type: "human", body: "old", created_at: "" },
        { id: 9, ticket_id: "t-2", author_id: "me", author_type: "agent", body: "my own reply", created_at: "" },
      ],
    });
    const out = await view(sb).newComments({ "t-1": 3, "t-2": 4 });
    const queries = sb.calls.filter((c) => c.table === "ticket_comments" && c.gt);
    expect(queries.map((c) => [c.filters[0], c.gt])).toEqual([[["ticket_id", "t-1"], ["id", 3]], [["ticket_id", "t-2"], ["id", 4]]]);
    // Nothing was asked for the ticket that isn't mine.
    expect(sb.calls.filter((c) => c.table === "ticket_comments" && c.filters.some(([k, v]) => k === "ticket_id" && v === "t-3"))).toHaveLength(0);
    // Only the teammate's new comment resumes a run; the ticket's own reply doesn't.
    expect(out.map((x) => [x.ticket.key, x.comments.map((c) => c.id)])).toEqual([["AK-1", [7]]]);
    expect(out[0].looping).toBe(false);
  });

  it("keeps the loop guard: a run of agent comments ending the ticket still hands it to a person", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: 10 + i, ticket_id: "t-1", author_id: i % 2 ? "bob" : "ana", author_type: "agent", body: "back and forth", created_at: "" }));
    const sb = fakeSb({ tickets: [ticket("t-1", "AK-1", { status: "in_progress" })], ticket_comments: many });
    const out = await view(sb).newComments({ "t-1": 0 });
    expect(out).toHaveLength(1);
    expect(out[0].comments).toHaveLength(8);
    expect(out[0].looping).toBe(true);
  });
});

describe("an idle runner skips the board (AK-146)", () => {
  it("does one light read, then nothing until something changes", async () => {
    const sb = fakeSb({ tickets: [] });
    const v = view(sb);
    const runner = Object.assign(Object.create(Runner.prototype), {
      ak: { me: { id: "me" }, sb },
      projects: [v],
      projectsLoadedAt: Date.now(),
      areaWaits: new Map(),
      log: () => undefined,
      ticketState: () => ({ sessions: {}, seen: {} }),
      saveTicketState: () => undefined,
    }) as Runner;
    expect(await runner["nextTicket"]()).toBeNull();
    const first = sb.calls.filter((c) => c.table === "tickets").length;
    expect(first).toBe(1);
    expect(await runner["nextTicket"]()).toBeNull();
    expect(sb.calls.filter((c) => c.table === "tickets")).toHaveLength(first);
  });
});
