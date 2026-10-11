import { useState, type CSSProperties, type ReactNode } from "react";
import { mergePolicyOf, type Ticket } from "../lib/data";
import { go, href, onNav, type Route } from "../lib/router";
import { Button } from "../ui";
import { Markdown } from "./bits";
import { amberButton, CaptainMessage, ReplyBox, YouMessage } from "./CaptainHome";
import { clock, newerPlan, planOrder, planRequest, waitsFor, type Plan } from "./captain";
import { withTicketLinks } from "./Room";
import { plural } from "./story";
import { planKey, type CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";

// The plan page (AK-61, screens/S08-plan.md with 00-AMENDMENTS.md): the detail behind a plan card,
// read-only. To change a plan you tell Captain in words. OK, start and Change something are the
// card's own actions, so whichever is used first, both show it.

export function PlanPage({ ws, cr, planId }: { ws: Workspace; cr: CaptainRoom; planId: number }) {
  const slug = ws.project.slug;
  const captain: Route = { view: "overview", project: slug };
  const plan = cr.plans.find((p) => p.turnId === planId);

  let body: ReactNode;
  if (cr.room === undefined) body = <p style={{ fontSize: 14, color: "var(--text-dim)" }}>Loading the plan…</p>;
  else if (!plan)
    body = (
      <p style={{ fontSize: 15, color: "var(--text-muted)" }}>
        There's no plan at this address.{" "}
        <a href={href(captain)} onClick={onNav(captain)}>
          Back to Captain
        </a>
      </p>
    );
  else body = <PlanDetail ws={ws} cr={cr} plan={plan} />;

  return (
    <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--text-dim)" }}>
        <a href={href(captain)} onClick={onNav(captain)} style={{ color: "var(--text-muted)", textDecoration: "none" }}>
          Captain
        </a>{" "}
        / <span aria-current="page">Plan</span>
      </nav>
      {body}
    </div>
  );
}

