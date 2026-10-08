import { useCallback, useEffect, useState } from "react";
import {
  addBlocker,
  addComment,
  PRIORITIES,
  removeBlocker,
  setSteps,
  setStepStatus,
  STATUSES,
  statusLabel,
  ticketDetail,
  TYPES,
  updateTicket,
  type Comment,
  type Step,
  type Ticket,
  type TicketEvent,
  type TicketPatch,
} from "../lib/data";
import { onNav } from "../lib/router";
import { Button } from "../ui";
import { ago, KeyText, Label, Markdown, Picker, PriorityIcon, StatusIcon, statusColor, StepProgress, TypeTag, Who } from "./bits";
import type { Workspace } from "./useWorkspace";

// One ticket (spec §11.4): where it is, the conversation and history, what done means, what it's
// blocked by and unblocks, and the context its agent works with.

export function TicketPage({ ws, me, ticketKey }: { ws: Workspace; me: string; ticketKey: string }) {
  const t = ws.byKey.get(ticketKey);
  const [detail, setDetail] = useState<{ steps: Step[]; comments: Comment[]; events: TicketEvent[] } | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!t) return;
    try {
      setDetail(await ticketDetail(t.id));
    } catch (e) {
      setErr((e as Error).message);
      setDetail((d) => d ?? { steps: ws.steps.get(t.id) ?? [], comments: [], events: [] });
    }
  }, [t, ws.steps]);
  useEffect(() => {
    void load();
  }, [load, ws]);

  if (!t) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
        No ticket {ticketKey} in {ws.project.name}.{" "}
        <a href={`/p/${ws.project.slug}/board`} onClick={onNav({ view: "board", project: ws.project.slug })}>
          Back to the board
        </a>
      </div>
    );
  }

  const save = async (patch: TicketPatch) => {
    try {
      setErr("");
      await updateTicket(t.id, patch);
      await ws.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const parent = t.parent_id ? ws.byId.get(t.parent_id) : undefined;
  const assignee = ws.agentOf(t.assignee_id);
  const steps = detail?.steps ?? ws.steps.get(t.id) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--faint)", alignItems: "center" }}>
        <a href={`/p/${ws.project.slug}/board`} onClick={onNav({ view: "board", project: ws.project.slug })} style={{ color: "var(--muted)" }}>
          Board
        </a>
        <span>/</span>
        {parent && (
          <>
            <a href={`/p/${ws.project.slug}/t/${parent.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: parent.key })} style={{ color: "var(--muted)" }}>
              {parent.key}
            </a>
            <span>/</span>
          </>
        )}
        <KeyText t={t} />
      </nav>

      <EditableTitle value={t.title} onSave={(title) => save({ title })} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Picker label="Status" value={t.status} options={[...STATUSES, { id: "canceled", label: "Canceled" }]} onChange={(status) => save({ status })} render={<><StatusIcon status={t.status} /><span style={{ color: statusColor[t.status] }}>{statusLabel(t.status)}</span></>} />
        <Picker label="Assignee" value={t.assignee_id ?? ""} options={[{ id: "", label: "Unassigned" }, ...ws.people.members.map((m) => ({ id: m.actor_id, label: ws.nameOf(m.actor_id) + (m.actor_type === "agent" ? " (agent)" : "") }))]} onChange={(id) => save({ assignee_id: id || null, ...(id && ws.agentOf(id) && t.status === "backlog" ? { status: "ready" as const } : {}) })} render={<Who ws={ws} id={t.assignee_id} size={18} you={me} />} />
        <Picker label="Priority" value={t.priority} options={PRIORITIES} onChange={(priority) => save({ priority })} render={<><PriorityIcon priority={t.priority} /><span>{PRIORITIES.find((p) => p.id === t.priority)!.label}</span></>} />
        <Picker label="Type" value={t.type} options={TYPES} onChange={(type) => save({ type })} render={<TypeTag type={t.type} />} />
        {t.type !== "epic" && (
          <Picker
            label="Epic"
            value={t.parent_id ?? ""}
            options={[{ id: "", label: "No epic" }, ...ws.tickets.filter((x) => x.type === "epic" && x.id !== t.id).map((e) => ({ id: e.id, label: `${e.key} · ${e.title}` }))]}
            onChange={(id) => save({ parent_id: id || null })}
            render={<span style={{ color: parent ? "var(--text-2)" : "var(--faint)" }}>{parent ? `Epic ${parent.key}` : "No epic"}</span>}
          />
        )}
        <LabelsEditor labels={t.labels} onSave={(labels) => save({ labels })} />
      </div>

      {t.needs_human && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 12, background: "var(--warn-bg)", border: "1px solid var(--warn-line)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)", flex: "none" }} />
          <span style={{ flex: 1, fontSize: 14 }}>
            <strong style={{ color: "var(--warn)" }}>Needs you.</strong> {t.needs_human}
          </span>
          <Button size="sm" variant="secondary" onClick={() => save({ needs_human: null })}>
            Resolved
          </Button>
        </div>
      )}
      {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          <Panel title="Description">
            <EditableText value={t.description} onSave={(description) => save({ description })} placeholder="What and why. Agents read this as their brief." />
          </Panel>

          <Panel title="Where it is" sub="Steps, checked off as the work proves them">
            <StepsEditor steps={steps} onToggle={async (idx, status) => (await setStepStatus(t.id, idx, status), await load(), await ws.reload())} onReplace={async (s) => (await setSteps(t.id, s), await load(), await ws.reload())} />
          </Panel>

          <Panel title="Activity" sub={assignee ? `Comments reach ${assignee.display_name} before its next step` : undefined}>
            <Timeline ws={ws} me={me} detail={detail} ticket={t} onPosted={load} />
          </Panel>
        </div>

        <aside style={{ flex: "1 1 280px", minWidth: 260, display: "flex", flexDirection: "column", gap: 20 }}>
          <Panel title="Done means">
            <ListEditor items={t.done_means} onSave={(done_means) => save({ done_means })} placeholder="One acceptance check per line" />
          </Panel>

          <Panel title="Blocked by">
            <Blockers ws={ws} t={t} />
          </Panel>

          {ws.unblocks(t.id).length > 0 && (
            <Panel title="Unblocks">
              {ws.unblocks(t.id).map((u) => (
                <TicketRow key={u.id} ws={ws} t={u} />
              ))}
            </Panel>
          )}

          {(t.type === "epic" || ws.childrenOf(t.id).length > 0) && (
            <Panel title={`Tickets in this epic · ${ws.childrenOf(t.id).filter((c) => c.status === "done").length}/${ws.childrenOf(t.id).length}`}>
              {ws.childrenOf(t.id).map((c) => (
                <TicketRow key={c.id} ws={ws} t={c} />
              ))}
              {!ws.childrenOf(t.id).length && <p style={{ fontSize: 13, color: "var(--faint)" }}>Set a ticket's epic to {t.key} to add it here.</p>}
            </Panel>
          )}

          <Panel title="Code">
            <CodeLinks t={t} repo={ws.project.repo} onSave={save} />
          </Panel>

          <Panel title="Context it's using">
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Every agent reads these before working on this ticket.</p>
            <a href={`/p/${ws.project.slug}/guide`} onClick={onNav({ view: "guide", project: ws.project.slug })} style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
              Project Guide: concept, architecture and rules
            </a>
            {ws.decisions.filter((d) => !d.superseded_by).slice(0, 6).map((d) => (
              <div key={d.id} style={{ fontSize: 13, color: "var(--text-2)", padding: "3px 0" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)" }}>{d.key}</span> · {d.title}
              </div>
            ))}
          </Panel>

          <Panel title="Details">
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", margin: 0, fontSize: 13 }}>
              <dt style={{ color: "var(--faint)" }}>Reporter</dt>
              <dd style={{ margin: 0 }}>
                <Who ws={ws} id={t.reporter_id} size={18} you={me} />
              </dd>
              <dt style={{ color: "var(--faint)" }}>Created</dt>
              <dd style={{ margin: 0 }}>{new Date(t.created_at).toLocaleString()}</dd>
              {t.started_at && (
                <>
                  <dt style={{ color: "var(--faint)" }}>Started</dt>
                  <dd style={{ margin: 0 }}>{ago(t.started_at)}</dd>
                </>
              )}
              {t.completed_at && (
                <>
                  <dt style={{ color: "var(--faint)" }}>Done</dt>
                  <dd style={{ margin: 0 }}>{ago(t.completed_at)}</dd>
                </>
              )}
              <dt style={{ color: "var(--faint)" }}>Updated</dt>
              <dd style={{ margin: 0 }}>{ago(t.updated_at)}</dd>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h2>
        {sub && <span style={{ fontSize: 13, color: "var(--faint)" }}>{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      aria-label="Title"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v !== value && onSave(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      maxLength={200}
      style={{ border: 0, background: "transparent", padding: 0, fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 700, letterSpacing: "-0.01em", width: "100%" }}
    />
  );
}

function EditableText({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing) {
    return (
      <div style={{ padding: "12px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)", cursor: "text" }} onClick={() => setEditing(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEditing(true)} aria-label="Edit description">
        <Markdown text={value} empty={placeholder} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={Math.max(6, v.split("\n").length + 1)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line-strong)", background: "var(--bg)", fontSize: 14, lineHeight: 1.55, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" variant="primary" onClick={() => (onSave(v), setEditing(false))}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (setV(value), setEditing(false))}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ListEditor({ items, onSave, placeholder }: { items: string[]; onSave: (v: string[]) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(items.join("\n"));
  useEffect(() => setV(items.join("\n")), [items]);
  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEditing(true)} style={{ cursor: "text", display: "grid", gap: 6 }}>
        {items.length ? (
          items.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 14 }}>
              <span style={{ color: "var(--faint)" }}>☐</span>
              <span>{d}</span>
            </div>
          ))
        ) : (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Add what has to be true for this to be done.</p>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} rows={Math.max(3, v.split("\n").length + 1)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line-strong)", background: "var(--bg)", fontSize: 14 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" variant="primary" onClick={() => (onSave(v.split("\n").map((x) => x.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean)), setEditing(false))}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LabelsEditor({ labels, onSave }: { labels: string[]; onSave: (v: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState("");
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {labels.map((l) => (
        <button key={l} type="button" title="Remove label" onClick={() => onSave(labels.filter((x) => x !== l))} style={{ border: 0, background: "none", padding: 0, cursor: "pointer" }}>
          <Label>{l} ×</Label>
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => (v.trim() && onSave([...new Set([...labels, v.trim().toLowerCase()])]), setV(""), setAdding(false))}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          placeholder="label"
          style={{ height: 26, width: 110, padding: "0 8px", borderRadius: 999, border: "1px solid var(--line-strong)", background: "var(--bg)", fontSize: 12 }}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ height: 26, padding: "0 10px", borderRadius: 999, border: "1px dashed var(--line)", background: "transparent", color: "var(--faint)", fontSize: 12, cursor: "pointer" }}>
          + Label
        </button>
      )}
    </span>
  );
}

function StepsEditor({ steps, onToggle, onReplace }: { steps: Step[]; onToggle: (idx: number, s: Step["status"]) => Promise<void>; onReplace: (s: { label: string; status: Step["status"] }[]) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  const next = (s: Step["status"]) => (s === "todo" ? "now" : s === "now" ? "done" : "todo");
  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={Math.max(4, v.split("\n").length + 1)} placeholder={"Plan the work, one step per line\nWrite the failing test\nBuild the button"} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line-strong)", background: "var(--bg)", fontSize: 14 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              const labels = v.split("\n").map((x) => x.replace(/^\s*(\d+[.)]|[-*])\s*/, "").trim()).filter(Boolean);
              await onReplace(labels.map((label) => ({ label, status: steps.find((s) => s.label === label)?.status ?? "todo" })));
              setEditing(false);
            }}
          >
            Save steps
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {steps.length > 0 && <StepProgress steps={steps} />}
      {steps.map((s) => (
        <button
          key={s.idx}
          type="button"
          onClick={() => void onToggle(s.idx, next(s.status))}
          title="Click to move: to do → now → done"
          style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 9, border: 0, textAlign: "left", cursor: "pointer", background: s.status === "now" ? "var(--surface-2)" : "transparent", color: "var(--text)" }}
        >
          <span style={{ width: 20, height: 20, flex: "none", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, ...(s.status === "done" ? { background: "var(--ok-bg)", color: "var(--ok)" } : s.status === "now" ? { background: "var(--primary)", color: "var(--on-primary)" } : { border: "1px solid var(--line)", color: "var(--faint)" }) }}>
            {s.status === "done" ? "✓" : s.idx + 1}
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, color: s.status === "done" ? "var(--muted)" : "var(--text)", textDecoration: s.status === "done" ? "line-through" : "none" }}>{s.label}</span>
            {s.note && <span style={{ fontSize: 12, color: "var(--faint)" }}>{s.note}</span>}
          </span>
        </button>
      ))}
      <div>
        <button type="button" onClick={() => (setV(steps.map((s) => s.label).join("\n")), setEditing(true))} style={{ border: 0, background: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
          {steps.length ? "Edit steps" : "+ Plan the steps (or let the agent do it)"}
        </button>
      </div>
    </div>
  );
}

function Blockers({ ws, t }: { ws: Workspace; t: Ticket }) {
  const [adding, setAdding] = useState(false);
  const blockers = ws.blockersOf(t.id);
  const candidates = ws.tickets.filter((x) => x.id !== t.id && !blockers.some((b) => b.id === x.id) && x.status !== "canceled");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {blockers.map((b) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <TicketRow ws={ws} t={b} />
          <button type="button" aria-label={`Remove ${b.key}`} onClick={async () => (await removeBlocker(t.id, b.id), await ws.reload())} style={{ border: 0, background: "none", color: "var(--faint)", cursor: "pointer" }}>
            ×
          </button>
        </div>
      ))}
      {!blockers.length && !adding && <p style={{ fontSize: 13, color: "var(--faint)" }}>Nothing. It can start any time.</p>}
      {adding ? (
        <select autoFocus aria-label="Blocked by" defaultValue="" onChange={async (e) => (e.target.value && (await addBlocker(t.id, e.target.value), await ws.reload()), setAdding(false))} onBlur={() => setAdding(false)} style={{ height: 34, borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13 }}>
          <option value="">Pick the ticket it waits for…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.key} · {c.title}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ alignSelf: "flex-start", border: 0, background: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "4px 0" }}>
          + Waits for another ticket
        </button>
      )}
    </div>
  );
}

function TicketRow({ ws, t }: { ws: Workspace; t: Ticket }) {
  return (
    <a href={`/p/${ws.project.slug}/t/${t.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: t.key })} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, color: "var(--text)", textDecoration: "none", background: "var(--surface)", border: "1px solid var(--line-soft)", minWidth: 0 }}>
      <StatusIcon status={t.status} />
      <KeyText t={t} />
      <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
    </a>
  );
}

