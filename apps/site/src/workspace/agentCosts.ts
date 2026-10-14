import type { Agent, RunUsage } from "../lib/data";
import { dayIn } from "./glance";
import type { Workspace } from "./useWorkspace";

export interface AgentCost { usd: number | null; missing: boolean; runs: number }
/** Only actual reports for today in the owner's time zone; incomplete totals stay unknown. */
export function costToday(ws: Workspace, agent: Agent, rows: RunUsage[], now: Date): AgentCost | null {
  if (agent.vendor !== "opencode") return null;
  const tz = agent.owner_profile_id ? ws.people.profiles.get(agent.owner_profile_id)?.timezone : null;
  const day = dayIn(tz, now);
  const runs = rows.filter((r) => r.agent_id === agent.id && dayIn(tz, new Date(r.created_at)) === day);
  if (!runs.length) return null;
  const missing = runs.some((r) => r.cost_usd === null || !Number.isFinite(r.cost_usd) || r.cost_usd < 0);
  return { usd: missing ? null : runs.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0), missing, runs: runs.length };
}
export const costText = (cost: AgentCost | null | undefined) => cost?.usd != null ? `$${cost.usd.toFixed(2)} today` : null;
