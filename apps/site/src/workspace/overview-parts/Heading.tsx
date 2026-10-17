import type { OverviewGlance } from "../glance";
import { OverviewLink } from "./Link";

// Match the reference's wrapping: keep hyphenated names together, and a short single goal
// on one desktop line. The phone stylesheet lets the goal wrap again.
const noBreak = (text: string) => text.split(/(\S+-\S+)/g).map((part, index) => part.length <= 16 && /\S+-\S+/.test(part) ? <span className="nw" key={index}>{part}</span> : part);
function sentence(text: string, view: OverviewGlance) {
  const working = /^(.*(?:working on|reviewing)) (.+)\.$/.exec(text);
  if (!working) return noBreak(text);
  const goal = view.goals.find(g => g.name === working[2]);
  const target = noBreak(working[2].replace(/ (goals?)$/, "\u00a0$1"));
  return <>{working[1]}{"\u00a0"}{goal && goal.name.length <= 36 ? <span className="goal">{target}</span> : target}.</>;
}

export function Heading({ view }: { view: OverviewGlance }) {
  return <div className="head">
    {view.croc && <img className={`croc ${view.croc}`} src="/brand/autokolab-croc.svg" alt="" aria-hidden="true" />}
    <p className="headline">{view.headings.map((line, index) => <span className={`sent ${line.tone ?? ""}`} key={index}>
      {line.link ? <><OverviewLink to={{ view: line.link.to, project: view.slug }}>{line.link.text}</OverviewLink>{line.text.slice(line.link.text.length)}</> : sentence(line.text, view)}
    </span>)}</p>
  </div>;
}
