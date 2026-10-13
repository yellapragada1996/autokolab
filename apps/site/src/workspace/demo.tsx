import { useMemo } from "react";
import { LEAD_BUILT_QUESTION, REVIEW_LIMIT_QUESTION, type Agent, type Decision, type Guide, type Member, type Project, type RunUsage, type Step, type Ticket, type TicketEvent } from "../lib/data";
import { parse, useRoute } from "../lib/router";
import type { Profile } from "../lib/session";
import { starterRules } from "./GuidePage";
import type { Room as RoomData } from "../lib/room";
import type { DemoRoom } from "./useCaptainRoom";
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
const FREE = "00000000-0000-0000-0000-0000000000c5";
// ?preview=workspace&state=waiting|paused|idle shows Overview's other states (AK-75); working is the default.
// waiting: nobody runs and things need Ana. paused: nothing needs Ana and a stopped agent resumes by
// itself. idle: everything started is finished, and Worth watching says "Nothing is off."
const demoState = new URLSearchParams(location.search).get("state");
const nobodyRuns = demoState === "waiting" || demoState === "paused" || demoState === "idle";
const nothingNeeded = demoState === "paused" || demoState === "idle";
// When lee-claude's usage limit resets, in its own time zone, as its runner writes it.
const resetsAt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", hour: "numeric", minute: "2-digit" }).format(new Date(now + 95 * 60_000)).toLowerCase();
// Team (AK-76): each runner reports its usage for today where it runs, its owner's time zone.
const dayIn = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
const usedIn = (timeZone: string, minutes: number, limitHours: number) => ({ used_today_s: minutes * 60, daily_limit_s: limitHours * 3600, usage_day: dayIn(timeZone) });
// ?preview=workspace&empty shows a project with no tickets yet (Overview's empty state).
const demoEmpty = new URLSearchParams(location.search).has("empty");

const project: Project = { id: "demo", name: "Shop", slug: "shop", repo: "ana/shop", default_branch: "main", ticket_prefix: "SH", owner_id: ANA, lead_agent_id: LEAD, room_id: "room", created_at: iso(9000), merge_policy: "auto_safe" };

const profile: Profile = { id: ANA, github_login: "ana", name: "Ana", avatar_url: null, timezone: "America/Toronto", city: "Toronto", onboarded: true };

// A made-up commit and its passing tests, for tickets that have merged.
const sha = (n: number) => n.toString(16).padStart(2, "0").repeat(20);
const passing = (n: number): NonNullable<Ticket["pr_facts"]> => ({ sha: sha(n), checks: { passed: 48, total: 48, state: "success" }, files: { total: 3, risky: [] }, additions: 40 + n, deletions: n });

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

