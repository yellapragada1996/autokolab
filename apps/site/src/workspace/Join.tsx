import { useEffect, useState } from "react";
import { acceptInvite, peekInvite, showCode, type InvitePeek } from "../lib/data";
import { go } from "../lib/router";
import { signInWithGitHub, type Profile } from "../lib/session";
import { Button, Logo } from "../ui";

// /j/<code>: someone sent you an invite link. See what it's for, sign in with GitHub, join with
// one click; next, connect your agents.

export function JoinPage({ code, profile, onJoined, notice }: { code: string; profile: Profile | null; onJoined?: () => Promise<void> | void; notice?: string }) {
  const [peek, setPeek] = useState<InvitePeek | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    peekInvite(code)
      .then(setPeek)
      .catch((e) => (setErr((e as Error).message), setPeek(null)));
  }, [code, profile?.id]);

  // Already in the project: straight to it.
  useEffect(() => {
    if (peek?.member) go({ view: "overview", project: peek.slug }, true);
  }, [peek]);

  const join = async () => {
    setBusy(true);
    setErr("");
    try {
      const p = await acceptInvite(code);
      await onJoined?.();
      go({ view: "connect", project: p.slug }, true);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
      <div style={{ width: "min(520px, 100%)", display: "flex", flexDirection: "column", gap: 22 }}>
        <Logo size={36} />
        {children}
      </div>
    </div>
  );

  if (peek === undefined) return shell(<p style={{ color: "var(--faint)" }}>Opening the invite…</p>);
  if (!peek) {
    return shell(
      <>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>This invite doesn't exist</h1>
        <p style={{ color: "var(--muted)" }}>
          Check the link ({showCode(code)}), or ask for a new one.{err ? ` ${err}` : ""}
        </p>
        <Button onClick={() => go("/")} style={{ alignSelf: "flex-start" }}>
          Go to AutoKolab
        </Button>
      </>,
    );
  }

  const reason = { revoked: "was cancelled", expired: "has expired", used: "has been used up" }[peek.reason ?? "expired"];
  return shell(
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>{peek.invited_by ?? "Someone"} invited you to</span>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em" }}>{peek.project}</h1>
        <span style={{ fontSize: 14, color: "var(--faint)" }}>
          {peek.repo && <span style={{ fontFamily: "var(--mono)" }}>github.com/{peek.repo} · </span>}
          {peek.people} {peek.people === 1 ? "person" : "people"} · {peek.agents} agent{peek.agents === 1 ? "" : "s"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line)" }}>
        {[
          ["Join the project", "Its board, the Project Guide, and the room where people and agents talk."],
          ["Bring your agents", "One terminal line connects your Claude Code or Codex. They work on your computer, with your subscription."],
          ["Watch it all happen", "Every ticket, step and decision, live on the board."],
        ].map(([t, d], i) => (
          <div key={t} style={{ display: "flex", gap: 12 }}>
            <span style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", border: "1px solid var(--line-strong)", color: "var(--faint)", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t}</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{d}</span>
            </span>
          </div>
        ))}
      </div>

      {!peek.valid ? (
        <p style={{ color: "var(--warn)", fontSize: 14 }}>This invite {reason}. Ask {peek.invited_by ?? "the project's owner"} for a new link.</p>
      ) : !profile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notice && <p style={{ color: "var(--warn)", fontSize: 14 }}>{notice}</p>}
          <Button variant="primary" size="lg" onClick={() => void signInWithGitHub(`/j/${code}`)} style={{ alignSelf: "flex-start" }}>
            Continue with GitHub
          </Button>
          <span style={{ fontSize: 13, color: "var(--faint)" }}>We only read your GitHub name and picture. Then you join with one click.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void join()} style={{ alignSelf: "flex-start" }}>
            {busy ? "Joining…" : `Join ${peek.project}`}
          </Button>
          <span style={{ fontSize: 13, color: "var(--faint)" }}>You're signed in as {profile.name}.</span>
        </div>
      )}
      {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}
    </>,
  );
}
