import { useEffect, useMemo, useRef, useState } from "react";

// ⌘K (spec §11, v2): jump anywhere, run commands. Phase 0 has the shell and a few commands.

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function useCommandPalette(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen];
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())), [commands, q]);
  useEffect(() => {
    if (open) {
      setQ("");
      setAt(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);
  if (!open) return null;
  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh", zIndex: 50 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, calc(100% - 32px))", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line-strong)", overflow: "hidden" }}>
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown" || (e.key === "j" && e.ctrlKey)) (e.preventDefault(), setAt((a) => Math.min(a + 1, shown.length - 1)));
            if (e.key === "ArrowUp" || (e.key === "k" && e.ctrlKey)) (e.preventDefault(), setAt((a) => Math.max(a - 1, 0)));
            if (e.key === "Enter") run(shown[at]);
          }}
          placeholder="Jump to a ticket, person or decision, or run a command"
          aria-label="Command"
          style={{ width: "100%", height: 52, padding: "0 18px", border: 0, borderBottom: "1px solid var(--line)", background: "transparent", color: "var(--text)", font: "400 16px var(--sans)", outline: "none" }}
        />
        <ul role="listbox" style={{ listStyle: "none", margin: 0, padding: 6, maxHeight: 320, overflowY: "auto" }}>
          {shown.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === at}
              onMouseEnter={() => setAt(i)}
              onClick={() => run(c)}
              style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: i === at ? "var(--surface-2)" : "transparent", fontSize: 14 }}
            >
              <span>{c.label}</span>
              {c.hint && <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)" }}>{c.hint}</span>}
            </li>
          ))}
          {!shown.length && <li style={{ padding: "10px 12px", fontSize: 14, color: "var(--faint)" }}>Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}