function PlanDetail({ ws, cr, plan }: { ws: Workspace; cr: CaptainRoom; plan: Plan }) {
  const request = planRequest(plan, cr.turns);
  const asks = new Set(plan.asks.map((t) => t.id));
  const newer = plan.status === "replaced" ? newerPlan(cr.plans, plan) : null;
  const selfMerge = mergePolicyOf(ws.project) === "auto_safe";
  const slug = ws.project.slug;

  return (
    <>
      <h1 className="sr-only">Plan</h1>
      {plan.status === "replaced" && (
        <div role="status" style={{ ...panel, background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)", fontSize: 15 }}>
          <span style={{ flex: 1, minWidth: 0 }}>Replaced by a newer plan.</span>
          {newer && (
            <a href={href({ view: "plan", project: slug, plan: newer.turnId })} onClick={onNav({ view: "plan", project: slug, plan: newer.turnId })} style={{ fontSize: 15 }}>
              Open the newer plan
            </a>
          )}
        </div>
      )}
      <div className="ak-plan">
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          {request && <YouMessage turn={request} ws={ws} />}
          {plan.text && (
            <CaptainMessage at={plan.at}>
              <Markdown text={withTicketLinks(plan.text, ws)} />
            </CaptainMessage>
          )}
          {plan.goals.map(({ goal, tickets }, i) => (
            <section key={goal.id} aria-labelledby={`goal-${goal.id}`} style={box}>
              <header style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "16px 18px", borderBottom: tickets.length ? "1px solid var(--border-subtle)" : 0, flexWrap: "wrap" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", letterSpacing: "0.04em" }}>
                  GOAL {i + 1}
                </span>
                <h2 id={`goal-${goal.id}`} style={{ flex: "1 1 200px", minWidth: 0, fontSize: 18, fontWeight: 500, overflowWrap: "anywhere" }}>
                  <a href={href({ view: "ticket", project: slug, key: goal.key })} onClick={onNav({ view: "ticket", project: slug, key: goal.key })} style={{ color: "var(--text)", textDecoration: "none" }}>
                    {goal.title}
                  </a>
                </h2>
                <span style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{plural(tickets.length, "ticket")}</span>
              </header>
              {tickets.length ? (
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {planOrder(ws, tickets).map((t, n) => (
                    <TicketRow key={t.id} ws={ws} t={t} n={n + 1} asked={asks.has(t.id)} first={n === 0} />
                  ))}
                </ol>
              ) : (
                <p style={{ padding: "14px 18px", fontSize: 14, color: "var(--text-dim)" }}>No tickets in this goal yet.</p>
              )}
            </section>
          ))}
          <Actions ws={ws} cr={cr} plan={plan} />
        </div>

        {(plan.asks.length > 0 || plan.not) && (
          <aside aria-label="About this plan" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {plan.asks.length > 0 && (
              <section aria-labelledby="plan-asks" style={{ ...box, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                <h2 id="plan-asks" className="eyebrow">
                  What you'll be asked
                </h2>
                <p style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 40, fontWeight: 500, lineHeight: 1, letterSpacing: "var(--tracking-tight)" }}>{plan.asks.length}</span>
                  <span style={{ fontSize: 15, color: "var(--text-muted)" }}>{plan.asks.length === 1 ? "decision, at most" : "decisions, at most"}</span>
                </p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 15, color: "var(--text-body)" }}>
                  {plan.asks.map((t) => (
                    <li key={t.id} style={dotLine}>
                      <span aria-hidden="true" style={{ ...dot, background: "var(--amber)" }} />
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{t.title}</span>
                    </li>
                  ))}
                  {selfMerge && (
                    <li style={dotLine}>
                      <span aria-hidden="true" style={{ ...dot, background: "var(--green)" }} />
                      <span style={{ minWidth: 0 }}>Everything else merges itself once tests pass and Captain approves the exact commit.</span>
                    </li>
                  )}
                </ul>
              </section>
            )}
            {plan.not && (
              <section aria-labelledby="plan-not" style={{ ...box, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                <h2 id="plan-not" className="eyebrow">
                  Not in this plan
                </h2>
                <p style={{ fontSize: 15, color: "var(--text-body)", overflowWrap: "anywhere" }}>{plan.not}</p>
              </section>
            )}
          </aside>
        )}
      </div>
    </>
  );
}

function TicketRow({ ws, t, n, asked, first }: { ws: Workspace; t: Ticket; n: number; asked: boolean; first: boolean }) {
  const to: Route = { view: "ticket", project: ws.project.slug, key: t.key };
  const after = waitsFor(ws, t);
  return (
    <li style={{ borderTop: first ? 0 : "1px solid var(--border-subtle)" }}>
      <a href={href(to)} onClick={onNav(to)} className="ak-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", color: "var(--text)", textDecoration: "none", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid var(--border-strong)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--text-muted)", flex: "none" }}>
          {n}
        </span>
        <span className="sr-only">{n}. </span>
        <span style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 15, overflowWrap: "anywhere" }}>{t.title}</span>
          {after && <span style={{ fontSize: 13, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{after}</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {asked && <span style={{ padding: "3px 10px", borderRadius: "var(--radius-chip)", background: "var(--amber-bg)", color: "var(--amber)", fontSize: 13, whiteSpace: "nowrap" }}>Waits for your OK</span>}
          <span style={{ fontSize: 13, color: t.assignee_id ? "var(--text-muted)" : "var(--text-dim)", whiteSpace: "nowrap" }}>{ws.nameOf(t.assignee_id)}</span>
        </span>
      </a>
    </li>
  );
}

/** OK, start and Change something while the plan waits; what happened after. */
function Actions({ ws, cr, plan }: { ws: Workspace; cr: CaptainRoom; plan: Plan }) {
  const [changing, setChanging] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const err = cr.errors.get(planKey(plan));
  const board: Route = { view: "board", project: ws.project.slug };

  const start = async () => {
    setBusy(true);
    await cr.startPlan(plan);
    setBusy(false);
  };
  const change = async () => {
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    const ok = await cr.changePlan(plan, text);
    setBusy(false);
    if (ok) {
      setReply("");
      setChanging(false);
    }
  };

  let state: ReactNode = null;
  if (plan.status === "started") {
    state = (
      <div role="status" style={{ ...panel, background: "var(--green-bg)", borderColor: "var(--green-border)" }}>
        <span aria-hidden="true" style={{ color: "var(--green)", fontSize: 18 }}>
          ✓
        </span>
        <span style={{ flex: "1 1 220px", minWidth: 0, fontSize: 16, color: "var(--green-ink)" }}>Started. {plural(plan.tickets.length, "ticket")} {plan.tickets.length === 1 ? "is" : "are"} on the board.</span>
        <Button variant="secondary" onClick={() => go(board)} style={{ height: 44 }}>
          Watch the board
        </Button>
      </div>
    );
  } else if (plan.status === "changes_asked") {
    state = (
      <div role="status" style={{ ...panel, background: "var(--surface)", borderColor: "var(--border)", fontSize: 15, color: "var(--text-muted)" }}>
        {plan.changedAt ? `You asked for changes at ${clock(plan.changedAt)}.` : "You asked for changes."} Captain answers with an updated plan.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {state}
      {plan.status === "pending" && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Button onClick={() => void start()} disabled={busy} style={{ ...amberButton(busy), height: 48, padding: "0 22px", fontSize: 16 }}>
              OK, start
            </Button>
            <Button variant="secondary" aria-expanded={changing} onClick={() => setChanging((c) => !c)} style={{ height: 48, padding: "0 20px", fontSize: 16 }}>
              Change something
            </Button>
          </div>
          {changing && <ReplyBox label="Tell Captain what to change" placeholder="Tell Captain what to change" value={reply} onChange={setReply} busy={busy} action="Send to Captain" onSend={change} />}
        </>
      )}
      {err && (
        <span role="alert" style={{ fontSize: 13, color: "var(--coral-text)" }}>
          That didn't go through: {err}
        </span>
      )}
    </div>
  );
}

const box: CSSProperties = { borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden", minWidth: 0 };
const panel: CSSProperties = { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "16px 18px", borderRadius: "var(--radius-xl)", border: "1px solid" };
const dotLine: CSSProperties = { display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 };
const dot: CSSProperties = { width: 7, height: 7, borderRadius: "50%", flex: "none", alignSelf: "center" };
