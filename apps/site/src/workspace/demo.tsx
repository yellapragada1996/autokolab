import { useMemo } from "react";
import type { Agent, Decision, Guide, Member, Project, Step, Ticket } from "../lib/data";
import { useRoute } from "../lib/router";
import type { Profile } from "../lib/session";
import { starterRules } from "./GuidePage";
import type { Workspace as WS } from "./useWorkspace";
import { Workspace } from "./Workspace";

// Development only (?preview=workspace): the workspace with made-up data, to look at screens
// without signing in. Changes don't save.

const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
const ANA = "00000000-0000-0000-0000-00000000000a";
const LEE = "00000000-0000-0000-0000-00000000000b";
const BUILDER = "00000000-0000-0000-0000-0000000000c1";
const REVIEWER = "00000000-0000-0000-0000-0000000000c2";
const LEAD = "00000000-0000-0000-0000-0000000000c3";

const project: Project = { id: "demo", name: "Shop", slug: "shop", repo: "ana/shop", default_branch: "main", ticket_prefix: "SH", owner_id: ANA, lead_agent_id: LEAD, created_at: iso(9000) };

const profile: Profile = { id: ANA, github_login: "ana", name: "Ana", avatar_url: null, timezone: "America/Toronto", city: "Toronto", onboarded: true };

function ticket(n: number, t: Partial<Ticket> & Pick<Ticket, "title" | "status">): Ticket {
  return {
    id: `t${n}`,
    project_id: "demo",
    number: n,
    key: `SH-${n}`,
    description: "",
    type: "task",
    priority: "none",
    labels: [],
    parent_id: null,
    assignee_id: null,
    assignee_type: null,
    reporter_id: LEAD,
    done_means: [],
    branch: null,
    pr_url: null,
    needs_human: null,
    sort_order: n,
    created_at: iso(5000 - n * 60),
    updated_at: iso(n * 7),
    started_at: null,
    completed_at: null,
    ...t,
  };
}

