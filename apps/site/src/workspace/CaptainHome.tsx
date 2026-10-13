import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { href, onNav, go, openLook, type Route } from "../lib/router";
import { AgentAvatar, Button } from "../ui";
import { Markdown } from "./bits";
import {
  answeredLine,
  catchUpItems,
  catchUpSummary,
  catchUpText,
  clock,
  dayLabel,
  folded,
  foldText,
  needText,
  planLine,
  problemText,
  replyPreview,
  shortened,
  timeline,
  withoutPlan,
  type CatchUp,
  type Need,
  type Plan,
  type Row,
  type Turn,
} from "./captain";
import { ApproveChange } from "./ApproveChange";
import { EvidencePanel } from "./EvidencePanel";
import { agentDot } from "./People";
import { withTicketLinks } from "./Room";
import { planKey, replyKey, type Answered, type CaptainRoom, type ReplyTarget } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";

// Captain (AK-49, autokolab-ux-handoff/screens/S01-captain-home.md, changed by DEC-24 and AK-69): the
// person's conversation with Captain, read like a chat with a colleague, and the composer. Everything
// from Captain is one kind of message; one that needs the person adds a small mark and small actions.
// The state sentence, who's doing what and the setup checklist live on Overview. Every sentence comes
// from captain.ts; this file only draws.

export function CaptainHome({ ws, cr, me }: { ws: Workspace; cr: CaptainRoom; me: string }) {
  const [pulse, setPulse] = useState<string | null>(null);
  const { startCatchUp } = cr;
  const roomReady = cr.room !== undefined;
  useEffect(() => {
    if (roomReady) startCatchUp();
  }, [roomReady, startCatchUp]);

  // A needs-you row on Overview opens this page at #need-<key>: land on that message and pulse it.
  const toCard = (el: HTMLElement, key: string) => {
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
    setPulse(key);
    setTimeout(() => setPulse(null), 1000);
  };

  return (
    <div style={{ flex: 1, width: "100%", maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", paddingTop: 16 }}>
      <Conversation ws={ws} cr={cr} me={me} pulse={pulse} onTarget={toCard} />
    </div>
  );
}

// ------------------------------------------------------------------ the conversation

function Conversation({ ws, cr, me, pulse, onTarget }: { ws: Workspace; cr: CaptainRoom; me: string; pulse: string | null; onTarget: (el: HTMLElement, key: string) => void }) {
  const slug = ws.project.slug;
  const answeredOf = useMemo(() => new Map(cr.answered.map((a) => [a.need.key, a])), [cr.answered]);
  const entries = useMemo(() => timeline(folded(cr.turns), [...cr.needs, ...cr.answered.map((a) => a.need)], cr.catchUp?.at), [cr.turns, cr.needs, cr.answered, cr.catchUp]);
  const planOf = useMemo(() => new Map(cr.plans.map((p) => [p.turnId, p])), [cr.plans]);
  const noCaptain = !ws.project.lead_agent_id;
  const canPost = !noCaptain && !!cr.room?.me && cr.room.me.role !== "observer";

  // Opening the page lands at the newest message, once the messages and the catch-up are both in
  // (the catch-up is the newest message when there is one), or on the message the address names
  // (#need-<key>, from a needs-you row on Overview) while it still waits.
  const landed = useRef(false);
  const complete = cr.room !== undefined && (cr.catchUpReady || !cr.room);
  useLayoutEffect(() => {
    if (landed.current || !complete) return;
    landed.current = true;
    const id = decodeURIComponent(location.hash.slice(1));
    const card = id.startsWith("need-") ? document.getElementById(id) : null;
    if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
    if (card) onTarget(card, id.slice("need-".length));
    else window.scrollTo(0, document.documentElement.scrollHeight);
  }, [complete, entries.length, onTarget]);

  // New Captain messages are read out politely; the ones already there when the page opened aren't.
  const [announce, setAnnounce] = useState("");
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const last = [...cr.turns].reverse().find((t) => t.kind === "captain" || t.kind === "question" || t.kind === "problem");
    if (!last) return;
    if (seen.current !== null && last.id > seen.current) setAnnounce(`Captain${last.kind === "question" ? ", needs you" : ""}: ${last.problem ? problemText(last.problem) : withoutPlan(last.body)}`);
    seen.current = Math.max(seen.current ?? 0, last.id);
  }, [cr.turns]);

  let body: ReactNode;
  if (noCaptain) {
    body = (
      <p style={{ fontSize: 15, color: "var(--text-muted)", padding: "12px 0" }}>
        This project has no Captain yet.{" "}
        <a href={href({ view: "people", project: slug })} onClick={onNav({ view: "people", project: slug })}>
          Pick one on People
        </a>{" "}
        to start talking to it.
      </p>
    );
  } else if (cr.room === undefined) {
    body = <p style={{ fontSize: 14, color: "var(--text-dim)", padding: "12px 0" }}>Loading the conversation…</p>;
  } else if (!cr.room?.me) {
    body = (
      <p style={{ fontSize: 14, color: "var(--text-muted)", padding: "12px 0" }}>
        You're not in this project's room yet, so there's no conversation with Captain. Reload the page, or ask the owner for a new invite link.
        {cr.loadError && <span style={{ display: "block", color: "var(--coral)", marginTop: 6 }}>{cr.loadError}</span>}
      </p>
    );
  } else if (!entries.length) {
    body = (
      <CaptainMessage at={null}>
        <Markdown text="I'm set up. Tell me what you'd like built." />
      </CaptainMessage>
    );
  } else {
    let lastDay = "";
    body = entries.map((e) => {
      const day = dayLabel(e.at);
      const divider = day !== lastDay ? <DayDivider label={day} /> : null;
      lastDay = day;
      let item: ReactNode;
      if (e.kind === "catchup") item = cr.catchUp && <CatchUpMessage ws={ws} c={cr.catchUp.c} at={cr.catchUp.at} needs={cr.needs.length} />;
      else if (e.kind === "card" && e.need.kind === "plan" && planOf.has(e.need.turnId!)) item = <PlanMessage ws={ws} cr={cr} plan={planOf.get(e.need.turnId!)!} need={e.need} pulse={pulse === e.need.key} />;
      else if (e.kind === "card") item = <NeedMessage ws={ws} cr={cr} me={me} need={e.need} answered={answeredOf.get(e.need.key)} pulse={pulse === e.need.key} />;
      else if (e.row.kind !== "fold" && planOf.has(e.row.id)) item = <PlanMessage ws={ws} cr={cr} plan={planOf.get(e.row.id)!} need={null} pulse={false} />;
      else item = <RowView ws={ws} row={e.row} />;
      return (
        <Fragment key={e.key}>
          {divider}
          {item}
        </Fragment>
      );
    });
  }

  return (
    <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, padding: "8px 0 20px" }}>
        {body}
        {cr.working && (
          <span role="status" className="ak-indent" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)" }}>
            <span className="ak-live" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", flex: "none" }} />
            {(cr.captain && agentDot(cr.captain) === "working" && cr.captain.status_note) || "Captain is reading…"}
          </span>
        )}
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
      </div>
      <Composer cr={cr} disabled={!canPost} noCaptain={noCaptain} autoFocus={canPost && !entries.length} />
    </>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-dim)" }}>
      <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
      {label}
      <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
    </div>
  );
}

