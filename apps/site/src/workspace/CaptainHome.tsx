import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { href, onNav, go, openLook, type Route } from "../lib/router";
import { AgentAvatar, Button, Chip, SegmentedProgress, type Segment } from "../ui";
import { ago, Markdown } from "./bits";
import {
  briefing,
  catchUpItems,
  catchUpSummary,
  catchUpText,
  clock,
  dayLabel,
  folded,
  foldText,
  mergeChip,
  mergeQuestion,
  NEED_WHAT,
  ownerOf,
  planAsks,
  planTitle,
  riskyPart,
  timeline,
  withoutPlan,
  type Briefing as BriefingData,
  type CatchUp,
  type Need,
  type Plan,
  type Row,
  type Segment as GoalSegment,
  type Turn,
} from "./captain";
import { EvidencePanel } from "./EvidencePanel";
import { agentDot } from "./People";
import { withTicketLinks } from "./Room";
import { planKey, type CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";

// Captain home (AK-49, autokolab-ux-handoff/screens/S01-captain-home.md): the pinned briefing, the
// person's conversation with Captain with its decision cards, and the composer. Every sentence comes
// from captain.ts; this file only draws.

const SEGMENT: Record<GoalSegment, Segment> = { done: "done", needs_you: "needs", building: "active", todo: "todo" };

export function CaptainHome({ ws, me, cr }: { ws: Workspace; me: string; cr: CaptainRoom }) {
  const [pulse, setPulse] = useState<string | null>(null);
  const b = briefing(ws, cr.needs);
  const { startCatchUp } = cr;
  const roomReady = cr.room !== undefined;
  useEffect(() => {
    if (roomReady) startCatchUp();
  }, [roomReady, startCatchUp]);

  const toOldestCard = () => {
    const need = cr.needs[0];
    const el = need && document.getElementById(`need-${need.key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
    setPulse(need.key);
    setTimeout(() => setPulse(null), 1000);
  };

  return (
    <div style={{ flex: 1, width: "100%", maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <Briefing ws={ws} b={b} online={cr.online} onNeeds={toOldestCard} />
      <SetupChecklist ws={ws} me={me} />
      <Conversation ws={ws} cr={cr} pulse={pulse} />
    </div>
  );
}

// ------------------------------------------------------------------ the pinned briefing

function Briefing({ ws, b, online, onNeeds }: { ws: Workspace; b: BriefingData; online: boolean; onNeeds: () => void }) {
  const [open, setOpen] = useState(false);
  // "updated just now": when the workspace last loaded. Each reload makes a new ws.
  const [loadedAt, setLoadedAt] = useState(() => new Date().toISOString());
  const [, tick] = useState(0);
  useEffect(() => setLoadedAt(new Date().toISOString()), [ws]);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const anyoneWorking = [...ws.people.agents.values()].some((a) => agentDot(a) === "working");
  const slug = ws.project.slug;

  return (
    <section aria-label="Where we are" style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg)", padding: "22px 0 14px" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-2xl)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-dim)" }}>
          {online && anyoneWorking && <span className="ak-live" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", flex: "none" }} />}
          {online ? `Where we are · updated ${ago(loadedAt)}` : "Captain is offline"}
        </span>
        <p className="ak-headline" style={{ fontWeight: 500, letterSpacing: "var(--tracking-tight)", lineHeight: 1.3 }}>
          {b.work}{" "}
          {b.needs.tone === "amber" ? (
            <button type="button" onClick={onNeeds} title="Go to the oldest card" style={{ border: 0, padding: 0, background: "none", font: "inherit", letterSpacing: "inherit", color: "var(--amber)", cursor: "pointer", textAlign: "left" }}>
              {b.needs.text}
            </button>
          ) : (
            <span style={{ color: "var(--green)" }}>{b.needs.text}</span>
          )}
        </p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          {b.next && <span style={{ fontSize: 14, color: "var(--text-muted)", flex: "1 1 260px", minWidth: 0 }}>{b.next}</span>}
          <button type="button" className="ak-tap" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ ...textButton, marginLeft: "auto", minHeight: 32 }}>
            {open ? "Hide" : "Who's doing what"}
          </button>
        </div>
        {open && (
          <div className="ak-enter" style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 12, maxHeight: "50vh", overflowY: "auto" }}>
            {b.goals.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {b.goals.map((g) => {
                  const to: Route = g.id ? { view: "ticket", project: slug, key: ws.byId.get(g.id)?.key ?? "" } : { view: "backlog", project: slug };
                  return (
                    <a key={g.id ?? "other"} href={href(to)} onClick={onNav(to)} style={{ display: "grid", gridTemplateColumns: "minmax(0, 130px) minmax(60px, 1fr) auto", alignItems: "center", gap: 12, fontSize: 14, color: "var(--text)", textDecoration: "none" }}>
                      <span style={ellipsis}>{g.title}</span>
                      <SegmentedProgress segments={g.segments.map((s) => SEGMENT[s])} label={`${g.title}: ${g.done} of ${g.total} done`} />
                      <span style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                        {g.done} of {g.total}
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
            {b.agents.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {b.agents.map((a) => {
                  const to: Route = { view: "ticket", project: slug, key: a.ticket.key };
                  return (
                    <a key={a.agentId} href={href(to)} onClick={onNav(to)} title={ownerOf(ws, a.agentId) ?? undefined} style={{ display: "grid", gridTemplateColumns: "minmax(52px, auto) minmax(0, 1fr) auto", alignItems: "baseline", gap: 12, fontSize: 14, color: "var(--text-body)", textDecoration: "none" }}>
                      <span style={{ color: "var(--text-muted)", ...ellipsis }}>{a.name}</span>
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{a.doing}</span>
                      <span style={{ fontSize: 13, whiteSpace: "nowrap", color: a.needsYou ? "var(--amber)" : "var(--text-dim)" }}>{a.needsYou ? "needs you" : (a.step ?? "")}</span>
                    </a>
                  );
                })}
              </div>
            )}
            <a href={href({ view: "board", project: slug })} onClick={onNav({ view: "board", project: slug })} style={{ fontSize: 14, alignSelf: "flex-start", textDecoration: "none" }}>
              Open the board
            </a>
          </div>
        )}
      </div>
    </section>
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
    { done: ws.tickets.length > 0, label: "Ask Captain for the first piece of work", sub: "It plans it into tickets for the other agents", to: "board" as const },
  ];
  const left = setup.filter((s) => !s.done).length;
  if (!left) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, margin: "8px 0 16px" }}>
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

// ------------------------------------------------------------------ the conversation

function Conversation({ ws, cr, pulse }: { ws: Workspace; cr: CaptainRoom; pulse: string | null }) {
  const slug = ws.project.slug;
  const okd = useMemo(() => new Set(cr.okd.map((n) => n.key)), [cr.okd]);
  const entries = useMemo(() => timeline(folded(cr.turns), [...cr.needs, ...cr.okd], cr.catchUp?.at), [cr.turns, cr.needs, cr.okd, cr.catchUp]);
  const planOf = useMemo(() => new Map(cr.plans.map((p) => [p.turnId, p])), [cr.plans]);
  const noCaptain = !ws.project.lead_agent_id;
  const canPost = !noCaptain && !!cr.room?.me && cr.room.me.role !== "observer";

  // Opening the page lands at the newest message, once the messages and the catch-up are both in
  // (the catch-up is the newest message when there is one).
  const landed = useRef(false);
  const complete = cr.room !== undefined && (cr.catchUpReady || !cr.room);
  useLayoutEffect(() => {
    if (landed.current || !complete) return;
    landed.current = true;
    window.scrollTo(0, document.documentElement.scrollHeight);
  }, [complete, entries.length]);

  // New Captain messages are read out politely; the ones already there when the page opened aren't.
  const [announce, setAnnounce] = useState("");
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const last = [...cr.turns].reverse().find((t) => t.kind === "captain" || t.kind === "question" || t.kind === "problem");
    if (!last) return;
    if (seen.current !== null && last.id > seen.current) setAnnounce(`Captain: ${last.problem ?? withoutPlan(last.body)}`);
    seen.current = Math.max(seen.current ?? 0, last.id);
  }, [cr.turns]);

  let body: ReactNode;
  if (noCaptain) {
    body = (
      <p style={{ fontSize: 15, color: "var(--text-muted)", padding: "12px 0" }}>
        This project has no Captain yet.{" "}
        <a href={href({ view: "people", project: slug })} onClick={onNav({ view: "people", project: slug })}>
          Pick one on People
        </a>{" "}
        to start talking to it.
      </p>
    );
  } else if (cr.room === undefined) {
    body = <p style={{ fontSize: 14, color: "var(--text-dim)", padding: "12px 0" }}>Loading the conversation…</p>;
  } else if (!cr.room?.me) {
    body = (
      <p style={{ fontSize: 14, color: "var(--text-muted)", padding: "12px 0" }}>
        You're not in this project's room yet, so there's no conversation with Captain. Reload the page, or ask the owner for a new invite link.
        {cr.loadError && <span style={{ display: "block", color: "var(--coral)", marginTop: 6 }}>{cr.loadError}</span>}
      </p>
    );
  } else if (!entries.length) {
    body = (
      <CaptainMessage at={null}>
        <Markdown text="I'm set up. Tell me what you'd like built." />
      </CaptainMessage>
    );
  } else {
    let lastDay = "";
    body = entries.map((e) => {
      const day = dayLabel(e.at);
      const divider = day !== lastDay ? <DayDivider label={day} /> : null;
      lastDay = day;
      let item: ReactNode;
      if (e.kind === "catchup") item = cr.catchUp && <CatchUpMessage ws={ws} c={cr.catchUp.c} at={cr.catchUp.at} needs={cr.needs.length} />;
      else if (e.kind === "card" && e.need.kind === "plan" && planOf.has(e.need.turnId!)) item = <PlanCard ws={ws} cr={cr} plan={planOf.get(e.need.turnId!)!} need={e.need} pulse={pulse === e.need.key} />;
      else if (e.kind === "card") item = <DecisionCard ws={ws} cr={cr} need={e.need} done={okd.has(e.need.key)} pulse={pulse === e.need.key} />;
      else if (e.row.kind !== "fold" && planOf.has(e.row.id)) item = <PlanCard ws={ws} cr={cr} plan={planOf.get(e.row.id)!} need={null} pulse={false} />;
      else item = <RowView ws={ws} row={e.row} />;
      return (
        <Fragment key={e.key}>
          {divider}
          {item}
        </Fragment>
      );
    });
  }

  return (
    <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, padding: "8px 0 20px" }}>
        {body}
        {cr.working && (
          <span role="status" className="ak-indent" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)" }}>
            <span className="ak-live" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", flex: "none" }} />
            {(cr.captain && agentDot(cr.captain) === "working" && cr.captain.status_note) || "Captain is reading…"}
          </span>
        )}
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
      </div>
      <Composer cr={cr} disabled={!canPost} noCaptain={noCaptain} autoFocus={canPost && !entries.length} />
    </>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-dim)" }}>
      <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
      {label}
      <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
    </div>
  );
}

function CaptainMessage({ at, children }: { at: string | null; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
      <AgentAvatar name="Captain" size={28} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{at ? `Captain · ${clock(at)}` : "Captain"}</span>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-body)", minWidth: 0, overflowWrap: "anywhere", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function RowView({ ws, row }: { ws: Workspace; row: Row }) {
  if (row.kind === "fold") return <QuietFold turns={row.turns} />;
  if (row.kind === "you") return <YouMessage turn={row} ws={ws} />;
  if (row.kind === "problem") {
    return (
      <CaptainMessage at={row.at}>
        <div style={{ padding: "10px 14px", borderRadius: "var(--radius-lg)", background: "var(--coral-bg)", border: "1px solid var(--coral-border)" }}>
          <span style={{ color: "var(--coral-text)", fontWeight: 500 }}>{row.problem}</span>
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>Details</summary>
            <pre className="mono" style={{ margin: "6px 0 0", fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--text-secondary)" }}>
              {row.body}
            </pre>
          </details>
        </div>
      </CaptainMessage>
    );
  }
  return (
    <CaptainMessage at={row.at}>
      <Markdown text={withTicketLinks(withoutPlan(row.body), ws)} />
    </CaptainMessage>
  );
}

function YouMessage({ turn, ws }: { turn: Turn; ws: Workspace }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>You · {clock(turn.at)}</span>
      <div style={{ maxWidth: "min(480px, 100%)", padding: "11px 15px", borderRadius: "16px 16px 4px 16px", background: "var(--surface-raised)", fontSize: 15, minWidth: 0, overflowWrap: "anywhere" }}>
        <Markdown text={withTicketLinks(turn.body, ws)} />
      </div>
    </div>
  );
}

function QuietFold({ turns }: { turns: Turn[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ak-indent" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        className="ak-tap"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 14px", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-strong)", background: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", textAlign: "left" }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform var(--dur-hover) ease", flex: "none" }}>
          <path d="M9 6l6 6-6 6" />
        </svg>
        {foldText(turns.length)}
      </button>
      {open && (
        <div className="ak-enter" style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 14 }}>
          {turns.map((t) => (
            <span key={t.id} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13, color: "var(--text-secondary)", minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }}>
                {clock(t.at)}
              </span>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{t.body.split("\n")[0]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the catch-up

const DOT: Record<"shipped" | "decided" | "problem", string> = { shipped: "var(--green)", decided: "var(--text-dim)", problem: "var(--coral)" };

function CatchUpMessage({ ws, c, at, needs }: { ws: Workspace; c: CatchUp; at: string; needs: number }) {
  const [open, setOpen] = useState(false);
  const items = catchUpItems(c);
  const summary = catchUpSummary(c);
  const slug = ws.project.slug;
  const routeOf = (ref: string): Route => (ws.byKey.has(ref) ? { view: "ticket", project: slug, key: ref } : { view: "decisions", project: slug });
  return (
    <CaptainMessage at={at}>
      <span>{catchUpText(c, needs)}</span>
      {items.length > 0 && (
        <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", fontSize: 13, color: "var(--text-secondary)", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 0 }}>{summary}</span>
            <button type="button" className="ak-tap" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ ...textButton, minHeight: 32 }}>
              {open ? "Hide" : `Show all ${items.length}`}
            </button>
          </div>
          {open && (
            <ul className="ak-enter" style={{ listStyle: "none", margin: 0, padding: "10px 14px", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it, i) => (
                <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14, color: "var(--text-body)", minWidth: 0 }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: it.type === "problem" ? 1 : "50%", background: DOT[it.type], flex: "none", alignSelf: "center" }} />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{it.text}</span>
                  {it.ref && (
                    <a href={href(routeOf(it.ref))} onClick={onNav(routeOf(it.ref))} className="mono" style={{ fontSize: 12, textDecoration: "none", flex: "none" }}>
                      {it.ref}
                    </a>
                  )}
                  <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }}>
                    {clock(it.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </CaptainMessage>
  );
}

// ------------------------------------------------------------------ decision cards

function DecisionCard({ ws, cr, need, done, pulse }: { ws: Workspace; cr: CaptainRoom; need: Need; done: boolean; pulse: boolean }) {
  const [reply, setReply] = useState("");
  const [saying, setSaying] = useState(false); // "No, something's off" opened its reason field
  const [busy, setBusy] = useState(false);
  const [knowing, setKnowing] = useState(false); // "How do you know?" opened the evidence
  const t = need.ticket;
  const slug = ws.project.slug;
  const question = need.kind === "risky_merge" ? mergeQuestion(need) : need.question;
  const err = cr.errors.get(need.key);
  const openTicket = () => t && go({ view: "ticket", project: slug, key: t.key });
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  if (done) {
    return (
      <div id={`need-${need.key}`} tabIndex={-1} role="region" aria-label={question} className="ak-enter ak-indent" style={{ ...cardBox, background: "var(--green-bg)", borderColor: "var(--green-border)" }}>
        <span style={{ display: "flex", gap: 10, alignItems: "baseline", color: "var(--green-ink)", fontSize: 15 }}>
          <span aria-hidden="true" style={{ color: "var(--green)" }}>
            ✓
          </span>
          OK'd. It merges by itself once the tests pass.
        </span>
      </div>
    );
  }

  const ticketLink = t && (
    <a href={href({ view: "ticket", project: slug, key: t.key })} onClick={onNav({ view: "ticket", project: slug, key: t.key })} style={{ color: "var(--amber-text-soft)" }}>
      {t.key} {t.title}
    </a>
  );
  const chip = need.kind === "risky_merge" && t ? mergeChip(ws, t) : null;
  const risky = need.kind === "risky_merge" ? riskyPart(need) : null;
  const send = (fn: (text: string) => Promise<unknown>) => async () => {
    const text = reply.trim();
    if (!text) return;
    await run(() => fn(text));
  };

  return (
    <div id={`need-${need.key}`} tabIndex={-1} role="region" aria-label={question} className={pulse ? "ak-indent ak-pulse" : "ak-indent"} style={cardBox}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--amber)", overflowWrap: "anywhere" }}>
          Needs you · {NEED_WHAT[need.kind]}
          {ticketLink && <> {ticketLink}</>}
        </span>
        {t && (
          <button type="button" className="ak-tap" aria-expanded={knowing} aria-controls={`evidence-${need.key}`} onClick={() => setKnowing((k) => !k)} style={{ ...textButton, fontSize: 13, minHeight: 32, whiteSpace: "nowrap", marginLeft: "auto" }}>
            {knowing ? "Hide how I know" : "How do you know?"}
          </button>
        )}
      </div>
      {need.kind === "captain_question" ? (
        <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.4, color: "var(--text)" }}>
          <Markdown text={withTicketLinks(need.question, ws)} />
        </div>
      ) : (
        <p style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.4, color: "var(--text)", overflowWrap: "anywhere" }}>{question}</p>
      )}
      {(chip || risky) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          {chip && <Chip tone="verified">{chip}</Chip>}
          {risky && (
            <span title={risky} style={{ maxWidth: "100%", display: "inline-flex" }}>
              <Chip mono>
                <span style={ellipsis}>{risky}</span>
              </Chip>
            </span>
          )}
        </div>
      )}
      {t && knowing && <EvidencePanel ws={ws} ticket={t} id={`evidence-${need.key}`} />}

      {need.kind === "risky_merge" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Button onClick={() => void run(() => cr.okMerge(need))} disabled={busy} style={amberButton(busy)}>
              Yes, merge it
            </Button>
            <Button variant="secondary" onClick={() => t && openLook(slug, t.key)} style={{ height: 44 }}>
              Let me look first
            </Button>
            <button type="button" aria-expanded={saying} onClick={() => setSaying((s) => !s)} style={{ ...textButton, minHeight: 44, color: "var(--text-muted)" }}>
              No, something's off
            </button>
          </div>
          {saying && (
            <ReplyBox
              label={`What's off with ${t?.key ?? "it"}?`}
              placeholder="What's off? Captain reads this before anything merges."
              value={reply}
              onChange={setReply}
              busy={busy}
              action="Send to Captain"
              onSend={async () => {
                const text = reply.trim();
                if (!text || !t) return;
                setBusy(true);
                const ok = await cr.send(`No on ${t.key}: ${text}`, null, need.key);
                setBusy(false);
                if (ok) {
                  setReply("");
                  setSaying(false);
                }
              }}
            />
          )}
        </>
      )}

      {need.kind === "ticket_question" && <ReplyBox label={`Answer ${t?.key ?? ""}`} placeholder="Your answer goes on the ticket" value={reply} onChange={setReply} busy={busy} action="Answer" onSend={send((text) => cr.answerTicket(need, text))} />}

      {need.kind === "captain_question" && (
        <ReplyBox
          label="Answer Captain"
          placeholder="Your answer"
          value={reply}
          onChange={setReply}
          busy={busy}
          action="Answer"
          onSend={send((text) => cr.answerCaptain(need, text))}
        />
      )}

      {need.kind === "problem" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="secondary" onClick={openTicket} style={{ height: 44 }}>
            Open the ticket
          </Button>
          <button type="button" disabled={busy} onClick={() => void run(() => cr.clearNeed(need))} style={{ ...textButton, minHeight: 44, color: "var(--text-muted)" }}>
            Seen, clear it
          </button>
        </div>
      )}

      {err && (
        <span role="alert" style={{ fontSize: 13, color: "var(--coral-text)" }}>
          That didn't go through: {err}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ plan cards

/** Captain's plan (CON-23), in place of its message: amber while it waits on the person, quiet after. */
function PlanCard({ ws, cr, plan, need, pulse }: { ws: Workspace; cr: CaptainRoom; plan: Plan; need: Need | null; pulse: boolean }) {
  const [changing, setChanging] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const title = planTitle(plan);
  const titleId = `plan-title-${plan.turnId}`;
  const asks = planAsks(plan);
  const err = cr.errors.get(planKey(plan));
  const pending = plan.status === "pending";
  const slug = ws.project.slug;

  const start = async () => {
    setBusy(true);
    await cr.startPlan(plan);
    setBusy(false);
  };
  const change = async () => {
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    const ok = await cr.changePlan(plan, text);
    setBusy(false);
    if (ok) {
      setReply("");
      setChanging(false);
    }
  };

  const look: CSSProperties = pending ? cardBox : { ...cardBox, background: "var(--surface)", borderColor: "var(--border)", ...(plan.status === "replaced" ? { opacity: 0.6 } : {}) };
  let state: ReactNode = null;
  if (plan.status === "started") state = <Chip tone="verified">{plan.byYou && plan.okAt ? `You said OK · ${clock(plan.okAt)}` : "Started"}</Chip>;
  else if (plan.status === "changes_asked") state = <Chip>{plan.changedAt ? `You asked for changes · ${clock(plan.changedAt)}` : "You asked for changes"}</Chip>;
  else if (plan.status === "replaced") state = <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Replaced by a newer plan</span>;

  return (
    <CaptainMessage at={plan.at}>
      {plan.text && <Markdown text={withTicketLinks(plan.text, ws)} />}
      <div id={need ? `need-${need.key}` : undefined} tabIndex={need ? -1 : undefined} role="region" aria-labelledby={titleId} className={pulse ? "ak-pulse" : undefined} style={look}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 id={titleId} style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4, color: pending ? "var(--text)" : "var(--text-secondary)", overflowWrap: "anywhere" }}>
            {title}
          </h3>
          {state}
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {plan.goals.map(({ goal, tickets }) => {
            const to: Route = { view: "ticket", project: slug, key: goal.key };
            return (
              <li key={goal.id} style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 15, minWidth: 0 }}>
                <a href={href(to)} onClick={onNav(to)} style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", color: "var(--text-body)", textDecoration: "none" }}>
                  {goal.title}
                </a>
                <span style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{tickets.length === 1 ? "1 ticket" : `${tickets.length} tickets`}</span>
              </li>
            );
          })}
        </ul>
        {(asks || plan.not) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, color: "var(--text-muted)" }}>
            {asks && <span>{asks}</span>}
            {plan.not && <span style={{ overflowWrap: "anywhere" }}>{plan.not}</span>}
          </div>
        )}
        {pending && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Button onClick={() => void start()} disabled={busy} style={amberButton(busy)}>
                OK, start
              </Button>
              <Button variant="secondary" aria-expanded={changing} onClick={() => setChanging((c) => !c)} style={{ height: 44 }}>
                Change something
              </Button>
            </div>
            {changing && <ReplyBox label="Tell Captain what to change" placeholder="Tell Captain what to change" value={reply} onChange={setReply} busy={busy} action="Send to Captain" onSend={change} />}
          </>
        )}
        {err && (
          <span role="alert" style={{ fontSize: 13, color: "var(--coral-text)" }}>
            That didn't go through: {err}
          </span>
        )}
      </div>
    </CaptainMessage>
  );
}

