import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Priority, Status, Ticket, TicketType } from "../lib/data";
import { AgentAvatar, PersonAvatar } from "../ui";
import type { Workspace } from "./useWorkspace";

// Small display pieces shared by the board, list and ticket screens. Colour only means status:
// blue moving, green done, amber needs you, coral heads up; everything else is neutral.

export const statusColor: Record<Status, string> = {
  backlog: "var(--faint)",
  ready: "var(--text-2)",
  in_progress: "var(--blue)",
  review: "var(--blue)",
  done: "var(--green)",
  canceled: "var(--faint)",
};

export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const c = statusColor[status];
  const r = 6;
  const circ = 2 * Math.PI * r;
  const fill = { backlog: 0, ready: 0, in_progress: 0.5, review: 0.75, done: 1, canceled: 0 }[status];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
      <circle cx="8" cy="8" r={r} fill="none" stroke={c} strokeWidth="1.6" strokeDasharray={status === "backlog" ? "2 2" : undefined} />
      {fill > 0 && fill < 1 && (
        <circle cx="8" cy="8" r={r / 2} fill="none" stroke={c} strokeWidth={r} strokeDasharray={`${(circ / 2) * fill} ${circ}`} transform="rotate(-90 8 8)" />
      )}
      {fill === 1 && (
        <>
          <circle cx="8" cy="8" r={r} fill={c} />
          <path d="M5.2 8.2l1.9 1.9 3.7-4" stroke="var(--bg)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {status === "canceled" && <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

/** Jira's priority arrows: urgent and high point up, medium is "=", low points down. Only urgent is coloured (heads up). */
export function PriorityIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  const label = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low", none: "No priority" }[priority];
  const c = { urgent: "var(--coral)", high: "var(--text-secondary)", medium: "var(--text-muted)", low: "var(--text-dim)", none: "var(--faint)" }[priority];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={`${label} priority`} style={{ flex: "none" }}>
      <title>{label}</title>
      {priority === "urgent" && <path d="M3.5 8.5L8 4l4.5 4.5M3.5 12.5L8 8l4.5 4.5" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {priority === "high" && <path d="M3.5 10.5L8 6l4.5 4.5" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {priority === "medium" && <path d="M3.5 6.5h9M3.5 9.5h9" stroke={c} strokeWidth="1.8" strokeLinecap="round" />}
      {priority === "low" && <path d="M3.5 5.5L8 10l4.5-4.5" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {priority === "none" && <path d="M4 8h8" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.5 2" />}
    </svg>
  );
}

/** Jira's issue type names: a feature is a Story. */
export const typeLabel: Record<TicketType, string> = { feature: "Story", bug: "Bug", task: "Task", chore: "Chore", epic: "Epic" };

/** Jira's issue type icons: a small neutral square with a symbol (the symbol tells them apart, not colour). */
export function TypeIcon({ type, size = 16 }: { type: TicketType; size?: number }) {
  const ink = "var(--avatar-fg)";
  const glyph = {
    feature: <path d="M5.5 4h5v8.5L8 10.5l-2.5 2z" fill={ink} />,
    bug: <circle cx="8" cy="8" r="3" fill={ink} />,
    task: <path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke={ink} strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    chore: <path d="M5 8h6" stroke={ink} strokeWidth="2" strokeLinecap="round" />,
    epic: <path d="M9.2 3.5L5 9h3l-1.2 3.5L11 7H8z" fill={ink} />,
  }[type];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={typeLabel[type]} style={{ flex: "none" }}>
      <title>{typeLabel[type]}</title>
      <rect width="16" height="16" rx="3" fill="var(--avatar-bg)" />
      {glyph}
    </svg>
  );
}

export function TypeTag({ type }: { type: TicketType }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
      <TypeIcon type={type} />
      {typeLabel[type]}
    </span>
  );
}

/** Jira's status lozenge: grey to do, blue in progress, green done, amber needs you. */
export function StatusLozenge({ status, needs }: { status: Status; needs?: boolean }) {
  const tone = needs
    ? { bg: "var(--amber-bg-2)", fg: "var(--amber)", line: "var(--amber-border)" }
    : status === "done"
      ? { bg: "var(--green-chip)", fg: "var(--green-text)", line: "transparent" }
      : status === "in_progress" || status === "review"
        ? { bg: "var(--blue-bg)", fg: "var(--blue-text)", line: "transparent" }
        : { bg: "var(--surface-2)", fg: "var(--text-2)", line: "transparent" };
  const text = needs ? "Needs you" : { backlog: "Backlog", ready: "Ready", in_progress: "In progress", review: "In review", done: "Done", canceled: "Canceled" }[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 6px", borderRadius: 4, background: tone.bg, color: tone.fg, border: `1px solid ${tone.line}`, font: "600 12px var(--sans)", letterSpacing: "0.03em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

/** The goal (epic) a ticket belongs to. Neutral: goals don't get their own colours. */
export function EpicLozenge({ epic }: { epic: Pick<Ticket, "key" | "title"> }) {
  return (
    <span title={`${epic.key} ${epic.title}`} style={{ display: "inline-flex", alignItems: "center", maxWidth: 170, height: 20, padding: "0 6px", borderRadius: 4, background: "var(--surface-raised)", color: "var(--text-secondary)", font: "500 12px var(--sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {epic.title}
    </span>
  );
}

/** A person (circle) or an agent (neutral square), with their name. */
export function Who({ ws, id, size = 22, withName = true, you }: { ws: Workspace; id: string | null; size?: number; withName?: boolean; you?: string }) {
  if (!id) {
    return withName ? (
      <span style={{ fontSize: 13, color: "var(--faint)" }}>Unassigned</span>
    ) : (
      <span title="Unassigned" style={{ width: size, height: size, borderRadius: "50%", border: "1px dashed var(--line-strong)", flex: "none", display: "inline-block" }} />
    );
  }
  const agent = ws.agentOf(id);
  const profile = ws.people.profiles.get(id);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {agent ? <AgentAvatar name={agent.display_name} vendor={agent.vendor} size={size} /> : <PersonAvatar name={profile?.name ?? "?"} src={profile?.avatar_url} size={size} you={id === you} />}
      {withName && <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ws.nameOf(id)}</span>}
      {withName && ws.project.lead_agent_id === id && <LeadBadge />}
    </span>
  );
}

export function LeadBadge() {
  return (
    <span title="The lead writes the tickets and assigns them" style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 5px", borderRadius: 4, background: "var(--primary)", color: "var(--on-primary)", font: "700 12px var(--sans)", letterSpacing: "0.04em", textTransform: "uppercase", flex: "none" }}>
      Lead
    </span>
  );
}

export function StepProgress({ steps }: { steps: { status: string }[] | undefined }) {
  if (!steps?.length) return null;
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div style={{ display: "flex", gap: 3 }} role="img" aria-label={`${done} of ${steps.length} steps done`}>
      {steps.map((s, i) => (
        <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: s.status === "done" ? "var(--ok-dot)" : s.status === "now" ? "var(--blue)" : "var(--track)" }} />
      ))}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, border: "1px solid var(--line)", fontSize: 12, color: "var(--text-2)" }}>
      {children}
    </span>
  );
}

