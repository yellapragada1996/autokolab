import { useState } from "react";
import type { Ticket } from "../lib/data";
import { Button } from "../ui";
import { approveState, prLabel } from "./approve";

// "Approve this change" for a person (AK-95), on the ticket page and on Captain's message. It shows
// what is being approved first: the ticket's plain line, the tests, the exact commit and the PR. When
// it can't be approved here, one plain sentence says why instead.

export function ApproveChange({ t, me, busy, onApprove, id }: { t: Ticket; me: string; busy?: boolean; onApprove: (sha: string, note: string) => void; id: string }) {
  const [note, setNote] = useState("");
  const s = approveState(t, me);
  if (s.kind !== "ready") return <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.why}</span>;
  const approve = () => !busy && onApprove(s.sha, note);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", minWidth: 0, fontSize: 13 }}>
      <span style={{ fontSize: 14, color: "var(--text-body)", overflowWrap: "anywhere" }}>{t.summary?.trim() || t.title}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", flex: "none" }} />
        {s.tests}
      </span>
      <span style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>
        Commit <code className="mono" style={{ fontSize: 12 }}>{s.sha.slice(0, 7)}</code>
        {t.pr_url && (
          <>
            {" · "}
            <a href={t.pr_url} target="_blank" rel="noreferrer">
              Pull request {prLabel(t.pr_url)}
            </a>
          </>
        )}
      </span>
      <label htmlFor={`${id}-note`} style={{ color: "var(--text-muted)", marginTop: 2 }}>
        Anything you're unsure about? <span style={{ color: "var(--text-dim)" }}>(optional)</span>
      </label>
      <input
        id={`${id}-note`}
        value={note}
        maxLength={600}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            approve();
          }
        }}
        className="ak-tap"
        style={{ width: "100%", minWidth: 0, height: 32, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--bg)", fontSize: 14 }}
      />
      <span>
        <Button size="sm" variant="primary" className="ak-tap" disabled={busy} onClick={approve}>
          {busy ? "Approving…" : "Approve this change"}
        </Button>
      </span>
    </div>
  );
}
