import { useEffect, useRef, useState } from "react";
import { createTicket, PRIORITIES, STATUSES, TYPES, type Priority, type Status, type Ticket, type TicketType } from "../lib/data";
import { Button } from "../ui";
import type { Workspace } from "./useWorkspace";

// Quick ticket creation: title first, everything else optional. Agents get tickets in "Ready".

export function NewTicket({ ws, initialStatus, onClose, onCreated }: { ws: Workspace; initialStatus?: Status; onClose: () => void; onCreated: (t: Ticket) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [doneMeans, setDoneMeans] = useState("");
  const [type, setType] = useState<TicketType>("task");
  const [priority, setPriority] = useState<Priority>("none");
  const [status, setStatus] = useState<Status>(initialStatus ?? "backlog");
  const [assignee, setAssignee] = useState("");
  const [parent, setParent] = useState("");
  const [labels, setLabels] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  // Giving work to an agent usually means it's ready to start.
  const pickAssignee = (id: string) => {
    setAssignee(id);
    if (id && ws.agentOf(id) && status === "backlog") setStatus("ready");
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return setErr("Give the ticket a title.");
    setBusy(true);
    setErr("");
    try {
      const t = await createTicket(ws.project.id, {
        title: title.trim(),
        description,
        type,
        priority,
        status,
        assignee: assignee || null,
        parent: parent || null,
        labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
        doneMeans: doneMeans.split("\n").map((l) => l.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean),
      });
      await ws.reload();
      onCreated(t);
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  };

  const field: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", fontSize: 14 };
  const sel: React.CSSProperties = { height: 36, padding: "0 10px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13 };
  const epics = ws.tickets.filter((t) => t.type === "epic" && t.status !== "done");

  return (
    <div role="dialog" aria-modal="true" aria-label="New ticket" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "8vh 16px", zIndex: 40, overflowY: "auto" }}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        style={{ width: "min(680px, 100%)", display: "flex", flexDirection: "column", gap: 14, padding: 22, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--line-strong)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--faint)" }}>
            {ws.project.name} · new {ws.project.ticket_prefix}-{ws.tickets.reduce((m, t) => Math.max(m, t.number), 0) + 1}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: "none", color: "var(--faint)", fontSize: 20, cursor: "pointer" }}>
            ×
          </button>
        </div>
        <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ticket title" aria-label="Title" maxLength={200} style={{ ...field, border: 0, background: "transparent", padding: 0, fontSize: 22, fontWeight: 600 }} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What and why. Markdown works. Agents read this as their brief." aria-label="Description" rows={5} style={{ ...field, resize: "vertical" }} />
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Done means (one per line)</span>
          <textarea value={doneMeans} onChange={(e) => setDoneMeans(e.target.value)} placeholder={"Google button on /login\nDenied consent shows a friendly error"} rows={3} style={{ ...field, resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)} style={sel}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select aria-label="Assignee" value={assignee} onChange={(e) => pickAssignee(e.target.value)} style={sel}>
            <option value="">Unassigned</option>
            {ws.people.members.map((m) => (
              <option key={m.actor_id} value={m.actor_id}>
                {ws.nameOf(m.actor_id)}
                {m.actor_type === "agent" ? " (agent)" : ""}
              </option>
            ))}
          </select>
          <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} style={sel}>
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as TicketType)} style={sel}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {epics.length > 0 && (
            <select aria-label="Epic" value={parent} onChange={(e) => setParent(e.target.value)} style={sel}>
              <option value="">No epic</option>
              {epics.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.key} · {e.title}
                </option>
              ))}
            </select>
          )}
          <input aria-label="Labels" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="labels, comma separated" style={{ ...sel, flex: 1, minWidth: 160 }} />
        </div>
        {assignee && ws.agentOf(assignee) && (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            {ws.nameOf(assignee)} picks up tickets in <strong style={{ color: "var(--text)" }}>Ready</strong> by itself, reads the Project Guide, and reports progress here.
          </p>
        )}
        {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--faint)" }}>⌘ Enter to create</span>
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create ticket"}
          </Button>
        </div>
      </form>
    </div>
  );
}
