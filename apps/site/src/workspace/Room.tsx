import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "../lib/session";
import { postToRoom, roomFor, roomMessages, watchRoom, type Room as RoomData, type RoomMember, type RoomMessage } from "../lib/room";
import { go } from "../lib/router";
import { AgentMark, Avatar, Button } from "../ui";
import { ago, LeadBadge, Markdown } from "./bits";
import type { Workspace } from "./useWorkspace";

// The room: where people and agents talk, live. The same conversation the agents use through their
// room tools. "@name" sends a message to that member; agents work out what kind of message it is.

const KIND: Partial<Record<RoomMessage["kind"], { label: string; color: string; bg: string }>> = {
  task: { label: "Task", color: "var(--on-primary)", bg: "var(--primary)" },
  question: { label: "Question", color: "var(--warn)", bg: "var(--warn-bg)" },
  answer: { label: "Answer", color: "var(--ok)", bg: "var(--ok-bg)" },
  status: { label: "Status", color: "var(--text-2)", bg: "var(--surface-2)" },
  review: { label: "Review", color: "#85b8ff", bg: "#13294b" },
  handoff: { label: "Handoff", color: "var(--text-2)", bg: "var(--surface-2)" },
  decision: { label: "Decision", color: "var(--on-primary)", bg: "var(--primary)" },
};
const SYSTEM = /^(Started on|Picked up) #\d+/;
const PROBLEM = /^(Blocked|Failed|Stopped|Couldn't)\b/;
const ONLINE_MS = 5 * 60_000;

function online(m: RoomMember): boolean {
  return !!m.last_seen_at && Date.now() - Date.parse(m.last_seen_at) < ONLINE_MS;
}

function Mark({ m, size = 30, me }: { m?: RoomMember; size?: number; me?: string }) {
  if (!m) return <Avatar name="?" size={size} />;
  return m.kind === "agent" ? <AgentMark vendor={m.client === "codex" ? "codex" : "claude"} size={size} /> : <Avatar name={m.name} size={size} you={m.id === me} />;
}

function time(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Ticket keys like VV-12 in a message become links to the ticket. */
function withTicketLinks(body: string, ws: Workspace): string {
  const prefix = ws.project.ticket_prefix;
  return body.replace(new RegExp(`(^|[^\\w/\\[])(${prefix}-\\d+)\\b`, "g"), (all, pre: string, key: string) =>
    ws.byKey.has(key) ? `${pre}[${key}](${location.origin}/p/${ws.project.slug}/t/${key})` : all,
  );
}

export function Room({ ws, profile, demo }: { ws: Workspace; profile: Profile; demo?: { room: RoomData; messages: RoomMessage[] } }) {
  const [room, setRoom] = useState<RoomData | null | undefined>(demo ? demo.room : undefined);
  const [messages, setMessages] = useState<RoomMessage[]>(demo?.messages ?? []);
  const [thread, setThread] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (demo) return;
    try {
      const r = await roomFor(ws.project.room_id, profile.id);
      setRoom(r);
      if (r) setMessages(await roomMessages(r.id));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
      setRoom((x) => (x === undefined ? null : x));
    }
  }, [ws.project.room_id, profile.id, demo]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => (room && !demo ? watchRoom(room.id, () => void load()) : undefined), [room?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((room?.members ?? []).map((m) => [m.id, m])), [room]);
  const shown = thread ? messages.filter((m) => m.id === thread || m.thread_id === thread) : messages;

  if (room === undefined) return <p style={{ color: "var(--faint)" }}>Loading the room…</p>;
  if (!room) {
    return (
      <div style={{ maxWidth: 620, padding: 18, borderRadius: 12, border: "1px dashed var(--line)", display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "var(--muted)" }}>
        <strong style={{ color: "var(--text)" }}>You're not in this project's room.</strong>
        <span>The room is where people and agents talk. Everyone who joins the project is in it; if you joined before rooms existed, reload the page or ask the owner for a new invite link.</span>
        {err && <span style={{ color: "var(--danger)" }}>{err}</span>}
      </div>
    );
  }

  const people = room.members.filter((m) => m.kind === "human");
  const agents = room.members.filter((m) => m.kind === "agent");
  const root = thread ? messages.find((m) => m.id === thread) : undefined;

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap", flex: 1, minHeight: 0 }}>
      <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", borderRadius: 12, border: "1px solid var(--line-soft)", background: "var(--sidebar)", minHeight: "min(72vh, 760px)", maxHeight: "calc(100vh - 150px)" }}>
        {thread && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", fontSize: 13 }}>
            <button type="button" onClick={() => setThread(null)} style={{ border: 0, background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>
              ← Whole room
            </button>
            <span style={{ color: "var(--text-2)" }}>Thread #{thread}{root ? ` · ${byId.get(root.sender_id)?.name ?? "someone"}: ${root.body.slice(0, 80)}` : ""}</span>
          </div>
        )}
        <MessageList ws={ws} messages={shown} byId={byId} me={room.me?.id} onReply={(m) => setReplyTo(m)} onThread={(id) => setThread(id)} />
        {err && <p style={{ color: "var(--danger)", fontSize: 13, padding: "0 14px" }}>{err}</p>}
        <Composer room={room} replyTo={replyTo} thread={thread} onClearReply={() => setReplyTo(null)} onPosted={load} />
      </div>

      <aside style={{ flex: "1 1 240px", minWidth: 220, display: "flex", flexDirection: "column", gap: 16 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="eyebrow">People</span>
          {people.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <Mark m={m} size={24} me={room.me?.id} />
              <span style={{ flex: 1 }}>
                {m.name}
                {m.id === room.me?.id ? " (you)" : ""}
              </span>
              <Presence on={online(m)} />
            </div>
          ))}
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="eyebrow">Agents</span>
          {agents.map((m) => {
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <Mark m={m} size={24} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {m.name}
                    {ws.project.lead_agent_id === m.id && <LeadBadge />}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>
                    {m.paused ? "Paused by its owner" : m.runner_state === "working" ? "Working" : online(m) ? "Online" : m.last_seen_at ? `Seen ${ago(m.last_seen_at)}` : "Not connected yet"}
                  </span>
                </span>
                <Presence on={online(m)} />
              </div>
            );
          })}
        </section>
        <p style={{ fontSize: 12, color: "var(--faint)", lineHeight: 1.5 }}>
          Start a message with <span className="mono">@name</span> to send it to someone. Agents read every message here; the ones that take instructions treat yours as work.
        </p>
        <Button size="sm" variant="ghost" onClick={() => go({ view: "board", project: ws.project.slug })} style={{ alignSelf: "flex-start" }}>
          Open the board
        </Button>
      </aside>
    </div>
  );
}

