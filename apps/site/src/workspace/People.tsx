import { useState } from "react";
import { addPerson, type Agent } from "../lib/data";
import { placeLine } from "../lib/place";
import { onNav } from "../lib/router";
import { AgentMark, Avatar, Button } from "../ui";
import { ago, KeyText } from "./bits";
import type { Workspace } from "./useWorkspace";

// Who works on this project: people (circles) and their agents (rounded squares), with what each
// agent is doing right now.

export const agentStatusText: Record<Agent["status"], { label: string; color: string }> = {
  idle: { label: "Idle", color: "var(--faint)" },
  planning: { label: "Planning", color: "var(--text-2)" },
  building: { label: "Building", color: "var(--ok)" },
  waiting_human: { label: "Needs you", color: "var(--warn)" },
  blocked: { label: "Blocked", color: "var(--danger)" },
  paused: { label: "Paused", color: "var(--faint)" },
  offline: { label: "Offline", color: "var(--faint)" },
};

/** An agent counts as online if it checked in within the last few minutes. */
export function agentOnline(a: Agent): boolean {
  return !!a.last_seen_at && Date.now() - Date.parse(a.last_seen_at) < 5 * 60_000 && a.status !== "offline";
}

export function People({ ws, me }: { ws: Workspace; me: string }) {
  const owner = ws.people.members.find((m) => m.role === "owner")?.actor_id;
  const isOwner = owner === me;
  const humans = ws.people.members.filter((m) => m.actor_type === "human");
  const agents = [...ws.people.agents.values()];
  const open = (id: string) => ws.tickets.filter((t) => t.assignee_id === id && !["done", "canceled"].includes(t.status));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 860 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>People · {humans.length}</h2>
        {humans.map((m) => {
          const p = ws.people.profiles.get(m.actor_id);
          const theirAgents = agents.filter((a) => a.owner_profile_id === m.actor_id);
          return (
            <div key={m.actor_id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
              <Avatar name={p?.name ?? "?"} src={p?.avatar_url} size={34} you={m.actor_id === me} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 200px" }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>
                  {p?.name ?? "Someone"}
                  {m.actor_id === me ? " (you)" : ""}
                  {m.role === "owner" && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--faint)" }}>Owner</span>}
                </span>
                <span style={{ fontSize: 13, color: "var(--faint)" }}>
                  {p?.github_login ? `@${p.github_login}` : ""}
                  {p ? ` · ${placeLine(p.city, p.timezone)}` : ""}
                </span>
              </span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                {open(m.actor_id).length} open ticket{open(m.actor_id).length === 1 ? "" : "s"}
                {theirAgents.length ? ` · ${theirAgents.length} agent${theirAgents.length === 1 ? "" : "s"}` : ""}
              </span>
            </div>
          );
        })}
        {isOwner && <AddPerson ws={ws} />}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Agents · {agents.length}</h2>
        {agents.map((a) => {
          const st = agentOnline(a) ? agentStatusText[a.status] : agentStatusText.offline;
          const cur = a.current_ticket_id ? ws.byId.get(a.current_ticket_id) : undefined;
          return (
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
              <AgentMark vendor={a.vendor} size={34} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 200px" }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{a.display_name}</span>
                <span style={{ fontSize: 13, color: "var(--faint)" }}>
                  {a.vendor === "claude" ? "Claude Code" : "Codex"} · {a.owner_profile_id ? `${ws.nameOf(a.owner_profile_id)}'s` : a.owner_label ? `${a.owner_label}'s` : "shared"}
                  {a.last_seen_at ? ` · seen ${ago(a.last_seen_at)}` : " · not connected yet"}
                </span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontSize: 13, color: st.color }}>{st.label}</span>
                {cur ? (
                  <a href={`/p/${ws.project.slug}/t/${cur.key}`} onClick={onNav({ view: "ticket", project: ws.project.slug, key: cur.key })} style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
                    <KeyText t={cur} style={{ color: "inherit" }} /> {a.status_note ?? cur.title}
                  </a>
                ) : (
                  a.status_note && <span style={{ fontSize: 12, color: "var(--muted)" }}>{a.status_note}</span>
                )}
              </span>
            </div>
          );
        })}
        {!agents.length && (
          <div style={{ padding: 16, borderRadius: 12, border: "1px dashed var(--line)", fontSize: 14, color: "var(--muted)" }}>
            No agents yet. Connect Claude Code or Codex on your computer with the AutoKolab helper and they join here.
          </div>
        )}
      </section>
    </div>
  );
}

function AddPerson({ ws }: { ws: Workspace }) {
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await addPerson(ws.project.id, login.trim());
      await ws.reload();
      setMsg({ ok: true, text: `Added ${login.trim().replace(/^@/, "")}.` });
      setLogin("");
    } catch (e2) {
      setMsg({ ok: false, text: `${(e2 as Error).message}. Send them ${location.origin} to sign in with GitHub first.` });
    }
    setBusy(false);
  };
  return (
    <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 12, border: "1px dashed var(--line)" }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>Add a person</span>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="GitHub username" aria-label="GitHub username" style={{ flex: "1 1 220px", height: 36, padding: "0 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--bg)", fontSize: 14 }} />
        <Button type="submit" size="sm" variant="primary" disabled={busy || !login.trim()} style={{ height: 36 }}>
          Add
        </Button>
      </span>
      <span style={{ fontSize: 13, color: msg ? (msg.ok ? "var(--ok)" : "var(--danger)") : "var(--faint)" }}>
        {msg?.text ?? `They need to have signed in at ${location.host} once.`}
      </span>
    </form>
  );
}
