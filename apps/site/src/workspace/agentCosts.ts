import type { Agent, RunUsage } from "../lib/data";
import { dayIn } from "./glance";
import type { Workspace } from "./useWorkspace";

export interface AgentCost {
  usd: number | null;
  missing: boolean;
  runs: number;
}
/** Only actual reports for today in the owner's time zone; incomplete totals stay unknown. */
export function costToday(ws: Workspace, agent: Agent, rows: RunUsage[], now: Date): AgentCost | null {
  if (agent.vendor !== "opencode") return null;
  const tz = agent.owner_profile_id ? ws.people.profiles.get(agent.owner_profile_id)?.timezone : null;
  const day = dayIn(tz, now);
  const runs = rows.filter((r) => r.agent_id === agent.id && dayIn(tz, new Date(r.created_at)) === day);
  if (!runs.length) return null;
  const missing = runs.some((r) => r.cost_usd === null || !Number.isFinite(r.cost_usd) || r.cost_usd < 0);
  return {
    usd: missing ? null : runs.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0),
    missing,
    runs: runs.length,
  };
}
export const costText = (cost: AgentCost | null | undefined) => (cost?.usd != null ? `$${cost.usd.toFixed(2)} today` : null);

/** The daily dollar limit its runner reported (schema 25); null when its helper or the server is older. */
export function reportedLimit(agent: Pick<Agent, "vendor" | "daily_usd">): number | null {
  if (agent.vendor !== "opencode" || agent.daily_usd == null) return null;
  const usd = Number(agent.daily_usd);
  return Number.isFinite(usd) && usd >= 0 ? usd : null;
}

const dollars = (usd: number) => (Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`);

/**
 * Today's spend against the reported limit (AK-112). Without a report it keeps AK-109's wording, since
 * the limit then lives only on its computer. Null when there is nothing to say.
 */
export function spendText(cost: AgentCost | null | undefined, limit: number | null): string | null {
  if (limit === null) return cost?.usd != null ? `${costText(cost)} · daily limit set on its computer` : null;
  // Some run today reported no cost: the total is unknown, so show the limit alone.
  if (cost?.missing) return limit > 0 ? `${dollars(limit)} daily limit` : "No daily limit";
  const spent = `$${(cost?.usd ?? 0).toFixed(2)}`;
  return limit > 0 ? `${spent} of ${dollars(limit)} today` : `${spent} today · no daily limit`;
}
