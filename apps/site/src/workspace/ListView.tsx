import { useMemo, useState } from "react";
import { PRIORITIES, STATUSES, type Ticket } from "../lib/data";
import { onNav } from "../lib/router";
import { Button } from "../ui";
import { applyFilter, emptyFilter, Filters, type FilterState } from "./Board";
import { ago, EpicLozenge, KeyText, Label, PriorityIcon, StatusLozenge, TypeIcon, Who } from "./bits";
import type { Workspace } from "./useWorkspace";

// Every ticket as a sortable table, for when the board gets busy (like Jira's backlog).

type SortKey = "key" | "title" | "status" | "priority" | "assignee" | "updated";
const statusRank = Object.fromEntries([...STATUSES.map((s, i) => [s.id, i]), ["canceled", 9]]);
const priorityRank = Object.fromEntries(PRIORITIES.map((p, i) => [p.id, i]));

export function ListView({ ws, me, onNew }: { ws: Workspace; me: string; onNew: () => void }) {
  const [f, setF] = useState<FilterState>(emptyFilter);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [showDone, setShowDone] = useState(false);

  const rows = useMemo(() => {
    const r = applyFilter(ws, me, f).filter((t) => showDone || t.status !== "done");
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
  }, [ws, me, f, sort, showDone]);

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
        <Filters ws={ws} me={me} f={f} setF={setF} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done
          </label>
          <Button variant="primary" onClick={onNew}>
            Create
          </Button>
        </div>
      </div>
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--line-soft)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead style={{ background: "var(--sidebar)" }}>
            <tr>
              <th style={{ width: 28 }} />
              <th style={{ width: 28 }} />
              {th("key", "Key", 90)}
              {th("title", "Title")}
              {th("status", "Status", 130)}
              {th("priority", "P", 40)}
              {th("assignee", "Assignee", 190)}
              {th("updated", "Updated", 100)}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td style={{ padding: "0 0 0 12px" }}>
                  <TypeIcon type={t.type} />
                </td>
                <td />
                <td style={{ padding: "10px 12px" }}>
                  <KeyText t={t} />
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <a href={`/p/${ws.project.slug}/t/${t.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: t.key })} style={{ color: "var(--text)", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
                    {t.title}
                  </a>
                  <span style={{ display: "inline-flex", gap: 6, marginLeft: 8, verticalAlign: "middle" }}>
                    {t.parent_id && ws.byId.get(t.parent_id) && <EpicLozenge epic={ws.byId.get(t.parent_id)!} />}
                    {t.labels.slice(0, 2).map((l) => (
                      <Label key={l}>{l}</Label>
                    ))}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <StatusLozenge status={t.status} needs={!!t.needs_human} />
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <PriorityIcon priority={t.priority} />
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <Who ws={ws} id={t.assignee_id} size={20} you={me} />
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--faint)" }}>{ago(t.updated_at)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 14 }}>
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
