import type { EngineRun } from "./engines.js";

/** Subscription limits are engine errors, never words quoted in a successful reply. */
export function usageLimit(run: Pick<EngineRun, "isError" | "aborted" | "timedOut" | "finalText">, now = new Date()): { until: Date } | null {
  if (!run.isError || run.aborted || run.timedOut) return null;
  const text = run.finalText;
  if (!/(?:you(?:'|’)ve hit your|you have hit your) (?:session|usage|weekly) limit/i.test(text)) return null;
  const fallback = new Date(now.getTime() + 30 * 60_000);
  const match = text.match(/resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i);
  if (!match) return { until: fallback };
  const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0);
  const minute = Number(match[2] ?? "0");
  if (Number(match[1]) < 1 || Number(match[1]) > 12 || minute > 59) return { until: fallback };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: match[4], hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatter.format(now);
  } catch {
    return { until: fallback };
  }
  // Search the next local clock occurrence; this also handles daylight-saving transitions.
  const start = Math.floor(now.getTime() / 60_000 + 1) * 60_000;
  for (let t = start; t <= now.getTime() + 25 * 3600_000; t += 60_000) {
    const parts = formatter.formatToParts(new Date(t));
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    if (h === hour && m === minute) return { until: new Date(Math.min(t, now.getTime() + 6 * 3600_000)) };
  }
  return { until: fallback };
}
