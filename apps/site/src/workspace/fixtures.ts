import type { Agent, Decision, Project, Step, Ticket } from "../lib/data";
import type { RoomMessage } from "../lib/room";
import type { Profile } from "../lib/session";
import type { Workspace } from "./useWorkspace";

// Small builders for unit tests: a workspace, tickets and room messages with sensible defaults.

export const ME = "person-raghav";
export const CAPTAIN = "agent-captain";
export const BIRCH = "agent-birch";
export const FJORD = "agent-fjord";

export const at = (iso: string) => `2026-10-10T${iso}:00Z`;

let n = 0;

export function ticket(over: Partial<Ticket> & { key: string }): Ticket {
  n++;
  return {
    id: `t-${over.key}`,
    project_id: "p1",
    number: n,
    title: over.key,
    description: "",
    type: "feature",
    priority: "medium",
    status: "ready",
    labels: [],
    parent_id: null,
    assignee_id: null,
    assignee_type: null,
    reporter_id: CAPTAIN,
    done_means: [],
    branch: null,
    pr_url: null,
    needs_human: null,
    sort_order: n,
    created_at: at("08:00"),
    updated_at: at("08:00"),
    started_at: null,
    completed_at: null,
    ...over,
  };
}

export const agent = (id: string, name: string): Agent => ({
  id,
  owner_profile_id: ME,
  owner_label: "raghav",
  vendor: "claude",
  display_name: name,
  status: "idle",
  status_note: null,
  current_ticket_id: null,
  last_seen_at: null,
  model: null,
  effort: null,
  model_set_by: null,
  model_set_at: null,
});

const profile = (id: string, name: string): Profile => ({ id, github_login: name.toLowerCase(), name, avatar_url: null, timezone: null, city: null, onboarded: true });

export function workspace(tickets: Ticket[], extra: { steps?: Record<string, Step["status"][] | [string, Step["status"]][]>; decisions?: Decision[] } = {}): Workspace {
  const project: Project = { id: "p1", name: "Shop", slug: "shop", repo: "ana/shop", default_branch: "main", ticket_prefix: "SH", owner_id: ME, lead_agent_id: CAPTAIN, room_id: "r1", created_at: at("07:00") };
  const agents = new Map([agent(CAPTAIN, "Captain"), agent(BIRCH, "Birch"), agent(FJORD, "Fjord")].map((a) => [a.id, a]));
  const profiles = new Map([[ME, profile(ME, "Raghav")]]);
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const steps = new Map<string, Step[]>();
  for (const [key, list] of Object.entries(extra.steps ?? {})) {
    steps.set(
      `t-${key}`,
      list.map((s, idx) => {
        const [label, status] = typeof s === "string" ? [`Step ${idx + 1}`, s] : s;
        return { ticket_id: `t-${key}`, idx, label, status, note: null, updated_at: at("09:00") };
      }),
    );
  }
  return {
    project,
    tickets,
    steps,
    links: [],
    people: { members: [], profiles, agents },
    decisions: extra.decisions ?? [],
    guide: null,
    byId,
    byKey: new Map(tickets.map((t) => [t.key, t])),
    reload: async () => undefined,
    nameOf: (id) => (id ? (profiles.get(id)?.name ?? agents.get(id)?.display_name ?? "Someone") : "Unassigned"),
    agentOf: (id) => (id ? agents.get(id) : undefined),
    blockersOf: () => [],
    unblocks: () => [],
    childrenOf: (tid) => tickets.filter((t) => t.parent_id === tid),
  };
}

let m = 0;

export function message(from: string, to: string | null, body: string, over: Partial<RoomMessage> = {}): RoomMessage {
  m++;
  return { id: m, room_id: "r1", thread_id: null, sender_id: from, to_id: to, kind: "chat", body, refs: {}, created_at: at("09:00"), ...over };
}

export const decision = (key: string, title: string, created: string, over: Partial<Decision> = {}): Decision => ({
  id: `d-${key}`,
  number: Number(key.split("-")[1]),
  key,
  kind: "decision",
  title,
  body: "",
  ticket_id: null,
  created_by: CAPTAIN,
  created_at: created,
  superseded_by: null,
  ...over,
});
