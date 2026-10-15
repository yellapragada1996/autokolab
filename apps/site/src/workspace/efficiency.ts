import type { AgentEfficiencyDay } from "../lib/data";

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The last seven local calendar days, including today. */
export function lastSevenDays(now: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
    return day(d);
  });
}

export function mb(bytes: number): string {
  const n = bytes / 1_000_000;
  return `${n < 1 ? n.toFixed(2) : n.toFixed(1)} MB`;
}

/** One factual line; absent reporting days are explicit instead of being treated as zero usage. */
export function efficiencyLine(rows: AgentEfficiencyDay[], now: Date): string {
  const days = lastSevenDays(now);
  const inRange = rows.filter((r) => days.includes(r.day));
  const missing = days.filter((d) => !inRange.some((r) => r.day === d)).length;
  const sum = (key: string) => inRange.reduce((n, r) => n + (Number(r.counters[key]) || 0), 0);
  const traffic = inRange.reduce((n, r) => n + Object.entries(r.counters).reduce((m, [key, value]) => m + (key.startsWith("rest_") ? Number(value) || 0 : 0), 0), 0);
  const messages = ["chat", "question", "task", "review", "other"].reduce((n, k) => n + sum(`wake_message_${k}`), 0);
  const comments = sum("wake_comment");
  const ready = sum("wake_ready");
  const reviews = sum("wake_review");
  const triage = sum("wake_triage");
  const wakes = messages + comments + ready + reviews + triage;
  const parts = [`${messages} for messages`, `${comments} for comments`, `${ready} for ready tickets`, `${reviews} for reviews`, `${triage} for triage`];
  return `In the last 7 days, AutoKolab used about ${mb(traffic)} of database downloads and woke agents ${wakes} times (${parts.join(", ")}). ${missing} ${missing === 1 ? "day" : "days"} missing data.`;
}
