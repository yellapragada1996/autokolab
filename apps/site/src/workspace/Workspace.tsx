import { useEffect, useMemo, useState } from "react";
import { recentEvents, waitsForMergeOk, type Project, type Status, type TicketEvent } from "../lib/data";
import { go, onNav, type Route } from "../lib/router";
import type { Profile } from "../lib/session";
import { Button, Icon, Kbd, Logo, PersonAvatar, Svg } from "../ui";
import { CommandPalette, useCommandPalette, type Command } from "../ui/CommandPalette";
import { Backlog } from "./Backlog";
import { Board, Card, EmptyBoard } from "./Board";
import { ago, KeyText, LeadBadge, StatusIcon, Who } from "./bits";
import { ConnectAgents } from "./Connect";
import { Decisions } from "./Decisions";
import { Room } from "./Room";
import type { Room as RoomData, RoomMessage } from "../lib/room";
import { GuidePage } from "./GuidePage";
import { ListView } from "./ListView";
import { NewTicket } from "./NewTicket";
import { AgentFace, agentOnline, agentStatusText, People } from "./People";
import { actionFor, activity, goals, goalStateText, headline, plural, type Goal } from "./story";
import { isPerson, OkToMerge, TicketPage } from "./TicketPage";
import { useWorkspace, type Workspace as WS } from "./useWorkspace";

// The project workspace: sidebar (projects, views, people and agents) and the current view.

type View = "overview" | "room" | "board" | "backlog" | "list" | "guide" | "decisions" | "people" | "connect";

const NAV: { id: View; label: string; icon: React.ReactNode; sub: string }[] = [
  { id: "overview", label: "Overview", icon: Icon.home, sub: "What needs you, what's moving, what just happened" },
  { id: "room", label: "Room", icon: Icon.chat, sub: "Where people and agents talk, live. @name to talk to someone." },
  { id: "board", label: "Board", icon: Icon.board, sub: "Work in flight. Agents pick up what's in Ready; drag cards between columns and lanes." },
  { id: "backlog", label: "Backlog", icon: Icon.backlog, sub: "What's on the board, and the ranked backlog waiting for it" },
  { id: "list", label: "All issues", icon: Icon.list, sub: "Every issue, sortable" },
  { id: "guide", label: "Project Guide", icon: Icon.book, sub: "Concept, architecture and rules: what every agent reads first" },
  { id: "decisions", label: "Decisions", icon: Icon.decisions, sub: "Settled choices everyone builds on" },
  { id: "people", label: "People & agents", icon: Icon.people, sub: "Who works here and what each agent is doing" },
];