function CodeLinks({ t, repo, onSave }: { t: Ticket; repo: string | null; onSave: (p: TicketPatch) => void }) {
  const [pr, setPr] = useState(t.pr_url ?? "");
  useEffect(() => setPr(t.pr_url ?? ""), [t.pr_url]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "var(--faint)", width: 56 }}>Branch</span>
        {t.branch ? (
          repo ? (
            <a href={`https://github.com/${repo}/tree/${t.branch}`} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
              {t.branch}
            </a>
          ) : (
            <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{t.branch}</span>
          )
        ) : (
          <span style={{ color: "var(--faint)" }}>Set when work starts</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "var(--faint)", width: 56 }}>PR</span>
        {t.pr_url ? (
          <a href={t.pr_url} target="_blank" rel="noreferrer">
            {t.pr_url.replace(/^https:\/\/github\.com\//, "")}
          </a>
        ) : (
          <input value={pr} onChange={(e) => setPr(e.target.value)} onBlur={() => pr.trim() && onSave({ pr_url: pr.trim() })} placeholder="Paste a pull request link" style={{ flex: 1, height: 30, padding: "0 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", fontSize: 12 }} />
        )}
      </div>
    </div>
  );
}

/** One line of history, e.g. "moved it from Ready to In progress". */
export function describe(ws: Workspace, e: TicketEvent): string | null {
  const d = e.data as Record<string, string>;
  switch (e.kind) {
    case "created":
      return "created this ticket";
    case "status":
      return `moved it from ${statusLabel(d.from as never)} to ${statusLabel(d.to as never)}`;
    case "assignee":
      return d.to ? `assigned it to ${ws.nameOf(d.to)}` : "unassigned it";
    case "priority":
      return `set priority to ${d.to}`;
    case "title":
      return `renamed it to "${d.to}"`;
    case "branch":
      return `is working on branch ${d.branch}`;
    case "pr":
      return `opened a pull request`;
    case "step":
      return d.status === "done" ? `finished step "${d.label}"` : d.status === "now" ? `started step "${d.label}"` : null;
    case "needs_human":
      return `needs a person: ${d.note}`;
    case "comment":
      return "commented";
    default:
      return null;
  }
}

