import { useEffect, useState } from "react";
import { addPerson, createInvite, EFFORTS, inviteLink, invites as listInvites, MODEL_CHOICES, revokeInvite, setAgentModel, setLead, showCode, type Agent, type Effort, type Invite } from "../lib/data";
import { placeLine } from "../lib/place";
import { go, onNav } from "../lib/router";
import { AgentMark, Avatar, Button } from "../ui";
import { ago, KeyText, LeadBadge } from "./bits";
import type { Workspace } from "./useWorkspace";

// Who works on this project: people (circles) and their agents (rounded squares), with what each
// agent is doing right now.

export const agentStatusText: Record<Agent["status"], { label: string; color: string }> = {
  idle: { label: "Online", color: "var(--ok)" },
  planning: { label: "Working", color: "var(--ok)" },
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

export function People({ ws, me, onProjectChanged }: { ws: Workspace; me: string; onProjectChanged?: () => void }) {
  const [leadErr, setLeadErr] = useState("");
  const makeLead = async (id: string | null) => {
    try {
      setLeadErr("");
      await setLead(ws.project.id, id);
      onProjectChanged?.();
    } catch (e) {
      setLeadErr((e as Error).message);
    }
  };
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
        {isOwner && <InvitePanel ws={ws} />}
        {isOwner && <AddPerson ws={ws} />}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Agents · {agents.length}</h2>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>
          The <strong style={{ color: "var(--text)" }}>lead</strong> is the agent you talk to (in Claude Code, for example). It turns what you ask for into complete tickets and assigns them to the other agents, the workers, who pick them up and do them.
        </p>
        {leadErr && <p style={{ color: "var(--danger)", fontSize: 14 }}>{leadErr}</p>}
        <div>
          <Button variant="secondary" size="sm" onClick={() => go({ view: "connect", project: ws.project.slug })}>
            Connect your agents
          </Button>
        </div>
        {agents.map((a) => {
          const st = agentOnline(a) ? agentStatusText[a.status] : agentStatusText.offline;
          const cur = a.current_ticket_id ? ws.byId.get(a.current_ticket_id) : undefined;
          return (
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
              <AgentMark vendor={a.vendor} size={34} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 200px" }}>
                <span style={{ fontSize: 15, fontWeight: 500, display: "flex", gap: 8, alignItems: "center" }}>
                  {a.display_name}
                  {a.id === ws.project.lead_agent_id ? <LeadBadge /> : <span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 400 }}>Worker</span>}
                </span>
                <span style={{ fontSize: 13, color: "var(--faint)" }}>
                  {a.vendor === "claude" ? "Claude Code" : "Codex"} · {a.owner_profile_id ? `${ws.nameOf(a.owner_profile_id)}'s` : a.owner_label ? `${a.owner_label}'s` : "shared"}
                  {a.last_seen_at ? ` · seen ${ago(a.last_seen_at)}` : " · not connected yet"}
                </span>
                <AgentModel ws={ws} agent={a} mine={a.owner_profile_id === me} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                {isOwner && (
                  <button type="button" onClick={() => void makeLead(a.id === ws.project.lead_agent_id ? null : a.id)} style={{ border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--text-2)", fontSize: 12, padding: "3px 8px", cursor: "pointer", marginBottom: 4 }}>
                    {a.id === ws.project.lead_agent_id ? "Remove as lead" : "Make lead"}
                  </button>
                )}
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
            No agents yet. Use "Connect your agents": one terminal line brings in your Claude Code or Codex.
          </div>
        )}
      </section>
    </div>
  );
}

/** "Sonnet · medium effort"; a part not set from AutoKolab is left to the agent's machine. */
export function modelText(model: string | null, effort: string | null): string | null {
  if (!model && !effort) return null;
  const name = model ? (/^[a-z]+$/.test(model) ? model[0].toUpperCase() + model.slice(1) : model) : "Model set on this machine";
  return effort ? `${name} · ${effort} effort` : name;
}

// "sonnet" and "claude-sonnet-5-5" are the same model; so are "opus[1m]" and "claude-opus-5-5[1m]".
const sameModel = (asked: string, ran: string) => {
  const a = asked.toLowerCase().replace(/\[.*\]$/, "");
  const r = ran.toLowerCase().replace(/\[.*\]$/, "");
  return r === a || r.includes(a) || a.includes(r);
};

/**
 * "running Haiku": what the agent's latest run actually used, only where it differs from what was
 * asked for on AutoKolab (AK-11). Null in the normal case, and for anything left to the machine.
 */
export function ranText(a: Pick<Agent, "model" | "effort" | "effective_model" | "effective_effort">): string | null {
  const model = a.model && a.effective_model && !sameModel(a.model, a.effective_model) ? a.effective_model : null;
  const effort = a.effort && a.effective_effort && a.effective_effort !== a.effort ? a.effective_effort : null;
  if (!model && !effort) return null;
  const name = model && /^[a-z]+$/.test(model) ? model[0].toUpperCase() + model.slice(1) : model;
  return `running ${[name, effort && `${effort} effort`].filter(Boolean).join(" · ")}`;
}

const fieldStyle = { height: 28, borderRadius: 6, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", fontSize: 13, padding: "0 8px" } as const;

/**
 * The agent's model and effort. Everyone in the project sees them; only the agent's owner gets the
 * control (the project's lead changes them with its own tool). Who set them last shows underneath.
 */
function AgentModel({ ws, agent: a, mine }: { ws: Workspace; agent: Agent; mine: boolean }) {
  const [model, setModel] = useState(a.model ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setModel(a.model ?? ""), [a.model]);

  // set_agent_model sets both at once: always send the current value of the one not being changed.
  const save = async (nextModel: string | null, nextEffort: Effort | null) => {
    if (nextModel === a.model && nextEffort === a.effort) return;
    setBusy(true);
    setErr("");
    try {
      await setAgentModel(a.id, nextModel, nextEffort);
      await ws.reload();
    } catch (e) {
      setErr((e as Error).message);
      setModel(a.model ?? "");
    }
    setBusy(false);
  };
  const commitModel = () => void save(model.trim() || null, a.effort);

  const setBy = a.model_set_by && (a.model || a.effort) ? `Set by ${ws.nameOf(a.model_set_by)}${a.model_set_at ? ` · ${ago(a.model_set_at)}` : ""}` : null;
  const text = modelText(a.model, a.effort);
  const ran = ranText(a);
  const ranNote = ran && (
    <span style={{ color: "var(--warn)" }} title="What its latest run actually used. Effort is the one its runner passed; the tool doesn't report it back.">
      {` · ${ran}`}
    </span>
  );

  if (!mine) {
    return (
      <span style={{ fontSize: 13, display: "flex", flexDirection: "column" }}>
        <span style={{ color: text ? "var(--text-2)" : "var(--muted)" }}>
          {text ?? "Set on this machine"}
          {ranNote}
        </span>
        {setBy && <span style={{ fontSize: 12, color: "var(--faint)" }}>{setBy}</span>}
      </span>
    );
  }

  const listId = `models-${a.id}`;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
          Model
          <input
            list={listId}
            value={model}
            disabled={busy}
            placeholder="Set on this machine"
            onChange={(e) => setModel(e.target.value)}
            onBlur={commitModel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitModel();
              }
              if (e.key === "Escape") setModel(a.model ?? "");
            }}
            style={{ ...fieldStyle, width: 170, fontFamily: "var(--mono)" }}
          />
          <datalist id={listId}>
            {MODEL_CHOICES[a.vendor].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
          Effort
          <select value={a.effort ?? ""} disabled={busy} onChange={(e) => void save(a.model, (e.target.value || null) as Effort | null)} style={fieldStyle}>
            <option value="">Set on this machine</option>
            {EFFORTS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </span>
      {err ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
          {err}
        </span>
      ) : (
        setBy && <span style={{ fontSize: 12, color: "var(--faint)" }}>{setBy}</span>
      )}
      {ran && (
        <span style={{ fontSize: 12, color: "var(--warn)" }}>
          Its latest run used {ran.replace(/^running /, "")}.
        </span>
      )}
      <span style={{ fontSize: 12, color: "var(--faint)" }}>
        Applies from its next run. Your machine can ignore this: set <code style={{ fontFamily: "var(--mono)" }}>model_locked = true</code> in this agent's runner settings. Sessions you open yourself in {a.vendor === "claude" ? "Claude Code" : "Codex"} use whatever you pick there.
      </span>
    </span>
  );
}

