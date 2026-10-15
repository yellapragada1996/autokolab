import { visiblePoll } from "../lib/poll";
import { useEffect, useState } from "react";
import { usageBetween, type RunUsage } from "../lib/data";
import { reportError } from "../lib/errors";
import { costToday, type AgentCost } from "./agentCosts";
import type { Workspace } from "./useWorkspace";

/** Costs live in the run record (AK-92). No guessed prices or local settings sent to the server. */
export function useAgentCosts(ws: Workspace | null) {
  const [rows, setRows] = useState<RunUsage[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (!ws) return;
    let canceled = false;
    const load = async () => {
      const end = new Date();
      try {
        const runs = ws.demoUsage ?? (await usageBetween(ws.project.id, new Date(end.getTime() - 48 * 3600_000), end));
        if (!canceled) {
          setRows(runs);
          setNow(end);
          setError("");
        }
      } catch (e) {
        if (!canceled) setError(reportError(e, "read agent costs"));
      }
    };
    void load();
    const stopPoll = visiblePoll(() => void load());
    return () => {
      canceled = true;
      stopPoll();
    };
  }, [ws?.project.id, ws?.demoUsage]);
  const costs = new Map<string, AgentCost>();
  if (ws)
    for (const a of ws.people.agents.values()) {
      const cost = costToday(ws, a, rows, now);
      if (cost) costs.set(a.id, cost);
    }
  return { costs, error };
}
