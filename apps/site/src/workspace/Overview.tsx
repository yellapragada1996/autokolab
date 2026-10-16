import { useEffect, useMemo, useState } from "react";
import { eventsAfter, eventsBetween, type TicketEvent } from "../lib/data";
import { go, href, onNav, openShow, type Route } from "../lib/router";
import { EVENTS_WINDOW_MS, useHistoryWindow } from "./useHistory";
import { overviewGlance } from "./glance";
import type { CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";

/** The approved Overview: one answer, then the person, team, goals and delivery. */
export function Overview({ ws, cr }: { ws: Workspace | null; me: string; cr: CaptainRoom }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
  const projectId = ws?.project.id;
  const demoEvents = ws?.demoEvents;
  const { rows: liveEvents } = useHistoryWindow(demoEvents ? undefined : projectId, EVENTS_WINDOW_MS, {
    read: (from, to) => projectId ? eventsBetween(projectId, from, to) : Promise.resolve([] as TicketEvent[]),
    readAfter: (afterId, from) => projectId ? eventsAfter(projectId, afterId, from) : Promise.resolve([] as TicketEvent[]),
  });
  const events = demoEvents ?? liveEvents;
  const view = useMemo(() => ws ? overviewGlance(ws, cr.needs, cr.plans, events, now) : null, [ws, cr.needs, cr.plans, events, now]);
  if (!ws || !view) return <div className="ak-overview"><h1>Overview</h1><p>Loading your project…</p></div>;
  const slug = ws.project.slug;
  const captain: Route = { view: "captain", project: slug };
  const work: Route = { view: "board", project: slug };
  const connect: Route = { view: "connect", project: slug };
  const answer = (key: string) => go(`${href(captain)}#need-${key}`, false, false);
  return (
    <div className="ak-overview">
      <h1>Overview</h1>
      <p className="ak-overview-state">{view.sentence}</p>
      {view.next && <p className="ak-overview-next"><strong>Next from Captain:</strong> {view.next}</p>}

      {view.state === "new" ? (
        <section className="ak-overview-section" aria-label="First steps">
          <h2>Start here</h2>
          <div className="ak-overview-list">
            {!ws.project.lead_agent_id && <div className="ak-overview-row ak-overview-setup"><span className="ak-overview-step">1</span><div><strong>Connect Captain</strong><div className="ak-overview-quiet">Give Captain a way to answer you and manage the work.</div></div></div>}
            <div className="ak-overview-row ak-overview-setup"><span className="ak-overview-step">{ws.project.lead_agent_id ? "1" : "2"}</span><div><strong>Tell Captain your first goal</strong><div className="ak-overview-quiet">A sentence is enough. Captain will take it from there.</div></div></div>
          </div>
          <a className="ak-overview-foot-link" href={href(ws.project.lead_agent_id ? captain : connect)} onClick={onNav(ws.project.lead_agent_id ? captain : connect)}>{ws.project.lead_agent_id ? "Tell Captain →" : "Connect Captain →"}</a>
        </section>
      ) : <>
        {view.requests.length > 0 && <section className="ak-overview-section" aria-label="Needs you">
          <h2>You are needed</h2>
          <div className="ak-overview-list">{view.requests.map((r) => <div className="ak-overview-row ak-overview-request" key={r.key}>
            <span className="ak-overview-dot amber" aria-hidden="true"/><div className="ak-overview-row-main">{r.text}</div>
            <button type="button" className="ak-overview-link ak-overview-row-end" onClick={() => answer(r.key)}>Open in Captain →</button>
          </div>)}</div>
        </section>}
        {view.state === "problem" && view.problem && <section className="ak-overview-section" aria-label="Problem">
          <h2>What happened</h2><div className="ak-overview-list"><div className="ak-overview-row ak-overview-request">
            <span className="ak-overview-dot coral" aria-hidden="true"/><div className="ak-overview-row-main">{view.problem.text}</div>
            {view.problem.key ? <button type="button" className="ak-overview-link ak-overview-row-end" onClick={() => openShow(view.problem!.key!)}>Show the record →</button> : view.problem.people && <a className="ak-overview-link ak-overview-row-end" href={href({ view: "people", project: slug })} onClick={onNav({ view: "people", project: slug })}>Show the team →</a>}
          </div></div>
        </section>}
        {view.team.length > 0 && <section className="ak-overview-section" aria-label="Team at work">
          <h2>Who is doing what</h2><div className="ak-overview-list">{view.team.map((r) => <div className="ak-overview-row ak-overview-team" key={r.id}>
            <span className="ak-overview-avatar" aria-hidden="true">{r.name[0]}</span>
            <div className="ak-overview-row-main"><strong>{r.name}</strong> <span className="ak-overview-quiet">· {r.task}</span></div>
            {r.tone !== "quiet" && <span className={`ak-overview-dot ${r.tone === "problem" ? "coral" : ""}`} aria-label={r.state}/>}
            <span className="ak-overview-row-end">{r.state}</span>
          </div>)}</div>
        </section>}
        {view.goals.length > 0 && <section className="ak-overview-section" aria-label="Goals">
          <h2>Goals</h2><div className="ak-overview-list">{view.goals.map((g) => <div className="ak-overview-row ak-overview-goal" key={g.id}>
            <div className="ak-overview-row-main"><strong>{g.name}</strong><span className="ak-overview-quiet">{g.next}</span></div>
            <span className="ak-overview-progress">{g.total > 0 ? `${g.done} of ${g.total} tasks done` : "Not started"}</span>
          </div>)}</div>
          <a className="ak-overview-foot-link" href={href(work)} onClick={onNav(work)}>See all work →</a>
        </section>}
        {view.goals.length === 0 && <a className="ak-overview-foot-link" href={href(work)} onClick={onNav(work)}>See all work →</a>}
        {view.delivered.length > 0 && <section className="ak-overview-section" aria-label="Delivered today">
          <h2>Delivered today</h2><div className="ak-overview-list">{view.delivered.map((d) => <div className="ak-overview-row" key={d.key}>
            <span className="ak-overview-dot green" aria-hidden="true"/><div className="ak-overview-row-main">{d.text}</div>
            <button type="button" className="ak-overview-link ak-overview-row-end" onClick={() => openShow(d.key)}>Show the record →</button>
          </div>)}</div>
        </section>}
        {view.state === "calm" && view.goals.every((g) => g.total > 0 && g.done === g.total) && <p className="ak-overview-note">Have another goal? Tell Captain when you’re ready.</p>}
      </>}
    </div>
  );
}
