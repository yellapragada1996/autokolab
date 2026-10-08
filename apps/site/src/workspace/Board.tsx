import { useMemo, useState } from "react";
import { STATUSES, statusLabel, updateTicket, type Status, type Ticket } from "../lib/data";
import { onNav } from "../lib/router";
import { Button } from "../ui";
import { KeyText, Label, PriorityIcon, StatusIcon, StepProgress, statusColor, typeTone, Who } from "./bits";
import type { Workspace } from "./useWorkspace";

// The board (spec §11.3): Backlog · Ready · In progress · Review · Done, live, drag to move.

export type Filter = "all" | "me" | "agents";

export function applyFilter(ws: Workspace, me: string, filter: Filter, query: string, assignee: string): Ticket[] {
  const q = query.trim().toLowerCase();
  return ws.tickets.filter((t) => {
    if (t.status === "canceled") return false;
    if (filter === "me" && !(t.needs_human || t.assignee_id === me)) return false;
    if (filter === "agents" && !(t.assignee_type === "agent" && ws.agentOf(t.assignee_id)?.owner_profile_id === me)) return false;
    if (assignee && t.assignee_id !== (assignee === "none" ? null : assignee)) return false;
    if (q && !`${t.key} ${t.title} ${t.labels.join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function Filters({
  ws,
  filter,
  setFilter,
  query,
  setQuery,
  assignee,
  setAssignee,
}: {
  ws: Workspace;
  filter: Filter;
  setFilter: (f: Filter) => void;
  query: string;
  setQuery: (q: string) => void;
  assignee: string;
  setAssignee: (a: string) => void;
}) {
  const everyone = ws.people.members.map((m) => ({ id: m.actor_id, label: ws.nameOf(m.actor_id) }));
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <div role="tablist" aria-label="Show" style={{ display: "inline-flex", padding: 3, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line)" }}>
        {(
          [
            ["all", "Everything"],
            ["me", "Needs me"],
            ["agents", "My agents"],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            type="button"
            onClick={() => setFilter(id)}
            style={{ height: 28, padding: "0 12px", border: 0, borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer", background: filter === id ? "var(--surface-2)" : "transparent", color: filter === id ? "var(--text)" : "var(--muted)" }}
          >
            {label}
          </button>
        ))}
      </div>
      <select
        aria-label="Assignee"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        style={{ height: 34, padding: "0 10px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13 }}
      >
        <option value="">Anyone</option>
        <option value="none">Unassigned</option>
        {everyone.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        aria-label="Search tickets"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tickets"
        style={{ height: 34, width: "min(220px, 60vw)", padding: "0 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13 }}
      />
    </div>
  );
}

export function Board({ ws, me, onNew }: { ws: Workspace; me: string; onNew: (status?: Status) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: Status; index: number } | null>(null);
  const [err, setErr] = useState("");
  // Epics are containers: they live in the list and on their tickets' cards, not as cards here.
  const shown = useMemo(() => applyFilter(ws, me, filter, query, assignee).filter((t) => t.type !== "epic"), [ws, me, filter, query, assignee]);

  const drop = async (status: Status, index: number) => {
    const t = dragging ? ws.byId.get(dragging) : undefined;
    setDragging(null);
    setOver(null);
    if (!t) return;
    const col = ws.tickets.filter((x) => x.status === status && x.id !== t.id).sort((a, b) => a.sort_order - b.sort_order);
    const before = col[index - 1]?.sort_order;
    const after = col[index]?.sort_order;
    const sort_order = before === undefined ? (after === undefined ? Date.now() / 1000 : after - 1) : after === undefined ? before + 1 : (before + after) / 2;
    if (t.status === status && Math.abs(t.sort_order - sort_order) < 1e-9) return;
    try {
      setErr("");
      await updateTicket(t.id, { status, sort_order });
      await ws.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Filters ws={ws} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} assignee={assignee} setAssignee={setAssignee} />
        <Button variant="primary" onClick={() => onNew()}>
          New ticket <kbd style={{ font: "500 11px var(--mono)", opacity: 0.7 }}>C</kbd>
        </Button>
      </div>
      {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATUSES.length}, minmax(214px, 1fr))`, gap: 14, overflowX: "auto", paddingBottom: 8, alignItems: "start" }}>
        {STATUSES.map((col) => {
          const cards = shown.filter((t) => t.status === col.id).sort((a, b) => a.sort_order - b.sort_order);
          return (
            <section
              key={col.id}
              aria-label={col.label}
              onDragOver={(e) => {
                e.preventDefault();
                if (!over || over.status !== col.id) setOver({ status: col.id, index: cards.length });
              }}
              onDrop={(e) => {
                e.preventDefault();
                void drop(col.id, over?.status === col.id ? over.index : cards.length);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 10,
                minHeight: 160,
                borderRadius: 14,
                background: over?.status === col.id ? "var(--surface-2)" : "var(--sidebar)",
                border: "1px solid var(--line-soft)",
              }}
            >
              <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 6px" }}>
                <StatusIcon status={col.id} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{col.label}</span>
                <span style={{ fontSize: 13, color: "var(--faint)" }}>{cards.length}</span>
                <button
                  type="button"
                  aria-label={`New ticket in ${col.label}`}
                  onClick={() => onNew(col.id)}
                  style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: 7, border: 0, background: "transparent", color: "var(--faint)", fontSize: 18, cursor: "pointer" }}
                >
                  +
                </button>
              </header>
              {cards.map((t, i) => (
                <div
                  key={t.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const index = e.clientY < r.top + r.height / 2 ? i : i + 1;
                    if (over?.status !== col.id || over.index !== index) setOver({ status: col.id, index });
                  }}
                >
                  {over?.status === col.id && over.index === i && dragging && dragging !== t.id && <DropLine />}
                  <Card ws={ws} t={t} me={me} dragging={dragging === t.id} onDragStart={() => setDragging(t.id)} onDragEnd={() => (setDragging(null), setOver(null))} />
                </div>
              ))}
              {over?.status === col.id && over.index === cards.length && dragging && <DropLine />}
              {!cards.length && !dragging && <p style={{ padding: "8px 6px", fontSize: 13, color: "var(--faint)" }}>{col.id === "ready" ? "Ready for an agent to pick up." : "Nothing here."}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DropLine() {
  return <div style={{ height: 3, borderRadius: 2, background: "var(--primary)", margin: "2px 0" }} />;
}

export function Card({ ws, t, me, dragging, onDragStart, onDragEnd }: { ws: Workspace; t: Ticket; me: string; dragging?: boolean; onDragStart?: () => void; onDragEnd?: () => void }) {
  const steps = ws.steps.get(t.id);
  const openBlockers = ws.blockersOf(t.id).filter((b) => b.status !== "done");
  const parent = t.parent_id ? ws.byId.get(t.parent_id) : undefined;
  const kids = ws.childrenOf(t.id);
  const waiting = openBlockers.length > 0 && t.status !== "done";
  const needs = !!t.needs_human;
  const done = steps?.filter((s) => s.status === "done").length ?? 0;
  const now = steps?.find((s) => s.status === "now");
  const meta = needs
    ? t.needs_human
    : waiting
      ? `Waiting on ${openBlockers.map((b) => b.key).join(", ")}`
      : steps?.length
        ? `Step ${Math.min(done + 1, steps.length)} of ${steps.length}${now ? ` · ${now.label}` : ""}`
        : t.type === "epic" && kids.length
          ? `${kids.filter((k) => k.status === "done").length} of ${kids.length} done`
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
        padding: 12,
        borderRadius: 12,
        textDecoration: "none",
        color: "var(--text)",
        opacity: dragging ? 0.4 : 1,
        cursor: "grab",
        ...(needs
          ? { background: "var(--warn-bg)", border: "1px solid var(--warn-line)" }
          : { background: "var(--surface)", border: `1px ${waiting ? "dashed" : "solid"} var(--line)` }),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PriorityIcon priority={t.priority} size={13} />
        <KeyText t={t} />
        <span style={{ marginLeft: "auto", fontSize: 12, color: needs ? "var(--warn)" : statusColor[t.status] }}>{needs ? "Needs you" : statusLabel(t.status)}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{t.title}</span>
      {steps && steps.length > 0 && <StepProgress steps={steps} />}
      {meta && <span style={{ fontSize: 12, color: needs ? "var(--warn)" : "var(--muted)" }}>{meta}</span>}
      {(t.labels.length > 0 || parent || t.type !== "task") && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {t.type !== "task" && <span style={{ fontSize: 11, color: typeTone[t.type] }}>{t.type[0].toUpperCase() + t.type.slice(1)}</span>}
          {parent && <Label>{parent.key} · {parent.title.length > 18 ? parent.title.slice(0, 17) + "…" : parent.title}</Label>}
          {t.labels.slice(0, 3).map((l) => (
            <Label key={l}>{l}</Label>
          ))}
        </div>
      )}
      <Who ws={ws} id={t.assignee_id} size={20} you={me} />
    </a>
  );
}
