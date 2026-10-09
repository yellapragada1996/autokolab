import type { CSSProperties, ReactNode } from "react";

// Base components (spec §11, Phase 0). Values come from the wireframes' inline styles.

// ------------------------------------------------------------------ Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const buttonBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 9,
  fontFamily: "var(--sans)",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const buttonVariants: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "var(--primary)", color: "var(--on-primary)" },
  secondary: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line-strong)", fontWeight: 500 },
  ghost: { background: "transparent", color: "var(--text-2)", fontWeight: 500 },
  danger: { background: "transparent", color: "var(--danger)", fontWeight: 500 },
};
const buttonSizes = {
  sm: { height: 32, padding: "0 12px", fontSize: 13 },
  md: { height: 40, padding: "0 18px", fontSize: 14 },
  lg: { height: 52, padding: "0 28px", fontSize: 16, borderRadius: 12 },
};

export function Button({
  variant = "secondary",
  size = "md",
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        ...buttonBase,
        ...buttonVariants[variant],
        ...buttonSizes[size],
        ...(rest.disabled ? { background: "var(--line)", color: "var(--faint)", cursor: "not-allowed", border: 0 } : {}),
        ...style,
      }}
    />
  );
}

// ------------------------------------------------------------------ Card

export function Card({ children, tone = "plain", dashed, style }: { children: ReactNode; tone?: "plain" | "warn" | "ok"; dashed?: boolean; style?: CSSProperties }) {
  const tones = {
    plain: { background: "var(--surface)", border: "1px solid var(--line)" },
    warn: { background: "var(--warn-bg)", border: "1px solid var(--warn-line)" },
    ok: { background: "var(--ok-bg)", border: "1px solid var(--line)" },
  };
  return (
    <div style={{ borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10, ...tones[tone], ...(dashed ? { borderStyle: "dashed" } : {}), ...style }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ Avatar (people: circles)

export type Presence = "online" | "away" | "offline";
const presenceColor: Record<Presence, string> = { online: "var(--ok-dot)", away: "var(--warn)", offline: "var(--faint)" };

export function Avatar({ name, src, size = 30, you, presence }: { name: string; src?: string | null; size?: number; you?: boolean; presence?: Presence }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      title={name}
      style={{
        position: "relative",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        background: you ? "var(--primary)" : "#e9c6f5",
        color: "var(--on-primary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.43),
      }}
    >
      {src ? <img src={src} alt="" width={size} height={size} style={{ borderRadius: "50%", display: "block" }} /> : initial}
      {presence && (
        <span
          aria-label={presence}
          style={{ position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: "50%", background: presenceColor[presence], border: "2px solid var(--sidebar)" }}
        />
      )}
    </span>
  );
}

// ------------------------------------------------------------------ AgentMark (agents: rounded squares)

export type Vendor = "claude" | "codex";
export function AgentMark({ vendor, size = 30 }: { vendor: Vendor; size?: number }) {
  const c = vendor === "claude" ? { bg: "var(--claude-bg)", fg: "var(--claude)", t: "Cl" } : { bg: "var(--codex-bg)", fg: "var(--codex)", t: "Cx" };
  return (
    <span
      aria-label={vendor === "claude" ? "Claude agent" : "Codex agent"}
      style={{
        flex: "none",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        background: c.bg,
        color: c.fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        font: `700 ${Math.round(size * 0.4)}px var(--mono)`,
      }}
    >
      {c.t}
    </span>
  );
}

// ------------------------------------------------------------------ StatusText

export type Tone = "ok" | "warn" | "danger" | "muted";
const toneColor: Record<Tone, string> = { ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)", muted: "var(--faint)" };
export function StatusText({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span style={{ fontSize: 12, color: toneColor[tone] }}>{children}</span>;
}

// ------------------------------------------------------------------ StepBar

export function StepBar({ total, done }: { total: number; done: number }) {
  return (
    <div style={{ display: "flex", gap: 4 }} role="img" aria-label={`${done} of ${total} steps done`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < done ? "var(--ok-dot)" : "var(--line)" }} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Chip

export function Chip({ children, tone = "plain", mono, onClick }: { children: ReactNode; tone?: "plain" | "ok" | "warn"; mono?: boolean; onClick?: () => void }) {
  const tones = {
    plain: { background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--line)" },
    ok: { background: "var(--ok-bg)", color: "var(--ok)", border: "1px solid transparent" },
    warn: { background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid var(--warn-line)" },
  };
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        padding: "0 12px",
        borderRadius: onClick ? 8 : 999,
        font: `500 13px ${mono ? "var(--mono)" : "var(--sans)"}`,
        cursor: onClick ? "pointer" : "default",
        ...tones[tone],
      }}
    >
      {children}
    </Tag>
  );
}

// ------------------------------------------------------------------ icons (stroke only)

export const Icon = {
  check: <path d="M5 12l5 5 9-10" />,
  room: <path d="M4 5h16v11H9l-5 4z" />,
  board: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="10" rx="1" />
      <rect x="17" y="4" width="4" height="13" rx="1" />
    </>
  ),
  decisions: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 12h7M9 16h5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </>
  ),
  home: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  backlog: <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  book: (
    <>
      <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" />
      <path d="M4 21V5M9 8h6" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <rect x="15" y="5" width="6" height="6" rx="1.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4-4" />
    </>
  ),
};

export function Svg({ children, size = 18, width = 1.8 }: { children: ReactNode; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 8, background: "var(--primary)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <svg width={size * 0.57} height={size * 0.57} viewBox="0 0 24 24" fill="none" stroke="#121316" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="12" r="3" />
        <circle cx="17" cy="7" r="3" />
        <circle cx="17" cy="17" r="3" />
        <path d="M10 11l4-2.5M10 13l4 2.5" />
      </svg>
    </span>
  );
}
