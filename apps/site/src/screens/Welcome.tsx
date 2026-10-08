import { useState } from "react";
import { browserTimezone, cityFromTimezone, localTime } from "../lib/place";
import type { Profile } from "../lib/session";
import { Button, Icon, Logo, Svg } from "../ui";

// Onboarding step 1 (spec §11.1): "What should your team call you?"

const STEPS = ["You", "Machine", "Agents", "Project"];

export function StepPills({ at }: { at: number }) {
  return (
    <nav aria-label="Setup progress" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {STEPS.map((label, i) => {
        const active = i === at;
        const done = i < at;
        return (
          <div
            key={label}
            aria-current={active ? "step" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px 6px 6px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 500,
              ...(active ? { background: "var(--surface-2)", color: "var(--text)" } : { color: done ? "var(--muted)" : "var(--faint)" }),
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                ...(active
                  ? { background: "var(--primary)", color: "var(--on-primary)" }
                  : done
                    ? { background: "var(--ok-bg)", color: "var(--ok)" }
                    : { background: "var(--surface)", color: "var(--faint)", border: "1px solid var(--line)" }),
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span>{label}</span>
          </div>
        );
      })}
    </nav>
  );
}

export function OnboardingFrame({ at, right, children }: { at: number; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 32px", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo />
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>AutoKolab</span>
        </div>
        <StepPills at={at} />
        <span>{right}</span>
      </header>
      <main style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "72px 24px 48px" }}>
        <div style={{ width: "100%", maxWidth: 680 }}>{children}</div>
      </main>
    </div>
  );
}

export function Welcome({ profile, onSave }: { profile: Profile; onSave: (p: { name: string; timezone: string; city: string }) => Promise<void> }) {
  const tz = browserTimezone();
  const city = cityFromTimezone(tz);
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const trimmed = name.trim();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return setErr("Type the name your team will see.");
    setBusy(true);
    setErr("");
    try {
      await onSave({ name: trimmed, timezone: tz, city });
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  };

  return (
    <OnboardingFrame
      at={0}
      right={
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--faint)" }}>
          {profile.github_login ? `@${profile.github_login}` : ""}
        </span>
      }
    >
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 style={{ fontSize: "clamp(32px, 6vw, 44px)", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.02em" }}>What should your team call you?</h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--muted)" }}>Your name shows next to your messages and on the agents you bring.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="nm" style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>
            Your name
          </label>
          <input
            id="nm"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErr("");
            }}
            maxLength={60}
            autoFocus
            style={{ height: 56, padding: "0 18px", borderRadius: 12, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--text)", font: "500 20px var(--sans)" }}
          />
          {err && <span style={{ color: "var(--danger)", fontSize: 14 }}>{err}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)" }}>
          <span style={{ color: "var(--muted)" }}>
            <Svg size={20}>{Icon.globe}</Svg>
          </span>
          <span style={{ fontSize: 15, color: "var(--muted)" }}>
            Teammates will see{" "}
            <strong style={{ color: "var(--text)", fontWeight: 600 }}>
              {city} · {localTime(tz)}
            </strong>{" "}
            next to you, from your time zone.
          </span>
        </div>
        <div>
          <Button variant="primary" size="lg" disabled={busy || !trimmed} type="submit">
            {busy ? "Saving…" : "Continue"}
          </Button>
        </div>
      </form>
    </OnboardingFrame>
  );
}
