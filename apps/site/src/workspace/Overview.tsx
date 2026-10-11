import type { CSSProperties, ReactNode } from "react";
import { go, href, onNav, openShow, showHref, type Route } from "../lib/router";
import { SegmentedProgress, type Segment } from "../ui";
import { ago } from "./bits";
import { briefing, goalName, ownerOf, today, withoutPlan, type Need, type Segment as GoalSegment } from "./captain";
import type { CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";

// Overview (DEC-24): for looking, not talking. What's going on, what needs you, who's doing what,
// how the goals stand and what happened today. Every sentence comes from captain.ts; this file only
// draws. Each block is hidden when it has nothing to show.

const SEGMENT: Record<GoalSegment, Segment> = { done: "done", needs_you: "needs", building: "active", todo: "todo" };
/** Shipped lines shown before "and n more". */
const SHIPPED_MAX = 8;

export function Overview({ ws, me, cr }: { ws: Workspace | null; me: string; cr: CaptainRoom }) {
  if (!ws) return <Skeleton />;
  const slug = ws.project.slug;
  const b = briefing(ws, cr.needs);
  const day = today(ws);
  const empty = ws.tickets.length === 0;
  const board: Route = { view: "board", project: slug };
  const captain: Route = { view: "captain", project: slug };

  return (
    <div style={column}>
      {empty ? (
        <p style={{ fontSize: 17, lineHeight: 1.5, color: "var(--text-body)" }}>
          Nothing is being worked on yet.{" "}
          <a href={href(captain)} onClick={onNav(captain)}>
            Tell Captain what you'd like built.
          </a>
        </p>
      ) : (
        <section aria-label="Where we are" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p className="ak-headline" style={{ fontWeight: 500, letterSpacing: "var(--tracking-tight)", lineHeight: 1.3 }}>
            {b.work} <span style={{ color: b.needs.tone === "amber" ? "var(--amber)" : "var(--green)" }}>{b.needs.text}</span>
          </p>
          {b.next && <p style={{ fontSize: 15, color: "var(--text-muted)" }}>{b.next}</p>}
        </section>
      )}

      {cr.needs.length > 0 && (
        <Block title="Needs you">
          <ul style={list}>
            {cr.needs.map((n) => (
              <li key={n.key}>
                <NeedRow need={n} slug={slug} />
              </li>
            ))}
          </ul>
        </Block>
      )}

      {b.agents.length > 0 && (
        <Block title="Who's doing what">
          <ul style={list}>
            {b.agents.map((a) => {
              const to: Route = { view: "ticket", project: slug, key: a.ticket.key };
              return (
                <li key={a.agentId}>
                  <a href={href(to)} onClick={onNav(to)} title={ownerOf(ws, a.agentId) ?? undefined} className="ak-row" style={{ ...row, gridTemplateColumns: "minmax(52px, auto) minmax(0, 1fr) auto" }}>
                    <span style={{ color: "var(--text-muted)", ...ellipsis }}>{a.name}</span>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{a.doing}</span>
                    <span style={{ fontSize: 13, whiteSpace: "nowrap", color: a.needsYou ? "var(--amber)" : "var(--text-dim)" }}>{a.needsYou ? "needs you" : (a.step ?? "")}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {b.goals.length > 0 && (
        <Block title="Goals">
          <ul style={list}>
            {b.goals.map((g) => {
              const to: Route = g.id ? { view: "ticket", project: slug, key: ws.byId.get(g.id)?.key ?? "" } : { view: "backlog", project: slug };
              const name = goalName(g.title);
              return (
                <li key={g.id ?? "other"}>
                  <a href={href(to)} onClick={onNav(to)} title={g.title} className="ak-row" style={{ ...row, alignItems: "center", gridTemplateColumns: "minmax(0, 180px) minmax(60px, 1fr) auto" }}>
                    <span style={ellipsis}>{name}</span>
                    <SegmentedProgress segments={g.segments.map((s) => SEGMENT[s])} label={`${name}: ${g.done} of ${g.total} done`} />
                    <span style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                      {g.done} of {g.total}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {(day.shipped.length > 0 || day.inReview.length > 0 || day.decided.length > 0) && (
        <Block title="Today">
          {day.shipped.length > 0 && (
            <Group label="Shipped">
              {day.shipped.slice(0, SHIPPED_MAX).map((t) => (
                <li key={t.id}>
                  <a
                    href={showHref(t.key)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      openShow(t.key);
                    }}
                    title="Show the work"
                    className="ak-row"
                    style={{ ...row, gridTemplateColumns: "auto minmax(0, 1fr) auto" }}
                  >
                    <Dot color="var(--green)" />
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{t.summary?.trim() || t.title}</span>
                    <span className="mono" style={key}>
                      {t.key}
                    </span>
                  </a>
                </li>
              ))}
              {day.shipped.length > SHIPPED_MAX && (
                <li style={{ padding: "4px 0" }}>
                  <a href={href(board)} onClick={onNav(board)} style={{ fontSize: 14, textDecoration: "none" }}>
                    and {day.shipped.length - SHIPPED_MAX} more
                  </a>
                </li>
              )}
            </Group>
          )}
          {day.inReview.length > 0 && (
            <Group label="In review">
              {day.inReview.map((t) => {
                const to: Route = { view: "ticket", project: slug, key: t.key };
                return (
                  <li key={t.id}>
                    <a href={href(to)} onClick={onNav(to)} className="ak-row" style={{ ...row, gridTemplateColumns: "auto minmax(0, 1fr) auto" }}>
                      <span className="mono" style={key}>
                        {t.key}
                      </span>
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{t.title}</span>
                      {t.assignee_id && <span style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{ws.nameOf(t.assignee_id)}</span>}
                    </a>
                  </li>
                );
              })}
            </Group>
          )}
          {day.decided.length > 0 && (
            <Group label="Decided">
              {day.decided.map((d) => {
                const to: Route = { view: "decisions", project: slug };
                return (
                  <li key={d.id}>
                    <a href={href(to)} onClick={onNav(to)} className="ak-row" style={{ ...row, gridTemplateColumns: "auto minmax(0, 1fr)" }}>
                      <span className="mono" style={key}>
                        {d.key}
                      </span>
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{d.title}</span>
                    </a>
                  </li>
                );
              })}
            </Group>
          )}
        </Block>
      )}

      <SetupChecklist ws={ws} me={me} />

      <nav aria-label="Next" style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 14, paddingTop: 4 }}>
        <a href={href(board)} onClick={onNav(board)} style={{ textDecoration: "none" }}>
          Open the board
        </a>
        <a href={href(captain)} onClick={onNav(captain)} style={{ textDecoration: "none" }}>
          Talk to Captain
        </a>
      </nav>
    </div>
  );
}

// ------------------------------------------------------------------ needs you

/** One compact row: what it is, the ticket, how long it has waited. Opens the item on the Captain page. */
function NeedRow({ need, slug }: { need: Need; slug: string }) {
  const t = need.ticket;
  const to = `${href({ view: "captain", project: slug })}#need-${need.key}`;
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(to, false, false);
      }}
      className="ak-row"
      style={{ ...row, gridTemplateColumns: "auto auto minmax(0, 1fr) auto" }}
    >
      <Dot color="var(--amber)" />
      <span style={{ whiteSpace: "nowrap" }}>{need.action}</span>
      <span style={{ minWidth: 0, color: "var(--text-muted)", ...ellipsis }}>
        {t ? (
          <>
            <span className="mono" style={{ fontSize: 12 }}>
              {t.key}
            </span>{" "}
            {t.title}
          </>
        ) : (
          withoutPlan(need.question).split("\n")[0]
        )}
      </span>
      <span style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{ago(need.since)}</span>
    </a>
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

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 13, fontWeight: 500, color: "var(--text-dim)" }}>{title}</h2>
      {children}
    </section>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <h3 style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", paddingTop: 4 }}>{label}</h3>
      <ul style={list}>{children}</ul>
    </div>
  );
}

const Dot = ({ color }: { color: string }) => <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: color, flex: "none", alignSelf: "center" }} />;

/** Grey lines where the page will be, while the workspace loads. */
function Skeleton() {
  const line = (width: string, height = 14): CSSProperties => ({ width, height, borderRadius: 6, background: "var(--surface-raised)" });
  return (
    <div role="status" aria-label="Loading" style={column}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={line("80%", 26)} />
        <span style={line("55%")} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={line("30%", 12)} />
        <span style={line("100%")} />
        <span style={line("92%")} />
        <span style={line("70%")} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ styles

const column: CSSProperties = { width: "100%", maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 };
const list: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 };
const row: CSSProperties = { display: "grid", alignItems: "baseline", gap: 12, padding: "8px 10px", margin: "0 -10px", borderRadius: "var(--radius-md)", fontSize: 14, color: "var(--text-body)", textDecoration: "none", minWidth: 0 };
const ellipsis: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const key: CSSProperties = { fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" };