const tickets: Ticket[] = [
  ticket(1, { title: "Sign-in", status: "in_progress", type: "epic", priority: "high", description: "Everything about getting people signed in." }),
  ticket(2, {
    title: "Add Google sign-in",
    status: "in_progress",
    type: "feature",
    priority: "high",
    parent_id: "t1",
    assignee_id: BUILDER,
    assignee_type: "agent",
    labels: ["auth"],
    branch: "SH-2-google-sign-in",
    started_at: iso(50),
    description: "People should be able to sign in with Google as well as email.\n\n- Use the existing session code in `src/auth`\n- Keep the email form as it is",
    done_means: ["Google button on /login", "New users get a profile", "Denied consent shows a friendly error"],
  }),
  ticket(3, { title: "Remember me for 30 days", status: "ready", parent_id: "t1", assignee_id: REVIEWER, assignee_type: "agent", priority: "medium", labels: ["auth"] }),
  ticket(4, { title: "Pick the session store", status: "in_progress", parent_id: "t1", assignee_id: REVIEWER, assignee_type: "agent", needs_human: "Redis or Postgres for sessions? Postgres is simpler, Redis is faster.", priority: "high" }),
  ticket(5, { title: "Checkout shows the wrong tax for Ontario", status: "review", type: "bug", priority: "urgent", assignee_id: BUILDER, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/41", labels: ["checkout"] }),
  ticket(6, { title: "Order history page", status: "backlog", type: "feature", priority: "low" }),
  ticket(7, { title: "Upgrade to React 19", status: "backlog", type: "chore", assignee_id: LEE, assignee_type: "human" }),
  ticket(8, { title: "Product search", status: "done", type: "feature", assignee_id: BUILDER, assignee_type: "agent", completed_at: iso(300) }),
  ticket(9, { title: "Write the Project Guide", status: "done", assignee_id: BUILDER, assignee_type: "agent", completed_at: iso(900) }),
];

const steps = new Map<string, Step[]>([
  [
    "t2",
    ["Read the auth code", "Add the Google provider", "Create profiles for new users", "Handle denied consent", "Tests"].map((label, idx) => ({
      ticket_id: "t2",
      idx,
      label,
      status: idx < 2 ? "done" : idx === 2 ? "now" : "todo",
      note: idx === 1 ? "Uses the existing OAuth helper" : null,
      updated_at: iso(10),
    })) as Step[],
  ],
  ["t4", [{ ticket_id: "t4", idx: 0, label: "Compare the options", status: "done", note: null, updated_at: iso(30) }, { ticket_id: "t4", idx: 1, label: "Wire the store", status: "todo", note: null, updated_at: iso(30) }]],
]);

const agents: Agent[] = [
  { id: LEAD, owner_profile_id: ANA, owner_label: "ana", vendor: "claude", display_name: "ana-claude", status: "idle", status_note: "Planned the Sign-in epic", current_ticket_id: null, last_seen_at: iso(3) },
  { id: BUILDER, owner_profile_id: ANA, owner_label: "ana", vendor: "claude", display_name: "builder", status: "building", status_note: "Creating profiles for new users", current_ticket_id: "t2", last_seen_at: iso(1) },
  { id: REVIEWER, owner_profile_id: LEE, owner_label: "lee", vendor: "codex", display_name: "lee-codex", status: "waiting_human", status_note: "Asked about the session store", current_ticket_id: "t4", last_seen_at: iso(2) },
];

const members: Member[] = [
  { actor_id: ANA, actor_type: "human", role: "owner" },
  { actor_id: LEE, actor_type: "human", role: "member" },
  { actor_id: LEAD, actor_type: "agent", role: "member" },
  { actor_id: BUILDER, actor_type: "agent", role: "member" },
  { actor_id: REVIEWER, actor_type: "agent", role: "member" },
];

const decisions: Decision[] = [
  { id: "d2", number: 2, key: "CON-2", kind: "contract", title: "Session cookie is httpOnly, 30 days", body: "`sid` cookie, `SameSite=Lax`.", ticket_id: "t3", created_by: ANA, created_at: iso(400), superseded_by: null },
  { id: "d1", number: 1, key: "DEC-1", kind: "decision", title: "Postgres for everything until it hurts", body: "One database is easier to run. Revisit when we pass 1k requests/s.", ticket_id: null, created_by: LEE, created_at: iso(3000), superseded_by: null },
];

const guide: Guide = {
  project_id: "demo",
  concept: "A small online shop for handmade goods. Shoppers should be able to find something and pay in under a minute.",
  architecture: "- Vite + React front end in `web/`\n- Node API in `api/`, Postgres\n- `npm test` runs everything",
  rules: starterRules(project),
  updated_by: BUILDER,
  updated_at: iso(800),
};

export default function DemoWorkspace() {
  const route = useRoute();
  const ws = useMemo<WS>(() => {
    const byId = new Map(tickets.map((t) => [t.id, t]));
    const links = [{ ticket_id: "t3", blocked_by: "t4" }];
    const profiles = new Map<string, Profile>([
      [ANA, profile],
      [LEE, { ...profile, id: LEE, github_login: "lee", name: "Lee", city: "Stockholm", timezone: "Europe/Stockholm" }],
    ]);
    const ag = new Map(agents.map((a) => [a.id, a]));
    return {
      project,
      tickets,
      steps,
      links,
      people: { members, profiles, agents: ag },
      decisions,
      guide,
      byId,
      byKey: new Map(tickets.map((t) => [t.key, t])),
      reload: async () => undefined,
      nameOf: (id) => (id ? (profiles.get(id)?.name ?? ag.get(id)?.display_name ?? "Someone") : "Unassigned"),
      agentOf: (id) => (id ? ag.get(id) : undefined),
      blockersOf: (tid) => links.filter((l) => l.ticket_id === tid).map((l) => byId.get(l.blocked_by)!),
      unblocks: (tid) => links.filter((l) => l.blocked_by === tid).map((l) => byId.get(l.ticket_id)!),
      childrenOf: (tid) => tickets.filter((t) => t.parent_id === tid),
    };
  }, []);
  const r = route.view === "home" || route.view === "new-project" ? ({ view: "overview", project: "shop" } as const) : route;
  return <Workspace project={project} projects={[project]} route={r} profile={profile} demo={ws} onSignOut={() => undefined} onEditProfile={() => undefined} />;
}