function ReplyBox({ label, placeholder, value, onChange, busy, action, onSend }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; busy: boolean; action: string; onSend: () => void | Promise<void> }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <textarea
        aria-label={label}
        placeholder={placeholder}
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void onSend();
          }
        }}
        style={{ flex: "1 1 240px", minWidth: 0, padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--amber-border)", background: "var(--bg)", fontSize: 15, resize: "vertical" }}
      />
      <Button onClick={() => void onSend()} disabled={busy || !value.trim()} style={amberButton(busy || !value.trim())}>
        {action}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ the composer

function Composer({ cr, disabled, noCaptain, autoFocus }: { cr: CaptainRoom; disabled: boolean; noCaptain: boolean; autoFocus: boolean }) {
  const [body, setBody] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const err = cr.errors.get("composer");

  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);
  // 2 rows, growing to 8.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = `${Math.min(el.scrollHeight, line * 8 + 20)}px`;
  }, [body]);

  const send = async () => {
    const text = body.trim();
    if (!text || disabled) return;
    setBody("");
    requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const ok = await cr.send(text);
    if (!ok) setBody((b) => b || text);
  };

  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 2, background: "var(--bg)", padding: "8px 0 16px" }}>
      <div className="ak-composer" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: "var(--radius-2xl)", border: "1px solid var(--border-strong)", background: "var(--surface)" }}>
        <textarea
          ref={box}
          value={body}
          disabled={disabled}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          aria-label="Message Captain"
          placeholder={noCaptain ? "Pick Captain on People first" : "Tell Captain anything — a goal, a question, a change of plan"}
          style={{ width: "100%", border: 0, outline: "none", background: "transparent", fontSize: 15, lineHeight: 1.5, resize: "none", padding: 0 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span role={err ? "alert" : undefined} style={{ flex: 1, minWidth: 0, fontSize: 13, color: err ? "var(--coral-text)" : "var(--text-muted)" }}>
            {err ? `That didn't go through: ${err}` : cr.online ? "Big work gets a plan first. Small things I just do." : "I'll pick this up when I'm back."}
          </span>
          <Button variant="primary" aria-label="Send" title="Send (Enter)" disabled={disabled || !body.trim()} onClick={() => void send()} style={{ width: 44, height: 44, padding: 0, flex: "none" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ styles

const ellipsis: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const textButton: CSSProperties = { border: 0, padding: 0, background: "none", color: "var(--blue-text)", fontSize: 14, cursor: "pointer" };
const cardBox: CSSProperties = { display: "flex", flexDirection: "column", gap: 14, padding: 18, borderRadius: "var(--radius-xl)", background: "var(--amber-bg)", border: "1px solid var(--amber-border)", minWidth: 0 };
/** The card's primary button: amber and 44px tall, with the usual disabled look while it can't be pressed. */
const amberButton = (disabled: boolean): CSSProperties => ({ height: 44, padding: "0 18px", borderRadius: 11, fontSize: 15, fontWeight: 600, ...(disabled ? {} : { background: "var(--amber)", color: "var(--amber-ink)" }) });
