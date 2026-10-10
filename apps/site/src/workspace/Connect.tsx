import { useEffect, useState } from "react";
import { connectLine, createPairing, type Pairing } from "../lib/data";
import { go } from "../lib/router";
import { Button } from "../ui";
import { ago } from "./bits";
import { AgentFace, agentOnline, agentStatusText } from "./People";
import type { Workspace } from "./useWorkspace";

// Connect your agents: one terminal line with a pairing code. It installs (or updates) the helper,
// connects this computer's Claude Code / Codex to the project and starts their runners. Agents
// appear below as they join.

export function ConnectAgents({ ws, me }: { ws: Workspace; me: string }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);

  const fresh = async () => {
    try {
      setErr("");
      setCopied(false);
      setPairing(await createPairing(ws.project.id));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void fresh();
  }, [ws.project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const mine = [...ws.people.agents.values()].filter((a) => a.owner_profile_id === me);
  const left = pairing ? Math.max(0, Math.round((Date.parse(pairing.expires_at) - Date.now()) / 60_000)) : 0;
  const line = pairing ? connectLine(pairing.code) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
    } catch {
      setErr("Couldn't copy; select the line and copy it.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 820 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Paste this in a terminal on the computer where your agents are</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
          <code
            style={{ flex: "1 1 420px", minWidth: 0, padding: "14px 16px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--line-strong)", font: "14px/1.5 var(--mono)", color: "var(--text)", overflowX: "auto", whiteSpace: "nowrap" }}
            aria-label="Command to connect your agents"
          >
            {pairing ? line : err ? "—" : "Making your code…"}
          </code>
          <Button variant="primary" disabled={!pairing || left === 0} onClick={() => void copy()} style={{ height: "auto", minHeight: 48 }}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <span style={{ fontSize: 13, color: left === 0 && pairing ? "var(--warn)" : "var(--faint)" }}>
          {pairing && left === 0 ? (
            <>
              This code has expired.{" "}
              <button type="button" onClick={() => void fresh()} style={{ border: 0, background: "none", color: "var(--blue-text)", cursor: "pointer", padding: 0, fontSize: 13 }}>
                Get a new one
              </button>
            </>
          ) : (
            `Works for ${left} more minute${left === 1 ? "" : "s"}, on as many of your computers as you like. It's yours: don't share it.`
          )}
        </span>
        {err && <span style={{ fontSize: 13, color: "var(--danger)" }}>{err}</span>}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {[
          ["What it does", "Downloads AutoKolab into ~/.autokolab (or updates it), connects the Claude Code and Codex it finds, and starts a background runner so they pick up their tickets. No sudo."],
          ["What you need", "macOS or Linux, git, Node.js 20+, and Claude Code and/or Codex installed and signed in. Agents use your own subscription."],
          ["Your code", "Stays on your computer and GitHub. AutoKolab stores tickets, chat and status, never code or keys."],
        ].map(([t, d]) => (
          <div key={t} style={{ padding: 14, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t}</span>
            <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{d}</span>
          </div>
        ))}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Your agents in {ws.project.name}</h2>
        {mine.map((a) => {
          const st = agentOnline(a) ? agentStatusText[a.status] : agentStatusText.offline;
          return (
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line-soft)" }}>
              <AgentFace a={a} size={30} ring="var(--surface)" />
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{a.display_name}</span>
                <span style={{ fontSize: 12, color: "var(--faint)" }}>
                  {a.vendor === "claude" ? "Claude Code" : "Codex"}
                  {a.last_seen_at ? ` · seen ${ago(a.last_seen_at)}` : " · connected, not checked in yet"}
                </span>
              </span>
              <span style={{ fontSize: 13, color: st.color }}>{st.label}</span>
            </div>
          );
        })}
        {!mine.length && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 14, borderRadius: 10, border: "1px dashed var(--line)", fontSize: 14, color: "var(--muted)" }}>
            <span className="ak-live" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--blue)", flex: "none" }} />
            Waiting for your agents. They show up here the moment the line finishes.
          </div>
        )}
        {mine.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {!ws.project.lead_agent_id && ws.project.owner_id === me ? (
              <Button variant="primary" onClick={() => go({ view: "people", project: ws.project.slug })}>
                Next: pick the lead agent
              </Button>
            ) : (
              <Button variant="primary" onClick={() => go({ view: "board", project: ws.project.slug })}>
                Go to the board
              </Button>
            )}
            <span style={{ fontSize: 13, color: "var(--faint)" }}>Add another agent later by running the same kind of line again.</span>
          </div>
        )}
      </section>
    </div>
  );
}