const allTickets: Ticket[] = [
  ticket(1, { title: "Sign-in: Google and email, remembered for 30 days", summary: "People can sign in with Google or email and stay signed in for 30 days.", status: "in_progress", type: "epic", priority: "high", description: "Everything about getting people signed in." }),
  ticket(2, {
    title: "Add Google sign-in",
    summary: "adding Google sign-in beside the email form",
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
    review: { summary: "Google sign-in is being added beside email sign-in.", line: { file: "src/auth/google.ts", code: "+  const profile = await createProfile(account);\n+  return startSession(profile);", plain: "A new Google account gets a profile before its session starts." }, less_sure: "The callback has not been tested against a live Google account yet." },
    pr_url: "https://github.com/ana/shop/pull/42",
  }),
  ticket(3, { title: "Remember me for 30 days", status: "ready", parent_id: "t1", assignee_id: REVIEWER, assignee_type: "agent", priority: "medium", labels: ["auth"], needs_human: "I couldn't start: the session table from SH-4 isn't merged yet." }),
  ticket(4, { title: "Pick the session store", summary: "choosing where sign-ins are kept", status: "in_progress", parent_id: "t1", assignee_id: REVIEWER, assignee_type: "agent", needs_human: "Redis or Postgres for sessions? Postgres is simpler, Redis is faster.", priority: "high" }),
  ticket(11, { title: "Checkout", summary: "Paying takes under a minute, with a card or Apple Pay.", status: "in_progress", type: "epic", priority: "high", description: "Paying should take under a minute." }),
  ticket(12, { title: "Pay with Apple Pay", summary: "adding Apple Pay to the checkout", status: "in_progress", type: "feature", priority: "medium", parent_id: "t11", assignee_id: SPARE, assignee_type: "agent", started_at: iso(25), updated_at: iso(8) }),
  ticket(13, { title: "Search", summary: "Shoppers find any product in two keystrokes.", status: "in_progress", type: "epic", description: "Find any product in two keystrokes." }),
  ticket(14, { title: "Filter search by price", status: "done", summary: "Shoppers can narrow search results to a price range", type: "feature", parent_id: "t13", assignee_id: BUILDER, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/40", started_at: iso(150), completed_at: iso(40), approved_sha: sha(14), approved_by: LEAD, approved_at: iso(48), pr_facts: passing(14) }),
  ticket(16, { title: "Store saved baskets in the database", status: "done", summary: "Saved baskets now remain available after sign-out", type: "feature", parent_id: "t11", assignee_id: BUILDER, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/39", merge_ok_at: iso(70), merge_ok_by: ANA, started_at: iso(265), completed_at: iso(60), approved_sha: sha(16), approved_by: LEAD, approved_at: iso(95), pr_facts: passing(16) }),
  ticket(15, { title: "Order history", summary: "Shoppers can see everything they bought.", status: "backlog", type: "epic", description: "Shoppers can see what they bought." }),
  ticket(5, { title: "Checkout shows the wrong tax for Ontario", status: "review", type: "bug", priority: "urgent", parent_id: "t11", assignee_id: BUILDER, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/41", labels: ["checkout"], summary: "Checkout charges the right tax for Ontario again", approved_sha: "3f9c2a71d0b84e6a95c1f2d7e8a0b4c6d5e7f912", approved_by: LEAD, approved_at: iso(5), pr_facts: { sha: "3f9c2a71d0b84e6a95c1f2d7e8a0b4c6d5e7f912", checks: { passed: 31, total: 48, state: "pending" }, files: { total: 2, risky: [] }, additions: 9, deletions: 3, checked_at: iso(4) } }),
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
    updated_at: iso(11),
    review: {
      summary: "Sessions move from memory into a new Postgres table, so they survive a restart.",
      question: "Everyone who is signed in now will be signed out once, when this ships. Is that OK?",
      line: { file: "db/migrations/004_sessions.sql", code: "+create table sessions (\n+  id text primary key,\n+  user_id uuid not null references users,\n+  expires_at timestamptz not null\n+);", plain: "A new sessions table, one row per signed-in browser." },
      decisions: ["DEC-1", "CON-2"],
      less_sure: "I didn't try it against the live database's size; the table starts empty, so the first deploy should be quick.",
    },
    pr_facts: { sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", checks: { passed: 48, total: 48, state: "success" }, files: { total: 3, risky: ["db/migrations/004_sessions.sql"] }, additions: 62, deletions: 4, checked_at: iso(11) },
    needs_human: "Ready to merge — needs your OK: Everyone who is signed in now will be signed out once, when this ships. Is that OK? (db/migrations/004_sessions.sql)",
  }),
  // Worth watching (AK-76): finished 45 minutes ago and nobody has reviewed it.
  ticket(17, { title: "Show related products", summary: "showing related products under the basket", status: "review", type: "feature", parent_id: "t11", assignee_id: BUILDER, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/44", started_at: iso(140), updated_at: iso(45) }),
  // Approving as a person (AK-95): Captain built SH-18, so a person approves it; SH-19's tests are
  // still running, so it can't be approved yet; Ana worked on SH-20, so someone else has to approve it.
  ticket(18, { title: "Tidy the order emails", summary: "Order emails show the items and the total in one table", status: "review", type: "feature", parent_id: "t11", assignee_id: LEAD, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/45", started_at: iso(90), updated_at: iso(14), needs_human: LEAD_BUILT_QUESTION, built_by: [LEAD], pr_facts: { ...passing(18), checked_at: iso(15) } }),
  ticket(19, { title: "Show stock levels", summary: "Product pages say how many are left", status: "review", type: "feature", parent_id: "t13", assignee_id: LEAD, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/46", started_at: iso(70), updated_at: iso(9), needs_human: LEAD_BUILT_QUESTION, built_by: [LEAD], pr_facts: { sha: sha(19), checks: { passed: 31, total: 48, state: "pending" }, files: { total: 2, risky: [] }, additions: 20, deletions: 1, checked_at: iso(9) } }),
  ticket(20, { title: "Gift wrap at checkout", status: "review", type: "feature", parent_id: "t11", assignee_id: BUILDER, assignee_type: "agent", pr_url: "https://github.com/ana/shop/pull/47", started_at: iso(200), updated_at: iso(7), needs_human: REVIEW_LIMIT_QUESTION, built_by: [BUILDER, ANA], pr_facts: { ...passing(20), checked_at: iso(8) } }),
  ticket(6, { title: "Order history page", status: "backlog", type: "feature", priority: "low", parent_id: "t15" }),
  ticket(7, { title: "Upgrade to React 19", status: "backlog", type: "chore", assignee_id: LEE, assignee_type: "human" }),
  ticket(8, { title: "Product search", status: "done", summary: "Shoppers can search products by name from any page", type: "feature", parent_id: "t13", assignee_id: BUILDER, assignee_type: "agent", completed_at: iso(300) }),
  // Captain's plan (AK-60): two goals whose tickets are drafts in Backlog until Ana says "OK, start".
  ticket(30, { title: "Wishlists", summary: "Shoppers can save things to buy later.", status: "backlog", type: "epic", description: "Shoppers can save things for later." }),
  ticket(31, { title: "Heart button on products", status: "backlog", type: "feature", parent_id: "t30", assignee_id: BUILDER, assignee_type: "agent" }),
  ticket(32, { title: "Store wishlists in the database", status: "backlog", type: "feature", parent_id: "t30", assignee_id: REVIEWER, assignee_type: "agent" }),
  ticket(33, { title: "Wishlist page", status: "backlog", type: "feature", parent_id: "t30", assignee_id: BUILDER, assignee_type: "agent" }),
  ticket(40, { title: "Gift cards", summary: "Shoppers can buy gift cards and pay with them.", status: "backlog", type: "epic", description: "Shoppers can buy and redeem gift cards." }),
  ticket(41, { title: "Charge for a gift card", status: "backlog", type: "feature", parent_id: "t40", assignee_id: REVIEWER, assignee_type: "agent" }),
  ticket(42, { title: "Redeem a gift card at checkout", status: "backlog", type: "feature", parent_id: "t40", assignee_id: BUILDER, assignee_type: "agent" }),
  ticket(9, { title: "Write the Project Guide", status: "done", summary: "Agents now read one guide with the concept and rules before they start", assignee_id: BUILDER, assignee_type: "agent", completed_at: iso(900) }),
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

const demoEvents = new Map<string, TicketEvent[]>([["t2", [
  { id: 1, ticket_id: "t2", actor_id: LEAD, actor_type: "agent", kind: "created", data: {}, created_at: iso(58) },
  { id: 2, ticket_id: "t2", actor_id: LEAD, actor_type: "agent", kind: "assignee", data: { to: BUILDER }, created_at: iso(55) },
  { id: 3, ticket_id: "t2", actor_id: BUILDER, actor_type: "agent", kind: "status", data: { from: "ready", to: "in_progress" }, created_at: iso(50) },
  { id: 4, ticket_id: "t2", actor_id: BUILDER, actor_type: "agent", kind: "step", data: { status: "done", label: "Add the Google provider" }, created_at: iso(15) },
  { id: 5, ticket_id: "t2", actor_id: BUILDER, actor_type: "agent", kind: "pr", data: {}, created_at: iso(8) },
]], ["t10", [
  { id: 6, ticket_id: "t10", actor_id: LEAD, actor_type: "agent", kind: "created", data: {}, created_at: iso(90) },
  { id: 7, ticket_id: "t10", actor_id: REVIEWER, actor_type: "agent", kind: "status", data: { from: "ready", to: "in_progress" }, created_at: iso(80) },
  { id: 8, ticket_id: "t10", actor_id: REVIEWER, actor_type: "agent", kind: "status", data: { from: "in_progress", to: "review" }, created_at: iso(20) },
]]]);

// Results (AK-71): four weeks of merged work and its history, so both periods have something to count.
const DAY = 24 * 60;
// number, title, goal, who built it, minutes since it merged, minutes it took
const shipped: [number, string, string, string, number, number][] = [
  [50, "Show delivery estimates in the basket", "t11", BUILDER, 1 * DAY + 180, 95],
  [51, "Sort search by newest", "t13", REVIEWER, 1 * DAY + 420, 140],
  [52, "Keep the basket after sign-in", "t11", BUILDER, 2 * DAY + 60, 70],
  [53, "Sign out everywhere", "t1", REVIEWER, 3 * DAY + 300, 210],
  [54, "Search understands plurals", "t13", BUILDER, 4 * DAY + 90, 55],
  [55, "Show the basket total with tax", "t11", LEE, 5 * DAY + 200, 320],
  [56, "Lock sign-in after ten wrong passwords", "t1", REVIEWER, 8 * DAY + 120, 180],
  [57, "Search by product code", "t13", BUILDER, 9 * DAY + 400, 85],
  [58, "Email a receipt after paying", "t11", BUILDER, 10 * DAY + 30, 150],
  [59, "Reset a forgotten password", "t1", REVIEWER, 12 * DAY + 240, 260],
  [60, "Remember the last search", "t13", BUILDER, 15 * DAY + 100, 45],
  [61, "Pay with a saved card", "t11", REVIEWER, 16 * DAY + 380, 290],
  [62, "Show sold-out products last", "t13", BUILDER, 17 * DAY + 50, 60],
  [63, "Confirm the email address on sign-up", "t1", BUILDER, 19 * DAY + 210, 125],
  [64, "Free delivery over $50", "t11", REVIEWER, 22 * DAY + 330, 170],
  [65, "Search suggestions as you type", "t13", BUILDER, 24 * DAY + 140, 240],
];

let eventId = 100;
const happened = (ticketId: string, minAgo: number, actor: string, kind: string, data: Record<string, unknown> = {}): TicketEvent => ({
  id: eventId++,
  ticket_id: ticketId,
  actor_id: actor,
  actor_type: actor === ANA || actor === LEE ? "human" : "agent",
  kind,
  data,
  created_at: iso(minAgo),
});

const history: TicketEvent[] = [...demoEvents.values()].flat();
for (const [n, title, goal, who, ago, took] of shipped) {
  const id = `t${n}`;
  allTickets.push(
    ticket(n, { title, status: "done", type: "feature", parent_id: goal, assignee_id: who, assignee_type: who === LEE ? "human" : "agent", pr_url: `https://github.com/ana/shop/pull/${n}`, created_at: iso(ago + took + 30), updated_at: iso(ago), started_at: iso(ago + took), completed_at: iso(ago), approved_sha: sha(n), approved_by: LEAD, approved_at: iso(ago + 8), pr_facts: passing(n) }),
  );
  history.push(
    happened(id, ago + took + 30, LEAD, "created", { status: "ready" }),
    happened(id, ago + took, who, "status", { from: "ready", to: "in_progress" }),
    happened(id, ago + 20, who, "status", { from: "in_progress", to: "review" }),
    happened(id, ago + 8, LEAD, "approval", { to: sha(n) }),
    happened(id, ago, LEAD, "status", { from: "review", to: "done" }),
  );
}
// Where the usage went (AK-92): what each run reported. Every ticket has a build run and Captain's
// review; some have a question for Captain or a few replies in the room. Before last week one
// runner was on older code and reported nothing, so the longer period says some runs didn't report.
let usageId = 1;
const demoUsage: RunUsage[] = [];
const ran = (kind: RunUsage["kind"], agent: string, ticketId: string | null, minAgo: number, size: number, reported = true) => {
  const n = (v: number) => (reported ? Math.round(v * size) : null);
  demoUsage.push({
    id: usageId++,
    agent_id: agent,
    ticket_id: ticketId,
    kind,
    model: reported ? "claude-opus-5-5" : null,
    input_tokens: n(900),
    cache_read_tokens: n(410_000),
    cache_write_tokens: n(31_000),
    output_tokens: n(8_400),
    turns: n(34),
    seconds: Math.round(size * 1500),
    cost_usd: reported ? Math.round(size * 284) / 100 : null,
    created_at: iso(minAgo),
  });
};
for (const [n, , , who, ago, took] of shipped) {
  const id = `t${n}`;
  const old = ago > 7 * DAY;
  if (who !== LEE) ran("build", who, id, ago + 20, took / 100, !(old && who === REVIEWER && n % 2 === 0));
  ran("review", LEAD, id, ago + 8, 0.18 + (n % 3) * 0.05);
  if (n % 3 === 0) ran("question", LEAD, id, ago + took / 2, 0.07);
  if (n % 2 === 0) ran("reply", LEAD, null, ago + took / 3, 0.09);
  if (n % 4 === 1) ran("reply", who === LEE ? BUILDER : who, null, ago + took / 4, 0.06);
}
ran("build", BUILDER, "t14", 60, 1.1);
ran("review", LEAD, "t14", 48, 0.2);
ran("build", BUILDER, "t16", 80, 2.05);
ran("review", LEAD, "t16", 68, 0.31);
ran("reply", LEAD, null, 95, 0.12);
ran("build", BUILDER, "t2", 30, 0.5);

// Today's two merges, the times a person was asked, and the work that was sent back.
for (const [id, n, started, done] of [["t14", 14, 150, 40], ["t16", 16, 265, 60]] as const) {
  history.push(happened(id, started, BUILDER, "status", { from: "ready", to: "in_progress" }), happened(id, done + 8, LEAD, "approval", { to: sha(n) }), happened(id, done, LEAD, "status", { from: "review", to: "done" }));
}
const okAsked: [string, number, string][] = [
  ["t16", 90, "This adds a baskets table. OK to add it?"],
  ["t53", 3 * DAY + 310, "Everyone is signed out once when this ships. Is that OK?"],
  ["t61", 16 * DAY + 390, "Saved cards are kept by the payment provider, not by us. OK to ship?"],
];
for (const [id, ago, question] of okAsked) {
  history.push(happened(id, ago, LEAD, "needs_human", { note: `Ready to merge — needs your OK: ${question}` }), happened(id, ago - 6, ANA, "merge_ok", { by: ANA }));
}
history.push(
  happened("t4", 30, REVIEWER, "needs_human", { note: "Redis or Postgres for sessions? Postgres is simpler, Redis is faster." }),
  happened("t12", 8, REVIEWER, "needs_human", { note: "I stopped: hit the 60-minute limit. Where it got to: the Apple Pay button shows; paying isn't wired yet." }),
  happened("t10", 13, LEAD, "needs_human", { note: "Ready to merge — needs your OK: Everyone who is signed in now will be signed out once, when this ships. Is that OK?" }),
  happened("t59", 12 * DAY + 400, REVIEWER, "needs_human", { note: "Should the reset link last an hour or a day?" }),
  happened("t55", 5 * DAY + 260, LEAD, "status", { from: "review", to: "in_progress" }),
  happened("t64", 22 * DAY + 400, LEAD, "status", { from: "review", to: "in_progress" }),
  // Worth watching (AK-76): Apple Pay bounced off review twice this week.
  happened("t12", 3 * DAY, LEAD, "status", { from: "review", to: "in_progress" }),
  happened("t12", 1 * DAY, LEAD, "status", { from: "review", to: "in_progress" }),
  happened("t17", 45, BUILDER, "status", { from: "in_progress", to: "review" }),
  happened("t8", 2 * DAY, ANA, "status", { from: "done", to: "in_progress" }),
  happened("t8", 300, BUILDER, "status", { from: "in_progress", to: "done" }),
);
history.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

const agents: Agent[] = [
  { id: LEAD, owner_profile_id: ANA, owner_label: "ana", vendor: "claude", display_name: "ana-claude", status: "idle", status_note: "Planned the Sign-in goal", current_ticket_id: null, last_seen_at: iso(3), model: "opus", effort: "high", model_set_by: ANA, model_set_at: iso(60), effective_model: "claude-opus-5-5", effective_effort: "high", effective_at: iso(20), ...usedIn("America/Toronto", 35, 3) },
  { id: BUILDER, owner_profile_id: ANA, owner_label: "ana", vendor: "claude", display_name: "builder", status: nobodyRuns ? "idle" : "building", status_note: nobodyRuns ? null : "Creating profiles for new users", current_ticket_id: nobodyRuns ? null : "t2", last_seen_at: iso(1), model: "sonnet", effort: "medium", model_set_by: LEAD, model_set_at: iso(30), effective_model: "haiku", effective_effort: "medium", effective_at: iso(1), ...usedIn("America/Toronto", 70, 3) },
  { id: REVIEWER, owner_profile_id: LEE, owner_label: "lee", vendor: "codex", display_name: "lee-codex", status: nothingNeeded ? "idle" : "waiting_human", status_note: "Asked about the session store", current_ticket_id: "t4", last_seen_at: iso(2), model: null, effort: null, model_set_by: null, model_set_at: null, effective_model: "gpt-5.5-codex", effective_effort: null, effective_at: iso(120) },
  { id: SPARE, owner_profile_id: LEE, owner_label: "lee", vendor: "claude", display_name: "lee-claude", status: "idle", status_note: `Waiting for my usage limit to reset, about ${resetsAt} (Europe/Stockholm)`, current_ticket_id: "t12", last_seen_at: iso(2), model: null, effort: null, model_set_by: null, model_set_at: null, effective_model: null, effective_effort: null, effective_at: null, ...usedIn("Europe/Stockholm", 160, 4), waiting_until: new Date(now + 95 * 60_000).toISOString() },
  // Free: connected, with nothing assigned.
  { id: FREE, owner_profile_id: ANA, owner_label: "ana", vendor: "codex", display_name: "ana-codex", status: "idle", status_note: null, current_ticket_id: null, last_seen_at: iso(1), model: null, effort: null, model_set_by: null, model_set_at: null, effective_model: "gpt-5-codex", effective_effort: null, effective_at: iso(40), ...usedIn("America/Toronto", 20, 2) },
];

const members: Member[] = [
  { actor_id: ANA, actor_type: "human", role: "owner" },
  { actor_id: LEE, actor_type: "human", role: "member" },
  { actor_id: LEAD, actor_type: "agent", role: "member" },
  { actor_id: BUILDER, actor_type: "agent", role: "member" },
  { actor_id: REVIEWER, actor_type: "agent", role: "member" },
  { actor_id: SPARE, actor_type: "agent", role: "member" },
  { actor_id: FREE, actor_type: "agent", role: "member" },
];

const allDecisions: Decision[] = [
  { id: "d3", number: 3, key: "DEC-3", kind: "decision", title: "Sessions live in Postgres, not Redis", body: "Keeps us on one database (DEC-1).", ticket_id: "t4", created_by: ANA, created_at: iso(15), superseded_by: null },
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
const demoRoom: DemoRoom = {
  room: {
    id: "room", name: "shop", repo: "ana/shop",
    members: [roomMember(ANA, "ana", "human", "web", "human", 1), roomMember(LEE, "lee", "human", "web", "human", 30), roomMember(LEAD, "ana-claude", "agent", "claude-code", "lead", 1), roomMember(BUILDER, "builder", "agent", "claude-code", "follower", 1), roomMember(REVIEWER, "lee-codex", "agent", "codex", "follower", 2)],
    me: null as RoomData["me"],
  },
  messages: [
    { id: 1, room_id: "room", thread_id: null, sender_id: ANA, to_id: LEAD, kind: "chat", body: "Can Apple Pay be in before Friday?", refs: {}, created_at: iso(60 * 26) },
    { id: 2, room_id: "room", thread_id: 1, sender_id: LEAD, to_id: ANA, kind: "answer", body: "Yes. lee-codex picks up SH-12 tomorrow morning; I'll tell you when it's in review.", refs: {}, created_at: iso(60 * 26 - 3) },
    // Settled without Ana (AK-100): Captain closed the first itself (question_close); the second closed when SH-14 was done.
    { id: 2.5, room_id: "room", thread_id: null, sender_id: LEAD, to_id: ANA, kind: "question", body: "lee-codex can't sign in to Codex on Lee's machine. Can you check its login?", refs: {}, created_at: iso(200) },
    { id: 2.6, room_id: "room", thread_id: 2.5, sender_id: LEAD, to_id: ANA, kind: "answer", body: "lee-codex signed in again by itself after the update.", refs: {}, created_at: iso(150) },
    { id: 2.7, room_id: "room", thread_id: null, sender_id: LEAD, to_id: ANA, kind: "question", body: "SH-14's tests keep failing on builder's machine. Can you look?", refs: {}, created_at: iso(120) },
    { id: 3, room_id: "room", thread_id: null, sender_id: ANA, to_id: LEAD, kind: "chat", body: "@ana-claude let's add Google sign-in. Plan it on the board.", refs: {}, created_at: iso(60) },
    { id: 4, room_id: "room", thread_id: 3, sender_id: LEAD, to_id: ANA, kind: "status", body: "Started on #3 (branch sh-1-plan-sign-in).", refs: {}, created_at: iso(58) },
    { id: 5, room_id: "room", thread_id: 3, sender_id: LEAD, to_id: ANA, kind: "status", body: "Picked up #3, continuing.", refs: {}, created_at: iso(56) },
    { id: 6, room_id: "room", thread_id: 3, sender_id: LEAD, to_id: ANA, kind: "answer", body: "Planned the **Sign-in** goal: SH-2 (Google sign-in) for builder, SH-3 and SH-4 for lee-codex. SH-3 waits on SH-4.", refs: {}, created_at: iso(55) },
    // A long Captain message, to see "Show more".
    { id: 6.5, room_id: "room", thread_id: 3, sender_id: LEAD, to_id: ANA, kind: "answer", body: "Here's how sign-in will work once this goal is done. Shoppers see a Google button above the email form on /login. The first time someone signs in with Google we make them a profile from their Google name and picture, so there's nothing to fill in. If they say no on Google's consent screen they land back on /login with a friendly line, not an error page.\n\nSessions last 30 days and survive a restart, because they move into Postgres (SH-4). That's the one change I'll ask you about before it merges, since everyone signed in gets signed out once.\n\n```\nGoogle → /auth/google/callback → profile → session (30 days)\n```\n\nNothing else changes for people who use email today.", refs: {}, created_at: iso(54) },
    { id: 7, room_id: "room", thread_id: null, sender_id: BUILDER, to_id: null, kind: "status", body: "Started on #2 (branch sh-2-add-google-sign-in).", refs: {}, created_at: iso(50) },
    { id: 8, room_id: "room", thread_id: null, sender_id: REVIEWER, to_id: null, kind: "status", body: "Queued #2: lee has paused me; I'll start when resumed.", refs: {}, created_at: iso(49) },
    { id: 9, room_id: "room", thread_id: null, sender_id: LEAD, to_id: BUILDER, kind: "status", body: "Model change: ana-claude moved builder to opus, high effort: SH-2 touches sign-in. Applies from your next run.", refs: {}, created_at: iso(48) },
    { id: 10, room_id: "room", thread_id: null, sender_id: REVIEWER, to_id: LEAD, kind: "question", body: "@ana-claude for SH-4: Redis or Postgres for sessions? Postgres is simpler, Redis is faster.", refs: {}, created_at: iso(20) },
    { id: 11, room_id: "room", thread_id: 10, sender_id: LEAD, to_id: null, kind: "status", body: "Started on #10 (branch sh-4-sessions).", refs: {}, created_at: iso(19) },
    { id: 12, room_id: "room", thread_id: 10, sender_id: LEAD, to_id: ANA, kind: "question", body: "@ana SH-4 is a product choice: Postgres keeps us on one database (DEC-1), Redis is faster. OK to go with Postgres?", refs: {}, created_at: iso(18) },
    // The same question again (AK-100): with SH-4's own Needs you, all three show as one item.
    { id: 12.5, room_id: "room", thread_id: null, sender_id: LEAD, to_id: ANA, kind: "question", body: "Still waiting on SH-4: Postgres keeps us on one database (DEC-1), and lee-codex can't go on until it's picked. OK to go with Postgres?", refs: {}, created_at: iso(16) },
    // A question about no ticket: it waits for a reply or "Not needed any more".
    { id: 12.7, room_id: "room", thread_id: null, sender_id: LEAD, to_id: ANA, kind: "question", body: "Should Apple Pay wait for Monday's design review, or ship as soon as it works?", refs: {}, created_at: iso(15) },
    { id: 13, room_id: "room", thread_id: 10, sender_id: REVIEWER, to_id: null, kind: "status", body: "Pausing this thread after 4 agent messages in a row. A person can reply to continue.", refs: {}, created_at: iso(17) },
    { id: 14, room_id: "room", thread_id: null, sender_id: BUILDER, to_id: null, kind: "status", body: "Failed on #2.\n\nYou've hit your session limit · resets 11:20pm (Europe/Stockholm)", refs: {}, created_at: iso(12) },
    { id: 15, room_id: "room", thread_id: null, sender_id: REVIEWER, to_id: LEAD, kind: "status", body: "Blocked on #5: SH-3 needs the session table from SH-4, which isn't merged yet.", refs: {}, created_at: iso(6) },
    // A plan, a change asked for, and the newer plan that replaces it. The newer one waits on Ana:
    // OK, start shows it started; Change something shows it changes-asked.
    { id: 16, room_id: "room", thread_id: null, sender_id: ANA, to_id: LEAD, kind: "chat", body: "Next: wishlists, please.", refs: {}, created_at: iso(5) },
    { id: 17, room_id: "room", thread_id: 16, sender_id: LEAD, to_id: ANA, kind: "question", body: "One goal, three tickets. I'll ask you before the database change.\n\n```autokolab-plan\ngoals: SH-30\nasks: SH-32\n```", refs: {}, created_at: iso(4.5) },
    { id: 18, room_id: "room", thread_id: 16, sender_id: ANA, to_id: LEAD, kind: "chat", body: "Add gift cards to the same plan.", refs: {}, created_at: iso(4) },
    { id: 19, room_id: "room", thread_id: 16, sender_id: LEAD, to_id: ANA, kind: "question", body: "Two goals, five tickets. Wishlists touch the database and gift cards take payments, so I'll ask you before those two merges, and nothing else.\n\n```autokolab-plan\ngoals: SH-30, SH-40\nasks: SH-32, SH-41\nnot: Sharing a wishlist with friends is not in this plan.\n```", refs: {}, created_at: iso(3) },
  ],
  // Last caught up 10 hours ago, so the preview opens with a catch-up.
  caughtUpAt: iso(600),
  // Arrives a moment after the page, like the live room, so the loading path shows here too.
  delayMs: 800,
  // ?preview=workspace&refuse: every answer is refused, to see the message it leaves.
  refuse: new URLSearchParams(location.search).has("refuse"),
  // ?preview=workspace&reply: opens with the composer replying to Captain's question.
  replyTo: new URLSearchParams(location.search).has("reply") ? 12.7 : undefined,
};

demoRoom.room.me = demoRoom.room.members[0];
// With nothing needing Ana, Captain's questions and plans to her are already answered.
if (nothingNeeded) demoRoom.messages = demoRoom.messages.filter((m) => !(m.kind === "question" && m.to_id === ANA));

/** A ticket as the chosen ?state= has it: nothing waits on Ana from paused on; everything started is done when idle. */
function forState(t: Ticket): Ticket {
  const out = nothingNeeded && t.needs_human ? { ...t, needs_human: null } : t;
  if (demoState === "idle" && out.type !== "epic" && (out.status === "in_progress" || out.status === "review")) return { ...out, status: "done", completed_at: iso(30) };
  return out;
}

export default function DemoWorkspace() {
  const route = useRoute();
  const ws = useMemo<WS>(() => {
    const tickets = demoEmpty ? [] : allTickets.map(forState);
    const decisions = demoEmpty ? [] : allDecisions;
    const byId = new Map(tickets.map((t) => [t.id, t]));
    // The plan's tickets wait on the database change and the charge, so the plan page reorders them.
    const links = demoEmpty ? [] : [
      { ticket_id: "t3", blocked_by: "t4" },
      { ticket_id: "t31", blocked_by: "t32" },
      { ticket_id: "t33", blocked_by: "t32" },
      { ticket_id: "t33", blocked_by: "t31" },
      { ticket_id: "t42", blocked_by: "t41" },
      // Order history starts after Apple Pay, so Overview says "starts after Checkout".
      { ticket_id: "t6", blocked_by: "t12" },
    ];
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
      demoEvents: demoEmpty ? [] : history,
      demoUsage: demoEmpty ? [] : demoUsage,
      demoDetails: new Map(tickets.map((t) => [t.id, { steps: steps.get(t.id) ?? [], comments: [], events: demoEvents.get(t.id) ?? [] }])),
      demoInvites: [{ code: "SHOP2026", project_id: project.id, created_at: iso(60), expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), max_uses: null, uses: 1, revoked: false }],
    };
  }, []);
  const previewRoute = parse("/p/shop", location.search);
  const r = route.view === "home" || route.view === "new-project" || route.view === "join" ? ({ view: "captain", project: "shop", show: "show" in previewRoute ? previewRoute.show : undefined } as const) : route;
  return <Workspace project={project} projects={[project]} route={r} profile={profile} demo={ws} demoRoom={demoRoom} demoEvents={demoEvents} onSignOut={() => undefined} onEditProfile={() => undefined} />;
}
