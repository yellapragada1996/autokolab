import { useCallback, useEffect, useState } from "react";
import {
  addBlocker,
  addComment,
  allowMerge,
  PRIORITIES,
  removeBlocker,
  setSteps,
  setStepStatus,
  STATUSES,
  statusLabel,
  ticketDetail,
  TYPES,
  updateTicket,
  waitsForMergeOk,
  type Comment,
  type Step,
  type Ticket,
  type TicketEvent,
  type TicketPatch,
  type Status,
} from "../lib/data";
import { onNav } from "../lib/router";
import { Button } from "../ui";
import { WhoMark } from "./Board";
import { ago, EpicLozenge, KeyText, Label, Markdown, Picker, PriorityIcon, StatusLozenge, StepProgress, TypeIcon, TypeTag, Who } from "./bits";
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
  const kids = ws.childrenOf(t.id);
  const kidsDone = kids.filter((k) => k.status === "done").length;
  const crumb: React.CSSProperties = { color: "var(--muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 };
  const plain: React.CSSProperties = { border: "1px solid transparent", background: "transparent", padding: "0 6px", marginLeft: -6 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--faint)", alignItems: "center", flexWrap: "wrap" }}>
        <a href={`/p/${ws.project.slug}/board`} onClick={onNav({ view: "board", project: ws.project.slug })} style={crumb}>
          {ws.project.name}
        </a>
        <span>/</span>
        {parent && (
          <>
            <a href={`/p/${ws.project.slug}/t/${parent.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: parent.key })} style={crumb}>
              <TypeIcon type="epic" size={14} />
              {parent.key}
            </a>
            <span>/</span>
          </>
        )}
        <span style={{ ...crumb, color: "var(--text-2)" }}>
          <TypeIcon type={t.type} size={14} />
          <KeyText t={t} style={{ color: "inherit" }} />
        </span>
      </nav>

      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 22 }}>
          <EditableTitle value={t.title} onSave={(title) => save({ title })} />

          {t.needs_human && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 8, background: "var(--warn-bg)", border: "1px solid var(--warn-line)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)", flex: "none" }} />
              <span style={{ flex: 1, fontSize: 14 }}>
                <strong style={{ color: "var(--warn)" }}>Needs you.</strong> {t.needs_human}
              </span>
              {waitsForMergeOk(t) && isPerson(ws, me) ? (
                <OkToMerge ws={ws} t={t} />
              ) : (
                <Button size="sm" variant="secondary" onClick={() => save({ needs_human: null })}>
                  Resolved
                </Button>
              )}
            </div>
          )}
          {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}

          <Panel title="Description">
            <EditableText value={t.description} onSave={(description) => save({ description })} placeholder="Add a description. The assigned agent reads this as its brief." />
          </Panel>

          <Panel title="Done means">
            <ListEditor items={t.done_means} onSave={(done_means) => save({ done_means })} placeholder="One acceptance check per line" />
          </Panel>

          {(t.type === "epic" || kids.length > 0) && (
            <Panel title="Child issues" sub={kids.length ? `${kidsDone} of ${kids.length} done` : undefined}>
              {kids.length > 0 && (
                <div style={{ height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" }}>
                  <div style={{ width: `${(kidsDone / kids.length) * 100}%`, height: "100%", background: "var(--ok-dot)" }} />
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 6, overflow: "hidden", border: kids.length ? "1px solid var(--line-soft)" : 0 }}>
                {kids.map((c) => (
                  <IssueRow key={c.id} ws={ws} t={c} me={me} />
                ))}
              </div>
              {!kids.length && <p style={{ fontSize: 13, color: "var(--faint)" }}>No child issues yet. The lead adds them when it plans this epic.</p>}
            </Panel>
          )}

          <Panel title="Linked issues">
            <Blockers ws={ws} t={t} me={me} />
          </Panel>

          <Panel title="Where it is" sub="Steps, checked off as the work proves them">
            <StepsEditor steps={steps} onToggle={async (idx, status) => (await setStepStatus(t.id, idx, status), await load(), await ws.reload())} onReplace={async (s) => (await setSteps(t.id, s), await load(), await ws.reload())} />
          </Panel>

          <Panel title="Activity">
            <Timeline ws={ws} me={me} detail={detail} ticket={t} onPosted={load} hint={assignee ? `${assignee.display_name} reads new comments before its next step` : undefined} />
          </Panel>
        </div>

        <aside style={{ flex: "1 1 300px", minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <StatusButton status={t.status} onChange={(status) => save({ status })} />
            {assignee && t.status === "in_progress" && (
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                {assignee.display_name} is on it{assignee.status_note ? `: ${assignee.status_note}` : ""}
              </span>
            )}
          </div>

          <section style={{ borderRadius: 8, border: "1px solid var(--line)", overflow: "hidden" }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, padding: "10px 14px", borderBottom: "1px solid var(--line)", background: "var(--sidebar)" }}>Details</h2>
            <dl style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "10px 12px", margin: 0, padding: 14, fontSize: 13, alignItems: "center" }}>
              <dt style={{ color: "var(--muted)" }}>Assignee</dt>
              <dd style={{ margin: 0 }}>
                <Picker
                  label="Assignee"
                  style={plain}
                  value={t.assignee_id ?? ""}
                  options={[{ id: "", label: "Unassigned" }, ...ws.people.members.map((m) => ({ id: m.actor_id, label: ws.nameOf(m.actor_id) + (m.actor_type === "agent" ? " (agent)" : "") }))]}
                  onChange={(id) => save({ assignee_id: id || null, ...(id && ws.agentOf(id) && t.status === "backlog" ? { status: "ready" as const } : {}) })}
                  render={<Who ws={ws} id={t.assignee_id} size={22} you={me} />}
                />
              </dd>
              <dt style={{ color: "var(--muted)" }}>Reporter</dt>
              <dd style={{ margin: 0 }}>
                <Who ws={ws} id={t.reporter_id} size={22} you={me} />
              </dd>
              <dt style={{ color: "var(--muted)" }}>Priority</dt>
              <dd style={{ margin: 0 }}>
                <Picker label="Priority" style={plain} value={t.priority} options={PRIORITIES} onChange={(priority) => save({ priority })} render={<><PriorityIcon priority={t.priority} /><span>{PRIORITIES.find((p) => p.id === t.priority)!.label}</span></>} />
              </dd>
              <dt style={{ color: "var(--muted)" }}>Type</dt>
              <dd style={{ margin: 0 }}>
                <Picker label="Type" style={plain} value={t.type} options={TYPES} onChange={(type) => save({ type })} render={<TypeTag type={t.type} />} />
              </dd>
              {t.type !== "epic" && (
                <>
                  <dt style={{ color: "var(--muted)" }}>Parent</dt>
                  <dd style={{ margin: 0 }}>
                    <Picker
                      label="Epic"
                      style={plain}
                      value={t.parent_id ?? ""}
                      options={[{ id: "", label: "None" }, ...ws.tickets.filter((x) => x.type === "epic" && x.id !== t.id).map((e) => ({ id: e.id, label: `${e.key} · ${e.title}` }))]}
                      onChange={(id) => save({ parent_id: id || null })}
                      render={parent ? <EpicLozenge epic={parent} /> : <span style={{ color: "var(--faint)" }}>None</span>}
                    />
                  </dd>
                </>
              )}
              <dt style={{ color: "var(--muted)" }}>Labels</dt>
              <dd style={{ margin: 0 }}>
                <LabelsEditor labels={t.labels} onSave={(labels) => save({ labels })} />
              </dd>
              <CodeLinks t={t} repo={ws.project.repo} onSave={save} />
              <MergeRows ws={ws} t={t} me={me} />
            </dl>
          </section>

          <section style={{ borderRadius: 8, border: "1px solid var(--line)", padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>Context it's using</h2>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Every agent reads these before working on this ticket.</p>
            <a href={`/p/${ws.project.slug}/guide`} onClick={onNav({ view: "guide", project: ws.project.slug })} style={{ fontSize: 13 }}>
              Project Guide: concept, architecture and rules
            </a>
            {ws.decisions.filter((d) => !d.superseded_by).slice(0, 6).map((d) => (
              <div key={d.id} style={{ fontSize: 13, color: "var(--text-2)" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)" }}>{d.key}</span> · {d.title}
              </div>
            ))}
          </section>

          <div style={{ fontSize: 12, color: "var(--faint)", display: "flex", flexDirection: "column", gap: 2, padding: "0 2px" }}>
            <span>Created {new Date(t.created_at).toLocaleString()}</span>
            <span>Updated {ago(t.updated_at)}</span>
            {t.started_at && <span>Started {ago(t.started_at)}</span>}
            {t.completed_at && <span>Resolved {ago(t.completed_at)}</span>}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Jira's status button: the current status, click to move it. */
function StatusButton({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const blue = status === "in_progress" || status === "review";
  const tone = status === "done" ? { bg: "#1c3a2a", fg: "#7ee2a8" } : blue ? { bg: "#0c66e4", fg: "#fff" } : { bg: "var(--surface-2)", fg: "var(--text)" };
  return (
    <label style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 12px", borderRadius: 6, background: tone.bg, color: tone.fg, font: "600 13px var(--sans)", cursor: "pointer", border: "1px solid var(--line)" }}>
      {status === "review" ? "In review" : statusLabel(status)}
      <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.8 }}>
        ▼
      </span>
      <select aria-label="Status" value={status} onChange={(e) => onChange(e.target.value as Status)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
        {[...STATUSES, { id: "canceled" as const, label: "Canceled" }].map((s) => (
          <option key={s.id} value={s.id}>
            {s.id === "review" ? "In review" : s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One linked or child issue, Jira-style: type, key, summary, status, assignee. */
function IssueRow({ ws, t, me, onRemove }: { ws: Workspace; t: Ticket; me: string; onRemove?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 38, padding: "4px 10px", background: "var(--surface)" }}>
      <TypeIcon type={t.type} />
      <a href={`/p/${ws.project.slug}/t/${t.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: t.key })} style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 0, color: "var(--text)", textDecoration: "none" }}>
        <KeyText t={t} style={{ textDecoration: t.status === "done" ? "line-through" : "none" }} />
        <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
      </a>
      <PriorityIcon priority={t.priority} />
      <WhoMark ws={ws} id={t.assignee_id} me={me} size={20} />
      <StatusLozenge status={t.status} needs={!!t.needs_human} />
      {onRemove && (
        <button type="button" aria-label={`Remove link to ${t.key}`} onClick={onRemove} style={{ border: 0, background: "none", color: "var(--faint)", cursor: "pointer", fontSize: 16 }}>
          ×
        </button>
      )}
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

