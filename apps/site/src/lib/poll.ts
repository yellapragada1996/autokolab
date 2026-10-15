/** Safety reads back up realtime; background tabs catch up once when shown. */
export const SAFETY_POLL_MS = 5 * 60_000;

/** A history window is fully re-read this often, to catch edits and deletes the cursor can't see. */
export const RECONCILE_POLL_MS = 60 * 60_000;

export function visiblePoll(refresh: () => void): () => void {
  const visible = () => {
    if (document.visibilityState !== "hidden") refresh();
  };
  const timer = setInterval(visible, SAFETY_POLL_MS);
  document.addEventListener("visibilitychange", visible);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", visible);
  };
}

/**
 * Two cadences for a history window while the tab is visible (AK-154): a five-minute incremental
 * read of rows added since the cursor, and a reconciliation when the tab is shown again or once an
 * hour. Both do nothing while the tab is hidden, so a background tab costs nothing.
 */
export function visibleCursorPoll(tick: () => void, reconcile: () => void, tickMs = SAFETY_POLL_MS, reconcileMs = RECONCILE_POLL_MS): () => void {
  const shown = () => document.visibilityState !== "hidden";
  const onVisibility = () => {
    if (shown()) reconcile();
  };
  const tickTimer = setInterval(() => {
    if (shown()) tick();
  }, tickMs);
  const reconcileTimer = setInterval(() => {
    if (shown()) reconcile();
  }, reconcileMs);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(tickTimer);
    clearInterval(reconcileTimer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
