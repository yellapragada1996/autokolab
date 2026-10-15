import { describe, expect, it } from "vitest";
import { appendNew, maxId, reconcile, trimWindow, type HistoryRow } from "./history";

// The window arithmetic behind AK-154: folding incremental reads in, re-reading a span for
// reconciliation, and dropping rows that fall out of the window.

const row = (id: number, at: string): HistoryRow => ({ id, created_at: at });
const ids = (rows: HistoryRow[]) => rows.map((r) => r.id);

const NOW = new Date("2026-10-15T12:00:00Z");
const DAY = 24 * 3600_000;
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString();

describe("maxId", () => {
  it("is the newest id, and 0 when there is nothing", () => {
    expect(maxId([])).toBe(0);
    expect(maxId([row(9, at(1)), row(3, at(2))])).toBe(9);
  });
});

describe("trimWindow", () => {
  it("keeps rows inside the window and sorts them oldest first", () => {
    const windowStart = new Date(NOW.getTime() - 7 * DAY);
    const kept = trimWindow([row(5, at(1)), row(2, at(3 * 24)), row(1, at(2)), row(8, at(9 * 24))], windowStart);
    expect(ids(kept)).toEqual([1, 2, 5]);
  });
});

describe("appendNew", () => {
  it("adds rows fetched after the cursor, newest at the end", () => {
    const windowStart = new Date(NOW.getTime() - 7 * DAY);
    const held = [row(1, at(3)), row(2, at(2))];
    const merged = appendNew(held, [row(3, at(1)), row(4, at(0))], windowStart);
    expect(ids(merged)).toEqual([1, 2, 3, 4]);
  });

  it("takes the fresh copy when the same id arrives twice, and drops rows out of the window", () => {
    const windowStart = new Date(NOW.getTime() - 7 * DAY);
    const held = [row(1, at(9 * 24)), row(2, at(3))];
    const merged = appendNew(held, [row(2, at(3))], windowStart);
    expect(ids(merged)).toEqual([2]);
  });
});

describe("reconcile", () => {
  it("replaces the last day with the fresh read, so edits and deletes take effect", () => {
    const held = [row(1, at(30)), row(2, at(20)), row(3, at(2))];
    const fresh = [row(2, at(20)), row(4, at(1))];
    const merged = reconcile(held, fresh, NOW, DAY, 7 * DAY);
    expect(ids(merged)).toEqual([1, 2, 4]);
  });

  it("drops a row deleted inside the last day while keeping older rows in the window", () => {
    const held = [row(1, at(40)), row(2, at(10)), row(3, at(1))];
    const merged = reconcile(held, [row(3, at(1))], NOW, DAY, 7 * DAY);
    expect(ids(merged)).toEqual([1, 3]);
  });

  it("drops anything older than the window", () => {
    const held = [row(1, at(9 * 24)), row(2, at(3 * 24))];
    const merged = reconcile(held, [], NOW, DAY, 7 * DAY);
    expect(ids(merged)).toEqual([2]);
  });
});
