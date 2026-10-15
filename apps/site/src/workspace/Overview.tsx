import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { eventsAfter, eventsBetween, type TicketEvent } from "../lib/data";
import { go, href, onNav, openShow, type Route } from "../lib/router";
import { AgentAvatar, Button, Logo } from "../ui";
import type { CatchUpItem } from "./captain";
import {
  askItems,
  crew,
  FIXES,
  overview,
  pulse,
  sinceItems,
  sinceLine,
  team,
  updatedText,
  watch,
  type AskItem,
  type CrewRow,
  type Feature,
  type Pulse,
  type Team,
  type Tone,
  type WatchItem,
} from "./glance";
import type { CaptainRoom } from "./useCaptainRoom";
import { costText } from "./agentCosts";
import { useAgentCosts } from "./useAgentCosts";
import { EVENTS_WINDOW_MS, useHistoryWindow } from "./useHistory";
import type { Workspace } from "./useWorkspace";

// Overview (DEC-24, AK-75, AK-111): for looking, not talking. Read top to bottom it answers, in order:
// is the team moving (the counts), does anything need me or look wrong (two panels, only when true),
// who is doing what (one team table), and what is being built (Now and Next, with Done in one line).
// Every sentence comes from glance.ts; this file only draws. No ticket key is shown: keys are hover
// text at most. Amber appears in one place, the Needs-you panel, plus small "needs you" markers.

const TONE_COLOR: Record<Tone, string> = { live: "var(--blue)", needs: "var(--amber)", problem: "var(--coral)", quiet: "var(--text-dim)", done: "var(--green)" };
/** Requests listed in the Needs-you panel before "and n more". */
const ASKS_SHOWN = 3;

export function Overview({ ws, me, cr }: { ws: Workspace | null; me: string; cr: CaptainRoom }) {
  const { costs, error: costError } = useAgentCosts(ws);
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

  // The last week's events, for the send-back count in "Something's off". Kept in memory and
  // topped up by id every few minutes; a reconciliation catches edits and deletes (AK-154).
  const projectId = ws?.project.id;
  const demoEvents = ws?.demoEvents;
  const { rows: liveEvents } = useHistoryWindow(demoEvents ? undefined : projectId, EVENTS_WINDOW_MS, {
    read: (from, to) => (projectId ? eventsBetween(projectId, from, to) : Promise.resolve([] as TicketEvent[])),
    readAfter: (afterId, from) => (projectId ? eventsAfter(projectId, afterId, from) : Promise.resolve([] as TicketEvent[])),
  });
  const events = demoEvents ?? liveEvents;

  const look = useMemo(() => (ws ? overview(ws, cr.needs, cr.plans, now) : null), [ws, cr.needs, cr.plans, now]);
  const members = cr.room?.members;
  const people = useMemo(() => {
    if (!ws) return null;
    const seen = new Map((members ?? []).filter((m) => m.kind === "human").map((m) => [m.profile_id ?? m.id, m.last_seen_at]));
    return team(ws, now, seen, me);
  }, [ws, members, now, me]);
  const watching = useMemo(() => (ws ? watch(ws, events, now) : []), [ws, events, now]);
  if (!ws || !look || !people) return <Skeleton />;

  const slug = ws.project.slug;
  const captain: Route = { view: "captain", project: slug };
  const peoplePage: Route = { view: "people", project: slug };
  const asks = askItems(ws, cr.needs, cr.plans, now);
  const counts = pulse(people, asks.length);
  const rows = crew(people, look.rows).map((r) => ({ ...r, spend: costText(costs.get(r.id)) }));
  const since = sinceLine(ws, cr.catchUp?.c ?? null);
  const answer = (key: string) => go(`${href(captain)}#need-${key}`, false, false);

  if (ws.tickets.length === 0) {
    return (
      <div className="ak-ov">
        <EmptyProject captain={captain} />
        <SetupChecklist ws={ws} me={me} />
      </div>
    );
  }

  return (
    <div className="ak-ov">
      <section aria-label="At a glance" className="ak-ov-top">
        <PulseStrip counts={counts} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <p className="ak-ov-headline">{look.headline}</p>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Live · {updatedText(loadedAt, now)}</span>
        </div>
      </section>

      {(asks.length > 0 || watching.length > 0) && (
        <div className={asks.length > 0 && watching.length > 0 ? "ak-ov-panels" : undefined}>
          {asks.length > 0 && <NeedsPanel asks={asks} onAnswer={answer} captain={captain} />}
          {watching.length > 0 && <OffPanel items={watching} people={peoplePage} />}
        </div>
      )}

      <Section id="ov-team" title="Team right now" right={<SmallLink to={peoplePage}>People</SmallLink>}>
        {costError && <p role="alert" style={{ fontSize: 13, color: "var(--coral)" }}>{costError}</p>}
        <CrewTable rows={rows} people={people} peoplePage={peoplePage} />
      </Section>

      <Section id="ov-features" title="What's being built" right={<SmallLink to={{ view: "board", project: slug }}>Open the board</SmallLink>}>
        <div className="ak-ov-board">
          <BoardColumn title="Now" count={look.features.now.length}>
            {look.features.now.length ? look.features.now.map((f) => <FeatureCard key={f.id} f={f} />) : <NothingBuilt captain={captain} />}
          </BoardColumn>
          <BoardColumn title="Next" count={look.features.next.length} after={look.features.next.length > 0 && look.features.next.length <= 2 ? "After these, nothing is planned." : null}>
            {look.features.next.length ? look.features.next.map((f) => <FeatureCard key={f.id} f={f} />) : <p style={quiet}>Nothing is planned yet.</p>}
          </BoardColumn>
        </div>
        <DoneLine features={look.features.done} />
      </Section>

      {(since || watching.length === 0) && (
        <footer className="ak-ov-foot">
          {since && cr.catchUp && <SinceYouLooked line={since} items={sinceItems(ws, cr.catchUp.c)} />}
          {watching.length === 0 && <p style={quiet}>Nothing is off.</p>}
        </footer>
      )}

      <SetupChecklist ws={ws} me={me} />
    </div>
  );
}