function Presence({ on }: { on: boolean }) {
  return <span title={on ? "Online" : "Offline"} style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "var(--ok-dot)" : "var(--line-strong)", flex: "none" }} />;
}

function MessageList({ ws, messages, byId, me, onReply, onThread }: { ws: Workspace; messages: RoomMessage[]; byId: Map<string, RoomMember>; me?: string; onReply: (m: RoomMessage) => void; onThread: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const replies = useMemo(() => {
    const n = new Map<number, number>();
    for (const m of messages) if (m.thread_id) n.set(m.thread_id, (n.get(m.thread_id) ?? 0) + 1);
    return n;
  }, [messages]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}
      aria-live="polite"
    >
      {!messages.length && <p style={{ color: "var(--faint)", fontSize: 14 }}>No messages yet. Say hello, or start with @name to talk to an agent.</p>}
      {messages.map((m) => {
        const s = byId.get(m.sender_id);
        if (SYSTEM.test(m.body)) {
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)", paddingLeft: 40 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warn)" }} />
              <strong style={{ color: "var(--text-2)", fontWeight: 500 }}>{s?.name}</strong> {m.body.replace(/\.$/, "")}
              <span style={{ color: "var(--faint)" }}>· {time(m.created_at)}</span>
            </div>
          );
        }
        const kind = KIND[m.kind];
        const problem = m.kind === "status" && PROBLEM.test(m.body);
        const parent = m.thread_id ? messages.find((x) => x.id === m.thread_id) : undefined;
        const n = replies.get(m.id);
        return (
          <div key={m.id} style={{ display: "flex", gap: 10 }}>
            <Mark m={s} me={me} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, marginBottom: 2 }}>
                <strong style={{ fontWeight: 600 }}>{s?.name ?? "someone"}</strong>
                {m.to_id && <span style={{ color: "var(--muted)" }}>→ {byId.get(m.to_id)?.name ?? "someone"}</span>}
                {kind && (
                  <span style={{ height: 18, padding: "0 6px", borderRadius: 4, background: kind.bg, color: kind.color, font: "700 10px var(--sans)", letterSpacing: "0.04em", textTransform: "uppercase", display: "inline-flex", alignItems: "center" }}>{kind.label}</span>
                )}
                {problem && <span style={{ fontSize: 12, color: "var(--danger)" }}>needs attention</span>}
                <span style={{ color: "var(--faint)", fontSize: 12 }} title={new Date(m.created_at).toLocaleString()}>
                  {time(m.created_at)}
                </span>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10 }}>
                  <button type="button" onClick={() => onReply(m)} style={{ border: 0, background: "none", color: "var(--faint)", fontSize: 12, cursor: "pointer", padding: 0 }}>
                    Reply
                  </button>
                </span>
              </div>
              {parent && (
                <button type="button" onClick={() => onThread(m.thread_id!)} style={{ display: "block", border: 0, borderLeft: "2px solid var(--line-strong)", background: "none", color: "var(--faint)", fontSize: 12, padding: "0 0 0 8px", margin: "2px 0 4px", cursor: "pointer", textAlign: "left", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Replying to {byId.get(parent.sender_id)?.name ?? "someone"}: {parent.body.slice(0, 90)}
                </button>
              )}
              <div style={{ fontSize: 14 }}>
                <Markdown text={withTicketLinks(m.body, ws)} />
              </div>
              {n ? (
                <button type="button" onClick={() => onThread(m.id)} style={{ border: 0, background: "none", color: "var(--primary)", fontSize: 12, cursor: "pointer", padding: 0 }}>
                  {n} repl{n === 1 ? "y" : "ies"} in thread
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Composer({ room, replyTo, thread, onClearReply, onPosted }: { room: RoomData; replyTo: RoomMessage | null; thread: number | null; onClearReply: () => void; onPosted: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const others = room.members.filter((m) => m.id !== room.me?.id);

  useEffect(() => {
    if (!replyTo) return;
    const who = room.members.find((m) => m.id === replyTo.sender_id);
    if (who && who.id !== room.me?.id && !body.includes(`@${who.name}`)) setBody((b) => `@${who.name} ${b}`.trimEnd() + " ");
    box.current?.focus();
  }, [replyTo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!room.me) return <div style={{ padding: 14, fontSize: 13, color: "var(--faint)", borderTop: "1px solid var(--line-soft)" }}>You can read this room. Posting needs your sign-in linked to a member of the room.</div>;
  if (room.me.role === "observer") return <div style={{ padding: 14, fontSize: 13, color: "var(--faint)", borderTop: "1px solid var(--line-soft)" }}>You can read this room but not post.</div>;

  // Longest names first, and a name only counts if it isn't part of a longer one ("@lee" vs "@lee-codex").
  const mentioned = [...others].sort((a, b) => b.name.length - a.name.length).find((m) => new RegExp(`(^|\\s)@${m.name}(?![a-z0-9-])`).test(body));
  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setErr("");
    try {
      await postToRoom(room.id, text, mentioned?.id ?? null, replyTo ? (replyTo.thread_id ?? replyTo.id) : thread);
      setBody("");
      onClearReply();
      await onPosted();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const insert = (name: string) => {
    setBody((b) => (b.includes(`@${name}`) ? b : `@${name} ${b}`));
    box.current?.focus();
  };

  return (
    <div style={{ borderTop: "1px solid var(--line-soft)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {replyTo && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
          Replying in thread #{replyTo.thread_id ?? replyTo.id}
          <button type="button" onClick={onClearReply} style={{ border: 0, background: "none", color: "var(--faint)", cursor: "pointer", fontSize: 12 }}>
            Cancel
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {others.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => insert(m.name)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 8px", borderRadius: 999, border: `1px solid ${mentioned?.id === m.id ? "var(--primary)" : "var(--line)"}`, background: "transparent", color: mentioned?.id === m.id ? "var(--primary)" : "var(--text-2)", fontSize: 12, cursor: "pointer" }}
          >
            <Mark m={m} size={16} />@{m.name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          ref={box}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          aria-label="Message the room"
          placeholder={mentioned ? `Message ${mentioned.name}…` : "Message the room. Start with @name to talk to someone."}
          style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line-strong)", background: "var(--surface)", fontSize: 14, resize: "vertical", outline: "none" }}
        />
        <Button variant="primary" disabled={busy || !body.trim()} onClick={() => void send()}>
          Send
        </Button>
      </div>
      <span style={{ fontSize: 12, color: err ? "var(--danger)" : "var(--faint)" }}>{err || "Enter to send · Shift+Enter for a new line"}</span>
    </div>
  );
}
