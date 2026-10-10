import { useMemo } from "react";
import type { Agent, Decision, Guide, Member, Project, Step, Ticket, TicketEvent } from "../lib/data";
import { useRoute } from "../lib/router";
import type { Profile } from "../lib/session";
import { starterRules } from "./GuidePage";
import type { Room as RoomData, RoomMessage } from "../lib/room";
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
const SPARE = "00000000-0000-0000-0000-0000000000c4";

const project: Project = { id: "demo", name: "Shop", slug: "shop", repo: "ana/shop", default_branch: "main", ticket_prefix: "SH", owner_id: ANA, lead_agent_id: LEAD, room_id: "room", created_at: iso(9000), merge_policy: "auto_safe" };

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
  ticket(11, { title: "Checkout", status: "in_progress", type: "epic", priority: "high", description: "Paying should take under a minute." }),
  ticket(12, { title: "Pay with Apple Pay", status: "in_progress", type: "feature", priority: "medium", parent_id: "t11", assignee_id: REVIEWER, assignee_type: "agent", started_at: iso(25) }),
  ticket(13, { title: "Search", status: "in_progress", type: "epic", description: "Find any product in two keystrokes." }),
  ticket(14, { title: "Filter search by price", status: "done", summary: "Shoppers can narrow search results to a price range", type: "feature", parent_id: "t13", assignee_id: BUILDER, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/40", completed_at: iso(40) }),
  ticket(15, { title: "Order history", status: "backlog", type: "epic", description: "Shoppers can see what they bought." }),
  ticket(5, { title: "Checkout shows the wrong tax for Ontario", status: "review", type: "bug", priority: "urgent", parent_id: "t11", assignee_id: BUILDER, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/41", labels: ["checkout"], summary: "Checkout charges the right tax for Ontario again", approved_sha: "3f9c2a71d0b84e6a95c1f2d7e8a0b4c6d5e7f912", approved_by: LEAD, approved_at: iso(5) }),
  ticket(10, {
    title: "Store sessions in Postgres",
    status: "review",
    type: "feature",
    priority: "high",
    parent_id: "t1",
    assignee_id: REVIEWER,
    assignee_type: "agent",
    pr_url: "https://github.com/ana/shop/pull/43",
    labels: ["auth"],
    approved_sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    approved_by: LEAD,
    approved_at: iso(12),
    needs_human: "Ready to merge — needs your OK: a database change (db/migrations/004_sessions.sql).",
  }),
  ticket(6, { title: "Order history page", status: "backlog", type: "feature", priority: "low", parent_id: "t15" }),
  ticket(7, { title: "Upgrade to React 19", status: "backlog", type: "chore", assignee_id: LEE, assignee_type: "human" }),
  ticket(8, { title: "Product search", status: "done", summary: "Shoppers can search products by name from any page", type: "feature", parent_id: "t13", assignee_id: BUILDER, assignee_type: "agent", completed_at: iso(300) }),
  ticket(9, { title: "Write the Project Guide", status: "done", summary: "Agents now read one guide with the concept and rules before they start", assignee_id: BUILDER, assignee_type: "agent", completed_at: iso(900) }),
];

const event = (id: number, ticket: string, actor: string, minAgo: number, kind: string, data: Record<string, unknown> = {}): TicketEvent => ({
  id, ticket_id: ticket, actor_id: actor, actor_type: actor === ANA || actor === LEE ? "human" : "agent", kind, data, created_at: iso(minAgo),
});
// Newest first, like recentEvents(); the step and branch events are bookkeeping the Overview hides.
const events: TicketEvent[] = [
  event(12, "t2", BUILDER, 4, "step", { idx: 2, label: "Create profiles for new users", status: "now" }),
  event(11, "t5", LEAD, 5, "approval", { to: "3f9c2a71d0b84e6a95c1f2d7e8a0b4c6d5e7f912" }),
  event(10, "t10", LEAD, 12, "needs_human", { note: "Ready to merge — needs your OK: a database change (db/migrations/004_sessions.sql)." }),
  event(9, "t4", REVIEWER, 20, "needs_human", { note: "Redis or Postgres for sessions?" }),
  event(8, "t12", REVIEWER, 25, "status", { from: "ready", to: "in_progress" }),
  event(7, "t12", REVIEWER, 25, "branch", { branch: "SH-12-apple-pay" }),
  event(6, "t14", LEAD, 40, "status", { from: "review", to: "done" }),
  event(5, "t2", BUILDER, 50, "status", { from: "ready", to: "in_progress" }),
  event(4, "t3", LEAD, 54, "assignee", { from: null, to: REVIEWER }),
  event(3, "t1", LEAD, 55, "created", { status: "in_progress" }),
  event(2, "t5", BUILDER, 70, "status", { from: "in_progress", to: "review" }),
  event(1, "t9", ANA, 900, "comment", { comment_id: 1 }),
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
  { id: LEAD, owner_profile_id: ANA, owner_label: "ana", vendor: "claude", display_name: "ana-claude", status: "idle", status_note: "Planned the Sign-in goal", current_ticket_id: null, last_seen_at: iso(3), model: "opus", effort: "high", model_set_by: ANA, model_set_at: iso(60), effective_model: "claude-opus-5-5", effective_effort: "high", effective_at: iso(20) },
  { id: BUILDER, owner_profile_id: ANA, owner_label: "ana", vendor: "claude", display_name: "builder", status: "building", status_note: "Creating profiles for new users", current_ticket_id: "t2", last_seen_at: iso(1), model: "sonnet", effort: "medium", model_set_by: LEAD, model_set_at: iso(30), effective_model: "haiku", effective_effort: "medium", effective_at: iso(1) },
  { id: REVIEWER, owner_profile_id: LEE, owner_label: "lee", vendor: "codex", display_name: "lee-codex", status: "waiting_human", status_note: "Asked about the session store", current_ticket_id: "t4", last_seen_at: iso(2), model: null, effort: null, model_set_by: null, model_set_at: null, effective_model: "gpt-5.5-codex", effective_effort: null, effective_at: iso(120) },
  { id: SPARE, owner_profile_id: LEE, owner_label: "lee", vendor: "claude", display_name: "lee-claude", status: "offline", status_note: null, current_ticket_id: null, last_seen_at: iso(60 * 24 * 3), model: null, effort: null, model_set_by: null, model_set_at: null, effective_model: null, effective_effort: null, effective_at: null },
];

const members: Member[] = [
  { actor_id: ANA, actor_type: "human", role: "owner" },
  { actor_id: LEE, actor_type: "human", role: "member" },
  { actor_id: LEAD, actor_type: "agent", role: "member" },
  { actor_id: BUILDER, actor_type: "agent", role: "member" },
  { actor_id: REVIEWER, actor_type: "agent", role: "member" },
  { actor_id: SPARE, actor_type: "agent", role: "member" },
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

const roomMember = (id: string, name: string, kind: "human" | "agent", client: string | null, role: RoomData["members"][number]["role"], seen: number) => ({
  id, name, kind, client, owner_id: ANA, runner_state: "idle", paused: false, last_seen_at: iso(seen), role, can_instruct: role !== "follower",
});
const demoRoom: { room: RoomData; messages: RoomMessage[] } = {
  room: {
    id: "room", name: "shop", repo: "ana/shop",
    members: [roomMember(ANA, "ana", "human", "web", "human", 1), roomMember(LEE, "lee", "human", "web", "human", 30), roomMember(LEAD, "ana-claude", "agent", "claude-code", "lead", 1), roomMember(BUILDER, "builder", "agent", "claude-code", "follower", 1), roomMember(REVIEWER, "lee-codex", "agent", "codex", "follower", 2)],
    me: null as RoomData["me"],
  },
  messages: [
    { id: 1, room_id: "room", thread_id: null, sender_id: ANA, to_id: LEAD, kind: "chat", body: "@ana-claude let's add Google sign-in. Plan it on the board.", refs: {}, created_at: iso(60) },
    { id: 2, room_id: "room", thread_id: 1, sender_id: LEAD, to_id: ANA, kind: "answer", body: "Planned the **Sign-in** goal: SH-2 (Google sign-in) for builder, SH-3 and SH-4 for lee-codex. SH-3 waits on SH-4.", refs: {}, created_at: iso(55) },
    { id: 3, room_id: "room", thread_id: 1, sender_id: LEAD, to_id: null, kind: "status", body: "Picked up #1, continuing.", refs: {}, created_at: iso(54) },
    { id: 4, room_id: "room", thread_id: null, sender_id: BUILDER, to_id: null, kind: "status", body: "Started on #2 (branch sh-2-add-google-sign-in).", refs: {}, created_at: iso(50) },
    { id: 5, room_id: "room", thread_id: null, sender_id: REVIEWER, to_id: null, kind: "status", body: "Queued #2: lee has paused me; I'll start when resumed.", refs: {}, created_at: iso(49) },
    { id: 6, room_id: "room", thread_id: null, sender_id: LEAD, to_id: BUILDER, kind: "status", body: "Model change: ana-claude moved builder to opus, high effort: SH-2 touches sign-in. Applies from your next run.", refs: {}, created_at: iso(48) },
    { id: 7, room_id: "room", thread_id: null, sender_id: REVIEWER, to_id: LEAD, kind: "question", body: "@ana-claude for SH-4: Redis or Postgres for sessions? Postgres is simpler, Redis is faster.", refs: {}, created_at: iso(20) },
    { id: 8, room_id: "room", thread_id: 7, sender_id: LEAD, to_id: null, kind: "status", body: "Started on #7 (branch sh-4-sessions).", refs: {}, created_at: iso(19) },
    { id: 9, room_id: "room", thread_id: 7, sender_id: LEAD, to_id: ANA, kind: "question", body: "@ana that's a product choice: Postgres keeps us on one database (DEC-1). OK to go with Postgres?", refs: {}, created_at: iso(18) },
    { id: 10, room_id: "room", thread_id: 7, sender_id: REVIEWER, to_id: null, kind: "status", body: "Pausing this thread after 4 agent messages in a row. A person can reply to continue.", refs: {}, created_at: iso(17) },
    { id: 11, room_id: "room", thread_id: null, sender_id: BUILDER, to_id: null, kind: "status", body: "Failed on #2.\n\nYou've hit your session limit · resets 11:20pm (Europe/Stockholm)", refs: {}, created_at: iso(12) },
    { id: 12, room_id: "room", thread_id: null, sender_id: REVIEWER, to_id: LEAD, kind: "status", body: "Blocked on #5: SH-3 needs the session table from SH-4, which isn't merged yet.", refs: {}, created_at: iso(6) },
  ],
};

demoRoom.room.me = demoRoom.room.members[0];

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
  const r = route.view === "home" || route.view === "new-project" || route.view === "join" ? ({ view: "overview", project: "shop" } as const) : route;
  return <Workspace project={project} projects={[project]} route={r} profile={profile} demo={ws} demoRoom={demoRoom} demoEvents={events} onSignOut={() => undefined} onEditProfile={() => undefined} />;
}
