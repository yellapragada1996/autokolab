// Keeping a history window in memory (AK-154). Overview and the agent-cost hook read a window of
// rows once, then ask only for what changed. These helpers fold a small incremental read into what
// is already held, and drop whatever has fallen out of the window.

/** Any row that has a numeric id and the time it was created. */
export interface HistoryRow {
  id: number;
  created_at: string;
}

const idOf = (row: HistoryRow) => row.id;
const createdMs = (row: HistoryRow) => Date.parse(row.created_at);

/** The newest id in a set, or `0` when there is none: the cursor for the next incremental read. */
export function maxId(rows: HistoryRow[]): number {
  return rows.reduce((max, r) => (r.id > max ? r.id : max), 0);
}

/** Oldest first, with everything outside the window (older than `windowStart`) dropped. */
export function trimWindow<T extends HistoryRow>(rows: T[], windowStart: Date): T[] {
  const from = windowStart.getTime();
  return rows.filter((r) => createdMs(r) >= from).sort((a, b) => a.id - b.id);
}

/**
 * Fold rows fetched after a cursor into the window. Duplicates (same id) take the fresh row, so an
 * edited row is not kept twice. Anything that no longer falls inside the window is dropped.
 */
export function appendNew<T extends HistoryRow>(kept: T[], fresh: T[], windowStart: Date): T[] {
  const byId = new Map<number, T>();
  for (const row of kept) byId.set(idOf(row), row);
  for (const row of fresh) byId.set(idOf(row), row);
  return trimWindow([...byId.values()], windowStart);
}

/**
 * Reconciliation: replace everything inside the last `recentMs` with a fresh read of that span
 * (so an edited row is corrected and a deleted row drops out), keep older rows still inside the
 * window, and drop the rest. `now` is passed in so the result is easy to test.
 */
export function reconcile<T extends HistoryRow>(kept: T[], fresh: T[], now: Date, recentMs: number, windowMs: number): T[] {
  const recentFrom = now.getTime() - recentMs;
  const windowStart = new Date(now.getTime() - windowMs);
  const byId = new Map<number, T>();
  for (const row of kept) if (createdMs(row) < recentFrom) byId.set(idOf(row), row);
  for (const row of fresh) byId.set(idOf(row), row);
  return trimWindow([...byId.values()], windowStart);
}