type Mark = "needs" | "problem";
const MARK: Record<Mark, { color: string; text: string }> = { needs: { color: "var(--amber)", text: "needs you" }, problem: { color: "var(--coral)", text: "problem" } };

/**
 * One message from Captain: avatar, "Captain · 9:17 am", plain text, no box. A message that needs the
 * person adds a small dot and "needs you" to that line (coral and "problem" for a run that went wrong).
 */
export function CaptainMessage({ at, mark, label, id, pulse, children }: { at: string | null; mark?: Mark; label?: string; id?: string; pulse?: boolean; children: ReactNode }) {
  return (
    <article id={id} tabIndex={id ? -1 : undefined} aria-label={label} className={pulse ? "ak-pulse" : undefined} style={{ display: "flex", gap: 12, minWidth: 0, borderRadius: "var(--radius-md)" }}>
      <AgentAvatar name="Captain" size={28} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)", flexWrap: "wrap" }}>
          {at ? `Captain · ${clock(at)}` : "Captain"}
          {mark && (
            <>
              <span aria-hidden="true">·</span>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: MARK[mark].color, flex: "none" }} />
              {MARK[mark].text}
            </>
          )}
        </span>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-body)", minWidth: 0, overflowWrap: "anywhere", display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>{children}</div>
      </div>
    </article>
  );
}

