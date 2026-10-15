import { beforeEach, describe, expect, it, vi } from "vitest";

// The cursor reads behind AK-154: only rows after the last seen id, inside the window, oldest
// first, a page at a time. A tiny in-memory stand-in for the two tables, so the query chain is
// exercised for real.

const h = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>[]> = { ticket_events: [], run_usage: [] };
  const state = { failCode: null as string | null };
  return { tables, state };
});

vi.mock("./session", () => {
  const make = (table: string) => {
    let rows = [...(h.tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return q;
      },
      gt: (col: string, val: unknown) => {
        rows = rows.filter((r) => (r[col] as number) > (val as number));
        return q;
      },
      gte: (col: string, val: unknown) => {
        rows = rows.filter((r) => (r[col] as string) >= (val as string));
        return q;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        const dir = opts?.ascending === false ? -1 : 1;
        rows = [...rows].sort((a, b) => ((a[col] as number) - (b[col] as number)) * dir);
        return q;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return q;
      },
      then: (ok: (v: unknown) => unknown) => {
        const answer = h.state.failCode ? { data: null, error: { code: h.state.failCode, message: "no" } } : { data: rows, error: null };
        return Promise.resolve(answer).then(ok);
      },
    };
    return q;
  };
  return { supabase: { from: (table: string) => make(table) } };
});

const { eventsAfter, usageAfter } = await import("./data");

const WINDOW_FROM = new Date("2026-10-01T00:00:00Z");
const STAMP = "2026-10-15T00:00:00Z";
const events = (project: string, ids: number[]) => ids.map((id) => ({ id, project_id: project, created_at: STAMP }));
const runs = (project: string, ids: number[]) => ids.map((id) => ({ id, project_id: project, created_at: STAMP }));

describe("eventsAfter", () => {
  beforeEach(() => {
    h.tables.ticket_events = events("p1", [1, 2, 3, 4, 5]);
    h.tables.run_usage = [];
    h.state.failCode = null;
  });

  it("returns only rows after the cursor, oldest first", async () => {
    expect((await eventsAfter("p1", 2, WINDOW_FROM)).map((r) => r.id)).toEqual([3, 4, 5]);
    expect(await eventsAfter("p1", 5, WINDOW_FROM)).toEqual([]);
  });

  it("leaves out another project's rows", async () => {
    h.tables.ticket_events = [...events("p1", [1, 2]), ...events("p2", [3, 4])];
    expect((await eventsAfter("p1", 0, WINDOW_FROM)).map((r) => r.id)).toEqual([1, 2]);
  });

  it("never reads rows older than the window, even when the cursor is 0", async () => {
    // The window is empty but the table has an older row: a tick must not fetch it.
    h.tables.ticket_events = [
      { id: 1, project_id: "p1", created_at: "2026-09-01T00:00:00Z" },
      { id: 2, project_id: "p1", created_at: "2026-10-10T00:00:00Z" },
    ];
    const from = new Date("2026-10-08T00:00:00Z");
    expect((await eventsAfter("p1", 0, from)).map((r) => r.id)).toEqual([2]);
  });

  it("reads every page, not just the first thousand", async () => {
    h.tables.ticket_events = events("p1", Array.from({ length: 1500 }, (_, i) => i + 1));
    const all = await eventsAfter("p1", 0, WINDOW_FROM);
    expect(all).toHaveLength(1500);
    expect(all[0].id).toBe(1);
    expect(all[1499].id).toBe(1500);
  });
});

describe("usageAfter", () => {
  beforeEach(() => {
    h.tables.run_usage = runs("p1", [1, 2, 3]);
    h.tables.ticket_events = [];
    h.state.failCode = null;
  });

  it("returns only runs after the cursor", async () => {
    expect((await usageAfter("p1", 1, WINDOW_FROM)).map((r) => r.id)).toEqual([2, 3]);
  });

  it("never reads runs older than the window, even when the cursor is 0", async () => {
    h.tables.run_usage = [
      { id: 1, project_id: "p1", created_at: "2026-09-01T00:00:00Z" },
      { id: 2, project_id: "p1", created_at: "2026-10-10T00:00:00Z" },
    ];
    const from = new Date("2026-10-09T00:00:00Z");
    expect((await usageAfter("p1", 0, from)).map((r) => r.id)).toEqual([2]);
  });

  it("reads a missing table as no runs", async () => {
    h.state.failCode = "PGRST205";
    expect(await usageAfter("p1", 0, WINDOW_FROM)).toEqual([]);
    h.state.failCode = "42P01";
    expect(await usageAfter("p1", 0, WINDOW_FROM)).toEqual([]);
  });
});