// ------------------------------------------------------------------ the counts

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function PulseStrip({ counts }: { counts: Pulse }) {
  const tiles: { n: number; word: string; zero: string; color: string; to: string }[] = [
    { n: counts.working, word: "working", zero: "Nobody working", color: "var(--blue)", to: "ov-team" },
    { n: counts.needs, word: counts.needs === 1 ? "needs you" : "need you", zero: "Nothing needs you", color: "var(--amber)", to: "ov-needs" },
    { n: counts.stopped, word: "stopped", zero: "Nothing stopped", color: "var(--coral)", to: "ov-team" },
    { n: counts.free, word: "free", zero: "Nobody free", color: "var(--text-muted)", to: "ov-team" },
  ];
  if (counts.offline) tiles.push({ n: counts.offline, word: "offline", zero: "", color: "var(--text-muted)", to: "ov-team" });
  return (
    <ul className="ak-ov-pulse" aria-label="The team at a glance">
      {tiles.map((t) => (
        <li key={t.word}>
          <button type="button" className="ak-ov-tile" disabled={!t.n} onClick={() => scrollTo(t.to)} aria-label={t.n ? `${t.n} ${t.word}` : t.zero}>
            <span className="ak-ov-num" style={{ color: t.n ? t.color : "var(--text-dim)" }}>
              {t.n}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: t.n ? "var(--text-secondary)" : "var(--text-dim)" }}>
              {t.n > 0 && <Dot color={t.color} />}
              {t.n ? t.word : t.zero}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ the two panels

function NeedsPanel({ asks, onAnswer, captain }: { asks: AskItem[]; onAnswer: (key: string) => void; captain: Route }) {
  const more = asks.length - ASKS_SHOWN;
  return (
    <section id="ov-needs" aria-labelledby="ov-needs-h" className="ak-ov-panel" style={{ background: "var(--amber-bg)", borderColor: "var(--amber-border)", borderLeftColor: "var(--amber)" }}>
      <h2 id="ov-needs-h" className="ak-ov-panel-h">
        <Dot color="var(--amber)" size={9} />
        {asks.length === 1 ? "1 thing needs you" : `${asks.length} things need you`}
      </h2>
      <ul style={list}>
        {asks.slice(0, ASKS_SHOWN).map((a) => (
          <li key={a.key} className="ak-ov-ask">
            <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 15, lineHeight: 1.45, color: "var(--text)", overflowWrap: "anywhere" }}>{a.title}</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{a.sub}</span>
            </span>
            <Button size="sm" variant="secondary" className="ak-tap" onClick={() => onAnswer(a.key)} style={{ flex: "none" }}>
              Answer
            </Button>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <a href={href(captain)} onClick={onNav(captain)} style={{ fontSize: 14 }}>
          and {more} more in Captain
        </a>
      )}
    </section>
  );
}

export function OffPanel({ items, people }: { items: WatchItem[]; people: Route }) {
  return (
    <section aria-labelledby="ov-off-h" className="ak-ov-panel" style={{ background: "var(--coral-bg)", borderColor: "var(--coral-border)", borderLeftColor: "var(--coral)" }}>
      <h2 id="ov-off-h" className="ak-ov-panel-h">
        <Dot color="var(--coral)" size={9} />
        Something's off
      </h2>
      <ul style={list}>
        {items.map((i, n) => {
          const body = (
            <>
              <Dot color={i.tone === "problem" ? "var(--coral)" : "var(--text-dim)"} style={{ marginTop: 8 }} />
              <span style={{ fontSize: 15, lineHeight: 1.45, color: "var(--text-body)", overflowWrap: "anywhere", textAlign: "left" }}>{i.text}</span>
            </>
          );
          return (
            <li key={n}>
              {i.key ? (
                <button type="button" onClick={() => openShow(i.key!)} title="Show the work" className="ak-row ak-ov-off">
                  {body}
                </button>
              ) : i.people ? (
                <a href={href(people)} onClick={onNav(people)} className="ak-row ak-ov-off" style={{ textDecoration: "none" }}>
                  {body}
                </a>
              ) : (
                <span className="ak-ov-off">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ the team table

const AVATAR_STATE: Partial<Record<CrewRow["state"], "working" | "waiting" | "idle">> = { working: "working", reviewing: "working", waiting: "waiting", free: "idle", idle: "idle" };

export function CrewTable({ rows, people, peoplePage }: { rows: CrewRow[]; people: Team; peoplePage: Route }) {
  if (!rows.length) {
    const connect: Route = "project" in peoplePage ? { view: "connect", project: peoplePage.project } : peoplePage;
    return (
      <p style={quiet}>
        No agents yet.{" "}
        <a href={href(connect)} onClick={onNav(connect)}>
          Connect your agents
        </a>
      </p>
    );
  }
  return (
    <>
      <ul style={{ ...list, gap: 0 }} aria-label="Agents">
        {rows.map((r) => {
          const open = () => (r.key ? openShow(r.key) : go(peoplePage));
          const stopped = r.state === "stopped" || r.state === "limit";
          return (
            <li key={r.id}>
              <button type="button" onClick={open} title={r.hover} className="ak-row ak-ov-crew">
                <span className="ak-ov-who">
                  <AgentAvatar name={r.name} size={30} status={AVATAR_STATE[r.state]} ring="var(--bg)" />
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span style={{ fontSize: 13, color: r.tone === "quiet" ? "var(--text-muted)" : TONE_COLOR[r.tone] }}>{r.word}</span>
                  </span>
                </span>
                <span className="ak-ov-doing">
                  <span style={{ fontSize: 14, lineHeight: 1.45, color: r.state === "free" || r.state === "offline" ? "var(--text-muted)" : "var(--text-body)", overflowWrap: "anywhere" }}>{r.doing}</span>
                  {(r.feature || r.notes.length > 0) && (
                    <span style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 13, color: "var(--text-muted)" }}>
                      {r.feature && <span className="ak-ov-tag">{r.feature}</span>}
                      {r.notes.map((n, i) => (
                        <span key={i} style={stopped && i === 0 ? { color: "var(--coral)" } : undefined}>
                          {n}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="ak-ov-usage">
                  {r.spend && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.spend}</span>}
                  {r.usage && (
                    <>
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.usage.text.replace(/ today$/, "")}</span>
                      <Bar share={r.usage.share} color={r.usage.share >= 1 ? "var(--coral)" : r.state === "working" || r.state === "reviewing" ? "var(--blue)" : "var(--text-dim)"} label={r.usage.text} />
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {people.people.length > 0 && (
        <p style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
          <span style={{ color: "var(--text-dim)" }}>People</span>
          {people.people.map((p) => (
            <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", boxSizing: "border-box", ...(p.online ? { background: "var(--green)" } : { border: "1px solid var(--text-dim)" }) }} />
              <span style={{ color: "var(--text-secondary)" }}>{p.name}</span> {p.label}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

// ------------------------------------------------------------------ what's being built

function BoardColumn({ title, count, after, children }: { title: string; count: number; after?: string | null; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", display: "flex", gap: 8, alignItems: "baseline" }}>
        {title}
        {count > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-dim)" }}>{count}</span>}
      </h3>
      {children}
      {after && <p style={quiet}>{after}</p>}
    </div>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  const [open, setOpen] = useState(false);
  const fixes = f.id === "fixes" || f.name === FIXES;
  const left = f.total - f.done;
  const progress = fixes ? `${left} open` : f.column === "now" ? f.word : f.status;
  const barColor = f.active ? "var(--blue)" : "var(--text-dim)";
  return (
    <div className="ak-ov-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ak-row" style={cardButton}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: "var(--text)", overflowWrap: "anywhere" }}>{f.name}</span>
          {f.waits && <span className="ak-ov-needs-mark">Needs you</span>}
        </span>
        {f.outcome && <span style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5, overflowWrap: "anywhere" }}>{f.outcome}</span>}
        {f.column === "now" && !fixes && <Bar share={f.total ? f.done / f.total : 0} color={barColor} label={f.count} thick />}
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
          <span style={{ color: "var(--text-secondary)" }}>{progress}</span>
          {f.pause && <span style={{ color: "var(--coral)" }}>{f.pause}</span>}
          {f.on.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", color: "var(--text-muted)" }}>
              {f.on.map((n) => (
                <AgentAvatar key={n} name={n} size={20} />
              ))}
              {f.on.join(", ")}
            </span>
          )}
        </span>
      </button>
      {open && (
        <ul aria-label={`Parts of ${f.name}`} style={{ ...list, padding: "0 8px 10px", borderTop: "1px solid var(--border-subtle)" }}>
          {f.parts.length === 0 && <li style={{ padding: "8px", ...quiet }}>No parts planned yet.</li>}
          {f.parts.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => openShow(p.key)} title={`${p.key} · Show the work`} className="ak-row" style={{ ...cardButton, padding: "8px", gap: 2 }}>
                <span style={{ fontSize: 14, color: "var(--text-body)", overflowWrap: "anywhere" }}>{p.line}</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  <span style={{ color: p.tone === "quiet" ? "var(--text-muted)" : TONE_COLOR[p.tone] }}>{p.state}</span>
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

/** Finished features in one line under the board; the list opens on request. */
function DoneLine({ features }: { features: Feature[] }) {
  const [open, setOpen] = useState(false);
  if (!features.length) return null;
  const named = features.slice(0, 3).map((f) => f.name);
  const earlier = features.length - named.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontSize: 14, color: "var(--text-body)" }}>
        <span style={{ color: "var(--green)" }} aria-hidden="true">
          ✓
        </span>
        <span>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Done</span> · {named.join(", ")}
          {earlier > 0 && ` · ${earlier} earlier`}
        </span>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={linkButton}>
          {open ? "Hide" : "Show"}
        </button>
      </p>
      {open && (
        <div className="ak-ov-board">
          {features.map((f) => (
            <FeatureCard key={f.id} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function NothingBuilt({ captain }: { captain: Route }) {
  return (
    <div className="ak-ov-card" style={{ padding: "18px 16px", display: "flex", alignItems: "center", gap: 14 }}>
      <Logo size={36} />
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 15, color: "var(--text-body)" }}>Nothing is being built right now.</span>
        <a href={href(captain)} onClick={onNav(captain)} style={{ fontSize: 14 }}>
          Ask Captain what's next
        </a>
      </span>
    </div>
  );
}

function EmptyProject({ captain }: { captain: Route }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14, padding: "8px 0" }}>
      <Logo size={56} />
      <p className="ak-ov-headline">Nothing is being worked on yet.</p>
      <p style={{ fontSize: 15, color: "var(--text-muted)", maxWidth: 520 }}>Tell Captain what you'd like built. It plans the work, hands it to your agents, and this page fills up as they go.</p>
      <Button variant="primary" onClick={() => go(captain)}>
        Talk to Captain
      </Button>
    </section>
  );
}

// ------------------------------------------------------------------ since you last looked

const ITEM_COLOR: Record<CatchUpItem["type"], string> = { shipped: "var(--green)", decided: "var(--text-dim)", problem: "var(--coral)" };

function SinceYouLooked({ line, items }: { line: string; items: CatchUpItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Since you last looked" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
        {line}{" "}
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={linkButton}>
          {open ? "Hide" : "Show what happened"}
        </button>
      </p>
      {open && (
        <ul style={{ ...list, gap: 6 }}>
          {items.map((i, n) => (
            <li key={n} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 10, fontSize: 14, color: "var(--text-body)" }}>
              <Dot color={ITEM_COLOR[i.type]} style={{ marginTop: 7 }} />
              <span style={{ overflowWrap: "anywhere" }}>{i.text}</span>
            </li>
          ))}
        </ul>
      )}
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
    { done: ws.tickets.length > 0, label: "Ask Captain for the first piece of work", sub: "It plans it into tickets for the other agents", to: "captain" as const },
  ];
  const left = setup.filter((s) => !s.done).length;
  if (!left) return null;
  return (
    <Section title={`Set up ${ws.project.name}`} right={<span style={{ fontSize: 13, color: "var(--text-dim)" }}>{setup.length - left} of {setup.length}</span>}>
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
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.sub}</span>
            </span>
          </a>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ pieces

function Section({ id, title, right, children }: { id?: string; title: string; right?: ReactNode; children: ReactNode }) {
  const h = id ? `${id}-h` : undefined;
  return (
    <section id={id} aria-labelledby={h} aria-label={h ? undefined : title} className="ak-ov-section">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 id={h} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function SmallLink({ to, children }: { to: Route; children: ReactNode }) {
  return (
    <a href={href(to)} onClick={onNav(to)} style={{ fontSize: 13, textDecoration: "none" }}>
      {children}
    </a>
  );
}

function Bar({ share, color, label, thick }: { share: number; color: string; label: string; thick?: boolean }) {
  return (
    <span role="img" aria-label={label} title={label} style={{ display: "block", width: "100%", height: thick ? 6 : 4, borderRadius: 3, background: "var(--surface-raised)", overflow: "hidden" }}>
      <span style={{ display: "block", height: "100%", width: `${Math.max(3, Math.min(100, Math.round(share * 100)))}%`, background: color, borderRadius: 3 }} />
    </span>
  );
}

const Dot = ({ color, size = 7, style }: { color: string; size?: number; style?: CSSProperties }) => <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: color, flex: "none", display: "inline-block", ...style }} />;

/** Grey shapes where the page will be, while the workspace loads. */
function Skeleton() {
  const line = (width: string, height = 14): CSSProperties => ({ width, height, borderRadius: 6, background: "var(--surface-raised)" });
  return (
    <div role="status" aria-label="Loading" className="ak-ov">
      <span style={{ ...line("100%", 84), borderRadius: 16 }} />
      <span style={line("60%", 22)} />
      <div className="ak-ov-board">
        {[0, 1].map((i) => (
          <span key={i} style={{ ...line("100%", 120), borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ styles

const list: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 };
const quiet: CSSProperties = { fontSize: 14, color: "var(--text-muted)" };
const cardButton: CSSProperties = { width: "100%", textAlign: "left", background: "transparent", border: 0, cursor: "pointer", padding: "16px 18px", borderRadius: 12, color: "inherit", font: "inherit", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 };
const linkButton: CSSProperties = { background: "transparent", border: 0, padding: 0, cursor: "pointer", color: "var(--blue-text)", font: "inherit", fontSize: 14 };
