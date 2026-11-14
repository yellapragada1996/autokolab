import { useMemo, useRef, type ReactNode } from "react";
import { eventsAfter, eventsBetween, usageAfter, usageBetween, type RunUsage, type TicketEvent } from "../lib/data";
import { EVENTS_WINDOW_MS, USAGE_WINDOW_MS, useHistoryWindow } from "./useHistory";
import { dayLanes, spendToday, stuckRows } from "./glance";
import { Lanes, NotResponding, SpendToday, TakingLonger, WaitingTable } from "./overview-parts/Flow";
import { OverviewLink } from "./overview-parts/Link";
import { overviewGlance, type OverviewGlance } from "./glance";
import type { CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";
import { Goals } from "./overview-parts/Goals";
import { Heading } from "./overview-parts/Heading";
import "./overview-parts/overview.css";

export interface OverviewSnapshot { view: OverviewGlance; at: Date }

/** Failed or incomplete refreshes keep the last complete view, only within the same project. */
export function keepOverviewSnapshot(previous: OverviewSnapshot | null, next: OverviewSnapshot | null, projectId?: string): OverviewSnapshot | null {
  if (next) return next;
  return previous && (!projectId || previous.view.projectId === projectId) ? previous : null;
}

export function OverviewContent({ snapshot, failed = false, flow }: { snapshot: OverviewSnapshot | null; failed?: boolean; flow?: ReactNode }) {
  const view = snapshot?.view;
  return <div className="ak-overview-scope"><div className={`ov${view && failed ? " stale" : ""}`} aria-busy={!view && !failed ? true : undefined}>
    <h1 className="sr-only">Overview</h1>
    {!view ? failed ? <>
      <div role="alert"><div className="head"><p className="headline"><span className="sent">Couldn’t load this project.</span></p></div>
        <p className="problem-line"><span className="dot coral" aria-hidden="true" /><span>AutoKolab can’t be reached right now. Your agents keep working on their own machines.</span></p>
      </div><button className="btn" type="button" onClick={() => window.location.reload()}>Try again</button>
    </> : <>
      <div className="head"><p className="headline muted-head" role="status"><span className="sent">Loading your project…</span></p></div>
      <div className="part" aria-hidden="true"><div className="cards">{[0, 1].map(i => <span className="sk-card" key={i}>
        <span className="sk" style={{ height: 16, width: "38%" }} /><span className="sk" style={{ height: 10, borderRadius: 5 }} /><span className="sk" style={{ height: 10, width: "52%" }} />
        <span className="sk-agent"><span className="sk" style={{ width: 32, height: 32, borderRadius: 10 }} /><span><span className="sk" style={{ height: 12, width: "40%" }} /><span className="sk" style={{ height: 12, width: "70%" }} /></span></span>
      </span>)}</div></div>
    </> : <>
      {failed && <p className="problem-line stale-line" role="alert"><span className="dot coral" aria-hidden="true" /><span>Couldn’t refresh. This is how things were at {snapshot.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</span></p>}
      <p className="ov-label">Overview · updated just now</p>
      <Heading view={view} />
      {view.requests.length > 0 && <p className="ov-answer"><OverviewLink to={{ view: "captain", project: view.slug }}>Answer {view.requests.length === 1 ? "it" : "them"} in Captain</OverviewLink> · {view.requests.length === 1 ? "1 thing is" : `${view.requests.length} things are`} waiting on you.</p>}
      <div className="ov-flow">{flow ?? <WaitingTable rows={view.waits} slug={view.slug} />}</div>
      <Goals view={view} />
    </>}
  </div></div>;
}

export function Overview({ ws, cr, error }: { ws: Workspace | null; me: string; cr: CaptainRoom; error?: string }) {
  const failed = !!(error || cr.loadError);
  // Recompute only when source data changes, never on a timer.
  const calculated = useMemo<OverviewSnapshot | null>(() => {
    if (!ws || cr.room === undefined || failed) return null;
    const at = new Date();
    return { view: overviewGlance(ws, cr.actionable, cr.plans, at), at };
  }, [ws, cr.room, cr.actionable, cr.plans, failed]);
  const held = useRef<OverviewSnapshot | null>(null);
  held.current = keepOverviewSnapshot(held.current, calculated, ws?.project.id);

  const snap = held.current;
  // The flow cards read history themselves (FlowCards), so this component stays a pure calculation.
  const flow = ws && snap && !failed ? <FlowCards ws={ws} cr={cr} snapshot={snap} /> : undefined;
  return <OverviewContent snapshot={snap} failed={failed} flow={flow} />;
}

/**
 * "Taking longer than usual" needs the ticket history, and the day's lanes and spend need what each
 * run recorded. Both are read once, then only what changed (useHistoryWindow); preview has its own.
 */
function FlowCards({ ws, cr, snapshot }: { ws: Workspace; cr: CaptainRoom; snapshot: OverviewSnapshot }) {
  const projectId = ws.project.id;
  const events = useHistoryWindow<TicketEvent>(ws.demoEvents ? undefined : projectId, EVENTS_WINDOW_MS, {
    read: (from, to) => eventsBetween(projectId, from, to),
    readAfter: (afterId, from) => eventsAfter(projectId, afterId, from),
  });
  const usage = useHistoryWindow<RunUsage>(ws.demoUsage ? undefined : projectId, USAGE_WINDOW_MS, {
    read: (from, to) => usageBetween(projectId, from, to),
    readAfter: (afterId, from) => usageAfter(projectId, afterId, from),
  });
  const { view, at: now } = snapshot;
  const runs = ws.demoUsage ?? usage.rows;
  const gone = view.team.find((a) => a.state === "offline" && a.waiting > 0 && a.id !== ws.project.lead_agent_id);
  return <>
    <NotResponding agent={gone} slug={view.slug} projectId={projectId} />
    <WaitingTable rows={view.waits} slug={view.slug} />
    <TakingLonger rows={stuckRows(ws, ws.demoEvents ?? events.rows, view.team, now)} slug={view.slug} />
    <Lanes day={dayLanes(ws, runs, view.team, cr.actionable, now)} />
    <SpendToday spend={spendToday(ws, runs, view.team, now)} />
  </>;
}
