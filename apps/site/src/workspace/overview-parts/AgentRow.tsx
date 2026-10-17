import type { OverviewAgent } from "../glance";
import { OverviewLink } from "./Link";
import { StepTicks } from "./StepTicks";

export function AgentRow({ agent, slug, highlight, selected }: { agent: OverviewAgent; slug: string; highlight?: (key: string | null) => void; selected?: string | null }) {
  const quiet = ["idle", "offline", "paused"].includes(agent.state);
  const ring = ["working", "reviewing"].includes(agent.state) ? "live" : agent.state === "waiting" ? "wait" : ["failed", "blocked", "limit"].includes(agent.state) ? "stop" : null;
  return <li><OverviewLink className={`row agent${!agent.goalId && agent.doing ? " has-work" : ""}${quiet ? " quiet" : ""}${ring ? ` s-${ring}-row` : ""}${agent.key && selected === agent.key ? " hover" : ""}`}
    to={agent.key ? { view: "ticket", project: slug, key: agent.key } : { view: "people", project: slug }}
    onMouseEnter={() => highlight?.(agent.key)} onMouseLeave={() => highlight?.(null)} onFocus={() => highlight?.(agent.key)} onBlur={() => highlight?.(null)}>
    <span className={`av${ring ? ` s-${ring}` : ""}`} aria-hidden="true">{agent.name[0]}</span>
    <span className="a-name" title={agent.name}>{agent.name}</span>
    <span className="a-doing" title={agent.doing}>{agent.doing}</span>
    <StepTicks agent={agent} />
    <span className="a-state">{agent.word}</span>
  </OverviewLink></li>;
}
