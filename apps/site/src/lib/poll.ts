/** Safety reads back up realtime; background tabs catch up once when shown. */
export const SAFETY_POLL_MS = 5 * 60_000;

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
