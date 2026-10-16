import { useEffect, useRef, useState } from "react";
import { reportError } from "../lib/errors";
import { appendNew, maxId, reconcile as reconcileWindow, trimWindow, type HistoryRow } from "../lib/history";
import { visibleCursorPoll } from "../lib/poll";

// Keep a history window in memory and only ask for what changed (AK-154). One initial read fills
// the window; a five-minute tick fetches rows after the last id; a reconciliation re-reads the last
// day when the tab is shown again or once an hour, to catch edits and deletes. Old rows drop out.

/** Overview counts send-backs over the last 7 days. */
export const EVENTS_WINDOW_MS = 7 * 24 * 3600_000;
/** Agent costs are shown for today, so 48 hours is enough. */
export const USAGE_WINDOW_MS = 48 * 3600_000;
/** How far back a reconciliation re-reads. */
export const RECONCILE_WINDOW_MS = 24 * 3600_000;

export interface HistoryReader<T extends HistoryRow> {
  /** Everything between two times, oldest first. */
  read: (from: Date, to: Date) => Promise<T[]>;
  /** Only rows added after an id and inside the window, oldest first. */
  readAfter: (afterId: number, from: Date) => Promise<T[]>;
}

/**
 * A window of rows that stays current with less traffic. `key` identifies the source (the project
 * id); when it is undefined or empty nothing is read. `at` is when the last read succeeded.
 */
export function useHistoryWindow<T extends HistoryRow>(key: string | undefined, windowMs: number, reader: HistoryReader<T>): { rows: T[]; error: string; at: Date; ready: boolean } {
  const [rows, setRows] = useState<T[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");
  const [at, setAt] = useState(() => new Date());
  const readerRef = useRef(reader);
  readerRef.current = reader;
  const cursor = useRef(0);

  useEffect(() => {
    if (!key) {
      setRows([]);
      setLoadedKey(undefined);
      return;
    }
    let live = true;
    cursor.current = 0;
    setRows([]);
    setLoadedKey(undefined);
    const windowStart = () => new Date(Date.now() - windowMs);

    const initial = async () => {
      const end = new Date();
      try {
        const all = await readerRef.current.read(windowStart(), end);
        if (!live) return;
        cursor.current = maxId(all);
        setRows(trimWindow(all, windowStart()));
        setError("");
        setAt(end);
        setLoadedKey(key);
      } catch (e) {
        if (live) {
          setError(reportError(e, "read history"));
          setLoadedKey(key);
        }
      }
    };

    const tick = async () => {
      const end = new Date();
      try {
        const fresh = await readerRef.current.readAfter(cursor.current, windowStart());
        if (!live) return;
        if (fresh.length) {
          cursor.current = Math.max(cursor.current, maxId(fresh));
          setRows((held) => appendNew(held, fresh, windowStart()));
        }
        setError("");
        setAt(end);
      } catch (e) {
        if (live) setError(reportError(e, "read history"));
      }
    };

    const recon = async () => {
      const end = new Date();
      try {
        const fresh = await readerRef.current.read(new Date(end.getTime() - RECONCILE_WINDOW_MS), end);
        if (!live) return;
        cursor.current = Math.max(cursor.current, maxId(fresh));
        setRows((held) => reconcileWindow(held, fresh, end, RECONCILE_WINDOW_MS, windowMs));
        setError("");
        setAt(end);
      } catch {
        // Keep what we hold; the next tick or reconciliation tries again.
      }
    };

    void initial();
    const stop = visibleCursorPoll(() => void tick(), () => void recon());
    return () => {
      live = false;
      stop();
    };
  }, [key, windowMs]);

  return { rows, error, at, ready: loadedKey === key };
}