function Timeline({ ws, me, detail, ticket, onPosted }: { ws: Workspace; me: string; detail: { comments: Comment[]; events: TicketEvent[] } | null; ticket: Ticket; onPosted: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!detail) return <p style={{ color: "var(--faint)", fontSize: 13 }}>Loading…</p>;
  const items = [
    ...detail.comments.map((c) => ({ at: c.created_at, id: `c${c.id}`, c })),
    ...detail.events.filter((e) => e.kind !== "comment").map((e) => ({ at: e.created_at, id: `e${e.id}`, e })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const post = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await addComment(ticket.id, me, body.trim());
      setBody("");
      await onPosted();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it) =>
        "c" in it && it.c ? (
          <div key={it.id} style={{ display: "flex", gap: 10 }}>
            <Who ws={ws} id={it.c.author_id} size={26} withName={false} you={me} />
            <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)" }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <strong style={{ fontWeight: 600 }}>{ws.nameOf(it.c.author_id)}</strong> <span style={{ color: "var(--faint)" }}>{ago(it.c.created_at)}</span>
              </div>
              <Markdown text={it.c.body} />
            </div>
          </div>
        ) : "e" in it && it.e && describe(ws, it.e) ? (
          <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "var(--muted)", paddingLeft: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--line-strong)", flex: "none", margin: "0 10px" }} />
            <span>
              <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>{ws.nameOf(it.e.actor_id)}</strong> {describe(ws, it.e)} <span style={{ color: "var(--faint)" }}>· {ago(it.e.created_at)}</span>
            </span>
          </div>
        ) : null,
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line-strong)" }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && void post()}
          rows={2}
          placeholder={ws.agentOf(ticket.assignee_id) ? `Steer ${ws.nameOf(ticket.assignee_id)}: it reads this before its next step` : "Write a comment"}
          aria-label="Comment"
          style={{ border: 0, background: "transparent", fontSize: 14, resize: "vertical", outline: "none" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: err ? "var(--danger)" : "var(--faint)" }}>{err || "⌘ Enter to send · Markdown works"}</span>
          <Button size="sm" variant="primary" disabled={busy || !body.trim()} onClick={() => void post()}>
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
