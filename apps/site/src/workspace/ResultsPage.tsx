import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import * as data from "../lib/data";
import type { TicketEvent } from "../lib/data";
import { Button, Skeleton } from "../ui";
import { Who } from "./bits";
import { auditCsv, auditFileName, auditJson, auditRows, barsText, checkedText, duration, emptyText, headline, periodLine, periodOf, rangeOf, results, sentBackCaption, type Period, type Results as Numbers } from "./results";
import type { Workspace } from "./useWorkspace";

// Results (S15): what the team got done in the period and how often it needed a person, counted from
// the record, and the audit export. No baseline and no comparison (00-AMENDMENTS.md).

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "4weeks", label: "Last 4 weeks" },
];

// How each number is counted: the tile's tooltip, and the list at the foot of the page.
const HOW = {
  merged: "Tickets that moved to Done in this period and have a pull request. Reviewed means someone other than the builder approved the commit; tested means the automatic tests passed on that commit.",
  time: "The middle value of the time from when work started on a ticket to when it was done, over the tickets merged in this period.",
  asked: "Each time a ticket's Needs you was set in this period: for an OK on a risky merge, a question, or a problem. Questions Captain asked in chat aren't counted.",
  sentBack: "Tickets that went from Review back to In progress, or were reopened after Done, in this period. Each ticket counts once.",
};

