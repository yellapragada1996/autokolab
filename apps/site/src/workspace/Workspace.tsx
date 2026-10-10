import { useEffect, useMemo, useState } from "react";
import type { Project, Status, TicketEvent } from "../lib/data";
import { go, href, onNav, type ProjectView, type Route } from "../lib/router";
import type { Profile } from "../lib/session";
import { AgentAvatar, Button, Icon, Logo, PersonAvatar, Svg } from "../ui";
import { CommandPalette, useCommandPalette, type Command } from "../ui/CommandPalette";
import { Backlog } from "./Backlog";
import { Board } from "./Board";
import { CaptainHome } from "./CaptainHome";
import { ConnectAgents } from "./Connect";
import { Decisions } from "./Decisions";
import { Room } from "./Room";
import { cityFromTimezone, localTime } from "../lib/place";
import { GuidePage } from "./GuidePage";
import { ListView } from "./ListView";
import { NewTicket } from "./NewTicket";
import { People } from "./People";
import { Results, Settings } from "./Settings";
import { plural } from "./story";
import { TicketPage } from "./TicketPage";
import { ShowWork } from "./ShowWork";
import { useCaptainRoom, type DemoRoom } from "./useCaptainRoom";
import { useWorkspace, type Workspace as WS } from "./useWorkspace";

// The project workspace (AK-43, 02-information-architecture.md): the AppShell with its sidebar
// (Captain · Work · Room · People, then Decisions · Results · Settings) and the current page.

interface NavItem {
  id: ProjectView;
  label: string;
  icon: React.ReactNode;
  sub: string;
  /** "G then W": shown in the item's tooltip and ⌘K, never printed on the item. */
  key?: string;
  /** The views that live under this item. */
  under: (ProjectView | "ticket")[];
}

const NAV_MAIN: NavItem[] = [
  { id: "overview", label: "Captain", icon: Icon.captain, sub: "Your point of contact for this project", under: ["overview"] },
  { id: "board", label: "Work", icon: Icon.board, sub: "Who is doing what. Agents pick up what's in Ready; drag cards between columns and lanes.", key: "W", under: ["board", "goals", "backlog", "list", "ticket"] },
  { id: "room", label: "Room", icon: Icon.chat, sub: "Where people and agents talk, live. @name to talk to someone.", key: "R", under: ["room"] },
  { id: "people", label: "People", icon: Icon.people, sub: "Who works here and what each agent is doing", key: "P", under: ["people", "connect"] },
];
const NAV_RECORDS: NavItem[] = [
  { id: "decisions", label: "Decisions", icon: Icon.decisions, sub: "Settled choices, and the Project Guide every agent reads first", key: "D", under: ["decisions", "guide"] },
  { id: "results", label: "Results", icon: Icon.results, sub: "Whether it's working", key: "S", under: ["results"] },
  { id: "settings", label: "Settings", icon: Icon.settings, sub: "How hands-off this project is, and who can join", under: ["settings"] },
];
const NAV = [...NAV_MAIN, ...NAV_RECORDS];

