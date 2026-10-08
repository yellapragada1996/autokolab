import { useMemo, useState } from "react";
import { PRIORITIES, STATUSES, statusLabel, type Ticket } from "../lib/data";
import { onNav } from "../lib/router";
import { Button } from "../ui";
import { applyFilter, Filters, type Filter } from "./Board";
import { ago, KeyText, Label, PriorityIcon, StatusIcon, statusColor, TypeTag, Who } from "./bits";
import type { Workspace } from "./useWorkspace";

// Every ticket as a sortable table, for when the board gets busy (like Jira's backlog).

type SortKey = "key" | "title" | "status" | "priority" | "assignee" | "updated";
const statusRank = Object.fromEntries([...STATUSES.map((s, i) => [s.id, i]), ["canceled", 9]]);
const priorityRank = Object.fromEntries(PRIORITIES.map((p, i) => [p.id, i]));

export function ListView({ ws, me, onNew }: { ws: Workspace; me: string; onNew: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [showDone, setShowDone] = useState(false);

  const rows = useMemo(() => {
    const r = applyFilter(ws, me, filter, query, assignee).filter((t) => showDone || t.status !== "done");
    const val = (t: Ticket): string | number => {
      switch (sort.key) {
        case "key":
          return t.number;
        case "title":
          return t.title.toLowerCase();
        case "status":
          return statusRank[t.status] * 1e6 + priorityRank[t.priority];
        case "priority":
          return priorityRank[t.priority];
        case "assignee":
          return ws.nameOf(t.assignee_id).toLowerCase();
        case "updated":
          return -Date.parse(t.updated_at);
      }
    };
    return [...r].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [ws, me, filter, query, assignee, sort, showDone]);

  const th = (key: SortKey, label: string, width?: number | string) => (
    <th style={{ textAlign: "left", fontWeight: 500, fontSize: 12, color: "var(--faint)", padding: "10px 12px", width, whiteSpace: "nowrap" }}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}
        style={{ border: 0, background: "none", padding: 0, cursor: "pointer", color: sort.key === key ? "var(--text)" : "inherit", font: "inherit" }}
      >
        {label} {sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : ""}
      </button>
    </th>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Filters ws={ws} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} assignee={assignee} setAssignee={setAssignee} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done
          </label>
          <Button variant="primary" onClick={onNew}>
            New ticket
          </Button>
        </div>
      </div>
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--line-soft)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead style={{ background: "var(--sidebar)" }}>
            <tr>
              <th style={{ width: 28 }} />
              {th("key", "Key", 90)}
              {th("title", "Title")}
              {th("status", "Status", 130)}
              {th("assignee", "Assignee", 190)}
              {th("updated", "Updated", 100)}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td style={{ padding: "0 0 0 12px" }}>
                  <PriorityIcon priority={t.priority} />
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <KeyText t={t} />
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <a href={`/p/${ws.project.slug}/t/${t.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: t.key })} style={{ color: "var(--text)", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
                    {t.title}
                  </a>
                  <span style={{ display: "inline-flex", gap: 6, marginLeft: 8, verticalAlign: "middle" }}>
                    {t.type !== "task" && <TypeTag type={t.type} />}
                    {t.needs_human && <span style={{ fontSize: 12, color: "var(--warn)" }}>Needs you</span>}
                    {t.labels.slice(0, 2).map((l) => (
                      <Label key={l}>{l}</Label>
                    ))}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: statusColor[t.status] }}>
                    <StatusIcon status={t.status} />
                    {statusLabel(t.status)}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <Who ws={ws} id={t.assignee_id} size={20} you={me} />
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--faint)" }}>{ago(t.updated_at)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 14 }}>
                  No tickets match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
