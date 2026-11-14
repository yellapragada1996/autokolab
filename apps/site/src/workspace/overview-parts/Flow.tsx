import { useState, type CSSProperties, type ReactNode } from "react";
import { go, href } from "../../lib/router";
import { offerCaptainDraft } from "../captainDraft";
import type { DayLanes, LaneKind, OverviewAgent, Spend, StuckRow, WaitRow } from "../glance";
import { MAX_WAITS } from "../glance";
import { OverviewLink } from "./Link";

// The Overview's "flow" sections, drawn as the wireframe has them: white cards with a serif title.
// Every number comes from glance.ts; this file only draws.

const card: CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-sm)" };
const head: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 12px", padding: "16px 22px", borderBottom: "1px solid var(--border)" };
const h2: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 600 };
const th: CSSProperties = { fontWeight: 500, padding: "12px 8px", textAlign: "left" };
const youPill: CSSProperties = { fontSize: 13, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "var(--amber-bg)", color: "var(--amber)" };
const btn: CSSProperties = { minHeight: 44, padding: "0 18px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", font: "inherit", fontWeight: 500, cursor: "pointer" };

function Card({ title, note, label, children }: { title: string; note?: ReactNode; label: string; children: ReactNode }) {
  return <section aria-label={label} style={card}>
    <div style={head}><h2 style={h2}>{title}</h2>{note && <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>{note}</span>}</div>
    {children}
  </section>;
}

