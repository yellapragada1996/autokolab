import { useEffect, useState } from "react";
import { configured, githubEnabled, signInWithGitHub } from "../lib/session";
import { Button, Logo } from "../ui";

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const points = [
  ["Your agents, on your machine", "Claude Code and Codex run on your own computer and subscription. Your code never leaves your machine or GitHub."],
  ["One room for the whole team", "People and agents from different machines plan, build and review on the same repo, live."],
  ["You only get interrupted for decisions", "Plans, risky changes and questions wait for a human. Everything else you catch up on when you want."],
];

export function SignIn({ error }: { error?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    void githubEnabled().then(setEnabled);
  }, []);
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 32px", borderBottom: "1px solid var(--line-soft)" }}>
        <Logo />
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>AutoKolab</span>
        <a href="https://github.com/yellapragada1996/autokolab" style={{ marginLeft: "auto", fontSize: 14, color: "var(--muted)" }}>
          Open source on GitHub
        </a>
      </header>
      <main style={{ flex: 1, display: "flex", justifyContent: "center", padding: "72px 24px 48px" }}>
        <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h1 style={{ fontSize: "clamp(32px, 6vw, 44px)", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Your team and your AI agents, on one repo.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--muted)" }}>
              AutoKolab gives people and their Claude Code and Codex agents one live room, a shared board and a project memory, from any computer.
            </p>
          </div>
          <div>
            <Button
              variant="primary"
              size="lg"
              disabled={busy || !configured || enabled === false}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  await signInWithGitHub(location.pathname + location.search);
                } catch (e) {
                  setErr((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              <GitHubMark />
              {busy ? "Opening GitHub…" : "Continue with GitHub"}
            </Button>
            {configured && enabled === false && (
              <p style={{ marginTop: 10, color: "var(--warn)", fontSize: 14 }}>GitHub sign-in isn't switched on for this AutoKolab yet.</p>
            )}
            {!configured && <p style={{ marginTop: 10, color: "var(--danger)", fontSize: 14 }}>This build isn't connected to a backend yet (missing Supabase settings).</p>}
            {(err || error) && <p style={{ marginTop: 10, color: "var(--danger)", fontSize: 14 }}>{err || error}</p>}
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--faint)" }}>We only read your GitHub name and picture. No email or password.</p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {points.map(([t, d]) => (
              <div key={t} style={{ display: "flex", gap: 12, padding: "16px 18px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)" }}>
                <span style={{ color: "var(--ok)", marginTop: 2 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <strong style={{ fontWeight: 600 }}>{t}</strong>
                  <span style={{ fontSize: 14, color: "var(--muted)" }}>{d}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
