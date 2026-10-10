import { useEffect, useMemo, useState } from "react";
import { updateTicket, type Status, type Ticket, type TicketPatch } from "../lib/data";
import { onNav } from "../lib/router";
import { AgentMark, Avatar, Button, Icon, Svg } from "../ui";
import { EpicLozenge, KeyText, LeadBadge, PriorityIcon, StepProgress, TypeIcon } from "./bits";
import { agentOnline, agentStatusText } from "./People";
import type { Workspace } from "./useWorkspace";

// The board, modelled on Jira's: columns for the work in flight, swimlanes by assignee or epic,
// an avatar row and quick filters to narrow it, cards you drag between columns and lanes.
// Backlog lives on its own page, like Jira's Kanban backlog.

export const BOARD_COLUMNS: { id: Status; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "in_progress", label: "In progress" },
  { id: "review", label: "In review" },
  { id: "done", label: "Done" },
];

/** Done cards stay on the board this long, like Jira hiding old done issues. */
const DONE_DAYS = 14;

export type Quick = "mine" | "needs" | "recent";
export interface FilterState {
  query: string;
  /** Selected people and agents (or "none" for unassigned). Empty = everyone. */
  people: string[];
  quick: Quick[];
}
export const emptyFilter: FilterState = { query: "", people: [], quick: [] };