export function Workspace({
  project,
  projects,
  route,
  profile,
  onSignOut,
  onEditProfile,
  onProjectChanged,
  demo,
  demoRoom,
  demoEvents,
}: {
  project: Project;
  projects: Project[];
  route: Extract<Route, { project: string }>;
  profile: Profile;
  onSignOut: () => void;
  onEditProfile: () => void;
  /** The project itself changed (e.g. a new lead): reload it. */
  onProjectChanged?: () => void;
  /** Development preview data instead of the live project. */
  demo?: WS;
  demoRoom?: { room: RoomData; messages: RoomMessage[] };
  demoEvents?: TicketEvent[];
}) {
  const live = useWorkspace(demo ? null : project);
  const ws = demo ?? live.ws;
  const error = live.error;
  const [newTicket, setNewTicket] = useState<{ status?: Status } | null>(null);
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const me = profile.id;

  // C: new ticket (like Linear), unless you're typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setNewTicket({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("autokolab.lastProject", project.slug);
    } catch {
      /* private mode */
    }
  }, [project.slug]);

  const commands = useMemo<Command[]>(() => {
    const c: Command[] = [
      { id: "new", label: "Create an issue", hint: "C", run: () => setNewTicket({}) },
      ...NAV.map((n) => ({ id: `go-${n.id}`, label: `Go to ${n.label}`, run: () => go({ view: n.id, project: project.slug }) })),
      ...(ws?.tickets ?? []).map((t) => ({ id: `t-${t.id}`, label: `${t.key} ${t.title}`, hint: t.status.replace("_", " "), run: () => go({ view: "ticket", project: project.slug, key: t.key }) })),
      ...projects.filter((p) => p.id !== project.id).map((p) => ({ id: `p-${p.id}`, label: `Switch to ${p.name}`, run: () => go({ view: "overview", project: p.slug }) })),
      { id: "new-project", label: "New project", run: () => go({ view: "new-project" }) },
      { id: "name", label: "Change your name", run: onEditProfile },
      { id: "github", label: "AutoKolab on GitHub", run: () => window.open("https://github.com/yellapragada1996/autokolab", "_blank", "noopener") },
      { id: "signout", label: "Sign out", run: onSignOut },
    ];
    return c;
  }, [ws, project, projects, onSignOut, onEditProfile]);

  const nav = NAV.find((n) => n.id === route.view);
  const title =
    route.view === "ticket"
      ? null
      : route.view === "connect"
        ? { label: "Connect your agents", sub: "Bring your Claude Code and Codex into this project with one terminal line" }
        : nav;

  return (
    <div style={{ minHeight: "100%", display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
      <Sidebar ws={ws} project={project} projects={projects} route={route} profile={profile} onOpenPalette={() => setPaletteOpen(true)} onSignOut={onSignOut} />

      <main className="room-main" style={{ flex: "999 1 620px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        {title && (
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 28px", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <h1 style={{ fontSize: 19, fontWeight: 600 }}>{title.label}</h1>
              <span style={{ fontSize: 13, color: "var(--faint)" }}>{title.sub}</span>
            </div>
            {!["board", "backlog", "list", "room", "connect"].includes(route.view) && (
              <Button variant="primary" size="sm" onClick={() => setNewTicket({})}>
                Create <kbd style={{ font: "500 12px var(--mono)", opacity: 0.7 }}>C</kbd>
              </Button>
            )}
          </header>
        )}
        <div style={{ flex: 1, padding: route.view === "ticket" ? "22px 28px 48px" : "22px 28px 40px", minWidth: 0, display: "flex", flexDirection: "column" }}>
          {error && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>{error}</p>}
          {!ws ? (
            <p style={{ color: "var(--faint)" }}>Loading {project.name}…</p>
          ) : route.view === "ticket" ? (
            <TicketPage ws={ws} me={me} ticketKey={route.key} />
          ) : route.view === "connect" ? (
            <ConnectAgents ws={ws} me={me} />
          ) : route.view === "room" ? (
            <Room ws={ws} profile={profile} demo={demoRoom} />
          ) : route.view === "board" ? (
            <Board ws={ws} me={me} onNew={(status) => setNewTicket({ status })} />
          ) : route.view === "backlog" ? (
            <Backlog ws={ws} me={me} onNew={() => setNewTicket({ status: "backlog" })} />
          ) : route.view === "list" ? (
            <ListView ws={ws} me={me} onNew={() => setNewTicket({})} />
          ) : route.view === "guide" ? (
            <GuidePage ws={ws} />
          ) : route.view === "decisions" ? (
            <Decisions ws={ws} />
          ) : route.view === "people" ? (
            <People ws={ws} me={me} onProjectChanged={onProjectChanged} />
          ) : (
            <Overview ws={ws} me={me} demoEvents={demoEvents} />
          )}
        </div>
      </main>

      {ws && newTicket && (
        <NewTicket
          ws={ws}
          initialStatus={newTicket.status}
          onClose={() => setNewTicket(null)}
          onCreated={(t) => {
            setNewTicket(null);
            go({ view: "ticket", project: project.slug, key: t.key });
          }}
        />
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}

// ------------------------------------------------------------------ sidebar

function Sidebar({
  ws,
  project,
  projects,
  route,
  profile,
  onOpenPalette,
  onSignOut,
}: {
  ws: WS | null;
  project: Project;
  projects: Project[];
  route: Extract<Route, { project: string }>;
  profile: Profile;
  onOpenPalette: () => void;
  onSignOut: () => void;
}) {
  const needs = ws?.tickets.filter((t) => t.needs_human && !["done", "canceled"].includes(t.status)).length ?? 0;
  const agents = ws ? [...ws.people.agents.values()] : [];
  const humans = ws?.people.members.filter((m) => m.actor_type === "human") ?? [];
  return (
    <aside aria-label="Project navigation" style={{ flex: "1 1 240px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 22, padding: "20px 14px", background: "var(--sidebar)", borderRight: "1px solid var(--line-soft)" }}>
      <label style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", borderRadius: 10, cursor: "pointer" }}>
        <Logo size={26} />
        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.repo ?? `${project.ticket_prefix}-…`}</span>
        </span>
        <span aria-hidden="true" style={{ color: "var(--faint)", fontSize: 12 }}>▾</span>
        <select
          aria-label="Switch project"
          value={project.slug}
          onChange={(e) => (e.target.value === "__new" ? go({ view: "new-project" }) : go({ view: "overview", project: e.target.value }))}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.slug}>
              {p.name}
            </option>
          ))}
          <option value="__new">+ New project</option>
        </select>
      </label>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((n) => {
          const active = route.view === n.id || (route.view === "ticket" && n.id === "board");
          return (
            <a
              key={n.id}
              href={`/p/${project.slug}/${n.id}`}
              onClick={onNav({ view: n.id, project: project.slug })}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 14,
                ...(active ? { background: "var(--surface-2)", color: "var(--text)", fontWeight: 500 } : { color: "var(--text-2)" }),
              }}
            >
              <Svg size={17}>{n.icon}</Svg>
              {n.label}
              {n.id === "overview" && needs > 0 && (
                <span style={{ marginLeft: "auto", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: "var(--amber)", color: "var(--amber-ink)", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {needs}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {ws && (
        <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="eyebrow" style={{ padding: "0 10px 4px" }}>
            People
          </span>
          {humans.map((m) => {
            const p = ws.people.profiles.get(m.actor_id);
            return (
              <div key={m.actor_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 10px" }}>
                <PersonAvatar name={p?.name ?? "?"} src={p?.avatar_url} size={22} you={m.actor_id === profile.id} />
                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p?.name ?? "Someone"}
                  {m.actor_id === profile.id ? " (you)" : ""}
                </span>
              </div>
            );
          })}
          <span className="eyebrow" style={{ padding: "12px 10px 4px" }}>
            Agents
          </span>
          {agents.map((a) => {
            const on = agentOnline(a);
            const st = on ? agentStatusText[a.status] : agentStatusText.offline;
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 10px" }} title={a.status_note ?? st.label}>
                <AgentFace a={a} size={22} ring="var(--sidebar)" />
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", gap: 6, alignItems: "center" }}>
                    {a.display_name}
                    {a.id === project.lead_agent_id && <LeadBadge />}
                  </span>
                  <span style={{ fontSize: 12, color: st.color }}>{st.label}</span>
                </span>
              </div>
            );
          })}
          {!agents.length && <span style={{ padding: "0 10px", fontSize: 12, color: "var(--faint)" }}>No agents connected yet.</span>}
        </section>
      )}

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, padding: "0 6px" }}>
        <button
          type="button"
          onClick={onOpenPalette}
          style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--faint)", fontSize: 13, cursor: "pointer" }}
        >
          <Svg size={15} width={2}>
            {Icon.search}
          </Svg>
          Jump to…
          <span style={{ marginLeft: "auto" }}>
            <Kbd>⌘K</Kbd>
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px 0" }}>
          <PersonAvatar name={profile.name} src={profile.avatar_url} size={22} you />
          <span style={{ fontSize: 13, color: "var(--text-2)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.name}</span>
          <Button variant="ghost" size="sm" onClick={onSignOut} style={{ height: 28, padding: "0 8px", fontSize: 12 }}>
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ overview

function Overview({ ws, me, demoEvents }: { ws: WS; me: string; demoEvents?: TicketEvent[] }) {
  const [events, setEvents] = useState<TicketEvent[] | null>(demoEvents ?? null);
  useEffect(() => {
    if (demoEvents) return;
    let live = true;
    recentEvents(ws.project.id)
      .then((e) => live && setEvents(e))
      .catch(() => live && setEvents([]));
    return () => {
      live = false;
    };
  }, [ws, demoEvents]);
  const sentences = events
    ?.flatMap((e) => {
      const t = ws.byId.get(e.ticket_id);
      const s = t && activity(ws, e, t);
      return t && s ? [{ e, t, s }] : [];
    })
    .slice(0, 15);

  const open = ws.tickets.filter((t) => !["done", "canceled"].includes(t.status));
  const needs = open.filter((t) => t.needs_human);
  const review = open.filter((t) => t.status === "review" && !t.needs_human);
  const moving = open.filter((t) => t.status === "in_progress" && !t.needs_human && t.type !== "epic");
  const ready = open.filter((t) => t.status === "ready");
  const agents = [...ws.people.agents.values()];
  const g = ws.guide;
  const setup = [
    { done: !!g && !!(g.concept.trim() || g.rules.trim()), label: "Write the Project Guide", sub: "The concept and rules every agent reads first", to: "guide" as const },
    { done: agents.some((a) => a.owner_profile_id === me), label: "Connect your agents", sub: "One terminal line brings in your Claude Code and Codex", to: "connect" as const },
    { done: ws.people.members.filter((m) => m.actor_type === "human").length > 1, label: "Invite the people you work with", sub: "Send them a link; they join with GitHub", to: "people" as const },
    { done: !!ws.project.lead_agent_id, label: "Pick the lead agent", sub: "Your own agent: you talk to it, it writes the tickets and assigns them", to: "people" as const },
    { done: ws.tickets.length > 0, label: "Ask the lead for the first piece of work", sub: "It plans it into tickets for the worker agents", to: "board" as const },
  ];
  const setupLeft = setup.filter((s) => !s.done).length;

  return (
    <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "999 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
        <Headline ws={ws} />

        {setupLeft > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>
              Set up {ws.project.name} <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 14 }}>· {setup.length - setupLeft} of {setup.length}</span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, border: "1px solid var(--line-soft)", overflow: "hidden" }}>
              {setup.map((s, i) => (
                <a
                  key={s.label}
                  href={`/p/${ws.project.slug}/${s.to}`}
                  onClick={onNav({ view: s.to, project: ws.project.slug })}
                  style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", background: "var(--surface)", borderTop: i ? "1px solid var(--line-soft)" : 0, textDecoration: "none", color: "var(--text)" }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, ...(s.done ? { background: "var(--ok-bg)", color: "var(--ok)" } : { border: "1px solid var(--line-strong)", color: "var(--faint)" }) }}>
                    {s.done ? "✓" : i + 1}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: s.done ? "var(--muted)" : "var(--text)", textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                    <span style={{ fontSize: 12, color: "var(--faint)" }}>{s.sub}</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {!ws.tickets.length && ws.project.lead_agent_id && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", padding: 16, borderRadius: 12, border: "1px dashed var(--line)", fontSize: 14, color: "var(--muted)" }}>
            <EmptyBoard ws={ws} />
          </div>
        )}

        <Group title="Needs you" count={needs.length + review.length} empty="Nothing is waiting on you. Questions from agents and pull requests to review show up here.">
          {[...needs, ...review].map((t) =>
            waitsForMergeOk(t) && isPerson(ws, me) ? (
              // The card is a link, so the button sits under it rather than inside.
              <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Card ws={ws} t={t} me={me} action={actionFor(t)} />
                <OkToMerge ws={ws} t={t} />
              </div>
            ) : (
              <Card key={t.id} ws={ws} t={t} me={me} action={actionFor(t)} />
            ),
          )}
        </Group>

        {ws.tickets.length > 0 && <Goals ws={ws} me={me} />}

        <Group title="In progress" count={moving.length} empty={ready.length ? `${ready.length} ticket${ready.length === 1 ? " is" : "s are"} in Ready, waiting for an agent.` : "Nothing in progress right now."}>
          {moving.map((t) => (
            <Card key={t.id} ws={ws} t={t} me={me} />
          ))}
        </Group>
      </div>

      <aside style={{ flex: "1 1 300px", minWidth: 260, display: "flex", flexDirection: "column", gap: 24 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="eyebrow">Agents now</span>
          {agents.map((a) => {
            const st = agentOnline(a) ? agentStatusText[a.status] : agentStatusText.offline;
            const cur = a.current_ticket_id ? ws.byId.get(a.current_ticket_id) : undefined;
            return (
              <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <AgentFace a={a} size={26} />
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {a.display_name} <span style={{ color: st.color, fontWeight: 400 }}>· {st.label}</span>
                  </span>
                  {cur ? (
                    <a href={`/p/${ws.project.slug}/t/${cur.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: cur.key })} style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>
                      {cur.key} · {a.status_note ?? cur.title}
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--faint)" }}>{a.status_note ?? (a.last_seen_at ? `seen ${ago(a.last_seen_at)}` : "not connected yet")}</span>
                  )}
                </span>
              </div>
            );
          })}
          {!agents.length && <span style={{ fontSize: 13, color: "var(--faint)" }}>No agents in this project yet.</span>}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="eyebrow">Recent activity</span>
          {events === null && <span style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</span>}
          {sentences?.length === 0 && <span style={{ fontSize: 13, color: "var(--faint)" }}>Nothing yet.</span>}
          {sentences?.map(({ e, t, s }) => (
            <a key={e.id} href={`/p/${ws.project.slug}/t/${t.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: t.key })} title={t.title} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--muted)", textDecoration: "none", lineHeight: 1.45 }}>
              <span style={{ marginTop: 2 }}>
                <StatusIcon status={t.status} size={13} />
              </span>
              {s.outcome ? (
                <span>
                  <span style={{ color: "var(--text-2)" }}>{s.outcome}</span>{" "}
                  <span style={{ color: "var(--faint)" }}>
                    · <KeyText t={t} style={{ color: "var(--faint)" }} /> · {ago(e.created_at)}
                  </span>
                </span>
              ) : (
                <span>
                  <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>{ws.nameOf(e.actor_id)}</strong> {s.verb} <KeyText t={t} style={{ color: "var(--text-2)" }} />
                  {s.after ? ` ${s.after}` : ""} <span style={{ color: "var(--faint)" }}>· {ago(e.created_at)}</span>
                </span>
              )}
            </a>
          ))}
        </section>
      </aside>
    </div>
  );
}

/** One sentence that says what's going on: who's building what, what shipped today, what needs you. */
function Headline({ ws }: { ws: WS }) {
  const h = headline(ws);
  const epicLink = (e: { key: string; title: string }) => (
    <a key={e.key} href={`/p/${ws.project.slug}/t/${e.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: e.key })} style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
      {e.title}
    </a>
  );
  let building: React.ReactNode;
  if (!h.building) building = "All quiet. Nothing is being built right now.";
  else {
    const { workers, agentsOnly, epics, tickets } = h.building;
    const who = workers ? `${plural(workers, agentsOnly ? "agent" : "teammate")} ${workers === 1 ? "is" : "are"} ` : "";
    const shown = epics.slice(0, 2);
    const more = epics.length - shown.length;
    building = epics.length ? (
      <>
        {who ? `${who}building ` : "Work is moving on "}
        {shown.map((e, i) => (
          <span key={e.id}>
            {i > 0 && (more ? ", " : " and ")}
            {epicLink(e)}
          </span>
        ))}
        {more > 0 && ` and ${plural(more, "more goal")}`}.
      </>
    ) : (
      `${who ? `${who}working on` : "Work is moving on"} ${plural(tickets, "ticket")}.`
    );
  }
  return (
    <p style={{ fontSize: 20, lineHeight: 1.45, fontWeight: 500, color: "var(--text)", maxWidth: 760 }}>
      {building}
      {h.shipped > 0 && ` ${plural(h.shipped, "thing")} shipped today.`}
      {h.needs > 0 && <span style={{ color: "var(--warn)" }}>{` ${plural(h.needs, "decision")} ${h.needs === 1 ? "needs" : "need"} you.`}</span>}
    </p>
  );
}

/** Each open epic with its progress, then the tickets with no epic as "Other work". */
function Goals({ ws, me }: { ws: WS; me: string }) {
  const list = goals(ws);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>
        Goals <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 14 }}>{list.filter((g) => g.epic).length}</span>
      </h2>
      {list.length ? (
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, border: "1px solid var(--line-soft)", overflow: "hidden" }}>
          {list.map((g, i) => (
            <GoalRow key={g.epic?.id ?? "other"} ws={ws} me={me} g={g} first={i === 0} />
          ))}
        </div>
      ) : (
        <div style={{ padding: 14, borderRadius: 12, border: "1px dashed var(--line)", fontSize: 13, color: "var(--muted)" }}>No open goals. Ask the lead to group the next piece of work into an epic.</div>
      )}
    </section>
  );
}

function GoalRow({ ws, me, g, first }: { ws: WS; me: string; g: Goal; first: boolean }) {
  const st = goalStateText[g.state];
  const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
  const to: Route = g.epic ? { view: "ticket", project: ws.project.slug, key: g.epic.key } : { view: "backlog", project: ws.project.slug };
  return (
    <a
      href={g.epic ? `/p/${ws.project.slug}/t/${g.epic.key}` : `/p/${ws.project.slug}/backlog`}
      onClick={onNav(to)}
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: "var(--surface)", borderTop: first ? 0 : "1px solid var(--line-soft)", textDecoration: "none", color: "var(--text)" }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 500, flex: "1 1 200px", minWidth: 0 }}>{g.epic ? g.epic.title : "Other work"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: st.color }}>{st.label}</span>
      </span>
      <span role="progressbar" aria-label={`${g.epic ? g.epic.title : "Other work"} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, borderRadius: 3, background: g.state === "waiting" ? "var(--warn)" : "var(--ok-dot)" }} />
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--muted)" }}>
        {g.total ? `${g.done} of ${g.total} done` : "No tickets yet"}
        {g.who.length > 0 && (
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }} aria-label={`On it: ${g.who.map((id) => ws.nameOf(id)).join(", ")}`}>
            {g.who.slice(0, 5).map((id) => (
              <span key={id} title={ws.nameOf(id)}>
                <Who ws={ws} id={id} size={20} withName={false} you={me} />
              </span>
            ))}
          </span>
        )}
      </span>
    </a>
  );
}

function Group({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>
        {title} <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 14 }}>{count}</span>
      </h2>
      {count ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>{children}</div>
      ) : (
        <div style={{ padding: 14, borderRadius: 12, border: "1px dashed var(--line)", fontSize: 13, color: "var(--muted)" }}>{empty}</div>
      )}
    </section>
  );
}