function Blockers({ ws, t, me }: { ws: Workspace; t: Ticket; me: string }) {
  const [adding, setAdding] = useState(false);
  const blockers = ws.blockersOf(t.id);
  const blocks = ws.unblocks(t.id);
  const candidates = ws.tickets.filter((x) => x.id !== t.id && !blockers.some((b) => b.id === x.id) && x.status !== "canceled" && x.type !== "epic");
  const group = (label: string, list: Ticket[], remove?: (x: Ticket) => () => void) =>
    list.length > 0 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 6, overflow: "hidden", border: "1px solid var(--line-soft)" }}>
          {list.map((x) => (
            <IssueRow key={x.id} ws={ws} t={x} me={me} onRemove={remove?.(x)} />
          ))}
        </div>
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {group("is blocked by", blockers, (b) => async () => (await removeBlocker(t.id, b.id), await ws.reload()))}
      {group("blocks", blocks)}
      {!blockers.length && !blocks.length && !adding && <p style={{ fontSize: 13, color: "var(--faint)" }}>Not linked to other issues. It can start any time.</p>}
      {adding ? (
        <select autoFocus aria-label="Is blocked by" defaultValue="" onChange={async (e) => (e.target.value && (await addBlocker(t.id, e.target.value), await ws.reload()), setAdding(false))} onBlur={() => setAdding(false)} style={{ height: 34, borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13 }}>
          <option value="">This issue is blocked by…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.key} · {c.title}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ alignSelf: "flex-start", border: 0, background: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "2px 0" }}>
          + Link an issue it's blocked by
        </button>
      )}
    </div>
  );
}

