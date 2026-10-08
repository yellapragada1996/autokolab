import { useEffect, useState } from "react";
import { placeLine } from "../lib/place";
import type { Profile } from "../lib/session";
import { Avatar, Button, Icon, Logo, Svg } from "../ui";

// The project room (spec §11.2), Phase 0: the real frame with you in it and honest empty states.
// Chat, tickets and agents arrive in later phases.

type Nav = "room" | "board" | "decisions" | "catchup";
const NAV: { id: Nav; label: string; icon: React.ReactNode }[] = [
  { id: "room", label: "Room", icon: Icon.room },
  { id: "board", label: "Board", icon: Icon.board },
  { id: "decisions", label: "Decisions", icon: Icon.decisions },
  { id: "catchup", label: "Catch up", icon: Icon.clock },
];

function useClock(): void {
  const [, setT] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setT((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="eyebrow" style={{ padding: "0 8px" }}>
        {title}
      </span>
      {children}
    </section>
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 14, borderRadius: 12, border: "1px dashed var(--line)" }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>{sub}</span>
    </div>
  );
}

export function RoomShell({ profile, onSignOut, onOpenPalette }: { profile: Profile; onSignOut: () => void; onOpenPalette: () => void }) {
  useClock();
  const [nav, setNav] = useState<Nav>("room");
  return (
    <div style={{ minHeight: "100%", display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
      <aside
        aria-label="Project navigation"
        style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 24, padding: "20px 16px", background: "var(--sidebar)", borderRight: "1px solid var(--line-soft)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px" }}>
          <Logo size={26} />
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>No project yet</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)" }}>connect a repo in setup</span>
          </span>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNav(n.id)}
              aria-current={nav === n.id ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 8,
                border: 0,
                textAlign: "left",
                cursor: "pointer",
                fontSize: 15,
                ...(nav === n.id ? { background: "var(--surface-2)", color: "var(--text)", fontWeight: 500 } : { background: "transparent", color: "var(--text-2)" }),
              }}
            >
              <Svg>{n.icon}</Svg>
              {n.label}
            </button>
          ))}
        </nav>

        <Section title="People">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8 }}>
            <Avatar name={profile.name} src={profile.avatar_url} you presence="online" />
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{profile.name} (you)</span>
              <span style={{ fontSize: 12, color: "var(--faint)" }}>{placeLine(profile.city, profile.timezone)}</span>
            </span>
          </div>
        </Section>

        <Section title="Agents">
          <span style={{ padding: "0 8px", fontSize: 13, color: "var(--faint)" }}>Your agents show up here once this computer is connected.</span>
        </Section>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, padding: "0 8px" }}>
          <button
            type="button"
            onClick={onOpenPalette}
            style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--faint)", fontSize: 13, cursor: "pointer" }}
          >
            <Svg size={15} width={2}>
              {Icon.search}
            </Svg>
            Jump to…
            <kbd style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>⌘K</kbd>
          </button>
          <Button variant="ghost" size="sm" onClick={onSignOut} style={{ justifyContent: "flex-start" }}>
            Sign out
          </Button>
        </div>
      </aside>

      <main className="room-main" style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 28px", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h1 style={{ fontSize: 19, fontWeight: 600 }}>{NAV.find((n) => n.id === nav)!.label}</h1>
            <span style={{ fontSize: 13, color: "var(--faint)" }}>1 person · 0 agents · everything said here becomes project memory</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--faint)", fontSize: 14 }}>
            <Svg size={16} width={2}>
              {Icon.search}
            </Svg>
            <input aria-label="Search the room" placeholder="Search messages, tickets, decisions" disabled style={{ border: 0, background: "transparent", color: "var(--text)", font: "400 14px var(--sans)", outline: "none", width: "min(240px, 50vw)" }} />
          </label>
        </header>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 28px" }}>
          <div style={{ maxWidth: 440, textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Welcome, {profile.name.split(" ")[0]}.</h2>
            <p style={{ color: "var(--muted)", fontSize: 15 }}>
              Next: connect this computer and your Claude Code or Codex, then pick the repo your team works on. That's the next step of setup, coming in the next release.
            </p>
          </div>
        </div>

        <footer style={{ padding: "16px 28px 22px", borderTop: "1px solid var(--line-soft)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line-strong)", opacity: 0.6 }}>
            <label htmlFor="msg" className="sr-only">
              Message the room
            </label>
            <textarea
              id="msg"
              rows={2}
              disabled
              placeholder="Message the room. @ an agent to hand it work, or / for commands"
              style={{ border: 0, background: "transparent", color: "var(--text)", font: "400 15px/1.5 var(--sans)", outline: "none", resize: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["/ticket", "/decide", "/pause all"].map((c) => (
                  <span key={c} style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface-2)", color: "var(--text-2)", font: "500 13px var(--mono)" }}>
                    {c}
                  </span>
                ))}
              </div>
              <Button variant="primary" size="sm" disabled>
                Send
              </Button>
            </div>
          </div>
        </footer>
      </main>

      <aside className="room-right" aria-label="Needs you and live tickets" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 20, padding: 20, background: "var(--sidebar)", borderLeft: "1px solid var(--line-soft)" }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="eyebrow">Needs you</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 14, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Nothing waiting on you</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Approvals and questions from agents show up here.</span>
          </div>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="eyebrow">Live tickets</span>
          <Empty title="No tickets yet" sub="When you hand an agent work, its ticket shows here with live steps." />
        </section>
      </aside>
    </div>
  );
}
