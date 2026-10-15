// This tab's REST download estimate. It is deliberately not persisted or sent to the server.
let bytes = 0;
const listeners = new Set<() => void>();

export const tabTrafficBytes = () => bytes;
export const subscribeTabTraffic = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function addTabTraffic(url: string, size: number): void {
  if (!url.includes("/rest/v1/") || !Number.isFinite(size) || size < 0) return;
  bytes += size;
  for (const listener of listeners) listener();
}