function CodeLinks({ t, repo, onSave }: { t: Ticket; repo: string | null; onSave: (p: TicketPatch) => void }) {
  const [pr, setPr] = useState(t.pr_url ?? "");
  useEffect(() => setPr(t.pr_url ?? ""), [t.pr_url]);
  return (
    <>
      <dt style={{ color: "var(--muted)" }}>Branch</dt>
      <dd style={{ margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
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
      </dd>
      <dt style={{ color: "var(--muted)" }}>Pull request</dt>
      <dd style={{ margin: 0, minWidth: 0 }}>
        {t.pr_url ? (
          <a href={t.pr_url} target="_blank" rel="noreferrer">
            {t.pr_url.replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\//, "#")}
          </a>
        ) : (
          <input value={pr} onChange={(e) => setPr(e.target.value)} onBlur={() => pr.trim() && onSave({ pr_url: pr.trim() })} placeholder="None yet" style={{ width: "100%", height: 28, padding: "0 6px", borderRadius: 6, border: "1px solid transparent", background: "transparent", fontSize: 13 }} />
        )}
      </dd>
    </>
  );
}

/** People in the project can OK a risky merge; agents can't (allow_merge refuses them too). */
export const isPerson = (ws: Workspace, me: string) => ws.people.members.some((m) => m.actor_id === me && m.actor_type === "human");

/**
 * The lead's approval of an exact commit, and a person's OK for a risky merge (DEC-19). Nothing shows
 * for tickets without either, including every ticket before schema 12. The lead can't approve a ticket
 * it built (AK-34), so those say who approved it, or that they wait for someone else.
 */
function MergeRows({ ws, t, me }: { ws: Workspace; t: Ticket; me: string }) {
  const waiting = waitsForMergeOk(t);
  const sha = t.approved_sha;
  const leadBuilt = !!ws.project.lead_agent_id && t.assignee_id === ws.project.lead_agent_id;
  const approver = t.approved_by ? (isPerson(ws, t.approved_by) ? "a person" : "another agent") : null;
  return (
    <>
      {!sha && leadBuilt && t.status === "review" && t.pr_url && (
        <>
          <dt style={{ color: "var(--muted)" }}>Approval</dt>
          <dd style={{ margin: 0, minWidth: 0, color: "var(--warn)" }}>Waiting for a person or another agent: the lead built this, so it can't approve it</dd>
        </>
      )}
      {sha && (
        <>
          <dt style={{ color: "var(--muted)" }}>Approval</dt>
          <dd style={{ margin: 0, minWidth: 0 }}>
            Approved by {ws.nameOf(t.approved_by ?? null)}
            {leadBuilt && approver && ` (${approver}, since the lead built this)`} for commit{" "}
            {ws.project.repo ? (
              <a href={`https://github.com/${ws.project.repo}/commit/${sha}`} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                {sha.slice(0, 7)}
              </a>
            ) : (
              <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{sha.slice(0, 7)}</code>
            )}
            {t.approved_at && <span style={{ color: "var(--faint)" }}> · {ago(t.approved_at)}</span>}
          </dd>
        </>
      )}
      {(waiting || t.merge_ok_at) && (
        <>
          <dt style={{ color: "var(--muted)" }}>Merge</dt>
          <dd style={{ margin: 0, minWidth: 0 }}>
            {t.merge_ok_at ? (
              <span>
                OK'd by {ws.nameOf(t.merge_ok_by ?? null)} <span style={{ color: "var(--faint)" }}>· {ago(t.merge_ok_at)}</span>
              </span>
            ) : isPerson(ws, me) ? (
              <OkToMerge ws={ws} t={t} />
            ) : (
              <span style={{ color: "var(--warn)" }}>Waiting for a person's OK</span>
            )}
          </dd>
        </>
      )}
    </>
  );
}

/** One click: a person OKs merging a risky change the lead approved. Its error shows next to it. */
export function OkToMerge({ ws, t }: { ws: Workspace; t: Ticket }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = async () => {
    setBusy(true);
    setErr("");
    try {
      await allowMerge(t.id);
      await ws.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <Button size="sm" variant="primary" disabled={busy} onClick={() => void ok()} title="The lead merges it once tests pass">
        {busy ? "Saving…" : "OK to merge"}
      </Button>
      {err && (
        <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
          {err}
        </span>
      )}
    </span>
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
    case "approval":
      return d.to ? `approved commit ${d.to.slice(0, 7)}` : d.reason === "pr_changed" ? null : "withdrew the approval";
    case "merge_ok":
      return d.by ? "OK'd the merge" : null;
    default:
      return null;
  }
}

function Timeline({ ws, me, detail, ticket, onPosted, hint }: { ws: Workspace; me: string; detail: { comments: Comment[]; events: TicketEvent[] } | null; ticket: Ticket; onPosted: () => Promise<void>; hint?: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"all" | "comments" | "history">("all");
  if (!detail) return <p style={{ color: "var(--faint)", fontSize: 13 }}>Loading…</p>;
  const items = [
    ...(tab !== "history" ? detail.comments.map((c) => ({ at: c.created_at, id: `c${c.id}`, c })) : []),
    ...(tab !== "comments" ? detail.events.filter((e) => e.kind !== "comment").map((e) => ({ at: e.created_at, id: `e${e.id}`, e })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
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
  const tabBtn = (id: typeof tab, label: string) => (
    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: 0, background: tab === id ? "var(--surface-2)" : "transparent", color: tab === id ? "var(--text)" : "var(--muted)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div role="tablist" aria-label="Show" style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--faint)", marginRight: 4 }}>Show:</span>
        {tabBtn("all", "All")}
        {tabBtn("comments", "Comments")}
        {tabBtn("history", "History")}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Who ws={ws} id={me} size={28} withName={false} you={me} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--line-strong)" }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && void post()}
            rows={2}
            placeholder={hint ? `Add a comment. ${hint}.` : "Add a comment"}
            aria-label="Comment"
            style={{ border: 0, background: "transparent", fontSize: 14, resize: "vertical", outline: "none" }}
          />
          {(body || err) && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: err ? "var(--danger)" : "var(--faint)" }}>{err || "⌘ Enter to save · Markdown works"}</span>
              <Button size="sm" variant="primary" disabled={busy || !body.trim()} onClick={() => void post()}>
                Save
              </Button>
            </div>
          )}
        </div>
      </div>
      {items.map((it) =>
        "c" in it && it.c ? (
          <div key={it.id} style={{ display: "flex", gap: 10 }}>
            <Who ws={ws} id={it.c.author_id} size={28} withName={false} you={me} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <strong style={{ fontWeight: 600 }}>{ws.nameOf(it.c.author_id)}</strong> <span style={{ color: "var(--faint)" }}>{ago(it.c.created_at)}</span>
              </div>
              <Markdown text={it.c.body} />
            </div>
          </div>
        ) : "e" in it && it.e && describe(ws, it.e) ? (
          <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
            <Who ws={ws} id={it.e.actor_id} size={28} withName={false} you={me} />
            <span>
              <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>{ws.nameOf(it.e.actor_id)}</strong> {describe(ws, it.e)} <span style={{ color: "var(--faint)" }}>· {ago(it.e.created_at)}</span>
            </span>
          </div>
        ) : null,
      )}
      {!items.length && <p style={{ fontSize: 13, color: "var(--faint)" }}>Nothing yet.</p>}
    </div>
  );
}
