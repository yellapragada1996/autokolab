import { href } from "../../lib/router";
import type { OverviewGlance } from "../glance";
import { OverviewLink } from "./Link";

export function NeedsYou({ view }: { view: OverviewGlance }) {
  if (!view.requests.length) return null;
  const to = (key: string) => `${href({ view: "captain", project: view.slug })}#${encodeURIComponent(`need-${key}`)}`;
  return <section className="needs" aria-label="Needs you">
    <h2 className="part-title">Needs you</h2>
    <ul className="list">{view.requests.slice(0, 3).map(r => <li key={r.key}>
      <OverviewLink className="row need" to={to(r.key)}>
        <span className="need-mark" aria-hidden="true" />
        <span><span className="need-q" title={r.text}>{r.text}</span><span className="need-meta">{r.meta}</span></span>
        <span className="need-act">{r.action} →</span>
      </OverviewLink>
    </li>)}</ul>
    {view.requests.length > 3 && <OverviewLink className="more" to={to(view.requests[view.requests.length - 1].key)}>and {view.requests.length - 3} more in Captain →</OverviewLink>}
    <p className="sr-only" role="status">{view.requests.length} {view.requests.length === 1 ? "thing needs" : "things need"} you</p>
  </section>;
}
