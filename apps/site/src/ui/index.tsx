import type { CSSProperties, ReactNode } from "react";

// Base components. Colours and sizes come from tokens.css (DEC-22, autokolab-ux-handoff/05-components.md).

export * from "./avatars";
export * from "./feedback";
export * from "./kit";

// ------------------------------------------------------------------ Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const buttonBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 10,
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
  lg: { height: 48, padding: "0 26px", fontSize: 15, borderRadius: 11 },
};

export function Button({
  variant = "secondary",
  size = "md",
  style,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return (
    <button
      type="button"
      {...rest}
      className={className ? `ak-btn ${className}` : "ak-btn"}
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
    ok: { background: "var(--ok-bg)", border: "1px solid var(--green-border)" },
  };
  return (
    <div style={{ borderRadius: "var(--radius-xl)", padding: 16, display: "flex", flexDirection: "column", gap: 10, ...tones[tone], ...(dashed ? { borderStyle: "dashed" } : {}), ...style }}>
      {children}
    </div>
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
    <span style={{ width: size, height: size, borderRadius: 8, background: "var(--text)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <svg width={size * 0.57} height={size * 0.57} viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="12" r="3" />
        <circle cx="17" cy="7" r="3" />
        <circle cx="17" cy="17" r="3" />
        <path d="M10 11l4-2.5M10 13l4 2.5" />
      </svg>
    </span>
  );
}
