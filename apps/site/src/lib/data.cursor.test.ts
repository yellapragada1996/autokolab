import { beforeEach, describe, expect, it, vi } from "vitest";

// The cursor reads behind AK-154: only rows after the last seen id, oldest first, a page at a time.
// A tiny in-memory stand-in for the two tables, so the query chain is exercised for real.

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

const events = (project: string, ids: number[]) => ids.map((id) => ({ id, project_id: project, created_at: `2026-10-15T00:00:${String(id % 60).padStart(2, "0")}Z` }));
const runs = (project: string, ids: number[]) => ids.map((id) => ({ id, project_id: project, created_at: "2026-10-15T00:00:00Z" }));

describe("eventsAfter", () => {
  beforeEach(() => {
    h.tables.ticket_events = events("p1", [1, 2, 3, 4, 5]);
    h.tables.run_usage = [];
    h.state.failCode = null;
  });

  it("returns only rows after the cursor, oldest first", async () => {
    expect((await eventsAfter("p1", 2)).map((r) => r.id)).toEqual([3, 4, 5]);
    expect(await eventsAfter("p1", 5)).toEqual([]);
  });

  it("leaves out another project's rows", async () => {
    h.tables.ticket_events = [...events("p1", [1, 2]), ...events("p2", [3, 4])];
    expect((await eventsAfter("p1", 0)).map((r) => r.id)).toEqual([1, 2]);
  });

  it("reads every page, not just the first thousand", async () => {
    h.tables.ticket_events = events("p1", Array.from({ length: 1500 }, (_, i) => i + 1));
    const all = await eventsAfter("p1", 0);
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
    expect((await usageAfter("p1", 1)).map((r) => r.id)).toEqual([2, 3]);
  });

  it("reads a missing table as no runs", async () => {
    h.state.failCode = "PGRST205";
    expect(await usageAfter("p1", 0)).toEqual([]);
    h.state.failCode = "42P01";
    expect(await usageAfter("p1", 0)).toEqual([]);
  });
});
