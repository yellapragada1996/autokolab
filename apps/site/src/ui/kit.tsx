import type { ReactNode } from "react";

// Small shared pieces (05-components.md). Colour only means status: amber needs you, green done,
// blue live, coral failure; everything else is neutral. Each status colour comes with a word.

// ------------------------------------------------------------------ StatusPill

export type PillTone = "live" | "done" | "needs" | "failure" | "neutral";
const pillTones: Record<PillTone, { color: string; background: string }> = {
  live: { color: "var(--blue-text)", background: "var(--blue-bg)" },
  done: { color: "var(--green-text)", background: "var(--green-chip)" },
  needs: { color: "var(--amber)", background: "var(--amber-bg-2)" },
  failure: { color: "var(--coral-text)", background: "var(--coral-bg)" },
  neutral: { color: "var(--text-muted)", background: "var(--surface-hover)" },
};

export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: "var(--radius-chip)", fontSize: 12, fontWeight: 500, lineHeight: 1.4, whiteSpace: "nowrap", ...pillTones[tone] }}>
      {tone === "live" && <span className="ak-live" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", flex: "none" }} />}
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Chip

/** A small rounded label: neutral for properties, green for a verified fact. Clickable if given onClick. */
export function Chip({ children, tone = "neutral", mono, onClick, title }: { children: ReactNode; tone?: "neutral" | "verified"; mono?: boolean; onClick?: () => void; title?: string }) {
  const style = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: "var(--radius-chip)",
    font: `500 12px/1.4 ${mono ? "var(--font-mono)" : "var(--font-sans)"}`,
    whiteSpace: "nowrap" as const,
    ...(tone === "verified"
      ? { background: "var(--green-chip)", color: "var(--green-text)", border: "1px solid var(--green-border)" }
      : { background: "var(--surface-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }),
  };
  if (onClick) {
    return (
      <button type="button" className="ak-btn" onClick={onClick} title={title} style={{ ...style, cursor: "pointer" }}>
        {children}
      </button>
    );
  }
  return (
    <span title={title} style={style}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Kbd

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd style={{ display: "inline-flex", alignItems: "center", padding: "0 6px", borderRadius: 5, border: "1px solid var(--border-strong)", font: "500 12px/1.5 var(--font-mono)", color: "var(--text-muted)" }}>
      {children}
    </kbd>
  );
}

// ------------------------------------------------------------------ Switch

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        flex: "none",
        width: 48,
        height: 28,
        padding: 0,
        border: 0,
        borderRadius: 999,
        background: checked ? "var(--blue-switch)" : "var(--track)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: `background-color var(--dur-switch) ease`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--text)",
          transform: checked ? "translateX(20px)" : "none",
          transition: `transform var(--dur-switch) var(--ease-out)`,
        }}
      />
    </button>
  );
}

// ------------------------------------------------------------------ SegmentedProgress

export type Segment = "done" | "needs" | "active" | "todo";
const segmentColor: Record<Segment, string> = { done: "var(--green)", needs: "var(--amber)", active: "var(--blue)", todo: "var(--track)" };

/** One segment per ticket (or step): green done, amber needs you, blue and shimmering in progress, grey not started. */
export function SegmentedProgress({ segments, label }: { segments: Segment[]; label?: string }) {
  if (!segments.length) return null;
  const done = segments.filter((s) => s === "done").length;
  return (
    <div role="img" aria-label={label ?? `${done} of ${segments.length} done`} style={{ display: "flex", gap: 3 }}>
      {segments.map((s, i) => (
        <span key={i} className={s === "active" ? "ak-shimmer" : undefined} style={{ flex: 1, minWidth: 4, height: 5, borderRadius: 3, backgroundColor: segmentColor[s] }} />
      ))}
    </div>
  );
}
