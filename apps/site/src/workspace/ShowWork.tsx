import { useEffect, useRef, useState } from "react";
import { ticketDetail, type TicketEvent } from "../lib/data";
import { closeShow, openShow, type ShowPart } from "../lib/router";
import { Button, Skeleton } from "../ui";
import { historyTime, undoMessage, undoState, workHistory, workRows, workSummary } from "./showWork";
import type { CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";

const PARTS: { id: ShowPart; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "change", label: "The change" },
  { id: "history", label: "History" },
];

export function ShowWork({ ws, captain, ticketKey, part, demoEvents }: { ws: Workspace; captain: CaptainRoom; ticketKey: string; part: ShowPart; demoEvents?: Map<string, TicketEvent[]> }) {
  const ticket = ws.byKey.get(ticketKey);
  const panel = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [events, setEvents] = useState<TicketEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => { setConfirm(false); setSendFailed(false); setSent(null); }, [ticketKey]);

  const undo = ticket ? undoState(ticket, captain.turns) : { kind: "none" as const };
  const askedAt = undo.kind === "asked" ? undo.at : sent;
  const askUndo = async () => {
    if (!ticket || sending) return;
    setSending(true);
    setSendFailed(false);
    const ok = await captain.send(undoMessage(ticket), null, `undo:${ticket.key}`);
    setSending(false);
    if (ok) { setSent(new Date().toISOString()); setConfirm(false); }
    else setSendFailed(true);
  };

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeShow();
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ticketKey]);

  useEffect(() => {
    setEvents(null);
    setFailed(false);
    if (!ticket) return;
    if (demoEvents) { setEvents(demoEvents.get(ticket.id) ?? []); return; }
    let active = true;
    void ticketDetail(ticket.id).then((detail) => { if (active) setEvents(detail.events); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [ticket?.id, demoEvents]);

  const select = (next: ShowPart) => openShow(ticketKey, next);
  const arrow = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % PARTS.length;
    else if (e.key === "ArrowLeft") next = (i + PARTS.length - 1) % PARTS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = PARTS.length - 1;
    else return;
    e.preventDefault();
    select(PARTS[next].id);
    requestAnimationFrame(() => tabs.current[next]?.focus());
  };

  return (
    <div className="ak-show-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeShow(); }}>
      <section ref={panel} className="ak-show-sheet" role="dialog" aria-modal="true" aria-labelledby="ak-show-title" tabIndex={-1}>
        <header className="ak-show-header">
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: "0 0 4px", color: "var(--text-muted)", fontSize: 12 }}>Show the work</p>
            <h2 id="ak-show-title" style={{ margin: 0, fontSize: 18, fontWeight: 500, lineHeight: 1.35, overflowWrap: "anywhere" }}>{ticket ? `${ticket.key} · ${ticket.title}` : ticketKey}</h2>
          </div>
          <button className="ak-show-close" type="button" onClick={closeShow} aria-label="Close Show the work">×</button>
        </header>
        {!ticket ? <p style={{ padding: "22px 26px", fontSize: 14 }}>No ticket {ticketKey} in this project.</p> : <>
          <div className="ak-show-tabs" role="tablist" aria-label="Show the work sections">
            {PARTS.map((tab, i) => <button key={tab.id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`ak-show-tab-${tab.id}`} aria-controls="ak-show-panel" aria-selected={part === tab.id} tabIndex={part === tab.id ? 0 : -1} onClick={() => select(tab.id)} onKeyDown={(e) => arrow(e, i)}>{tab.label}</button>)}
          </div>
          <div className="ak-show-body" role="tabpanel" id="ak-show-panel" aria-labelledby={`ak-show-tab-${part}`} tabIndex={0}>
            {part === "summary" && <>
              <p className="ak-show-summary">{workSummary(ticket)}</p>
              {workRows(ws, ticket).length > 0 && <dl className="ak-show-rows">{workRows(ws, ticket).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}{row.sha && <> · <code>{row.sha}</code></>}{row.at && <> · {new Date(row.at).toLocaleString()}</>}</dd></div>)}</dl>}
              {ticket.done_means.length > 0 && <section className="ak-show-done"><h3>Done means</h3><ul>{ticket.done_means.map((item, i) => <li key={i}>{(ticket.approved_sha || ticket.status === "done") && <span aria-label="Met" className="ak-show-tick">✓</span>}{item}</li>)}</ul></section>}
              {undo.kind === "risky" && <p className="ak-show-undo">This change needed an OK to merge (database, CI, dependencies or sign-in), so it can't be undone automatically. Ask Captain if it needs reversing.</p>}
              {undo.kind === "can" && <div className="ak-show-undo">
                {askedAt ? <p>Asked Captain to undo this. It will show up as a new ticket.</p> : confirm ? <>
                  <p>Captain will open a change that reverses this one. It goes through the same tests, review and merge.</p>
                  <div className="ak-show-undo-actions"><Button size="sm" variant="primary" disabled={sending} onClick={() => void askUndo()}>{sending ? "Sending…" : "Yes, undo it"}</Button><Button size="sm" variant="ghost" disabled={sending} onClick={() => { setConfirm(false); setSendFailed(false); }}>Cancel</Button></div>
                </> : <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>Undo this change</Button>}
                {sendFailed && <p role="alert">Couldn't ask Captain to undo this. Please try again.</p>}
              </div>}
              {undo.kind === "asked" && <p className="ak-show-undo">You asked Captain to undo this at {new Date(undo.at).toLocaleString()}.</p>}
            </>}
            {part === "change" && <>
              {ticket.review?.line ? <section className="ak-show-change"><h3>The line that matters</h3><p className="ak-show-file">{ticket.review.line.file}</p><pre>{ticket.review.line.code.split("\n").map((line, i) => <span key={i} className={line.startsWith("+") && !line.startsWith("+++") ? "ak-show-added" : undefined}>{line}{"\n"}</span>)}</pre>{ticket.review.line.plain && <p>In plain words: {ticket.review.line.plain}</p>}</section> : !ticket.pr_url && <p>No change recorded yet.</p>}
              {ticket.pr_url && <a href={ticket.pr_url} target="_blank" rel="noopener noreferrer">Open the full change on GitHub</a>}
            </>}
            {part === "history" && <>
              {failed ? <p>History couldn't be loaded right now.</p> : events === null ? <Skeleton lines={4} /> : <><ol className="ak-show-history">{workHistory(ws, events).map((e) => <li key={e.id}><time dateTime={e.at}>{historyTime(e.at)}</time><span>{e.text}</span></li>)}</ol>{!workHistory(ws, events).length && <p>No history recorded yet.</p>}<p className="ak-show-foot">Written by the database, not by the agents.</p></>}
            </>}
          </div>
        </>}
      </section>
    </div>
  );
}
