import { usageAfter, usageBetween, type RunUsage } from "../lib/data";
import { costToday, type AgentCost } from "./agentCosts";
import { USAGE_WINDOW_MS, useHistoryWindow } from "./useHistory";
import type { Workspace } from "./useWorkspace";

/** Costs live in the run record (AK-92). No guessed prices or local settings sent to the server. */
export function useAgentCosts(ws: Workspace | null) {
  const demoUsage = ws?.demoUsage;
  const projectId = ws?.project.id;
  const { rows: held, error, at } = useHistoryWindow(demoUsage ? undefined : projectId, USAGE_WINDOW_MS, {
    read: (from, to) => (projectId ? usageBetween(projectId, from, to) : Promise.resolve([] as RunUsage[])),
    readAfter: (afterId, from) => (projectId ? usageAfter(projectId, afterId, from) : Promise.resolve([] as RunUsage[])),
  });
  const rows = demoUsage ?? held;
  const costs = new Map<string, AgentCost>();
  if (ws)
    for (const a of ws.people.agents.values()) {
      const cost = costToday(ws, a, rows, at);
      if (cost) costs.set(a.id, cost);
    }
  return { costs, error };
}