/** The views inside Work and Decisions, as tabs. */
const WORK_TABS: { id: ProjectView; label: string }[] = [
  { id: "board", label: "By agent" },
  { id: "goals", label: "By goal" },
  { id: "backlog", label: "Backlog" },
  { id: "list", label: "All issues" },
];
const DECISION_TABS: { id: ProjectView; label: string }[] = [
  { id: "guide", label: "Guide" },
  { id: "decisions", label: "Decisions" },
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
  demoRoom?: DemoRoom;
  demoEvents?: Map<string, TicketEvent[]>;
}) {
  const live = useWorkspace(demo ? null : project);
  const ws = demo ?? live.ws;
  const error = live.error;
  // The conversation with Captain: shared by the Captain page and the sidebar badge, so they agree.
  const captain = useCaptainRoom(project, ws, profile.id, demoRoom);
  const [newTicket, setNewTicket] = useState<{ status?: Status } | null>(null);
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const me = profile.id;

  // C: new ticket (like Linear); G then W / R / P / D / S: go to that page. Not while typing.
  useEffect(() => {
    let g = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable], [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (Date.now() - g < 1500) {
        g = 0;
        const to = NAV.find((n) => n.key === k);
        if (to) {
          e.preventDefault();
          go({ view: to.id, project: project.slug });
        }
        return;
      }
      if (k === "G") g = Date.now();
      else if (k === "C") {
        e.preventDefault();
        setNewTicket({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project.slug]);

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
      ...NAV.map((n) => ({ id: `go-${n.id}`, label: `Go to ${n.label}`, hint: n.key && `G then ${n.key}`, run: () => go({ view: n.id, project: project.slug }) })),
      ...[...WORK_TABS, ...DECISION_TABS]
        .filter((t) => !NAV.some((n) => n.id === t.id))
        .map((t) => ({ id: `go-${t.id}`, label: `Go to ${t.id === "guide" ? "the Project Guide" : `Work · ${t.label}`}`, run: () => go({ view: t.id, project: project.slug }) })),
      ...(ws?.tickets ?? []).map((t) => ({ id: `t-${t.id}`, label: `${t.key} ${t.title}`, hint: t.status.replace("_", " "), run: () => go({ view: "ticket", project: project.slug, key: t.key }) })),
      ...projects.filter((p) => p.id !== project.id).map((p) => ({ id: `p-${p.id}`, label: `Switch to ${p.name}`, run: () => go({ view: "overview", project: p.slug }) })),
      { id: "new-project", label: "New project", run: () => go({ view: "new-project" }) },
      { id: "name", label: "Change your name", run: onEditProfile },
      { id: "github", label: "AutoKolab on GitHub", run: () => window.open("https://github.com/yellapragada1996/autokolab", "_blank", "noopener") },
      { id: "signout", label: "Sign out", run: onSignOut },
    ];
    return c;
  }, [ws, project, projects, onSignOut, onEditProfile]);

  const section = NAV.find((n) => n.under.includes(route.view));
  const title =
    route.view === "ticket"
      ? null
      : route.view === "connect"
        ? { label: "Connect your agents", sub: "Bring your Claude Code and Codex into this project with one terminal line" }
        : section;
  const tabs = section?.id === "board" && route.view !== "ticket" ? WORK_TABS : section?.id === "decisions" ? DECISION_TABS : null;

  return (
    <div style={{ minHeight: "100%", display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
      <Sidebar ws={ws} needs={captain.needs.length} project={project} projects={projects} route={route} profile={profile} onSignOut={onSignOut} />

      <main style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header className="ak-page" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: title ? "18px 28px" : "12px 28px", borderBottom: title ? "1px solid var(--line-soft)" : 0, flexWrap: "wrap" }}>
          {title && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {route.view === "overview" && <AgentAvatar name="Captain" size={32} status={captain.working ? "working" : undefined} ring="var(--bg)" />}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "var(--tracking-tight)" }}>{title.label}</h1>
                <span style={{ fontSize: 13, color: "var(--faint)" }}>{title.sub}</span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
            <Button variant="secondary" size="sm" className="ak-tap" onClick={() => setPaletteOpen(true)} title="Search and jump anywhere (⌘K)" aria-keyshortcuts="Meta+K Control+K">
              <Svg size={15} width={2}>
                {Icon.search}
              </Svg>
              Search
            </Button>
            {title && !["overview", "board", "goals", "backlog", "list", "room", "connect", "settings", "results"].includes(route.view) && (
              <Button variant="primary" size="sm" onClick={() => setNewTicket({})} title="Create a ticket (C)">
                Create
              </Button>
            )}
          </div>
        </header>
        <div className="ak-page" style={{ flex: 1, padding: route.view === "ticket" ? "8px 28px 48px" : route.view === "overview" ? "0 28px" : "22px 28px 40px", minWidth: 0, display: "flex", flexDirection: "column", gap: tabs ? 16 : 0 }}>
          {tabs && <Tabs label={`${section!.label} views`} tabs={tabs} current={route.view} project={project.slug} />}
          {error && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>{error}</p>}
          {!ws ? (
            <p style={{ color: "var(--faint)" }}>Loading {project.name}…</p>
          ) : route.view === "ticket" ? (
            <TicketPage ws={ws} me={me} ticketKey={route.key} />
          ) : route.view === "connect" ? (
            <ConnectAgents ws={ws} me={me} />
          ) : route.view === "room" ? (
            <Room ws={ws} profile={profile} demo={demoRoom} />
          ) : route.view === "board" || route.view === "goals" ? (
            <Board ws={ws} me={me} groupBy={route.view === "goals" ? "epic" : "assignee"} onNew={(status) => setNewTicket({ status })} />
          ) : route.view === "settings" ? (
            <Settings ws={ws} me={me} onProjectChanged={onProjectChanged} />
          ) : route.view === "results" ? (
            <Results ws={ws} />
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
            <CaptainHome ws={ws} me={me} cr={captain} />
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
      {ws && route.show && <ShowWork ws={ws} ticketKey={route.show.key} part={route.show.part} demoEvents={demoEvents} />}
    </div>
  );
}

// ------------------------------------------------------------------ sidebar

function Sidebar({
  ws,
  needs,
  project,
  projects,
  route,
  profile,
  onSignOut,
}: {
  ws: WS | null;
  /** The badge: open "needs you" items, the same list as Captain's headline and cards. */
  needs: number;
  project: Project;
  projects: Project[];
  route: Extract<Route, { project: string }>;
  profile: Profile;
  onSignOut: () => void;
}) {
  const agents = ws ? ws.people.agents.size : 0;
  const humans = ws?.people.members.filter((m) => m.actor_type === "human") ?? [];
  const item = (n: NavItem) => {
    const active = n.under.includes(route.view);
    return (
      <a
        key={n.id}
        className="ak-row"
        href={href({ view: n.id, project: project.slug })}
        onClick={onNav({ view: n.id, project: project.slug })}
        aria-current={active ? "page" : undefined}
        title={n.key ? `${n.label} · G then ${n.key}` : n.label}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 10px",
          borderRadius: 9,
          textDecoration: "none",
          fontSize: 14,
          ...(active ? { background: "var(--surface-active)", color: "var(--text)", fontWeight: 500 } : { color: "var(--text-muted)" }),
        }}
      >
        <Svg size={16}>{n.icon}</Svg>
        {n.label}
        {n.id === "overview" && needs > 0 && (
          <span aria-label={`${needs} need${needs === 1 ? "s" : ""} you`} style={{ marginLeft: "auto", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: "var(--amber)", color: "var(--amber-ink)", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {needs}
          </span>
        )}
      </a>
    );
  };
  return (
    <aside className="ak-nav" aria-label="Project navigation" style={{ flex: "1 1 220px", maxWidth: 260, display: "flex", flexDirection: "column", gap: 20, padding: "20px 12px", background: "var(--sidebar)", borderRight: "1px solid var(--border-subtle)" }}>
      <label style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", borderRadius: 10, cursor: "pointer", flex: "none" }}>
        <Logo size={26} />
        <span className="ak-hide" style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
          <span style={{ fontSize: 12, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ws ? `${plural(humans.length, "person", "people")} · ${plural(agents, "agent")}` : (project.repo ?? "")}
          </span>
        </span>
        <span className="ak-hide" aria-hidden="true" style={{ color: "var(--faint)", fontSize: 12 }}>▾</span>
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

      <nav aria-label="Pages" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_MAIN.map(item)}
        <div role="separator" style={{ height: 1, background: "var(--border-subtle)", margin: "8px 10px" }} />
        {NAV_RECORDS.map(item)}
      </nav>

      <div className="ak-hide" style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, padding: "0 6px" }}>
        {ws && <TeamClocks ws={ws} />}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

/** "Toronto 11:02 · Stockholm 17:02": each place the team works from, on one small line. */
function TeamClocks({ ws }: { ws: WS }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const places = new Map<string, string>();
  for (const m of ws.people.members) {
    const p = m.actor_type === "human" ? ws.people.profiles.get(m.actor_id) : undefined;
    if (!p?.timezone || places.has(p.timezone)) continue;
    places.set(p.timezone, p.city || cityFromTimezone(p.timezone));
  }
  if (!places.size) return null;
  return (
    <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
      {[...places].map(([tz, city]) => `${city} ${localTime(tz)}`).join(" · ")}
    </span>
  );
}

/** The views inside a page (Work's By agent · By goal · Backlog · All issues; Decisions' Guide · Decisions). */
function Tabs({ label, tabs, current, project }: { label: string; tabs: { id: ProjectView; label: string }[]; current: string; project: string }) {
  return (
    <nav aria-label={label} style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
      {tabs.map((t) => {
        const on = t.id === current;
        return (
          <a
            key={t.id}
            href={href({ view: t.id, project })}
            onClick={onNav({ view: t.id, project })}
            aria-current={on ? "page" : undefined}
            style={{ padding: "6px 12px", borderRadius: 7, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", textDecoration: "none", ...(on ? { background: "var(--surface-raised)", color: "var(--text)" } : { color: "var(--text-muted)" }) }}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