/** Captain's words, shortened to their beginning with "Show more" when they run long. */
function Said({ ws, text }: { ws: Workspace; text: string }) {
  const [open, setOpen] = useState(false);
  const head = useMemo(() => shortened(text), [text]);
  return (
    <>
      <div className="ak-said" style={{ minWidth: 0, width: "100%" }}>
        <Markdown text={withTicketLinks(head && !open ? head : text, ws)} />
      </div>
      {head && (
        <button type="button" className="ak-tap" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ ...textButton, fontSize: 13, minHeight: 28 }}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

function RowView({ ws, row }: { ws: Workspace; row: Row }) {
  if (row.kind === "fold") return <QuietFold turns={row.turns} />;
  if (row.kind === "you") return <YouMessage turn={row} ws={ws} />;
  if (row.kind === "problem") return <ProblemRow row={row} />;
  return (
    <CaptainMessage at={row.at}>
      <Said ws={ws} text={withoutPlan(row.body)} />
    </CaptainMessage>
  );
}

/** A run that went wrong, said plainly with a coral mark; the runner's own words one click away. */
function ProblemRow({ row }: { row: Turn }) {
  const [open, setOpen] = useState(false);
  return (
    <CaptainMessage at={row.at} mark="problem">
      <span>{problemText(row.problem ?? "")}</span>
      <button type="button" className="ak-tap" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ ...textButton, fontSize: 13, minHeight: 28, color: "var(--text-muted)" }}>
        {open ? "Hide details" : "Details"}
      </button>
      {open && (
        <pre className="mono ak-enter" style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--text-secondary)" }}>
          {row.body}
        </pre>
      )}
    </CaptainMessage>
  );
}

export function YouMessage({ turn, ws }: { turn: Turn; ws: Workspace }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>You · {clock(turn.at)}</span>
      <div style={{ maxWidth: "min(480px, 100%)", padding: "11px 15px", borderRadius: "16px 16px 4px 16px", background: "var(--surface-raised)", fontSize: 15, minWidth: 0, overflowWrap: "anywhere" }}>
        <Markdown text={withTicketLinks(turn.body, ws)} />
      </div>
    </div>
  );
}

function QuietFold({ turns }: { turns: Turn[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ak-indent" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        className="ak-tap"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 14px", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-strong)", background: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", textAlign: "left" }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform var(--dur-hover) ease", flex: "none" }}>
          <path d="M9 6l6 6-6 6" />
        </svg>
        {foldText(turns.length)}
      </button>
      {open && (
        <div className="ak-enter" style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 14 }}>
          {turns.map((t) => (
            <span key={t.id} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13, color: "var(--text-secondary)", minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }}>
                {clock(t.at)}
              </span>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{t.body.split("\n")[0]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the catch-up

const DOT: Record<"shipped" | "decided" | "problem", string> = { shipped: "var(--green)", decided: "var(--text-dim)", problem: "var(--coral)" };

function CatchUpMessage({ ws, c, at, needs }: { ws: Workspace; c: CatchUp; at: string; needs: number }) {
  const [open, setOpen] = useState(false);
  const items = catchUpItems(c);
  const summary = catchUpSummary(c);
  const slug = ws.project.slug;
  const routeOf = (ref: string): Route => (ws.byKey.has(ref) ? { view: "ticket", project: slug, key: ref } : { view: "decisions", project: slug });
  return (
    <CaptainMessage at={at}>
      <span>{catchUpText(c, needs)}</span>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "var(--text-secondary)", flexWrap: "wrap" }}>
            <span style={{ minWidth: 0 }}>{summary}</span>
            <button type="button" className="ak-tap" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ ...textButton, fontSize: 13, minHeight: 28 }}>
              {open ? "Hide" : `Show all ${items.length}`}
            </button>
          </div>
          {open && (
            <ul className="ak-enter" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it, i) => (
                <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14, color: "var(--text-body)", minWidth: 0 }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: it.type === "problem" ? 1 : "50%", background: DOT[it.type], flex: "none", alignSelf: "center" }} />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{it.text}</span>
                  {it.ref && (
                    <a href={href(routeOf(it.ref))} onClick={onNav(routeOf(it.ref))} className="mono" style={{ fontSize: 12, textDecoration: "none", flex: "none" }}>
                      {it.ref}
                    </a>
                  )}
                  <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }}>
                    {clock(it.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </CaptainMessage>
  );
}

