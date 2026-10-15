import { useFullTicket } from "./useFullTicket";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { mergePolicyOf } from "../lib/data";
import { closeLook } from "../lib/router";
import { Button, Chip } from "../ui";
import { answeredText, codeLines, lookChips, lookState, lookTitle, mergeQuestion, NEED_WHAT } from "./captain";
import { EvidencePanel } from "./EvidencePanel";
import type { CaptainRoom } from "./useCaptainRoom";
import type { Workspace } from "./useWorkspace";

// "Let me look first" (AK-55, autokolab-ux-handoff/screens/S04-look-first.md): a risky merge's one
// real question, as a modal over the Captain page at /p/<project>/look/<key>. What it shows comes
// from the ticket (captain.ts lookState, lookChips); the answers go through the same Captain room
// as the card's, so the card turns green too. No Undo: these can't be undone (00-AMENDMENTS.md).

const TITLE = "ak-look-title";

export function LookFirst({ ws, cr, me, ticketKey, covered }: { ws: Workspace; cr: CaptainRoom; me: string; ticketKey: string; covered: boolean }) {
  const slug = ws.project.slug;
  const key = ticketKey.toUpperCase();
  const full = useFullTicket(ws.byKey.get(key), !!ws.demoDetails);
  const detailedWs = full.ticket ? { ...ws, byKey: new Map(ws.byKey).set(key, full.ticket) } : ws;
  const state = lookState(detailedWs, key);
  // OK'd on this visit: stays green even after the reload shows the ticket as answered.
  const okd = cr.okd.find((n) => n.ticket?.key === key);
  const need = state.kind === "ask" ? state.need : (okd ?? null);
  const [saying, setSaying] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const err = need ? cr.errors.get(need.key) : undefined;
  const asking = state.kind === "ask" && !okd;

  const close = () => closeLook(slug, need ? `need-${need.key}` : undefined);
  const yes = async () => {
    if (!need || busy || !asking) return;
    setBusy(true);
    await cr.okMerge(need);
    setBusy(false);
  };
  const no = () => {
    if (!asking) return;
    setSaying(true);
    requestAnimationFrame(() => field.current?.focus());
  };
  const sendNo = async () => {
    const text = reason.trim();
    if (!need?.ticket || !text || busy) return;
    setBusy(true);
    const ok = await cr.send(`No on ${need.ticket.key}: ${text}`, null, need.key);
    setBusy(false);
    if (ok) close();
  };

  // The handlers change every render; the key listener reads the latest through this.
  const keys = useRef({ yes, no, close, covered });
  keys.current = { yes, no, close, covered };

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      // Show the work opened from "All the evidence" sits on top and takes the keys.
      if (k.covered || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        k.close();
        return;
      }
      if (e.key === "Tab" && panel.current) {
        const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), [tabindex="0"]')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "1") {
        e.preventDefault();
        void k.yes();
      } else if (e.key === "2") {
        e.preventDefault();
        k.no();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);

  let body: ReactNode;
  if (okd) {
    body = (
      <>
        <CloseRow onClose={close} />
        <div className="ak-enter" style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20, borderRadius: "var(--radius-xl)", background: "var(--green-bg)", border: "1px solid var(--green-border)" }}>
          <p id={TITLE} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 17, fontWeight: 500, color: "var(--green-ink)" }}>
            <span aria-hidden="true" style={{ color: "var(--green)" }}>
              ✓
            </span>
            OK'd. It merges by itself once the tests pass.
          </p>
          <BackButton onClick={close} />
        </div>
      </>
    );
  } else if (state.kind !== "ask" || !need?.ticket) {
    const line =
      state.kind === "answered"
        ? answeredText(ws, state.by, state.at, me)
        : state.kind === "nothing" && state.why === "unknown"
          ? `There's no ticket ${key} in this project, so there's nothing to answer.`
          : `${key} isn't waiting for an OK to merge, so there's nothing to answer.`;
    body = (
      <>
        <CloseRow onClose={close} />
        <p id={TITLE} style={{ fontSize: 17, lineHeight: 1.45, color: "var(--text)" }}>
          {line}
        </p>
        <BackButton onClick={close} />
      </>
    );
  } else {
    const t = need.ticket;
    const line = t.review?.line;
    const chips = lookChips(ws, t);
    body = (
      <>
        <CloseRow onClose={close}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--amber)", overflowWrap: "anywhere" }}>
            Needs you · {NEED_WHAT.risky_merge} {t.key}
          </span>
        </CloseRow>
        <h2 id={TITLE} className="ak-look-title">
          {lookTitle(t)}
        </h2>

        {line?.code?.trim() && (
          <section aria-label="The line that matters" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>The line that matters</span>
            {line.file && (
              <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
                {line.file}
              </span>
            )}
            <pre className="mono" style={{ margin: 0, padding: "14px 16px", overflowX: "auto", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
              {codeLines(line.code).map((l, i) => (
                <span key={i} style={l.added ? { color: "var(--green)" } : undefined}>
                  {l.text}
                  {"\n"}
                </span>
              ))}
            </pre>
            {line.plain?.trim() && <p style={{ fontSize: 14, color: "var(--text-body)" }}>In plain words: {line.plain.trim()}</p>}
          </section>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
          {chips.map((c) => (
            <Chip key={c.text} tone={c.tone}>
              {c.text}
              {c.sha && <span className="mono" style={{ fontSize: 12, marginLeft: 6 }}>{c.sha}</span>}
            </Chip>
          ))}
          <button type="button" className="ak-tap" aria-expanded={evidence} aria-controls="ak-look-evidence" onClick={() => setEvidence((x) => !x)} style={evidenceButton}>
            {evidence ? "Hide the evidence" : "All the evidence"}
          </button>
        </div>
        {evidence && <EvidencePanel ws={ws} ticket={t} id="ak-look-evidence" />}

        <div role="separator" style={{ height: 1, background: "var(--border-subtle)" }} />
        <p style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.45, color: "var(--text)", overflowWrap: "anywhere" }}>{mergeQuestion(need)}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Answer tone="amber" keyName="1" disabled={busy} onClick={() => void yes()} line="Yes, that's right. Merge it" sub="It merges once the tests pass; each machine updates itself after." />
          <Answer tone="neutral" keyName="2" disabled={busy} expanded={saying} onClick={no} line="No, something's off" sub="Nothing merges. You tell Captain what's wrong." />
        </div>

        {saying && (
          <div className="ak-enter" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="ak-look-reason" style={{ fontSize: 13, color: "var(--text-muted)" }}>
              What's off?
            </label>
            <textarea
              ref={field}
              id="ak-look-reason"
              value={reason}
              rows={3}
              placeholder="Captain reads this before anything merges."
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendNo();
                }
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--bg)", fontSize: 15, resize: "vertical" }}
            />
            <Button onClick={() => void sendNo()} disabled={busy || !reason.trim()} style={{ alignSelf: "flex-end", height: 44, padding: "0 18px", fontSize: 15 }}>
              Send to Captain
            </Button>
          </div>
        )}

        {err && (
          <p role="alert" style={{ fontSize: 14, color: "var(--coral-text)" }}>
            That didn't go through: {err}
          </p>
        )}

        {mergePolicyOf(ws.project) === "auto_safe" && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>You only see this step for risky changes. Everything else merges itself.</p>}
      </>
    );
  }

  return (
    <div
      className="ak-look-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section ref={panel} className="ak-look" role="dialog" aria-modal="true" aria-labelledby={TITLE} tabIndex={-1}>
        {body}
      </section>
    </div>
  );
}

