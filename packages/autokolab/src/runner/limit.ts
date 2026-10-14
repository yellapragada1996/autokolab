import type { UsageReport } from "../core/projects.js";
import type { EngineRun } from "./engines.js";

/**
 * Whether an API-model agent's dollars for today are used up. 0 (or less) means no limit. Only the
 * engine's own cost figures count, so a provider that reports none can't be held to it.
 */
export function overSpend(spentUsd: number, dailyUsd: number): boolean {
  return dailyUsd > 0 && spentUsd >= dailyUsd;
}

/** The day's notice once the spend limit is reached (CON-25). */
export function spendNotice(dailyUsd: number, providerName: string): string {
  const usd = Number.isInteger(dailyUsd) ? String(dailyUsd) : dailyUsd.toFixed(2);
  return `I've spent today's $${usd} limit on ${providerName}. I'll carry on tomorrow.`;
}

/**
 * What the runner reports about its day (AK-76): time used, the owner's daily limit, the local day
 * they belong to, and when it expects to work again. That is the end of a subscription-limit wait
 * still ahead, else five past the next local midnight once the daily limit is used up, else null.
 */
export function usageReport(usedSeconds: number, maxHoursPerDay: number, waitUntil: string | null, now = new Date()): UsageReport {
  const limit = Math.min(86_400, Math.max(0, Math.round(maxHoursPerDay * 3600)));
  const used = Math.min(86_400, Math.max(0, Math.round(usedSeconds)));
  const two = (n: number) => String(n).padStart(2, "0");
  const waiting =
    waitUntil && Date.parse(waitUntil) > now.getTime()
      ? new Date(waitUntil).toISOString()
      : used >= limit
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5).toISOString()
        : null;
  return { used_s: used, limit_s: limit, day: `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`, waiting_until: waiting };
}

/** How long an API-model agent waits after its provider's rate limit before trying again. */
export const RATE_LIMIT_WAIT_MS = 15 * 60_000;

/** Subscription limits are engine errors, never words quoted in a successful reply. */
export function usageLimit(run: Pick<EngineRun, "isError" | "aborted" | "timedOut" | "finalText" | "rateLimited">, now = new Date()): { until: Date } | null {
  if (!run.isError || run.aborted || run.timedOut) return null;
  if (run.rateLimited) return { until: new Date(now.getTime() + RATE_LIMIT_WAIT_MS) };
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