const card: CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-xl)", padding: 20, minWidth: 0 };
const heading: CSSProperties = { fontSize: 16, fontWeight: 600 };

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function Results({ ws, at }: { ws: Workspace; /** Tests only: the moment the page was opened. */ at?: Date }) {
  const [period, setPeriod] = useState<Period>(() => periodOf(location.search));
  // The period ends when the page was opened, so the numbers don't shift while someone reads them.
  const [now] = useState(() => at ?? new Date());
  const [events, setEvents] = useState<TicketEvent[] | null>(ws.demoEvents ?? null);
  const [error, setError] = useState("");

  // Four weeks of events cover both periods.
  useEffect(() => {
    if (ws.demoEvents) return;
    let live = true;
    setEvents(null);
    setError("");
    data
      .eventsBetween(ws.project.id, rangeOf("4weeks", now).from, now)
      .then((rows) => live && setEvents(rows))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [ws.project.id, ws.demoEvents, now]);

  const choose = (p: Period) => {
    setPeriod(p);
    const q = new URLSearchParams(location.search);
    if (p === "week") q.delete("period");
    else q.set("period", p);
    const search = q.toString();
    history.replaceState(history.state, "", `${location.pathname}${search ? `?${search}` : ""}${location.hash}`);
  };

  const r = useMemo(() => (events ? results(ws, events, period, now) : null), [ws, events, period, now]);
  const range = rangeOf(period, now);

  const exportAs = (ext: "csv" | "json") => {
    if (!events) return;
    const rows = auditRows(ws, events, range);
    if (ext === "csv") download(auditFileName(ws.project.slug, range, "csv"), "text/csv;charset=utf-8", auditCsv(rows));
    else download(auditFileName(ws.project.slug, range, "json"), "application/json", auditJson(ws, rows, range));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1180, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div role="group" aria-label="Period" style={{ display: "inline-flex", padding: 3, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--line)" }}>
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className="ak-tap" aria-pressed={period === p.id} onClick={() => choose(p.id)} style={{ height: 30, padding: "0 12px", border: 0, borderRadius: 7, fontSize: 13, cursor: "pointer", background: period === p.id ? "var(--surface-raised)" : "transparent", color: period === p.id ? "var(--text)" : "var(--muted)" }}>
              {p.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Export audit report" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Export audit report</span>
          <Button size="sm" className="ak-tap" disabled={!events} onClick={() => exportAs("csv")} title="Every ticket event and decision in this period, as a spreadsheet">
            CSV
          </Button>
          <Button size="sm" className="ak-tap" disabled={!events} onClick={() => exportAs("json")} title="Every ticket event and decision in this period, as JSON">
            JSON
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>{periodLine(range)}</p>
        {error ? (
          <p role="alert" style={{ fontSize: 14, color: "var(--danger)" }}>
            Couldn't read the project's history: {error}
          </p>
        ) : !r ? (
          <Skeleton lines={3} />
        ) : (
          <h2 style={{ fontSize: "clamp(22px, 3.2vw, 36px)", lineHeight: 1.2, fontWeight: 500, letterSpacing: "var(--tracking-tight)", maxWidth: 900 }}>{r.merged.length ? headline(r) : emptyText(r)}</h2>
        )}
      </div>

      {r && r.merged.length > 0 && <Body ws={ws} r={r} />}
    </div>
  );
}

function Body({ ws, r }: { ws: Workspace; r: Numbers }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Tile label="Merged" value={r.merged.length} caption={checkedText(r)} how={HOW.merged} />
        {r.medianMs !== null && <Tile label="Time to merge" value={duration(r.medianMs)} caption="median, start to done" how={HOW.time} />}
        <Tile label="Times you were asked" value={r.asked.total} caption="a ticket needed a person" how={HOW.asked} />
        <Tile label="Sent back" value={r.sentBack.total} caption={sentBackCaption(r)} how={HOW.sentBack} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
        <section style={{ ...card, flex: "2 1 420px", display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={heading}>Merged tickets</h3>
          <Bars r={r} />
        </section>
        {r.asked.total > 0 && (
          <section style={{ ...card, flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={heading}>Where you were asked</h3>
            <Asked r={r} />
          </section>
        )}
      </div>

      {r.agents.length > 0 && (
        <section style={{ ...card, padding: 0 }}>
          <h3 style={{ ...heading, padding: "16px 20px" }}>By agent</h3>
          <Agents ws={ws} r={r} />
        </section>
      )}

      <details style={{ fontSize: 13, color: "var(--muted)" }}>
        <summary style={{ cursor: "pointer" }}>How these are counted</summary>
        <dl style={{ display: "grid", gap: 8, margin: "12px 0 0", lineHeight: 1.5, maxWidth: 720 }}>
          {(
            [
              ["Merged", HOW.merged],
              ["Time to merge", HOW.time],
              ["Times you were asked", HOW.asked],
              ["Sent back", HOW.sentBack],
            ] as const
          ).map(([name, how]) => (
            <div key={name}>
              <dt style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{name}</dt>
              <dd style={{ margin: 0 }}>{how}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}

function Tile({ label, value, caption, how }: { label: string; value: ReactNode; caption: string; how: string }) {
  return (
    <div title={how} style={{ ...card, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 500, letterSpacing: "var(--tracking-tight)" }}>{value}</span>
      <span style={{ fontSize: 13, color: "var(--faint)" }}>{caption}</span>
    </div>
  );
}

/** Merged tickets per day or per week. Read out as one sentence that lists every value. */
function Bars({ r }: { r: Numbers }) {
  const max = Math.max(1, ...r.bars.map((b) => b.count));
  return (
    <div role="img" aria-label={barsText(r)} style={{ display: "flex", alignItems: "stretch", gap: "clamp(4px, 2%, 24px)", height: 220 }}>
      {r.bars.map((b) => (
        <div key={b.name} aria-hidden="true" title={`${b.name}: ${b.count} merged`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, width: "100%", maxWidth: 72, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 6, borderBottom: "1px solid var(--line)" }}>
            <span style={{ font: "12px var(--font-mono)", color: "var(--text-secondary)" }}>{b.count}</span>
            <div style={{ width: "100%", height: `${(b.count / max) * 82}%`, background: "var(--green)", borderRadius: "6px 6px 2px 2px" }} />
          </div>
          <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function Asked({ r }: { r: Numbers }) {
  const max = Math.max(...r.asked.kinds.map((k) => k.count));
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
      {r.asked.kinds.map((k) => (
        <li key={k.kind} style={{ display: "grid", gap: 6 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
            {k.label}
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{k.count}</span>
          </span>
          <span aria-hidden="true" style={{ height: 6, borderRadius: 999, background: "var(--track)" }}>
            <span style={{ display: "block", height: "100%", width: `${(k.count / max) * 100}%`, borderRadius: 999, background: "var(--amber)" }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Agents({ ws, r }: { ws: Workspace; r: Numbers }) {
  const th: CSSProperties = { textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--muted)", padding: "10px 8px", verticalAlign: "bottom" };
  const td: CSSProperties = { fontSize: 14, padding: "12px 8px", borderTop: "1px solid var(--line-soft)", verticalAlign: "middle" };
  const edge = { paddingLeft: 20 };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th scope="col" style={{ ...th, ...edge, width: "40%" }}>
            Agent
          </th>
          <th scope="col" style={th} title={HOW.merged}>
            Merged
          </th>
          <th scope="col" style={th} title={HOW.time}>
            Time to merge
          </th>
          <th scope="col" style={{ ...th, paddingRight: 20 }} title={HOW.sentBack}>
            Sent back
          </th>
        </tr>
      </thead>
      <tbody>
        {r.agents.map((a) => (
          <tr key={a.id}>
            <th scope="row" style={{ ...td, ...edge, fontWeight: 400, textAlign: "left", overflow: "hidden" }}>
              <Who ws={ws} id={a.id} />
            </th>
            {a.captain ? (
              <td style={{ ...td, color: "var(--text-secondary)" }} title="Approvals Captain gave in this period">
                {a.approvals} approved
              </td>
            ) : (
              <td style={td}>{a.merged}</td>
            )}
            <td style={td}>{a.captain || a.medianMs === null ? <Dash /> : duration(a.medianMs)}</td>
            <td style={{ ...td, paddingRight: 20 }}>{a.captain ? <Dash /> : a.sentBack}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Dash = () => (
  <span style={{ color: "var(--faint)" }}>
    <span aria-hidden="true">—</span>
    <span className="sr-only">Not counted</span>
  </span>
);
