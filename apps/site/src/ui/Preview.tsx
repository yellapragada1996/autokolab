import { useState, type ReactNode } from "react";
import { AgentAvatar, Button, Chip, InlineSaved, Kbd, PersonAvatar, SegmentedProgress, Skeleton, StatusPill, Switch, Toast } from ".";

// Development only (?preview=components): every shared component in each of its states.

export default function ComponentsPreview() {
  const [on, setOn] = useState(true);
  const [saved, setSaved] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [undone, setUndone] = useState(0);
  const [skeletonKey, setSkeletonKey] = useState(0);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "40px 28px 80px", display: "flex", flexDirection: "column", gap: 36 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="eyebrow">Development preview</span>
        <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: "var(--tracking-tight)" }}>Shared components</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Geist and the tokens from DEC-22. Colour only means status: amber needs you, green done, blue live, coral failure.</p>
      </header>

      <Section title="AgentAvatar" note="Neutral tile, first letter, optional status dot. The vendor is in the tooltip.">
        {[22, 24, 28, 32, 34, 40].map((s) => (
          <AgentAvatar key={s} name="Fjord" vendor="claude" size={s} />
        ))}
        <Labelled label="Working">
          <AgentAvatar name="Fjord" vendor="claude" size={34} status="working" />
        </Labelled>
        <Labelled label="Idle">
          <AgentAvatar name="Harbor" vendor="codex" size={34} status="idle" />
        </Labelled>
        <Labelled label="Waiting on a person">
          <AgentAvatar name="Atlas" vendor="claude" size={34} status="waiting" />
        </Labelled>
      </Section>

      <Section title="PersonAvatar" note="Circle with initials. You are light; others are grey.">
        <Labelled label="You">
          <PersonAvatar name="Raghav Rao" size={34} you />
        </Labelled>
        <Labelled label="Someone else">
          <PersonAvatar name="James Black" size={34} />
        </Labelled>
        <Labelled label="Online">
          <PersonAvatar name="Ana" size={34} presence="online" ring="var(--bg)" />
        </Labelled>
        <Labelled label="Away">
          <PersonAvatar name="Ana" size={34} presence="away" ring="var(--bg)" />
        </Labelled>
        <Labelled label="Offline">
          <PersonAvatar name="Ana" size={34} presence="offline" ring="var(--bg)" />
        </Labelled>
      </Section>

      <Section title="StatusPill">
        <StatusPill tone="live">Building</StatusPill>
        <StatusPill tone="done">Shipped</StatusPill>
        <StatusPill tone="needs">Needs you</StatusPill>
        <StatusPill tone="failure">Tests failed</StatusPill>
        <StatusPill tone="neutral">Not started</StatusPill>
      </Section>

      <Section title="Chip">
        <Chip>Database change</Chip>
        <Chip tone="verified">✓ Tests passed</Chip>
        <Chip mono>a1b2c3d</Chip>
        <Chip onClick={() => setToast("Chip clicked.")}>Clickable</Chip>
      </Section>

      <Section title="Kbd">
        <Kbd>⌘K</Kbd>
        <Kbd>⌘L</Kbd>
        <Kbd>G</Kbd>
        <Kbd>Esc</Kbd>
      </Section>

      <Section title="Switch">
        <Labelled label={on ? "On" : "Off"}>
          <Switch checked={on} onChange={(v) => (setOn(v), setSaved(Date.now()))} label="Pause everyone" />
        </Labelled>
        <Labelled label="Off">
          <Switch checked={false} onChange={() => {}} label="Off example" />
        </Labelled>
        <Labelled label="Disabled">
          <Switch checked onChange={() => {}} label="Disabled example" disabled />
        </Labelled>
      </Section>

      <Section title="InlineSaved" note="Flip the first switch: “Saved” shows for a second.">
        <Switch checked={on} onChange={(v) => (setOn(v), setSaved(Date.now()))} label="Auto-saved setting" />
        <InlineSaved at={saved} />
      </Section>

      <Section title="SegmentedProgress" note="One segment per ticket.">
        <div style={{ display: "grid", gap: 14, width: "100%" }}>
          <Labelled label="Done, in progress (shimmer), needs you, not started" wide>
            <SegmentedProgress segments={["done", "done", "done", "active", "active", "needs", "todo", "todo"]} />
          </Labelled>
          <Labelled label="All done" wide>
            <SegmentedProgress segments={["done", "done", "done", "done"]} />
          </Labelled>
          <Labelled label="Not started" wide>
            <SegmentedProgress segments={["todo", "todo", "todo"]} />
          </Labelled>
        </div>
      </Section>

      <Section title="Toast" note="Bottom centre, one Undo, closes after 6 s, pauses on hover.">
        <Button onClick={() => setToast("Merging set to “Ask me first”.")}>Show a toast with Undo</Button>
        {undone > 0 && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Undone {undone}×</span>}
      </Section>

      <Section title="Skeleton" note="Neutral bars, no shimmer, only after 300 ms.">
        <div style={{ display: "grid", gap: 10, width: "100%" }}>
          <Skeleton key={skeletonKey} lines={3} />
          <div>
            <Button size="sm" onClick={() => setSkeletonKey((k) => k + 1)}>
              Replay
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Buttons and motion" note="Hover lifts, press shrinks; live dot pulses; all off under reduced motion.">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
        <span className="ak-live" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--blue)" }} aria-label="Live" />
        <span className="ak-enter" style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Fades up on mount
        </span>
      </Section>

      {toast && (
        <Toast key={toast + undone} onClose={() => setToast(null)} onUndo={() => setUndone((n) => n + 1)}>
          {toast}
        </Toast>
      )}
    </main>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, borderRadius: "var(--radius-xl)", background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <h2 style={{ fontSize: 17, fontWeight: 500 }}>{title}</h2>
        {note && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{note}</p>}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>{children}</div>
    </section>
  );
}

function Labelled({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: wide ? "stretch" : "center", gap: 6, width: wide ? "100%" : undefined }}>
      {children}
      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
    </span>
  );
}