/** Invite links: send one in any chat; people sign in with GitHub and join with one click. */
function InvitePanel({ ws }: { ws: Workspace }) {
  const [list, setList] = useState<Invite[]>([]);
  const [made, setMade] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState(7);
  const [err, setErr] = useState("");
  const load = async () => {
    try {
      setList(await listInvites(ws.project.id));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [ws.project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const make = async () => {
    try {
      setErr("");
      setCopied(false);
      const inv = await createInvite(ws.project.id, days);
      setMade(inv);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setErr("Couldn't copy; select the link and copy it.");
    }
  };
  const active = list.filter((i) => !i.revoked && Date.parse(i.expires_at) > Date.now() && (i.max_uses === null || i.uses < i.max_uses));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Invite people</span>
        <label style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
          Link works for
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ height: 30, borderRadius: 6, border: "1px solid var(--line)", background: "var(--bg)", fontSize: 13 }}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <Button size="sm" variant="primary" onClick={() => void make()}>
          Create invite link
        </Button>
      </div>
      {made && (
        <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
          <code style={{ flex: "1 1 300px", padding: "10px 12px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--line-strong)", font: "13px var(--mono)", overflowX: "auto", whiteSpace: "nowrap" }}>{inviteLink(made.code)}</code>
          <Button size="sm" variant="secondary" onClick={() => void copy(inviteLink(made.code))} style={{ height: "auto" }}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
      <span style={{ fontSize: 13, color: err ? "var(--danger)" : "var(--faint)" }}>
        {err || "Send the link in any chat. They sign in with GitHub, join with one click, then connect their own agents. To push code they also need access to the repo on GitHub."}
      </span>
      {active.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {active.map((i) => (
            <div key={i.code} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
              <span style={{ fontFamily: "var(--mono)", color: "var(--text-2)" }}>{showCode(i.code)}</span>
              <span>
                used {i.uses}
                {i.max_uses ? ` of ${i.max_uses}` : ""} · expires {new Date(i.expires_at).toLocaleDateString()}
              </span>
              <button type="button" onClick={() => void copy(inviteLink(i.code))} style={{ border: 0, background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, padding: 0 }}>
                Copy
              </button>
              <button type="button" onClick={async () => (await revokeInvite(i.code), await load())} style={{ border: 0, background: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13, padding: 0 }}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
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
      <span style={{ fontSize: 14, fontWeight: 500 }}>Or add someone who already signed in</span>
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
