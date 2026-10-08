import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Priority, Status, Ticket, TicketType } from "../lib/data";
import { AgentMark, Avatar } from "../ui";
import type { Workspace } from "./useWorkspace";

// Small display pieces shared by the board, list and ticket screens.

export const statusColor: Record<Status, string> = {
  backlog: "var(--faint)",
  ready: "var(--text-2)",
  in_progress: "var(--ok)",
  review: "var(--codex)",
  done: "var(--muted)",
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

export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === "urgent") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label="Urgent" style={{ flex: "none" }}>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="var(--warn)" />
        <path d="M8 4.5v4.5M8 11.2v.3" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  const bars = { high: 3, medium: 2, low: 1, none: 0 }[priority];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={`${priority} priority`} style={{ flex: "none" }}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.5} y={11 - i * 3.5} width="3" height={3 + i * 3.5} rx="1" fill={i < bars ? "var(--text-2)" : "var(--line)"} />
      ))}
    </svg>
  );
}

export const typeTone: Record<TicketType, string> = {
  feature: "var(--ok)",
  bug: "var(--danger)",
  task: "var(--text-2)",
  chore: "var(--faint)",
  epic: "#c9a7ff",
};

export function TypeTag({ type }: { type: TicketType }) {
  return <span style={{ fontSize: 12, color: typeTone[type] }}>{type[0].toUpperCase() + type.slice(1)}</span>;
}

/** A person (circle) or an agent (rounded square), with their name. */
export function Who({ ws, id, size = 22, withName = true, you }: { ws: Workspace; id: string | null; size?: number; withName?: boolean; you?: string }) {
  if (!id) return <span style={{ fontSize: 13, color: "var(--faint)" }}>Unassigned</span>;
  const agent = ws.agentOf(id);
  const profile = ws.people.profiles.get(id);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {agent ? <AgentMark vendor={agent.vendor} size={size} /> : <Avatar name={profile?.name ?? "?"} src={profile?.avatar_url} size={size} you={id === you} />}
      {withName && <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ws.nameOf(id)}</span>}
    </span>
  );
}

export function StepProgress({ steps }: { steps: { status: string }[] | undefined }) {
  if (!steps?.length) return null;
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div style={{ display: "flex", gap: 3 }} role="img" aria-label={`${done} of ${steps.length} steps done`}>
      {steps.map((s, i) => (
        <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: s.status === "done" ? "var(--ok-dot)" : s.status === "now" ? "var(--warn)" : "var(--line)" }} />
      ))}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, border: "1px solid var(--line)", fontSize: 11, color: "var(--text-2)" }}>
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
