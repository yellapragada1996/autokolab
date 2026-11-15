import type { OverviewAgent, OverviewGlance, StuckRow, WaitRow } from "../glance";
import { OverviewLink } from "./Link";

// The Overview below its headline: what is being built now, and what needs attention.
// One rule for both: a line is either worth reading at full size or it is not on the page.

/** On this project's work right now. Idle, offline and paused agents, and agents busy elsewhere, are not. */
const active = (a: OverviewAgent) => !["idle", "offline", "paused"].includes(a.state) && !a.elsewhere;
const TONE: Partial<Record<OverviewAgent["state"], "wait" | "stop">> = { waiting: "wait", failed: "stop", blocked: "stop", limit: "stop" };

function Crew({ agents, slug }: { agents: OverviewAgent[]; slug: string }) {
  return <span className="b-crew">{agents.map(a => {
    const tone = TONE[a.state];
    return <OverviewLink key={a.id} className="b-agent" title={a.doing || undefined} to={a.key ? { view: "ticket", project: slug, key: a.key } : { view: "people", project: slug }}>
      <span className="b-av" aria-hidden="true">{a.name[0]?.toUpperCase()}</span>
      <span className="b-text"><b title={a.name}>{a.name}</b>{a.doing ? ` ${a.doing}` : tone ? "" : ` ${a.word}`}{tone && <span className={`b-${tone}`}> {a.word}</span>}</span>
    </OverviewLink>;
  })}</span>;
}

/** One line per goal an agent is on now. Goals that are finished, not started or unattended are not listed. */
export function BeingBuilt({ view }: { view: OverviewGlance }) {
  const goals = view.goals.map(goal => ({ goal, crew: view.team.filter(a => a.goalId === goal.id && active(a)) })).filter(x => x.crew.length);
  const other = view.team.filter(a => !a.goalId && a.key && active(a));
  if (!goals.length && !other.length) return null;
  return <section className="b-card" aria-label="Being built now">
    <h2>Being built now</h2>
    {goals.map(({ goal, crew }) => {
      const done = goal.tickets.filter(t => t.segment === "d").length;
      return <div className="b-row b-goal" key={goal.id}>
        <OverviewLink className="b-name" to={{ view: "goals", project: view.slug }} title={goal.name}>{goal.name}</OverviewLink>
        <span className="b-bar" role="img" aria-label={`${done} of ${goal.tickets.length} tickets done`}><i style={{ width: `${goal.tickets.length ? Math.round(done / goal.tickets.length * 100) : 0}%` }} /></span>
        <Crew agents={crew} slug={view.slug} />
      </div>;
    })}
    {other.length > 0 && <div className="b-row b-goal"><span className="b-name">Other work</span><span /><Crew agents={other} slug={view.slug} /></div>}
  </section>;
}

export const MAX_ATTENTION = 3;

/**
 * Work that is stuck or slow and that the person can't settle by answering Captain: their own items
 * live there, and a usage limit is already in the headline and on its goal. Nothing to show, no card.
 */
export function NeedsAttention({ waits, stuck, slug }: { waits: WaitRow[]; stuck: StuckRow[]; slug: string }) {
  // Only real stops: a reported problem or a computer that is off. Waiting for a review or behind another
  // ticket is the normal queue, and shows up as "taking longer than usual" once it actually is.
  const held = waits.filter(r => /^(problem|offline):/.test(r.key));
  const items = [
    ...held.map(r => ({ key: r.key, ticket: r.ticketKey, tone: "stop", lead: `${r.who} ${/^(?!1 )\d/.test(r.who) ? "are" : "is"} waiting on ${r.on}.`, rest: r.why })),
    ...stuck.filter(r => !held.some(h => h.ticketKey === r.key)).map(r => ({ key: `slow:${r.key}`, ticket: r.key, tone: r.tone === "problem" ? "stop" : "slow", lead: `${r.title} is taking longer than usual.`, rest: `${r.text}.${r.tag ? ` ${r.tag}.` : ""}` })),
  ].slice(0, MAX_ATTENTION);
  if (!items.length) return null;
  return <section className="b-card" aria-label="Needs attention">
    <h2>Needs attention</h2>
    {items.map(i => <div className="b-row b-look" key={i.key}>
      <span className={`b-dot ${i.tone}`} aria-hidden="true" />
      <span>{i.ticket ? <OverviewLink className="b-lead" to={{ view: "ticket", project: slug, key: i.ticket }}>{i.lead}</OverviewLink> : <b className="b-lead">{i.lead}</b>} {i.rest}</span>
    </div>)}
  </section>;
}