export function applyFilter(ws: Workspace, me: string, f: FilterState): Ticket[] {
  const q = f.query.trim().toLowerCase();
  return ws.tickets.filter((t) => {
    if (t.status === "canceled") return false;
    if (f.people.length && !f.people.includes(t.assignee_id ?? "none")) return false;
    if (f.quick.includes("mine") && !(t.assignee_id === me || ws.agentOf(t.assignee_id)?.owner_profile_id === me)) return false;
    if (f.quick.includes("needs") && !t.needs_human) return false;
    if (f.quick.includes("recent") && Date.now() - Date.parse(t.updated_at) > 86400_000) return false;
    if (q && !`${t.key} ${t.title} ${t.labels.join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Search, the avatar row (click to show one person's or agent's work) and quick filters. */
export function Filters({ ws, me, f, setF }: { ws: Workspace; me: string; f: FilterState; setF: (f: FilterState) => void }) {
  const lead = ws.project.lead_agent_id;
  const actors = [...ws.people.members].sort((a, b) => Number(b.actor_id === lead) - Number(a.actor_id === lead) || (a.actor_type === b.actor_type ? 0 : a.actor_type === "agent" ? -1 : 1));
  const toggle = (id: string) => setF({ ...f, people: f.people.includes(id) ? f.people.filter((x) => x !== id) : [...f.people, id] });
  const quick = (q: Quick) => setF({ ...f, quick: f.quick.includes(q) ? f.quick.filter((x) => x !== q) : [...f.quick, q] });
  const chip = (on: boolean): React.CSSProperties => ({
    height: 32,
    padding: "0 12px",
    borderRadius: 6,
    border: `1px solid ${on ? "var(--primary)" : "var(--line)"}`,
    background: on ? "rgba(215,242,92,0.12)" : "transparent",
    color: on ? "var(--primary)" : "var(--text-2)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  });
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--faint)", width: "min(200px, 60vw)" }}>
        <Svg size={14} width={2}>
          {Icon.search}
        </Svg>
        <input aria-label="Search this board" value={f.query} onChange={(e) => setF({ ...f, query: e.target.value })} placeholder="Search this board" style={{ border: 0, background: "transparent", outline: "none", fontSize: 13, width: "100%", color: "var(--text)" }} />
      </label>
      <div role="group" aria-label="Show work for" style={{ display: "flex", alignItems: "center", paddingLeft: 6 }}>
        {actors.map((m) => {
          const on = f.people.includes(m.actor_id);
          const agent = ws.agentOf(m.actor_id);
          const p = ws.people.profiles.get(m.actor_id);
          return (
            <button
              key={m.actor_id}
              type="button"
              onClick={() => toggle(m.actor_id)}
              title={`${ws.nameOf(m.actor_id)}${m.actor_id === lead ? " (lead)" : ""}`}
              aria-pressed={on}
              style={{ marginLeft: -6, padding: 0, border: 0, borderRadius: agent ? 9 : "50%", background: "none", cursor: "pointer", boxShadow: on ? "0 0 0 2px var(--primary)" : "0 0 0 2px var(--bg)", position: "relative", zIndex: on ? 2 : 1, display: "inline-flex" }}
            >
              {agent ? <AgentMark vendor={agent.vendor} size={30} /> : <Avatar name={p?.name ?? "?"} src={p?.avatar_url} size={30} you={m.actor_id === me} />}
            </button>
          );
        })}
        <button type="button" onClick={() => toggle("none")} title="Unassigned" aria-pressed={f.people.includes("none")} style={{ marginLeft: -6, width: 30, height: 30, borderRadius: "50%", border: "1px dashed var(--line-strong)", background: "var(--bg)", color: "var(--faint)", fontSize: 11, cursor: "pointer", boxShadow: f.people.includes("none") ? "0 0 0 2px var(--primary)" : "0 0 0 2px var(--bg)" }}>
          ?
        </button>
      </div>
      <button type="button" style={chip(f.quick.includes("mine"))} onClick={() => quick("mine")} aria-pressed={f.quick.includes("mine")}>
        Only mine
      </button>
      <button type="button" style={chip(f.quick.includes("needs"))} onClick={() => quick("needs")} aria-pressed={f.quick.includes("needs")}>
        Needs you
      </button>
      <button type="button" style={chip(f.quick.includes("recent"))} onClick={() => quick("recent")} aria-pressed={f.quick.includes("recent")}>
        Recently updated
      </button>
      {(f.query || f.people.length > 0 || f.quick.length > 0) && (
        <button type="button" onClick={() => setF(emptyFilter)} style={{ border: 0, background: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>
          Clear filters
        </button>
      )}
    </div>
  );
}

type GroupBy = "none" | "assignee" | "epic";
interface Lane {
  id: string;
  /** What dropping a card into this lane changes. */
  patch: TicketPatch;
  head: React.ReactNode;
  tickets: Ticket[];
}

export function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, v);
    } catch {
      /* private mode */
    }
  }, [key, v]);
  return [v, setV];
}

export function Board({ ws, me, onNew }: { ws: Workspace; me: string; onNew: (status?: Status) => void }) {
  const [f, setF] = useState<FilterState>(emptyFilter);
  const [groupBy, setGroupBy] = useStored<GroupBy>("autokolab.board.groupBy", "assignee");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ lane: string; status: Status; index: number } | null>(null);
  const [err, setErr] = useState("");

  const shown = useMemo(
    () =>
      applyFilter(ws, me, f).filter(
        (t) => t.type !== "epic" && BOARD_COLUMNS.some((c) => c.id === t.status) && (t.status !== "done" || !t.completed_at || Date.now() - Date.parse(t.completed_at) < DONE_DAYS * 86400_000),
      ),
    [ws, me, f],
  );

  const lanes = useMemo<Lane[]>(() => {
    if (groupBy === "none") return [{ id: "all", patch: {}, head: null, tickets: shown }];
    if (groupBy === "epic") {
      const epics = ws.tickets.filter((t) => t.type === "epic" && t.status !== "canceled");
      const out: Lane[] = epics.map((e) => {
        const kids = ws.childrenOf(e.id);
        return {
          id: e.id,
          patch: { parent_id: e.id },
          tickets: shown.filter((t) => t.parent_id === e.id),
          head: (
            <>
              <TypeIcon type="epic" />
              <span style={{ fontWeight: 600 }}>{e.title}</span>
              <KeyText t={e} />
              <span style={{ color: "var(--faint)" }}>
                {kids.filter((k) => k.status === "done").length} of {kids.length} done
              </span>
            </>
          ),
        };
      });
      out.push({ id: "no-epic", patch: { parent_id: null }, tickets: shown.filter((t) => !t.parent_id || !epics.some((e) => e.id === t.parent_id)), head: <span style={{ fontWeight: 600 }}>Issues without an epic</span> });
      return out.filter((l) => l.tickets.length || l.id !== "no-epic");
    }
    // By assignee: the lead and the worker agents first, then people, then unassigned.
    const lead = ws.project.lead_agent_id;
    const ids = [...new Set(shown.map((t) => t.assignee_id).filter((x): x is string => !!x))].sort((a, b) => {
      const rank = (id: string) => (id === lead ? 0 : ws.agentOf(id) ? 1 : id === me ? 2 : 3);
      return rank(a) - rank(b) || ws.nameOf(a).localeCompare(ws.nameOf(b));
    });
    const out: Lane[] = ids.map((id) => {
      const agent = ws.agentOf(id);
      const p = ws.people.profiles.get(id);
      const st = agent ? (agentOnline(agent) ? agentStatusText[agent.status] : agentStatusText.offline) : null;
      return {
        id,
        patch: { assignee_id: id },
        tickets: shown.filter((t) => t.assignee_id === id),
        head: (
          <>
            {agent ? <AgentMark vendor={agent.vendor} size={22} /> : <Avatar name={p?.name ?? "?"} src={p?.avatar_url} size={22} you={id === me} />}
            <span style={{ fontWeight: 600 }}>
              {ws.nameOf(id)}
              {id === me ? " (you)" : ""}
            </span>
            {id === lead && <LeadBadge />}
            {st && (
              <span style={{ color: st.color }}>
                {st.label}
                {agent?.status_note && agentOnline(agent) ? ` · ${agent.status_note}` : ""}
              </span>
            )}
          </>
        ),
      };
    });
    const none = shown.filter((t) => !t.assignee_id);
    if (none.length) out.push({ id: "unassigned", patch: { assignee_id: null }, tickets: none, head: <span style={{ fontWeight: 600 }}>Unassigned</span> });
    return out;
  }, [groupBy, shown, ws, me]);

  const drop = async (lane: Lane, status: Status, index: number) => {
    const t = dragging ? ws.byId.get(dragging) : undefined;
    setDragging(null);
    setOver(null);
    if (!t) return;
    const cell = lane.tickets.filter((x) => x.status === status && x.id !== t.id).sort((a, b) => a.sort_order - b.sort_order);
    const before = cell[index - 1]?.sort_order;
    const after = cell[index]?.sort_order;
    const sort_order = before === undefined ? (after === undefined ? t.sort_order : after - 1) : after === undefined ? before + 1 : (before + after) / 2;
    const patch: TicketPatch = { ...lane.patch };
    if (t.status !== status) patch.status = status;
    if (sort_order !== t.sort_order) patch.sort_order = sort_order;
    for (const k of Object.keys(patch) as (keyof TicketPatch)[]) if (patch[k] === t[k as keyof Ticket]) delete patch[k];
    if (!Object.keys(patch).length) return;
    try {
      setErr("");
      await updateTicket(t.id, patch);
      await ws.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const grid = `repeat(${BOARD_COLUMNS.length}, minmax(220px, 1fr))`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Filters ws={ws} me={me} f={f} setF={setF} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
            Group by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} style={{ height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13 }}>
              <option value="none">None</option>
              <option value="assignee">Assignee</option>
              <option value="epic">Epic</option>
            </select>
          </label>
          <Button variant="primary" size="sm" onClick={() => onNew("ready")}>
            Create <kbd style={{ font: "500 11px var(--mono)", opacity: 0.7 }}>C</kbd>
          </Button>
        </div>
      </div>
      {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}

      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ minWidth: BOARD_COLUMNS.length * 230 }}>
          {/* Column headers, like Jira: name and count. */}
          <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, position: "sticky", top: 0, zIndex: 3, background: "var(--bg)", paddingBottom: 8 }}>
            {BOARD_COLUMNS.map((c) => (
              <div key={c.id} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--sidebar)", font: "600 12px var(--sans)", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>
                {c.label} <span style={{ color: "var(--faint)", marginLeft: 4 }}>{shown.filter((t) => t.status === c.id).length}</span>
              </div>
            ))}
          </div>

          {lanes.map((lane) => {
            const isCollapsed = collapsed.has(lane.id);
            return (
              <section key={lane.id} style={{ marginBottom: 10 }}>
                {lane.head && (
                  <button
                    type="button"
                    onClick={() => setCollapsed((s) => (s.has(lane.id) ? new Set([...s].filter((x) => x !== lane.id)) : new Set([...s, lane.id])))}
                    aria-expanded={!isCollapsed}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 4px", border: 0, borderBottom: "1px solid var(--line-soft)", background: "none", color: "var(--text)", fontSize: 13, cursor: "pointer", textAlign: "left", marginBottom: 8 }}
                  >
                    <span aria-hidden="true" style={{ display: "inline-block", width: 12, color: "var(--faint)", transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform 120ms" }}>
                      ▾
                    </span>
                    {lane.head}
                    <span style={{ color: "var(--faint)", marginLeft: 4 }}>
                      {lane.tickets.length} issue{lane.tickets.length === 1 ? "" : "s"}
                    </span>
                  </button>
                )}
                {!isCollapsed && (
                  <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8 }}>
                    {BOARD_COLUMNS.map((col) => {
                      const cards = lane.tickets.filter((t) => t.status === col.id).sort((a, b) => a.sort_order - b.sort_order);
                      const here = over?.lane === lane.id && over.status === col.id;
                      return (
                        <div
                          key={col.id}
                          aria-label={`${col.label}${lane.head ? "" : ""}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (!here) setOver({ lane: lane.id, status: col.id, index: cards.length });
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            void drop(lane, col.id, here ? over!.index : cards.length);
                          }}
                          style={{ display: "flex", flexDirection: "column", gap: 6, padding: 6, minHeight: 72, borderRadius: 8, background: here ? "var(--surface-2)" : "var(--sidebar)", outline: here ? "1px dashed var(--line-strong)" : "none" }}
                        >
                          {cards.map((t, i) => (
                            <div
                              key={t.id}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const r = e.currentTarget.getBoundingClientRect();
                                const index = e.clientY < r.top + r.height / 2 ? i : i + 1;
                                if (!here || over!.index !== index) setOver({ lane: lane.id, status: col.id, index });
                              }}
                            >
                              {here && over!.index === i && dragging && dragging !== t.id && <DropLine />}
                              <Card ws={ws} t={t} me={me} dragging={dragging === t.id} onDragStart={() => setDragging(t.id)} onDragEnd={() => (setDragging(null), setOver(null))} />
                            </div>
                          ))}
                          {here && over!.index === cards.length && dragging && <DropLine />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {!shown.length && (
            <div style={{ padding: "28px 20px", borderRadius: 12, border: "1px dashed var(--line)", textAlign: "center", color: "var(--muted)", fontSize: 14, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              {ws.tickets.length ? <span>No issues on the board match. Tickets waiting in the Backlog aren't shown here.</span> : <EmptyBoard ws={ws} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Nothing on the board yet: the lead writes the tickets, so say how to ask it. */
export function EmptyBoard({ ws }: { ws: Workspace }) {
  const lead = ws.project.lead_agent_id ? ws.nameOf(ws.project.lead_agent_id) : null;
  return lead ? (
    <>
      <strong style={{ color: "var(--text)" }}>The board is empty.</strong>
      <span>
        Tell your lead, <strong style={{ color: "var(--text)" }}>{lead}</strong>, what you want built. In Claude Code, for example:
      </span>
      <code style={{ display: "block", padding: "10px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--line)", font: "13px var(--mono)", color: "var(--text-2)", textAlign: "left" }}>
        Plan "add Google sign-in" on the AutoKolab board and assign the tickets.
      </code>
      <span style={{ fontSize: 13, color: "var(--faint)" }}>It writes complete tickets and assigns them to the worker agents, who start right away.</span>
    </>
  ) : (
    <>
      <strong style={{ color: "var(--text)" }}>The board is empty.</strong>
      <span>Pick a lead agent on the People page: it writes the tickets and assigns them to the other agents.</span>
    </>
  );
}

function DropLine() {
  return <div style={{ height: 3, borderRadius: 2, background: "var(--primary)", margin: "2px 0" }} />;
}

/** A Jira-style card: title, what's happening, epic, then type, key, priority and assignee. */
export function Card({ ws, t, me, action, dragging, onDragStart, onDragEnd }: { ws: Workspace; t: Ticket; me: string; /** What a person is asked to do, e.g. "Answer a question". */ action?: string; dragging?: boolean; onDragStart?: () => void; onDragEnd?: () => void }) {
  const steps = ws.steps.get(t.id);
  const openBlockers = ws.blockersOf(t.id).filter((b) => !["done", "canceled"].includes(b.status));
  const parent = t.parent_id ? ws.byId.get(t.parent_id) : undefined;
  const waiting = openBlockers.length > 0 && t.status !== "done";
  const needs = !!t.needs_human;
  const done = steps?.filter((s) => s.status === "done").length ?? 0;
  const now = steps?.find((s) => s.status === "now");
  const meta = needs
    ? t.needs_human
    : waiting
      ? `Waiting on ${openBlockers.map((b) => b.key).join(", ")}`
      : steps?.length && t.status !== "done"
        ? `Step ${Math.min(done + 1, steps.length)} of ${steps.length}${now ? ` · ${now.label}` : ""}`
        : null;
  return (
    <a
      href={`/p/${ws.project.slug}/t/${t.key}`}
      onClick={onNav({ view: "ticket", project: ws.project.slug, key: t.key })}
      draggable={!!onDragStart}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.key);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 6,
        textDecoration: "none",
        color: "var(--text)",
        opacity: dragging ? 0.4 : 1,
        cursor: onDragStart ? "grab" : "pointer",
        boxShadow: "0 1px 1px rgba(0,0,0,0.35)",
        ...(needs ? { background: "var(--warn-bg)", border: "1px solid var(--warn-line)" } : { background: "var(--surface)", border: `1px ${waiting ? "dashed" : "solid"} var(--line)` }),
      }}
    >
      {action && <span style={{ fontSize: 13, fontWeight: 600, color: needs ? "var(--warn)" : "var(--codex)" }}>{action}</span>}
      <span style={{ fontSize: 14, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</span>
      {t.summary && (
        <span title={t.summary} style={{ fontSize: 12, lineHeight: 1.4, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.summary}
        </span>
      )}
      {steps && steps.length > 0 && t.status !== "done" && <StepProgress steps={steps} />}
      {meta && <span style={{ fontSize: 12, lineHeight: 1.4, color: needs ? "var(--warn)" : "var(--muted)" }}>{meta}</span>}
      {(parent || t.labels.length > 0) && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {parent && <EpicLozenge epic={parent} />}
          {t.labels.slice(0, 2).map((l) => (
            <span key={l} style={{ height: 20, padding: "0 6px", borderRadius: 4, border: "1px solid var(--line)", fontSize: 11, color: "var(--text-2)", display: "inline-flex", alignItems: "center" }}>
              {l}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <TypeIcon type={t.type} />
        <KeyText t={t} style={{ textDecoration: t.status === "done" ? "line-through" : "none" }} />
        {t.pr_url && (
          <span title="Pull request open" style={{ fontSize: 11, color: "var(--codex)", fontFamily: "var(--mono)" }}>
            PR
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <PriorityIcon priority={t.priority} />
          <WhoMark ws={ws} id={t.assignee_id} me={me} />
        </span>
      </div>
    </a>
  );
}

export function WhoMark({ ws, id, me, size = 22 }: { ws: Workspace; id: string | null; me: string; size?: number }) {
  if (!id) return <span title="Unassigned" style={{ width: size, height: size, borderRadius: "50%", border: "1px dashed var(--line-strong)", display: "inline-block", flex: "none" }} />;
  const agent = ws.agentOf(id);
  const p = ws.people.profiles.get(id);
  return (
    <span title={ws.nameOf(id)} style={{ display: "inline-flex", flex: "none" }}>
      {agent ? <AgentMark vendor={agent.vendor} size={size} /> : <Avatar name={p?.name ?? "?"} src={p?.avatar_url} size={size} you={id === me} />}
    </span>
  );
}
