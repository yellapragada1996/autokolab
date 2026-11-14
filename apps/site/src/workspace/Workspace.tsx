import { useEffect, useMemo, useState } from "react";
import type { Project, Status, TicketEvent } from "../lib/data";
import { go, href, onNav, type ProjectView, type Route } from "../lib/router";
import type { Profile } from "../lib/session";
import { AgentAvatar, Button, FullLogo, Icon, Svg } from "../ui";
import { CommandPalette, useCommandPalette, type Command } from "../ui/CommandPalette";
import { workHeadline } from "./work";
import { Backlog } from "./Backlog";
import { Board } from "./Board";
import { CaptainHome } from "./CaptainHome";
import { ConnectAgents } from "./Connect";
import { Decisions } from "./Decisions";
import { Room } from "./Room";
import { GuidePage } from "./GuidePage";
import { ListView } from "./ListView";
import { LookFirst } from "./LookFirst";
import { NewTicket } from "./NewTicket";
import { Overview } from "./Overview";
import { People } from "./People";
import { PlanPage } from "./PlanPage";
import { Results, Settings } from "./Settings";
import { TicketPage } from "./TicketPage";
import { ShowWork } from "./ShowWork";
import { useCaptainRoom, type DemoRoom } from "./useCaptainRoom";
import { useDecisionNotifications } from "./useDecisionNotifications";
import { useWorkspace, type Workspace as WS } from "./useWorkspace";

// The project workspace (AK-43, 02-information-architecture.md): the AppShell with its sidebar
// (Captain · Overview · Work · Room · People, then Decisions · Results · Settings) and the current page.

interface NavItem {
  id: ProjectView;
  label: string;
  icon: React.ReactNode;
  sub: string;
  /** "G then W": shown in the item's tooltip and ⌘K, never printed on the item. */
  key?: string;
  /** The views that live under this item. */
  under: (ProjectView | "ticket" | "plan")[];
}

const NAV_MAIN: NavItem[] = [
  { id: "captain", label: "Captain", icon: Icon.captain, sub: "Your point of contact for this project", under: ["captain", "plan"] },
  { id: "overview", label: "Overview", icon: Icon.home, sub: "Who is working on what, and which features are being built, next and done", key: "O", under: ["overview"] },
  { id: "people", label: "Team", icon: Icon.people, sub: "People and agents working on this project", key: "P", under: ["people", "connect"] },
];
const NAV_RECORDS: NavItem[] = [
  { id: "board", label: "Work", icon: Icon.board, sub: "All work and goals", key: "W", under: ["board", "goals", "backlog", "list", "ticket"] },
  { id: "room", label: "Room", icon: Icon.chat, sub: "What the agents say to each other. You only need Captain", key: "R", under: ["room"] },
  { id: "decisions", label: "Guide", icon: Icon.decisions, sub: "What every agent reads first: the project guide and the decisions in force", key: "D", under: ["decisions", "guide"] },
  { id: "results", label: "Results", icon: Icon.results, sub: "Whether it's working", key: "S", under: ["results"] },
  { id: "settings", label: "Settings", icon: Icon.settings, sub: "How hands-off this project is, and who can join", under: ["settings"] },
];
const NAV = [...NAV_MAIN, ...NAV_RECORDS];

