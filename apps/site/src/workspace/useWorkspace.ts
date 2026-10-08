import { useCallback, useEffect, useMemo, useState } from "react";
import * as data from "../lib/data";
import type { Agent, Decision, Guide, Link, People, Project, Step, Ticket } from "../lib/data";

// One live snapshot of a project: tickets, steps, links, people, agents, decisions and the guide.
// Re-loads whenever anything changes (realtime), so every screen stays current.

export interface Workspace {
  project: Project;
  tickets: Ticket[];
  steps: Map<string, Step[]>;
  links: Link[];
  people: People;
  decisions: Decision[];
  guide: Guide | null;
  byKey: Map<string, Ticket>;
  byId: Map<string, Ticket>;
  reload: () => Promise<void>;
  /** Who someone is: a person's or an agent's display name. */
  nameOf: (id: string | null | undefined) => string;
  agentOf: (id: string | null | undefined) => Agent | undefined;
  blockersOf: (ticketId: string) => Ticket[];
  unblocks: (ticketId: string) => Ticket[];
  childrenOf: (ticketId: string) => Ticket[];
}

export function useWorkspace(project: Project | null): { ws: Workspace | null; error: string } {
  const [state, setState] = useState<Omit<Workspace, "reload" | "nameOf" | "agentOf" | "blockersOf" | "unblocks" | "childrenOf" | "byKey" | "byId"> | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const tickets = await data.tickets(project.id);
      const ids = tickets.map((t) => t.id);
      const [steps, links, people, decisions, guide] = await Promise.all([
        data.allSteps(ids),
        data.links(ids),
        data.people(project.id),
        data.decisions(project.id),
        data.guide(project.id),
      ]);
      const stepMap = new Map<string, Step[]>();
      for (const s of steps) stepMap.set(s.ticket_id, [...(stepMap.get(s.ticket_id) ?? []), s]);
      setState({ project, tickets, steps: stepMap, links, people, decisions, guide });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [project]);

  useEffect(() => {
    setState(null);
    if (!project) return;
    void load();
    return data.watchProject(project.id, () => void load());
  }, [project, load]);

  const ws = useMemo<Workspace | null>(() => {
    if (!state) return null;
    const byId = new Map(state.tickets.map((t) => [t.id, t]));
    const byKey = new Map(state.tickets.map((t) => [t.key, t]));
    return {
      ...state,
      byId,
      byKey,
      reload: load,
      nameOf: (id) => {
        if (!id) return "Unassigned";
        return state.people.profiles.get(id)?.name ?? state.people.agents.get(id)?.display_name ?? "Someone";
      },
      agentOf: (id) => (id ? state.people.agents.get(id) : undefined),
      blockersOf: (tid) => state.links.filter((l) => l.ticket_id === tid).map((l) => byId.get(l.blocked_by)).filter((t): t is Ticket => !!t),
      unblocks: (tid) => state.links.filter((l) => l.blocked_by === tid).map((l) => byId.get(l.ticket_id)).filter((t): t is Ticket => !!t),
      childrenOf: (tid) => state.tickets.filter((t) => t.parent_id === tid),
    };
  }, [state, load]);

  return { ws, error };
}
