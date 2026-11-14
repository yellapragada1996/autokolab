/**
 * One rule for "is this agent's computer there?", used by every page so they can't disagree.
 * A runner checks in every 30 seconds (HEARTBEAT_MS), so four missed check-ins mean it's gone.
 * Keep in step with AGENT_ONLINE_MS in packages/autokolab/src/core/projects.ts.
 */
export const AGENT_ONLINE_MS = 2 * 60_000;
/** People check in less often (a browser tab in the background), so they get longer. */
export const PERSON_ONLINE_MS = 5 * 60_000;

export function seenWithin(lastSeenAt: string | null | undefined, ms: number, now = Date.now()): boolean {
  return !!lastSeenAt && now - Date.parse(lastSeenAt) < ms;
}

export const agentOnline = (lastSeenAt: string | null | undefined, now = Date.now()) => seenWithin(lastSeenAt, AGENT_ONLINE_MS, now);