/** The views inside Work and Decisions, as tabs. */
const WORK_TABS: { id: ProjectView; label: string }[] = [
  { id: "board", label: "By agent" },
  { id: "goals", label: "By feature" },
  { id: "backlog", label: "Later" },
  { id: "list", label: "All tickets" },
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
  const notifications = useDecisionNotifications(profile.id, project.id, project.slug, captain.actionable, !!ws && captain.room !== undefined);
  const [addAgent, setAddAgent] = useState(false);
  const [newTicket, setNewTicket] = useState<{ status?: Status } | null>(null);
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const me = profile.id;

  // C: new ticket (like Linear); G then O / W / R / P / D / S: go to that page. Not while typing.
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
      { id: "add-agent", label: "Add an agent", run: () => setAddAgent(true) },
      { id: "new", label: "New ticket", hint: "C", run: () => setNewTicket({}) },
      ...NAV.map((n) => ({ id: `go-${n.id}`, label: `Go to ${n.label}`, hint: n.key && `G then ${n.key}`, run: () => go({ view: n.id, project: project.slug }) })),
      ...[...WORK_TABS, ...DECISION_TABS]
        .filter((t) => !NAV.some((n) => n.id === t.id))
        .map((t) => ({ id: `go-${t.id}`, label: `Go to ${t.id === "guide" ? "the Project Guide" : `Work · ${t.label}`}`, run: () => go({ view: t.id, project: project.slug }) })),
      ...(ws?.tickets ?? []).map((t) => ({ id: `t-${t.id}`, label: `${t.key} ${t.title}`, hint: t.status.replace("_", " "), run: () => go({ view: "ticket", project: project.slug, key: t.key }) })),
      ...projects.filter((p) => p.id !== project.id).map((p) => ({ id: `p-${p.id}`, label: `Switch to ${p.name}`, run: () => go({ view: "captain", project: p.slug }) })),
      { id: "new-project", label: "New project", run: () => go({ view: "new-project" }) },
      { id: "name", label: "Change your name", run: onEditProfile },
      { id: "github", label: "AutoKolab on GitHub", run: () => window.open("https://github.com/yellapragada1996/autokolab", "_blank", "noopener") },
      { id: "signout", label: "Sign out", run: onSignOut },
    ];
    return c;
  }, [ws, project, projects, onSignOut, onEditProfile]);

  const section = NAV.find((n) => n.under.includes(route.view));
  const title =
    route.view === "ticket" || route.view === "plan"
      ? null
      : route.view === "connect"
        ? { label: "Add an agent", sub: "Choose a model and connect it on your computer" }
        : section;
  const tabs = section?.id === "board" && route.view !== "ticket" ? WORK_TABS : section?.id === "decisions" ? DECISION_TABS : null;

  return (
    <div className="ak-workspace-shell" style={{ minHeight: "100%", display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
      <Sidebar needs={captain.actionable.length} project={project} projects={projects} route={route} onSignOut={onSignOut} />

      <main className={route.view === "overview" ? "ak-workspace-main ak-workspace-main-overview" : "ak-workspace-main"} style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        {route.view !== "overview" && <header className="ak-page ak-page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, padding: title ? "36px 48px 4px" : "16px 48px 0", flexWrap: "wrap" }}>
          {title && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.15 }}>{title.label}</h1>
              <span style={{ fontSize: 15, color: "var(--text-muted)" }}>{section?.id === "board" && ws && route.view !== "ticket" ? workHeadline(ws) : title.sub}</span>
            </div>
          )}
          <div className="ak-header-actions" style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
            <Button variant="secondary" size="sm" className="ak-tap" onClick={() => setPaletteOpen(true)} title="Search and jump anywhere (⌘K)" aria-keyshortcuts="Meta+K Control+K">
              <Svg size={15} width={2}>
                {Icon.search}
              </Svg>
              Search
            </Button>
          </div>
        </header>}
        <div className={route.view === "overview" ? "ak-page ak-overview-page" : "ak-page"} style={{ flex: 1, padding: route.view === "overview" ? 0 : route.view === "ticket" ? "8px 48px 48px" : route.view === "captain" ? "20px 48px 0" : "24px 48px 56px", minWidth: 0, display: "flex", flexDirection: "column", gap: tabs ? 16 : 0 }}>
          {tabs && <Tabs label={`${section!.label} views`} tabs={tabs} current={route.view} project={project.slug} />}
          {error && route.view !== "overview" && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>{error}</p>}
          {route.view === "overview" ? (
            <Overview ws={ws} me={me} cr={captain} error={error} />
          ) : !ws ? (
            <p style={{ color: "var(--faint)" }}>Loading {project.name}…</p>
          ) : route.view === "ticket" ? (
            <TicketPage ws={ws} me={me} ticketKey={route.key} />
          ) : route.view === "plan" ? (
            <PlanPage ws={ws} cr={captain} planId={route.plan} />
          ) : route.view === "connect" ? (
            <ConnectAgents ws={ws} me={me} />
          ) : route.view === "room" ? (
            <Room ws={ws} profile={profile} demo={demoRoom} />
          ) : route.view === "board" || route.view === "goals" ? (
            <Board ws={ws} me={me} needs={captain.needs} groupBy={route.view === "goals" ? "epic" : "assignee"} onNew={(status) => setNewTicket({ status })} />
          ) : route.view === "settings" ? (
            <Settings ws={ws} me={me} notifications={notifications} onProjectChanged={onProjectChanged} />
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
            <People ws={ws} me={me} onProjectChanged={onProjectChanged} onAddAgent={() => setAddAgent(true)} />
          ) : (
            <CaptainHome ws={ws} cr={captain} me={me} />
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
      {ws && addAgent && <ConnectAgents ws={ws} me={me} onClose={() => setAddAgent(false)} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      {ws && route.view === "captain" && route.look &&<LookFirst ws={ws} cr={captain} me={me} ticketKey={route.look} covered={!!route.show} />}
      {ws && route.show && <ShowWork ws={ws} captain={captain} ticketKey={route.show.key} part={route.show.part} demoEvents={demoEvents} />}
    </div>
  );
}

// ------------------------------------------------------------------ sidebar

export function Sidebar({ needs, project, projects, route, onSignOut }: {
  needs: number; project: Project; projects: Project[];
  route: Extract<Route, { project: string }>; onSignOut: () => void;
}) {
  const nav = (n: NavItem) => {
    // "Guide" opens the guide tab; its decisions are the tab beside it.
    const to: Route = { view: n.id === "decisions" ? "guide" : n.id, project: project.slug };
    const active = n.under.includes(route.view);
    return <a key={n.id} className="ak-shell-nav-item" href={href(to)} onClick={onNav(to)} aria-current={active ? "page" : undefined} title={n.key ? `${n.label} · G then ${n.key}` : n.label}>
      <Svg size={16} width={1.7}>{n.icon}</Svg>
      <span>{n.label}</span>{n.id === "captain" && needs > 0 && <span className="ak-shell-need" aria-label={`${needs} need you`}>{needs}</span>}
    </a>;
  };
  const item = (view: ProjectView, label: string) => {
    const to: Route = { view, project: project.slug };
    return <li key={view}><a href={href(to)} onClick={onNav(to)}>{label}</a></li>;
  };
  const by = (id: string) => NAV.find((n) => n.id === id)!;
  // One list, every page once. On a phone the first three are the tab bar and the rest sit in Menu.
  return <aside className="ak-nav ak-shell-nav" aria-label="Project navigation">
    <div className="ak-shell-brand">AutoKolab</div>
    <label className="ak-shell-project">
      <span>{project.name}</span><span aria-hidden="true">⌄</span>
      <select aria-label="Switch project" value={project.slug} onChange={(e) => e.target.value === "__new" ? go({ view: "new-project" }) : go({ view: "captain", project: e.target.value })}>
        {projects.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}<option value="__new">+ New project</option>
      </select>
    </label>
    <nav className="ak-shell-pages" aria-label="Pages">
      {NAV_MAIN.map(nav)}
      <span className="ak-shell-wide">{nav(by("board"))}{nav(by("results"))}<span className="ak-shell-sep" aria-hidden="true" />{nav(by("room"))}{nav(by("decisions"))}</span>
    </nav>
    <div className="ak-shell-foot">
      {nav(by("settings"))}
      <button type="button" className="ak-shell-nav-item" onClick={onSignOut}><Svg size={16} width={1.7}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></Svg><span>Sign out</span></button>
    </div>
    <details className="ak-shell-project-menu"><summary>Menu</summary><ul>
      {item("board", "Work")}{item("results", "Results")}{item("room", "Room")}{item("guide", "Guide")}{item("settings", "Settings")}
      <li><button type="button" onClick={onSignOut}>Sign out</button></li>
    </ul></details>
  </aside>;
}

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
