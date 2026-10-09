import { useMemo, useState } from "react";
import { createTicket, STATUSES, updateTicket, type Status, type Ticket } from "../lib/data";
import { onNav } from "../lib/router";
import { Button } from "../ui";
import { applyFilter, emptyFilter, Filters, WhoMark, type FilterState } from "./Board";
import { EpicLozenge, KeyText, PriorityIcon, StatusLozenge, TypeIcon } from "./bits";
import type { Workspace } from "./useWorkspace";

// Jira's Kanban backlog: what's on the board at the top, the ranked backlog below. Drag to rank,
// drag up to put work on the board, create issues inline.

const ON_BOARD: Status[] = ["ready", "in_progress", "review"];

export function Backlog({ ws, me, onNew }: { ws: Workspace; me: string; onNew: () => void }) {
  const [f, setF] = useState<FilterState>(emptyFilter);
  const [epic, setEpic] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ section: "board" | "backlog"; index: number } | null>(null);
  const [err, setErr] = useState("");

  const rows = useMemo(() => applyFilter(ws, me, f).filter((t) => t.type !== "epic" && (!epic || t.parent_id === epic)), [ws, me, f, epic]);
  const board = rows.filter((t) => ON_BOARD.includes(t.status)).sort((a, b) => ON_BOARD.indexOf(a.status) - ON_BOARD.indexOf(b.status) || a.sort_order - b.sort_order);
  const backlog = rows.filter((t) => t.status === "backlog").sort((a, b) => a.sort_order - b.sort_order);
  const epics = ws.tickets.filter((t) => t.type === "epic" && t.status !== "canceled");

  const save = async (id: string, patch: Parameters<typeof updateTicket>[1]) => {
    try {
      setErr("");
      await updateTicket(id, patch);
      await ws.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const drop = async (section: "board" | "backlog", index: number) => {
    const t = dragging ? ws.byId.get(dragging) : undefined;
    setDragging(null);
    setOver(null);
    if (!t) return;
    const list = (section === "board" ? board : backlog).filter((x) => x.id !== t.id);
    const before = list[index - 1]?.sort_order;
    const after = list[index]?.sort_order;
    const sort_order = before === undefined ? (after === undefined ? t.sort_order : after - 1) : after === undefined ? before + 1 : (before + after) / 2;
    const status: Status = section === "backlog" ? "backlog" : ON_BOARD.includes(t.status) ? t.status : "ready";
    if (status === t.status && sort_order === t.sort_order) return;
    await save(t.id, { status, sort_order });
  };

  const section = (id: "board" | "backlog", title: string, sub: string, list: Ticket[]) => (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        if (over?.section !== id) setOver({ section: id, index: list.length });
      }}
      onDrop={(e) => {
        e.preventDefault();
        void drop(id, over?.section === id ? over.index : list.length);
      }}
      style={{ borderRadius: 10, background: "var(--sidebar)", border: `1px solid ${over?.section === id ? "var(--line-strong)" : "var(--line-soft)"}`, padding: 8 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 8px 10px", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h2>
        <span style={{ fontSize: 13, color: "var(--faint)" }}>
          {list.length} issue{list.length === 1 ? "" : "s"} · {sub}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 6, overflow: "hidden" }}>
        {list.map((t, i) => (
          <div
            key={t.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              const index = e.clientY < r.top + r.height / 2 ? i : i + 1;
              if (over?.section !== id || over.index !== index) setOver({ section: id, index });
            }}
          >
            {over?.section === id && over.index === i && dragging && dragging !== t.id && <div style={{ height: 2, background: "var(--primary)" }} />}
            <Row ws={ws} t={t} me={me} dragging={dragging === t.id} onDragStart={() => setDragging(t.id)} onDragEnd={() => (setDragging(null), setOver(null))} onStatus={(status) => void save(t.id, { status })} />
          </div>
        ))}
        {over?.section === id && over.index === list.length && dragging && <div style={{ height: 2, background: "var(--primary)" }} />}
        {!list.length && <div style={{ padding: "14px 10px", fontSize: 13, color: "var(--faint)" }}>{id === "board" ? "Nothing on the board. Drag issues up from the backlog." : "The backlog is empty."}</div>}
      </div>
      {id === "backlog" && <InlineCreate ws={ws} />}
    </section>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Filters ws={ws} me={me} f={f} setF={setF} />
          {epics.length > 0 && (
            <select aria-label="Epic" value={epic} onChange={(e) => setEpic(e.target.value)} style={{ height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13 }}>
              <option value="">All epics</option>
              {epics.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.key} · {e.title}
                </option>
              ))}
            </select>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={onNew}>
          Create <kbd style={{ font: "500 11px var(--mono)", opacity: 0.7 }}>C</kbd>
        </Button>
      </div>
      {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}
      {section("board", "Board", "Ready, In progress and In review", board)}
      {section("backlog", "Backlog", "ranked; drag to reorder, drag up to start", backlog)}
    </div>
  );
}

function Row({ ws, t, me, dragging, onDragStart, onDragEnd, onStatus }: { ws: Workspace; t: Ticket; me: string; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onStatus: (s: Status) => void }) {
  const parent = t.parent_id ? ws.byId.get(t.parent_id) : undefined;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.key);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 40, padding: "6px 10px", background: "var(--surface)", opacity: dragging ? 0.4 : 1, cursor: "grab" }}
    >
      <TypeIcon type={t.type} />
      <KeyText t={t} style={{ width: 64, flex: "none" }} />
      <a href={`/p/${ws.project.slug}/t/${t.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: t.key })} style={{ flex: 1, minWidth: 0, color: "var(--text)", textDecoration: "none", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t.title}
      </a>
      {parent && <EpicLozenge epic={parent} />}
      <label style={{ position: "relative", display: "inline-flex", cursor: "pointer" }} title="Change status">
        <StatusLozenge status={t.status} needs={!!t.needs_human} />
        <select aria-label={`Status of ${t.key}`} value={t.status} onChange={(e) => onStatus(e.target.value as Status)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
          {[...STATUSES, { id: "canceled" as const, label: "Canceled" }].map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <PriorityIcon priority={t.priority} />
      <WhoMark ws={ws} id={t.assignee_id} me={me} />
    </div>
  );
}

function InlineCreate({ ws }: { ws: Workspace }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const create = async () => {
    if (!title.trim()) return setOpen(false);
    try {
      setErr("");
      await createTicket(ws.project.id, { title: title.trim(), status: "backlog" });
      setTitle("");
      await ws.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ marginTop: 6, width: "100%", padding: "8px 10px", border: 0, borderRadius: 6, background: "transparent", color: "var(--muted)", fontSize: 13, textAlign: "left", cursor: "pointer" }}>
        + Create issue
      </button>
    );
  }
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void create();
          if (e.key === "Escape") (setTitle(""), setOpen(false));
        }}
        onBlur={() => !title.trim() && setOpen(false)}
        placeholder="What needs to be done? Enter to create"
        aria-label="New issue title"
        style={{ height: 38, padding: "0 10px", borderRadius: 6, border: "1px solid var(--primary)", background: "var(--bg)", fontSize: 14 }}
      />
      {err && <span style={{ fontSize: 13, color: "var(--danger)" }}>{err}</span>}
    </div>
  );
}
