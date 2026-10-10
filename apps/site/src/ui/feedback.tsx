import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Feedback (05-components.md): a toast with one Undo, an inline "Saved", and skeleton bars.

/**
 * Bottom-centre toast with one action (Undo). It closes itself after 6 seconds, and the clock
 * pauses while the pointer is over it.
 */
export function Toast({ children, onUndo, onClose, duration = 6000, style }: { children: ReactNode; onUndo?: () => void; onClose: () => void; duration?: number; style?: CSSProperties }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(duration);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const t = setTimeout(() => close.current(), left.current);
    return () => {
      clearTimeout(t);
      left.current -= Date.now() - started;
    };
  }, [paused]);

  return (
    // The outer box centres it; the inner one animates (so the animation's transform can't un-centre it).
    <div style={{ position: "fixed", left: 16, right: 16, bottom: 24, zIndex: 60, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div
        role="status"
        aria-live="polite"
        className="ak-enter"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 16px",
          borderRadius: "var(--radius-lg)",
          background: "var(--surface-raised)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-md)",
          color: "var(--text)",
          fontSize: 14,
          ...style,
        }}
      >
        <span>{children}</span>
        {onUndo && (
          <button
            type="button"
            onClick={() => (onUndo(), onClose())}
            style={{ border: 0, background: "none", padding: 0, color: "var(--blue-text)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

/** "Saved" in small green for a second after each change. Pass a value that changes on every save. */
export function InlineSaved({ at }: { at: unknown }) {
  const [show, setShow] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (at == null) return;
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 1000);
    return () => clearTimeout(t);
  }, [at]);
  return (
    <span aria-live="polite" style={{ fontSize: 12, color: "var(--green)", minWidth: 40 }}>
      {show ? "Saved" : ""}
    </span>
  );
}

/** Neutral placeholder bars, shown only if the content takes longer than 300 ms. */
export function Skeleton({ lines = 3, width = "100%", height = 12, delay = 300 }: { lines?: number; width?: number | string; height?: number; delay?: number }) {
  const [shown, setShown] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  if (!shown) return null;
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "grid", gap: 10, width }}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ display: "block", height, borderRadius: 6, background: "var(--surface-hover)", width: i === lines - 1 && lines > 1 ? "60%" : "100%" }} />
      ))}
    </div>
  );
}