/** An agent that stopped responding while it had a ticket under way: one calm line and two ways on. */
export function NotResponding({ agent, slug, projectId }: { agent: OverviewAgent | undefined; slug: string; projectId: string }) {
  const [waited, setWaited] = useState<string | null>(null);
  if (!agent || waited === agent.id) return null;
  const what = agent.key ? ` while building ${agent.key}` : "";
  return <section aria-label="Agent not responding" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", padding: "16px 20px", background: "var(--coral-bg)", border: "1px solid var(--coral-border)", borderRadius: 12 }}>
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <span style={{ fontWeight: 600, color: "var(--coral-text)" }}>{agent.name} stopped responding {agent.word.replace(/^Offline · /, "")} ago</span>
      <span style={{ color: "var(--text-secondary)" }}>{what}. It picks up where it stopped when its computer is back.</span>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button type="button" style={btn} onClick={() => setWaited(agent.id)}>Wait</button>
      <button type="button" style={{ ...btn, background: "var(--text)", color: "var(--bg)", borderColor: "var(--text)", fontWeight: 600 }} onClick={() => {
        offerCaptainDraft(projectId, `Give ${agent.key ?? `${agent.name}'s tickets`} to another agent: ${agent.name} isn't responding.`);
        go({ view: "captain", project: slug });
      }}>Give {agent.key ?? "its tickets"} to another agent</button>
    </div>
  </section>;
}

export function WaitingTable({ rows, slug }: { rows: WaitRow[]; slug: string }) {
  if (!rows.length) return null;
  const shown = rows.slice(0, MAX_WAITS);
  const td: CSSProperties = { padding: "14px 8px" };
  return <Card title="Who is waiting on whom" label="Waiting on">
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 14 }}>
        <thead><tr style={{ fontSize: 13, color: "var(--text-muted)" }}>
          <th scope="col" style={{ ...th, paddingLeft: 22 }}>Waiting</th><th scope="col" style={th}>On</th><th scope="col" style={th}>Because</th><th scope="col" style={{ ...th, paddingRight: 22, textAlign: "right" }}>For</th>
        </tr></thead>
        <tbody>{shown.map(r => {
          const to = r.you ? `${href({ view: "captain", project: slug })}#${encodeURIComponent(`need-${r.you}`)}` : r.ticketKey ? href({ view: "ticket", project: slug, key: r.ticketKey }) : null;
          return <tr key={r.key} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ ...td, paddingLeft: 22, fontWeight: 600 }}>{to ? <OverviewLink to={to}>{r.who}</OverviewLink> : r.who}</td>
            <td style={td}>{r.you ? <span style={youPill}>You</span> : r.on}</td>
            <td style={td}>{r.why}</td>
            <td style={{ ...td, paddingRight: 22, textAlign: "right", fontWeight: r.you ? 600 : 400, whiteSpace: "nowrap" }}>{r.age}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {rows.length > shown.length && <p style={{ margin: 0, padding: "12px 22px", borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--text-muted)" }}>and {rows.length - shown.length} more on Work</p>}
  </Card>;
}

export function TakingLonger({ rows, slug }: { rows: StuckRow[]; slug: string }) {
  if (!rows.length) return null;
  return <Card title="Taking longer than usual" label="Stuck">
    <div style={{ display: "flex", flexDirection: "column" }}>{rows.map((r, i) =>
      <div key={r.key} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", padding: "14px 22px", borderTop: i ? "1px solid var(--border)" : 0 }}>
        <span style={{ flex: "1 1 240px", fontWeight: 600 }}><OverviewLink to={{ view: "ticket", project: slug, key: r.key }}>{r.key} · {r.title}</OverviewLink></span>
        <span style={{ flex: "1 1 200px", color: "var(--text-secondary)" }}>{r.text}</span>
        {r.tag && <span style={{ fontSize: 13, fontWeight: 600, padding: "3px 10px", borderRadius: 999, ...(r.tone === "problem" ? { background: "var(--coral-bg)", color: "var(--coral-text)" } : { background: "var(--surface-sunken)", color: "var(--text-secondary)" }) }}>{r.tag}</span>}
      </div>)}</div>
  </Card>;
}

const BUILD = "#1E4D40", REVIEW = "#B9C8F2", TALK = "#E9B95A";
const LANE: Record<LaneKind, CSSProperties> = {
  build: { background: BUILD, color: "#FFFFFF" },
  review: { background: REVIEW },
  talk: { background: TALK },
  waiting: { background: "var(--amber-bg)", border: "1px solid var(--amber-border)", color: "var(--amber)", boxSizing: "border-box" },
  offline: { border: "1px dashed var(--coral)", color: "var(--coral-text)", boxSizing: "border-box" },
};
const LEGEND: [LaneKind, string][] = [["build", "Building"], ["review", "Reviewing"], ["talk", "Talking"], ["waiting", "Waiting"], ["offline", "Offline"]];

export function Lanes({ day }: { day: DayLanes | null }) {
  if (!day) return null;
  const total = day.to - day.from;
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / total) * 100))}%`;
  return <Card title="Today, by agent" label="Today, by agent">
    <div style={{ padding: "20px 22px", overflowX: "auto" }}>
      <div style={{ minWidth: 620, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, fontSize: 13, color: "var(--text-muted)" }}><span style={{ width: 96, flex: "none" }} /><span style={{ flex: 1, display: "flex", justifyContent: "space-between" }}>{day.hours.map((h, i) => <span key={i}>{h}</span>)}</span></div>
        {day.lanes.map(l => <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 96, flex: "none", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
          <span role="img" aria-label={l.said} style={{ flex: 1, position: "relative", height: 26 }}>
            {l.blocks.map((b, i) => <span key={i} style={{ position: "absolute", top: 0, bottom: 0, left: pct(b.from - day.from), width: pct(b.to - b.from), minWidth: 4, borderRadius: 4, fontSize: 11, display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden", whiteSpace: "nowrap", boxSizing: "border-box", ...LANE[b.kind] }}>{b.label}</span>)}
          </span>
        </div>)}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 13, color: "var(--text-secondary)", paddingLeft: 108 }}>
          {LEGEND.map(([k, word]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, ...LANE[k] }} />{word}</span>)}
        </div>
      </div>
    </div>
  </Card>;
}

export function SpendToday({ spend }: { spend: Spend | null }) {
  if (!spend) return null;
  const part = (n: number) => `${(n / spend.max) * 100}%`;
  return <Card title="Spend today" note={spend.sentence} label="Spend today">
    <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
      {spend.rows.map(r => <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 96, flex: "none", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
        <span role="img" aria-label={`${r.name}: building ${Math.round(r.build / 1000)}k, reviewing ${Math.round(r.review / 1000)}k, talking ${Math.round(r.talk / 1000)}k tokens`} style={{ flex: 1, display: "flex", height: 14, gap: 2 }}>
          {r.build > 0 && <span style={{ width: part(r.build), background: BUILD, borderRadius: 3 }} />}
          {r.review > 0 && <span style={{ width: part(r.review), background: REVIEW, borderRadius: 3 }} />}
          {r.talk > 0 && <span style={{ width: part(r.talk), background: TALK, borderRadius: 3 }} />}
        </span>
        <span style={{ width: 72, flex: "none", textAlign: "right", fontWeight: 600 }}>{r.cost == null ? "—" : `$${r.cost.toFixed(2)}`}</span>
      </div>)}
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Amounts are what each tool reports. Subscription agents show an estimate, and local models report none.</div>
    </div>
  </Card>;
}