function CloseRow({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ minWidth: 0 }}>{children}</span>
      <button type="button" className="ak-show-close" onClick={onClose} aria-label="Close" aria-keyshortcuts="Escape">
        ×
      </button>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} style={{ alignSelf: "flex-start", height: 44, padding: "0 18px", fontSize: 15 }}>
      Back to Captain
    </Button>
  );
}

/** One of the two large answers: a bold line and what happens next. */
function Answer({ tone, keyName, line, sub, disabled, expanded, onClick }: { tone: "amber" | "neutral"; keyName: string; line: string; sub: string; disabled: boolean; expanded?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="ak-look-answer"
      disabled={disabled}
      aria-expanded={expanded}
      aria-keyshortcuts={keyName}
      onClick={onClick}
      style={tone === "amber" ? { background: "var(--amber-bg)", borderColor: "var(--amber-border)" } : undefined}
    >
      <span style={{ fontSize: 16, fontWeight: 600, color: tone === "amber" ? "var(--amber)" : "var(--text)" }}>{line}</span>
      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{sub}</span>
    </button>
  );
}

const evidenceButton: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 28, padding: "3px 12px", borderRadius: "var(--radius-chip)", border: "1px solid var(--border)", background: "none", color: "var(--blue-text)", fontSize: 13, cursor: "pointer" };
