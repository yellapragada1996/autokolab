import { useState } from "react";
import type { OverviewGlance, OverviewGoal } from "../glance";
import { AgentRow } from "./AgentRow";
import { GoalProgress } from "./GoalProgress";
import { OverviewLink } from "./Link";

function GoalCard({ goal, view }: { goal: OverviewGoal; view: OverviewGlance }) {
  const [selected, highlight] = useState<string | null>(null);
  const crew = view.team.filter(a => a.goalId === goal.id);
  return <section className="card" aria-label={goal.name}>
    <h3 className="card-name"><OverviewLink to={{ view: "goals", project: view.slug }} title={goal.name}><span>{goal.name}</span></OverviewLink></h3>
    <GoalProgress goal={goal} slug={view.slug} selected={selected} highlight={highlight} />
    {crew.length ? <ul className="list crew">{crew.map(a => <AgentRow key={a.id} agent={a} slug={view.slug} highlight={highlight} selected={selected} />)}</ul>
      : <p className="card-empty">{goal.finished ? `Finished today at ${new Date(goal.finished).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}.` : "Nobody on this right now."}</p>}
  </section>;
}

export function Goals({ view }: { view: OverviewGlance }) {
  const free = view.team.filter(a => !a.goalId);
  if (!view.goals.length && !free.length) return null;
  // Unassigned live work is real, but it cannot be placed inside an invented goal.
  const hasActive = free.some(a => !["idle", "offline", "paused"].includes(a.state));
  const unassigned = free.length ? <section className={`free ${!view.goals.length ? "solo" : view.goals.length % 2 ? "" : "span"}`}>
    <h2 className="part-title">{hasActive ? "Other agents" : "Not working right now"}</h2>
    <ul className="list">{free.map(a => <AgentRow key={a.id} agent={a} slug={view.slug} />)}</ul>
  </section> : null;
  return <div className="part" aria-label={view.goals.length ? "Being built" : "Agents"}>
    {view.goals.length ? <><h2 className="sr-only">Being built</h2><div className="cards">{view.goals.map(g => <GoalCard key={g.id} goal={g} view={view} />)}{unassigned}</div></> : unassigned}
  </div>;
}
