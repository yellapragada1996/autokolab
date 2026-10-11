import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { go, href, onNav, openShow, type Route } from "../lib/router";
import { Button } from "../ui";
import type { CatchUpItem } from "./captain";
import { overview, sinceItems, sinceLine, STATE_WORD, updatedText, youLine, type AgentRow, type Feature, type State, type Tone } from "./glance";
import type { CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";

// Overview (DEC-24, AK-75): for looking, not talking. What state the work is in, what each agent is
// doing, what needs you, what's new, and the features in Now · Next · Done. Every sentence comes
// from glance.ts; this file only draws. No ticket key is shown: keys are hover text at most.

const STATE_COLOR: Record<State, string> = { working: "var(--blue)", waiting: "var(--amber)", paused: "var(--coral)", idle: "var(--text-dim)" };
const TONE_COLOR: Record<Tone, string> = { live: "var(--blue)", needs: "var(--amber)", problem: "var(--coral)", quiet: "var(--text-dim)", done: "var(--green)" };
/** Finished features shown before "n earlier features". */
const DONE_SHOWN = 3;
/** Next is short at this many features or fewer: "After these, nothing is planned." */
const NEXT_SHORT = 2;

export function Overview({ ws, me, cr }: { ws: Workspace | null; me: string; cr: CaptainRoom }) {
  const [now, setNow] = useState(() => new Date());
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  useEffect(() => setLoadedAt(Date.now()), [ws]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  // The same catch-up as the Captain page, counted from the same last visit, worked out once per visit.
  const { startCatchUp } = cr;
  const roomReady = cr.room !== undefined && !!ws;
  useEffect(() => {
    if (roomReady) startCatchUp();
  }, [roomReady, startCatchUp]);

  const look = useMemo(() => (ws ? overview(ws, cr.needs, cr.plans, now) : null), [ws, cr.needs, cr.plans, now]);
  if (!ws || !look) return <Skeleton />;
  const slug = ws.project.slug;
  const captain: Route = { view: "captain", project: slug };
  const you = youLine(ws, cr.needs, cr.plans, now);
  const since = sinceLine(ws, cr.catchUp?.c ?? null);

  return (
    <div style={column}>
      {ws.tickets.length === 0 ? (
        <p style={{ fontSize: 17, lineHeight: 1.5, color: "var(--text-body)" }}>
          Nothing is being worked on yet.{" "}
          <a href={href(captain)} onClick={onNav(captain)}>
            Tell Captain what you'd like built.
          </a>
        </p>
      ) : (
        <section aria-label="Where we are" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--text-dim)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "3px 10px", borderRadius: 999, border: "1px solid var(--border-strong)", color: "var(--text)", fontWeight: 500 }}>
              <Dot color={STATE_COLOR[look.state]} />
              {STATE_WORD[look.state]}
            </span>
            <span>Live · {updatedText(loadedAt, now)}</span>
          </div>
          <p style={{ fontSize: "clamp(22px, 2.4vw + 12px, 26px)", fontWeight: 500, letterSpacing: "var(--tracking-tight)", lineHeight: 1.3, color: "var(--text)" }}>{look.headline}</p>
        </section>
      )}

      {look.rows.length > 0 && (
        <section aria-label="What each agent is doing">
          <ul style={list}>
            {look.rows.map((r) => (
              <li key={r.agentId}>
                <AgentLine row={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {you && (
        <section aria-label="Needs you" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--amber-border)" }}>
          <Dot color="var(--amber)" />
          <span style={{ flex: "1 1 240px", minWidth: 0, fontSize: 14, color: "var(--text-body)" }}>{you.text}</span>
          <Button
            size="sm"
            className="ak-tap"
            style={{ background: "var(--amber)", color: "var(--amber-ink)", border: 0 }}
            onClick={() => go(`${href(captain)}#need-${you.oldest.key}`, false, false)}
          >
            Answer
          </Button>
        </section>
      )}

      {since && cr.catchUp && <SinceYouLooked line={since} items={sinceItems(ws, cr.catchUp.c)} />}

      {ws.tickets.length > 0 && (
        <section aria-label="Features" className="ak-features">
          <FeatureColumn title="Now" empty="Nothing is being built right now.">
            {look.features.now.map((f) => (
              <FeatureCard key={f.id} f={f} />
            ))}
          </FeatureColumn>
          <FeatureColumn title="Next" empty="Nothing is planned." after={look.features.next.length > 0 && look.features.next.length <= NEXT_SHORT ? "After these, nothing is planned." : null}>
            {look.features.next.map((f) => (
              <FeatureCard key={f.id} f={f} />
            ))}
          </FeatureColumn>
          <DoneColumn features={look.features.done} />
        </section>
      )}

      <SetupChecklist ws={ws} me={me} />
    </div>
  );
}

// ------------------------------------------------------------------ agents

function AgentLine({ row }: { row: AgentRow }) {
  const color = row.kind === "stopped" ? "var(--coral)" : row.kind === "waiting" ? "var(--amber)" : "var(--blue)";
  return (
    <button type="button" onClick={() => openShow(row.key)} title="Show the work" className="ak-row" style={{ ...rowButton, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 10 }}>
      <Dot color={color} style={{ marginTop: 7 }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 15, color: "var(--text-body)", overflowWrap: "anywhere" }}>
          <strong style={{ fontWeight: 600, color: "var(--text)" }}>{row.name}</strong> {row.doing}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{row.detail}</span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ since you last looked

const ITEM_COLOR: Record<CatchUpItem["type"], string> = { shipped: "var(--green)", decided: "var(--text-dim)", problem: "var(--coral)" };

function SinceYouLooked({ line, items }: { line: string; items: CatchUpItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Since you last looked" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ fontSize: 14, color: "var(--text-body)" }}>
        {line}{" "}
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={linkButton}>
          {open ? "Hide" : "Show what happened"}
        </button>
      </p>
      {open && (
        <ul style={{ ...list, gap: 4 }}>
          {items.map((i, n) => (
            <li key={n} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 10, fontSize: 13, color: "var(--text-muted)" }}>
              <Dot color={ITEM_COLOR[i.type]} style={{ marginTop: 6 }} />
              <span style={{ overflowWrap: "anywhere" }}>{i.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ features

function FeatureColumn({ title, empty, after, children }: { title: string; empty: string; after?: string | null; children: ReactNode[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <h2 style={{ fontSize: 13, fontWeight: 500, color: "var(--text-dim)" }}>{title}</h2>
      {children.length ? children : <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{empty}</p>}
      {after && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{after}</p>}
    </div>
  );
}

function DoneColumn({ features }: { features: Feature[] }) {
  const [all, setAll] = useState(false);
  const earlier = features.length - DONE_SHOWN;
  const shown = all ? features : features.slice(0, DONE_SHOWN);
  return (
    <FeatureColumn title="Done" empty="Nothing finished yet.">
      {[
        ...shown.map((f) => <FeatureCard key={f.id} f={f} />),
        ...(earlier > 0
          ? [
              <button key="earlier" type="button" aria-expanded={all} onClick={() => setAll((a) => !a)} style={{ ...linkButton, alignSelf: "flex-start" }}>
                {all ? "Show fewer" : `${earlier} earlier ${earlier === 1 ? "feature" : "features"}`}
              </button>,
            ]
          : []),
      ]}
    </FeatureColumn>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  const [open, setOpen] = useState(false);
  const color = TONE_COLOR[f.tone];
  const share = f.total ? f.done / f.total : 0;
  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--border-subtle)", background: "var(--surface)", minWidth: 0 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ak-row" style={{ ...rowButton, width: "100%", margin: 0, padding: "12px 14px", borderRadius: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text)", overflowWrap: "anywhere" }}>{f.name}</span>
        {f.outcome && <span style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.45, overflowWrap: "anywhere" }}>{f.outcome}</span>}
        {f.column === "now" && (
          <span role="img" aria-label={f.count} title={f.count} style={{ display: "block", width: "100%", height: 4, borderRadius: 2, background: "var(--surface-raised)", overflow: "hidden", marginTop: 2 }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(4, Math.round(share * 100))}%`, background: color }} />
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: f.tone === "quiet" ? "var(--text-dim)" : f.tone === "done" ? "var(--text-muted)" : color }}>
          {f.column === "done" && (
            <span aria-hidden="true" style={{ color: "var(--green)", fontWeight: 700 }}>
              ✓
            </span>
          )}
          {f.status}
        </span>
      </button>
      {open && (
        <ul aria-label={`Parts of ${f.name}`} style={{ ...list, padding: "0 6px 8px", borderTop: "1px solid var(--border-subtle)" }}>
          {f.parts.length === 0 && <li style={{ padding: "8px", fontSize: 13, color: "var(--text-dim)" }}>No parts planned yet.</li>}
          {f.parts.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => openShow(p.key)} title={`${p.key} · Show the work`} className="ak-row" style={{ ...rowButton, width: "100%", margin: 0, padding: "8px", display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, color: "var(--text-body)", overflowWrap: "anywhere" }}>{p.line}</span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  <span style={{ color: p.tone === "quiet" ? "var(--text-dim)" : TONE_COLOR[p.tone] }}>{p.state}</span>
                  {p.who && ` · ${p.who}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ setup, while a step is undone

function SetupChecklist({ ws, me }: { ws: Workspace; me: string }) {
  const g = ws.guide;
  const agents = [...ws.people.agents.values()];
  const setup = [
    { done: !!g && !!(g.concept.trim() || g.rules.trim()), label: "Write the Project Guide", sub: "The concept and rules every agent reads first", to: "guide" as const },
    { done: agents.some((a) => a.owner_profile_id === me), label: "Connect your agents", sub: "One terminal line brings in your Claude Code and Codex", to: "connect" as const },
    { done: ws.people.members.filter((m) => m.actor_type === "human").length > 1, label: "Invite the people you work with", sub: "Send them a link; they join with GitHub", to: "settings" as const },
    { done: !!ws.project.lead_agent_id, label: "Pick Captain", sub: "Your own agent: you talk to it, it writes the tickets and assigns them", to: "people" as const },
    { done: ws.tickets.length > 0, label: "Ask Captain for the first piece of work", sub: "It plans it into tickets for the other agents", to: "captain" as const },
  ];
  const left = setup.filter((s) => !s.done).length;
  if (!left) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>
        Set up {ws.project.name} <span style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 14 }}>· {setup.length - left} of {setup.length}</span>
      </h2>
      <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
        {setup.map((s, i) => (
          <a
            key={s.label}
            href={href({ view: s.to, project: ws.project.slug })}
            onClick={onNav({ view: s.to, project: ws.project.slug })}
            className="ak-row"
            style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", background: "var(--surface)", borderTop: i ? "1px solid var(--border-subtle)" : 0, textDecoration: "none", color: "var(--text)" }}
          >
            <span style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, ...(s.done ? { background: "var(--green-bg)", color: "var(--green)" } : { border: "1px solid var(--border-strong)", color: "var(--text-dim)" }) }}>
              {s.done ? "✓" : i + 1}
            </span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: s.done ? "var(--text-muted)" : "var(--text)", textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{s.sub}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ pieces

const Dot = ({ color, style }: { color: string; style?: CSSProperties }) => <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: color, flex: "none", ...style }} />;

/** Grey shapes where the page will be, while the workspace loads. */
function Skeleton() {
  const line = (width: string, height = 14): CSSProperties => ({ width, height, borderRadius: 6, background: "var(--surface-raised)" });
  return (
    <div role="status" aria-label="Loading" style={column}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={line("90px", 22)} />
        <span style={line("80%", 26)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={line("70%")} />
        <span style={line("55%")} />
      </div>
      <div className="ak-features">
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ ...line("100%", 96), borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ styles

const column: CSSProperties = { width: "100%", maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 };
const list: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 };
const rowButton: CSSProperties = { width: "calc(100% + 20px)", textAlign: "left", background: "transparent", border: 0, cursor: "pointer", padding: "8px 10px", margin: "0 -10px", borderRadius: "var(--radius-md)", color: "inherit", font: "inherit", minWidth: 0, alignItems: "start" };
const linkButton: CSSProperties = { background: "transparent", border: 0, padding: 0, cursor: "pointer", color: "var(--blue-text)", font: "inherit", fontSize: 13 };
