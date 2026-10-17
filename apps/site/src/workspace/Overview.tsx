import { useMemo, useRef } from "react";
import { overviewGlance, type OverviewGlance } from "./glance";
import type { CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";
import { Goals } from "./overview-parts/Goals";
import { Heading } from "./overview-parts/Heading";
import { NeedsYou } from "./overview-parts/NeedsYou";
import "./overview-parts/overview.css";

export interface OverviewSnapshot { view: OverviewGlance; at: Date }

/** Failed or incomplete refreshes keep the last complete view, only within the same project. */
export function keepOverviewSnapshot(previous: OverviewSnapshot | null, next: OverviewSnapshot | null, projectId?: string): OverviewSnapshot | null {
  if (next) return next;
  return previous && (!projectId || previous.view.projectId === projectId) ? previous : null;
}

export function OverviewContent({ snapshot, failed = false }: { snapshot: OverviewSnapshot | null; failed?: boolean }) {
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
      <NeedsYou view={view} /><Heading view={view} /><Goals view={view} />
    </>}
  </div></div>;
}

export function Overview({ ws, cr, error }: { ws: Workspace | null; me: string; cr: CaptainRoom; error?: string }) {
  const failed = !!(error || cr.loadError);
  // No history query is needed for this view. Recompute only when source data changes, never on a timer.
  const calculated = useMemo<OverviewSnapshot | null>(() => {
    if (!ws || cr.room === undefined || failed) return null;
    const at = new Date();
    return { view: overviewGlance(ws, cr.needs, cr.plans, at), at };
  }, [ws, cr.room, cr.needs, cr.plans, failed]);
  const held = useRef<OverviewSnapshot | null>(null);
  held.current = keepOverviewSnapshot(held.current, calculated, ws?.project.id);
  return <OverviewContent snapshot={held.current} failed={failed} />;
}
