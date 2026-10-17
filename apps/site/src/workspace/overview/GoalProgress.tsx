import { useId, useState } from "react";
import { SEGMENT_ORDER, SEGMENT_WORD, type OverviewGoal } from "../glance";
import { OverviewLink } from "./Link";

export function progressCounts(goal: OverviewGoal) {
  return SEGMENT_ORDER.map(segment => ({ segment, word: SEGMENT_WORD[segment], count: goal.tickets.filter(t => t.segment === segment).length })).filter(x => x.count);
}

export function GoalProgress({ goal, slug, selected, highlight }: { goal: OverviewGoal; slug: string; selected: string | null; highlight: (key: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<{ key: string; x: number; top: number; room: number } | null>(null);
  const id = useId();
  const counts = progressCounts(goal);
  const hovered = goal.tickets.find(t => t.key === tip?.key);
  const count = goal.tickets.length;
  return <div className={`prog${open ? " open" : ""}`}>
    <button className="line-btn" type="button" aria-expanded={open} aria-controls={id}
      aria-label={`${goal.name}: ${counts.map(x => `${x.count} ${x.word}`).join(", ")}. ${open ? "Hide" : "Show"} its ${count} ${count === 1 ? "ticket" : "tickets"}.`}
      onClick={() => { setOpen(value => !value); setTip(null); }} onMouseLeave={() => { setTip(null); highlight(null); }} onKeyDown={event => { if (event.key === "Escape") setTip(null); }}>
      <span className="bar-row">
        <span className={`gl${count > 16 ? " cont" : ""}`} aria-hidden="true">{goal.tickets.map(t => <span key={t.key}
          className={`gs ${t.segment}${selected === t.key ? " hl" : ""}`}
          onMouseEnter={event => {
            const segment = event.currentTarget.getBoundingClientRect();
            const parent = event.currentTarget.closest(".prog")!.getBoundingClientRect();
            setTip({ key: t.key, x: segment.left - parent.left + segment.width / 2, top: segment.top - parent.top, room: parent.width });
            highlight(t.key);
          }} />)}</span>
        <span className="n-tasks">{count} {count === 1 ? "ticket" : "tickets"} <svg className="chev" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </span>
      <span className="legend" aria-hidden="true">{counts.map(x => <span className="lg" key={x.segment}><span className={`gs ${x.segment}`} /><span><b>{x.count}</b> {x.word}</span></span>)}</span>
    </button>
    <div className="tray" id={id} hidden={!open}><ul>{goal.tickets.map(t => <li key={t.key}>
      <OverviewLink className={`trow${selected === t.key ? " hl" : ""}`} to={{ view: "ticket", project: slug, key: t.key }}
        onMouseEnter={() => highlight(t.key)} onMouseLeave={() => highlight(null)} onFocus={() => highlight(t.key)} onBlur={() => highlight(null)}>
        <span className={`gs ${t.segment}`} aria-hidden="true" /><span className="t-key">{t.key}</span>
        <span className="t-title" title={t.title}>{t.title}</span><span className="t-meta">{t.detail}</span><span className="t-go" aria-hidden="true">→</span>
        <span className="sr-only">, {t.description}</span>
      </OverviewLink>
    </li>)}</ul></div>
    {hovered && tip && <div className="tip show" aria-hidden="true" ref={node => {
      if (!node) return;
      const left = Math.max(-8, Math.min(tip.room - node.offsetWidth + 8, tip.x - node.offsetWidth / 2));
      node.style.left = `${left}px`;
      node.style.top = `${tip.top - node.offsetHeight - 10}px`;
      node.style.setProperty("--arrow", `${tip.x - left}px`);
    }}><b><span className="k">{hovered.key}</span>{hovered.title}</b><span className="m">{hovered.description}</span></div>}
  </div>;
}
