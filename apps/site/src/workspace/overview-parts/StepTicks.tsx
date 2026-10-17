import type { OverviewAgent } from "../glance";

export function StepTicks({ agent }: { agent: OverviewAgent }) {
  if (!agent.steps.length) return null;
  const text = agent.step ? `step ${agent.step} of ${agent.steps.length}` : `${agent.steps.filter(s => s.status === "done").length} of ${agent.steps.length} steps done`;
  return <span className="steps"><span className="ticks" aria-hidden="true">{agent.steps.map(s => <span key={s.idx} className={`tick${s.status === "done" ? " d" : s.status === "now" ? " n" : ""}`} />)}</span>{text}</span>;
}