// ------------------------------------------------------------------ messages that need the person

/** Small actions under a message: 32px, 44px on phones. */
function Actions({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{children}</div>;
}

/** The one quiet line that replaces the actions once the person has answered. */
function Quiet({ children, green }: { children: ReactNode; green?: boolean }) {
  return <span style={{ fontSize: 13, color: green ? "var(--green-text)" : "var(--text-dim)" }}>{children}</span>;
}

function Refused({ err }: { err: string | undefined }) {
  return err ? (
    <span role="alert" style={{ fontSize: 13, color: "var(--coral-text)" }}>
      That didn't go through: {err}
    </span>
  ) : null;
}

/** Put the composer into reply mode for this message and move to it. */
function replyTo(cr: CaptainRoom, target: ReplyTarget) {
  cr.setReplyTo(target);
  requestAnimationFrame(() => document.getElementById(COMPOSER)?.focus());
}

function NeedMessage({ ws, cr, me, need, answered, pulse }: { ws: Workspace; cr: CaptainRoom; me: string; need: Need; answered: Answered | undefined; pulse: boolean }) {
  const [knowing, setKnowing] = useState(false); // "How do you know?" opened the evidence
  const [answering, setAnswering] = useState(false); // "Answer" opened the one-line field
  const t = need.ticket;
  const slug = ws.project.slug;
  const text = needText(need, ws.nameOf);
  const err = cr.errors.get(need.key);
  const replying = cr.replyTo && replyKey(cr.replyTo) === need.key;
  const problem = need.kind === "problem";
  const label = answered ? undefined : `Captain, ${problem ? "a problem" : "needs you"}: ${replyPreview(text, 12)}`;

  let actions: ReactNode = null;
  if (answered) {
    actions = (
      <Quiet green={answered.answer === "yes" || answered.answer === "approved"}>
        {answeredLine(answered.answer, answered.at)}
        {answered.answer === "yes" && ". It merges by itself once the tests pass."}
      </Quiet>
    );
  } else if (need.kind === "risky_merge") {
    actions = (
      <Actions>
        <Button size="sm" className="ak-tap" onClick={() => void cr.okMerge(need)} style={amberSmall}>
          Yes, merge it
        </Button>
        <Button size="sm" className="ak-tap" onClick={() => t && openLook(slug, t.key)}>
          Let me look first
        </Button>
        <Button size="sm" className="ak-tap" aria-pressed={!!replying} onClick={() => replyTo(cr, { kind: "no", need })}>
          No
        </Button>
        {t && (
          <button type="button" className="ak-tap" aria-expanded={knowing} aria-controls={`evidence-${need.key}`} onClick={() => setKnowing((k) => !k)} style={{ ...textButton, fontSize: 13, minHeight: 32, marginLeft: 4 }}>
            {knowing ? "Hide how I know" : "How do you know?"}
          </button>
        )}
      </Actions>
    );
  } else if (need.kind === "approval" && t) {
    actions = <ApproveChange t={t} me={me} id={`approve-${need.key}`} onApprove={(sha, note) => void cr.approve(need, sha, note)} />;
  } else if (need.kind === "ticket_question") {
    actions = answering ? (
      <OneLine label={`Answer ${t?.key ?? ""}`} onCancel={() => setAnswering(false)} onSend={(v) => void cr.answerTicket(need, v)} />
    ) : (
      <Actions>
        <Button size="sm" className="ak-tap" onClick={() => setAnswering(true)}>
          Answer
        </Button>
      </Actions>
    );
  } else if (need.kind === "captain_question") {
    actions = (
      <Actions>
        <Button size="sm" className="ak-tap" aria-pressed={!!replying} onClick={() => replyTo(cr, { kind: "captain", need })}>
          Reply
        </Button>
        <button type="button" className="ak-tap" onClick={() => void cr.closeQuestion(need)} style={{ ...textButton, fontSize: 13, minHeight: 32, color: "var(--text-muted)", marginLeft: 4 }}>
          Not needed any more
        </button>
      </Actions>
    );
  } else if (problem) {
    actions = (
      <Actions>
        <Button size="sm" className="ak-tap" onClick={() => t && go({ view: "ticket", project: slug, key: t.key })}>
          Open the ticket
        </Button>
        <Button size="sm" variant="ghost" className="ak-tap" onClick={() => void cr.clearNeed(need)}>
          Dismiss
        </Button>
      </Actions>
    );
  }

  return (
    <CaptainMessage at={need.since} mark={answered ? undefined : problem ? "problem" : "needs"} label={label} id={`need-${need.key}`} pulse={pulse}>
      <Said ws={ws} text={text} />
      {t && knowing && !answered && (
        <div style={{ width: "100%" }}>
          <EvidencePanel ws={ws} ticket={t} id={`evidence-${need.key}`} />
        </div>
      )}
      {actions}
      <Refused err={err} />
    </CaptainMessage>
  );
}

/** The one-line answer to a ticket question: Enter sends, Esc closes. */
function OneLine({ label, onSend, onCancel }: { label: string; onSend: (text: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const send = () => {
    const v = value.trim();
    if (v) onSend(v);
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
      <input
        autoFocus
        aria-label={label}
        placeholder="Your answer goes on the ticket"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            send();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="ak-tap"
        style={{ flex: "1 1 220px", minWidth: 0, height: 36, padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--bg)", fontSize: 15 }}
      />
      <Button size="sm" className="ak-tap" disabled={!value.trim()} onClick={send}>
        Send
      </Button>
      <button type="button" className="ak-tap" onClick={onCancel} style={{ ...textButton, fontSize: 13, minHeight: 32, color: "var(--text-muted)" }}>
        Cancel
      </button>
    </div>
  );
}

/** Captain's plan (CON-23): its message, one plain line, and the actions while it waits on the person. */
function PlanMessage({ ws, cr, plan, need, pulse }: { ws: Workspace; cr: CaptainRoom; plan: Plan; need: Need | null; pulse: boolean }) {
  const [busy, setBusy] = useState(false);
  const err = cr.errors.get(planKey(plan));
  const pending = plan.status === "pending" && !!need;
  const replying = cr.replyTo?.kind === "plan" && cr.replyTo.plan.turnId === plan.turnId;
  const page: Route = { view: "plan", project: ws.project.slug, plan: plan.turnId };
  const open = (
    <a href={href(page)} onClick={onNav(page)} style={{ fontSize: 13 }}>
      Open the plan
    </a>
  );

  const start = async () => {
    setBusy(true);
    await cr.startPlan(plan);
    setBusy(false);
  };

  let state: ReactNode = null;
  if (plan.status === "started") state = plan.byYou && plan.okAt ? `You said OK · ${clock(plan.okAt)}` : "Started";
  else if (plan.status === "changes_asked") state = plan.changedAt ? `You asked for changes · ${clock(plan.changedAt)}` : "You asked for changes";
  else if (plan.status === "replaced") state = "Replaced by a newer plan";

  return (
    <CaptainMessage at={plan.at} mark={pending ? "needs" : undefined} label={pending ? `Captain, needs you: a plan. ${planLine(plan)}` : undefined} id={need ? `need-${need.key}` : undefined} pulse={pulse}>
      {plan.text && <Said ws={ws} text={plan.text} />}
      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{planLine(plan)}</span>
      {pending ? (
        <Actions>
          <Button size="sm" variant="primary" className="ak-tap" disabled={busy} onClick={() => void start()}>
            OK, start
          </Button>
          <Button size="sm" className="ak-tap" aria-pressed={replying} onClick={() => replyTo(cr, { kind: "plan", plan })}>
            Change something
          </Button>
          <span style={{ marginLeft: 4 }}>{open}</span>
        </Actions>
      ) : (
        <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          {state && <Quiet>{state}</Quiet>}
          {state && (
            <span aria-hidden="true" style={{ fontSize: 13, color: "var(--text-dim)" }}>
              ·
            </span>
          )}
          {open}
        </span>
      )}
      <Refused err={err} />
    </CaptainMessage>
  );
}

/** A reply field with its own send button, for the plan page (S08). The Captain page replies through the composer. */
export function ReplyBox({ label, placeholder, value, onChange, busy, action, onSend }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; busy: boolean; action: string; onSend: () => void | Promise<void> }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <textarea
        aria-label={label}
        placeholder={placeholder}
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void onSend();
          }
        }}
        style={{ flex: "1 1 240px", minWidth: 0, padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--amber-border)", background: "var(--bg)", fontSize: 15, resize: "vertical" }}
      />
      <Button onClick={() => void onSend()} disabled={busy || !value.trim()} style={amberButton(busy || !value.trim())}>
        {action}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ the composer

const COMPOSER = "captain-composer";

/** The message reply mode answers, for the chip's first words. */
const replyingTo = (t: ReplyTarget) => (t.kind === "plan" ? t.plan.text || planLine(t.plan) : t.kind === "no" ? needText(t.need, () => "") : t.need.question);

function Composer({ cr, disabled, noCaptain, autoFocus }: { cr: CaptainRoom; disabled: boolean; noCaptain: boolean; autoFocus: boolean }) {
  const [body, setBody] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const reply = cr.replyTo;
  const err = reply ? undefined : cr.errors.get("composer");
  const chip = reply ? `Replying to: ${replyPreview(replyingTo(reply))}` : "";

  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);
  // 2 rows, growing to 8.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = `${Math.min(el.scrollHeight, line * 8 + 20)}px`;
  }, [body]);

  const send = async () => {
    const text = body.trim();
    if (!text || disabled) return;
    setBody("");
    if (!reply) requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const ok = await cr.sendReply(text);
    if (!ok) setBody((b) => b || text);
  };

  const placeholder = noCaptain
    ? "Pick Captain on People first"
    : reply?.kind === "no"
      ? "What's off? Captain reads this before anything merges."
      : reply?.kind === "plan"
        ? "Tell Captain what to change"
        : reply
          ? "Your answer"
          : "Tell Captain anything — a goal, a question, a change of plan";

  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 2, background: "var(--bg)", padding: "8px 0 16px" }}>
      <div aria-live="polite" className="sr-only">
        {reply ? `${chip}. Press Escape to cancel.` : ""}
      </div>
      <div className="ak-composer" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: "var(--radius-2xl)", border: "1px solid var(--border-strong)", background: "var(--surface)" }}>
        {reply && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start", maxWidth: "100%", minWidth: 0, padding: "2px 4px 2px 10px", borderRadius: 999, background: "var(--surface-raised)", fontSize: 13, color: "var(--text-secondary)" }}>
            <span style={ellipsis}>{chip}</span>
            <button
              type="button"
              className="ak-tap"
              aria-label="Cancel reply"
              title="Cancel reply (Esc)"
              onClick={() => {
                cr.setReplyTo(null);
                box.current?.focus();
              }}
              style={{ flex: "none", width: 28, minHeight: 28, border: 0, borderRadius: 999, background: "none", color: "var(--text-muted)", fontSize: 16, cursor: "pointer" }}
            >
              ×
            </button>
          </div>
        )}
        <textarea
          id={COMPOSER}
          ref={box}
          value={body}
          disabled={disabled}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            } else if (e.key === "Escape" && reply) {
              e.preventDefault();
              cr.setReplyTo(null);
            }
          }}
          rows={2}
          aria-label={reply ? chip : "Message Captain"}
          placeholder={placeholder}
          style={{ width: "100%", border: 0, outline: "none", background: "transparent", fontSize: 15, lineHeight: 1.5, resize: "none", padding: 0 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span role={err ? "alert" : undefined} style={{ flex: 1, minWidth: 0, fontSize: 13, color: err ? "var(--coral-text)" : "var(--text-muted)" }}>
            {err ? `That didn't go through: ${err}` : reply ? "Enter sends. Esc cancels." : cr.online ? "Big work gets a plan first. Small things I just do." : "I'll pick this up when I'm back."}
          </span>
          <Button variant="primary" aria-label="Send" title="Send (Enter)" disabled={disabled || !body.trim()} onClick={() => void send()} style={{ width: 44, height: 44, padding: 0, flex: "none" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ styles

const ellipsis: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const textButton: CSSProperties = { border: 0, padding: 0, background: "none", color: "var(--blue-text)", fontSize: 14, cursor: "pointer" };
/** The one amber button on a risky merge: small, like the other actions. */
const amberSmall: CSSProperties = { background: "var(--amber)", color: "var(--amber-ink)", border: 0, fontWeight: 600 };
/** The plan page's primary button: amber and 44px tall, with the usual disabled look while it can't be pressed. */
export const amberButton = (disabled: boolean): CSSProperties => ({ height: 44, padding: "0 18px", borderRadius: 11, fontSize: 15, fontWeight: 600, ...(disabled ? {} : { background: "var(--amber)", color: "var(--amber-ink)" }) });