export function KeyText({ t, style }: { t: Pick<Ticket, "key">; style?: CSSProperties }) {
  return <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)", ...style }}>{t.key}</span>;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * A small, safe Markdown renderer (headings, lists, checkboxes, code blocks, inline code, bold,
 * links). Builds React elements, never HTML strings.
 */
export function Markdown({ text, empty }: { text: string; empty?: string }) {
  if (!text.trim()) return <p style={{ color: "var(--faint)", fontSize: 14 }}>{empty ?? "Nothing here yet."}</p>;
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul${out.length}`} style={{ margin: "4px 0 10px", paddingLeft: 20, display: "grid", gap: 4 }}>{list}</ul>);
    list = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      out.push(
        <pre key={`pre${out.length}`} style={{ margin: "6px 0 12px", padding: "12px 14px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--line-soft)", overflowX: "auto", font: "13px/1.55 var(--mono)", color: "var(--text-2)" }}>
          {code.join("\n")}
        </pre>,
      );
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const li = line.match(/^\s*[-*]\s+(\[( |x)\]\s+)?(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      const size = [0, 18, 16, 15][h[1].length];
      out.push(<p key={`h${out.length}`} style={{ fontWeight: 600, fontSize: size, margin: "12px 0 6px" }}>{inline(h[2])}</p>);
    } else if (li || ol) {
      const checked = li?.[2];
      list.push(
        <li key={`li${list.length}`} style={{ fontSize: 14, lineHeight: 1.55, listStyle: li?.[1] ? "none" : undefined, marginLeft: li?.[1] ? -18 : 0 }}>
          {li?.[1] && <span style={{ marginRight: 6, color: checked === "x" ? "var(--ok)" : "var(--faint)" }}>{checked === "x" ? "☑" : "☐"}</span>}
          {inline(li ? li[3] : ol![1])}
        </li>,
      );
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      out.push(<p key={`p${out.length}`} style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 8px", color: "var(--text-2)" }}>{inline(line)}</p>);
    }
    i++;
  }
  flush();
  return <div>{out}</div>;
}

function inline(s: string): ReactNode {
  const parts = s.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`") && p.length > 1)
      return <code key={i} style={{ font: "12.5px var(--mono)", padding: "1px 5px", borderRadius: 5, background: "var(--surface-2)", color: "var(--text)" }}>{p.slice(1, -1)}</code>;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
    const link = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** A compact select that looks like the rest of the UI. */
export function Picker<T extends string>({
  value,
  options,
  onChange,
  label,
  render,
  style,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  render?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13, cursor: "pointer", ...style }}>
      <span className="sr-only">{label}</span>
      {render}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
