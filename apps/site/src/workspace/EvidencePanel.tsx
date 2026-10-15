import { useFullTicket } from "./useFullTicket";
import { Fragment, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { href, onNav, openShow, showHref, type ShowPart } from "../lib/router";
import { evidence, type EvidenceKind, type EvidenceRow } from "./evidence";
import type { Ticket } from "../lib/data";
import type { Workspace } from "./useWorkspace";

// The evidence behind a decision card ("How do you know?", autokolab-ux-handoff/screens/S02-evidence.md
// Part A). The rows come from evidence.ts; this file only draws them.

/** A link to the Show-the-work sheet: a real address for new tabs, the sheet in place for a plain click. */
export function SheetLink({ ticketKey, part = "summary", children, style }: { ticketKey: string; part?: ShowPart; children: ReactNode; style?: CSSProperties }) {
  const open = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openShow(ticketKey, part);
  };
  return (
    <a href={showHref(ticketKey, part)} onClick={open} style={style}>
      {children}
    </a>
  );
}

export function EvidencePanel({ ws, ticket, id }: { ws: Workspace; ticket: Ticket; id?: string }) {
  const full = useFullTicket(ticket, !!ws.demoDetails);
  if (full.error && full.loading) return <p role="alert">{full.error}</p>;
  if (full.loading) return <p>Loading the evidence…</p>;
  const rows = evidence(ws, full.ticket!);
  return (
    <div id={id} className="ak-enter" style={{ borderRadius: "var(--radius-lg)", background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", minWidth: 0, overflow: "hidden" }}>
      {full.error && <p role="alert">{full.error}</p>}
      <ul aria-label={`How I know about ${ticket.key}`} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((r, i) => (
          <li key={r.kind} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderTop: i ? "1px solid var(--border-subtle)" : 0, minWidth: 0, flexWrap: "wrap" }}>
            <Icon row={r} />
            <span style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14, color: "var(--text)", overflowWrap: "anywhere" }}>
                <Main ws={ws} row={r} />
              </span>
              {r.sub && <span style={{ fontSize: 13, color: "var(--text-muted)", overflowWrap: "anywhere" }}>{r.sub}</span>}
            </span>
            {r.action && (
              <SheetLink ticketKey={ticket.key} part={r.action.part} style={{ ...action, marginLeft: "auto" }}>
                {r.action.label}
              </SheetLink>
            )}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px", borderTop: "1px solid var(--border-subtle)" }}>
        <SheetLink ticketKey={ticket.key} style={action}>
          Show the work
        </SheetLink>
      </div>
    </div>
  );
}

/** The main line, with each decision key a link to Decisions. */
function Main({ ws, row }: { ws: Workspace; row: EvidenceRow }) {
  if (!row.decisions?.length) return <>{row.text}</>;
  const to = { view: "decisions", project: ws.project.slug } as const;
  const keys = row.decisions;
  return (
    <>
      Follows{" "}
      {keys.map((k, i) => (
        <Fragment key={k}>
          {i > 0 && (i === keys.length - 1 ? " and " : ", ")}
          <a href={href(to)} onClick={onNav(to)} className="mono" style={{ fontSize: 13 }}>
            {k}
          </a>
        </Fragment>
      ))}
    </>
  );
}

const TICK = <path d="M5 12.5l4.5 4.5L19 7.5" />;
const CROSS = <path d="M6 6l12 12M18 6L6 18" />;
const CLOCK = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);

const PATHS: Record<EvidenceKind, ReactNode> = {
  tests: TICK,
  review: TICK,
  change: <path d="M4 7h16M4 12h10M4 17h13" />,
  decisions: <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" />,
  trail: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h6a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h6" />
    </>
  ),
  less_sure: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" />
    </>
  ),
};

function Icon({ row }: { row: EvidenceRow }) {
  // Colour only means status: the review and the tests are verified facts, so they carry one
  // (tests: green passed, coral failed, blue still running); the rest stay neutral.
  const tone = row.tone ?? (row.kind === "review" ? "green" : null);
  const path = row.kind === "tests" && tone === "coral" ? CROSS : row.kind === "tests" && tone === "blue" ? CLOCK : PATHS[row.kind];
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: 2, color: tone ? `var(--${tone})` : "var(--text-dim)" }}>
      {path}
    </svg>
  );
}

const action: CSSProperties = { fontSize: 13, whiteSpace: "nowrap", textDecoration: "none" };
