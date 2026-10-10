import { useState } from "react";
import { addDecision, supersede, type Decision } from "../lib/data";
import { onNav } from "../lib/router";
import { Button, Chip } from "../ui";
import { ago, Markdown } from "./bits";
import type { Workspace } from "./useWorkspace";

// Decisions and contracts (spec §11.5): settled choices everyone builds on. Agents read the ones
// in force before every ticket; a newer decision can replace an older one.

export function Decisions({ ws }: { ws: Workspace }) {
  const [adding, setAdding] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const live = ws.decisions.filter((d) => !d.superseded_by);
  const old = ws.decisions.filter((d) => d.superseded_by);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <p style={{ color: "var(--muted)", fontSize: 15, flex: "1 1 360px" }}>
          Choices the team has settled, like "Postgres, not Mongo" or the shape of an API. Agents follow these and ask before going against one.
        </p>
        {!adding && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            Record a decision
          </Button>
        )}
      </div>
      {adding && <NewDecision ws={ws} onDone={() => setAdding(false)} />}
      {live.map((d) => (
        <DecisionCard key={d.id} ws={ws} d={d} />
      ))}
      {!live.length && !adding && (
        <div style={{ padding: 16, borderRadius: 12, border: "1px dashed var(--line)", fontSize: 14, color: "var(--muted)" }}>
          No decisions yet. Record one when the team settles something, so nobody has to settle it again.
        </div>
      )}
      {old.length > 0 && (
        <button type="button" onClick={() => setShowOld((s) => !s)} style={{ alignSelf: "flex-start", border: 0, background: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>
          {showOld ? "Hide" : "Show"} {old.length} replaced decision{old.length === 1 ? "" : "s"}
        </button>
      )}
      {showOld && old.map((d) => <DecisionCard key={d.id} ws={ws} d={d} />)}
    </div>
  );
}

function DecisionCard({ ws, d }: { ws: Workspace; d: Decision }) {
  const [replacing, setReplacing] = useState(false);
  const replacedBy = d.superseded_by ? ws.decisions.find((x) => x.id === d.superseded_by) : undefined;
  const ticket = d.ticket_id ? ws.byId.get(d.ticket_id) : undefined;
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)", opacity: d.superseded_by ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)" }}>{d.key}</span>
        <h3 style={{ fontSize: 15, fontWeight: 600, textDecoration: d.superseded_by ? "line-through" : "none" }}>{d.title}</h3>
        {d.kind === "contract" && <Chip>Contract</Chip>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--faint)" }}>
          {ws.nameOf(d.created_by)} · {ago(d.created_at)}
        </span>
      </div>
      {d.body.trim() && <Markdown text={d.body} />}
      <div style={{ display: "flex", gap: 12, fontSize: 13, alignItems: "center", flexWrap: "wrap" }}>
        {ticket && (
          <a href={`/p/${ws.project.slug}/t/${ticket.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: ticket.key })}>
            From {ticket.key}
          </a>
        )}
        {replacedBy && <span style={{ color: "var(--faint)" }}>Replaced by {replacedBy.key}</span>}
        {!d.superseded_by && !replacing && (
          <button type="button" onClick={() => setReplacing(true)} style={{ border: 0, background: "none", color: "var(--muted)", cursor: "pointer", padding: 0, fontSize: 13 }}>
            Replace with a new decision
          </button>
        )}
      </div>
      {replacing && <NewDecision ws={ws} replaces={d} onDone={() => setReplacing(false)} />}
    </article>
  );
}

function NewDecision({ ws, replaces, onDone }: { ws: Workspace; replaces?: Decision; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Decision["kind"]>(replaces?.kind ?? "decision");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!title.trim()) return setErr("Give it a title.");
    setBusy(true);
    setErr("");
    try {
      const d = await addDecision(ws.project.id, title.trim(), body, kind);
      if (replaces) await supersede(replaces.id, d.id);
      await ws.reload();
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const field: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", fontSize: 14 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-strong)" }}>
      {replaces && <span style={{ fontSize: 13, color: "var(--faint)" }}>Replaces {replaces.key}</span>}
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What was decided, in one line" aria-label="Decision" maxLength={200} style={{ ...field, fontSize: 15, fontWeight: 600 }} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Why, and what it means for the code. Markdown works." aria-label="Details" rows={4} style={{ ...field, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div role="radiogroup" aria-label="Kind" style={{ display: "inline-flex", padding: 3, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--line)" }}>
          {(
            [
              ["decision", "Decision"],
              ["contract", "Contract (API, schema)"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} style={{ height: 28, padding: "0 12px", border: 0, borderRadius: 7, fontSize: 13, cursor: "pointer", background: kind === id ? "var(--surface-2)" : "transparent", color: kind === id ? "var(--text)" : "var(--muted)" }}>
              {label}
            </button>
          ))}
        </div>
        {err && <span style={{ color: "var(--danger)", fontSize: 13 }}>{err}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" disabled={busy || !title.trim()} onClick={() => void save()}>
            {busy ? "Saving…" : "Record"}
          </Button>
        </span>
      </div>
    </div>
  );
}
