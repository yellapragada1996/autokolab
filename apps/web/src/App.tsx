import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutoKolab, type RoomMemberView, type RoomView, type WorkEntry } from "@core/client";
import type { BulletinItem, Message } from "@core/types";
import { Avatar, Dot } from "./icons";
import { isLocal, local, STALE_EVENT, type SetupState } from "./local";
import { InviteBox, RepoPicker, Setup, Wordmark } from "./Setup";

// ------------------------------------------------------------------ sign-in (when not opened by the app)

interface Saved {
  url: string;
  anonKey: string;
  token: string;
}
const KEY = "autokolab.signin";
const ROOM_KEY = "autokolab.room";

function store(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}
function loadSaved(): Saved | null {
  for (const s of [store("session"), store("local")]) {
    try {
      const raw = s?.getItem(KEY);
      if (raw) return JSON.parse(raw) as Saved;
    } catch {
      /* ignore */
    }
  }
  return null;
}
function save(s: Saved | null): void {
  try {
    store("session")?.removeItem(KEY);
    if (s) store("session")?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ app

export function App() {
  const [ak, setAk] = useState<AutoKolab | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [localState, setLocalState] = useState<SetupState | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const on = () => setStale(true);
    window.addEventListener(STALE_EVENT, on);
    return () => window.removeEventListener(STALE_EVENT, on);
  }, []);

  const openLocal = useCallback(async () => {
    const s = await local.state();
    setLocalState(s);
    if (!s.ready) {
      setSetup(s);
      return;
    }
    setSetup(null);
    const client = await AutoKolab.connect(await local.signIn());
    setAk(client);
  }, []);

  const connect = useCallback(async (s: Saved) => {
    setError("");
    try {
      setAk(await AutoKolab.connect(s));
      save(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("demo")) {
      void import("./demo").then((d) => {
        setAk(d.demoClient());
        setLocalState(d.demoState());
        setBooting(false);
      });
      return;
    }
    if (isLocal) {
      void openLocal()
        .catch((e) => setError((e as Error).message))
        .finally(() => setBooting(false));
      return;
    }
    const s = loadSaved();
    if (s) void connect(s).finally(() => setBooting(false));
    else setBooting(false);
  }, [connect, openLocal]);

  if (stale) {
    return (
      <div className="center">
        <div className="login">
          <Wordmark />
          <p>AutoKolab was restarted, so this page needs a reload.</p>
          <p className="muted small">If reloading doesn't help, run autokolab in Terminal.</p>
          <div>
            <button className="primary" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (booting) return <div className="center muted">Starting AutoKolab…</div>;
  if (setup) return <Setup initial={setup} onFinished={() => void openLocal().catch((e) => setError((e as Error).message))} />;
  if (!ak) {
    return (
      <div className="center">
        <div className="login">
          <Wordmark />
          {error ? <p className="error">{error}</p> : null}
          <p className="muted">
            Open AutoKolab from your computer: run <code>autokolab</code> in Terminal.
          </p>
        </div>
      </div>
    );
  }
  return <Shell ak={ak} localState={localState} onLocalChange={() => void openLocal()} />;
}

// ------------------------------------------------------------------ shell

function Shell({ ak, localState, onLocalChange }: { ak: AutoKolab; localState: SetupState | null; onLocalChange: () => void }) {
  const [rooms, setRooms] = useState(ak.rooms());
  const [dialog, setDialog] = useState<"invite" | "repo" | null>(null);
  const [roomId, setRoomId] = useState<string>(() => {
    let saved: string | null = null;
    try {
      saved = store("local")?.getItem(ROOM_KEY) ?? null;
    } catch {
      /* ignore */
    }
    return rooms.find((r) => r.id === saved)?.id ?? rooms[0]?.id ?? "";
  });
  useEffect(() => {
    const ch = ak.onMembersChange(() => setRooms(ak.rooms()));
    return () => void ak.sb.removeChannel(ch);
  }, [ak]);
  const pick = (id: string) => {
    setRoomId(id);
    try {
      store("local")?.setItem(ROOM_KEY, id);
    } catch {
      /* ignore */
    }
  };
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const view = useMemo(() => (room ? ak.room(room) : null), [ak, room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <header className="topbar">
        <Wordmark />
        <span className="sep" />
        {rooms.length > 1 ? (
          <select value={room?.id} onChange={(e) => pick(e.target.value)} aria-label="Room" className="roompick">
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <strong>{room?.name}</strong>
        )}
        {room?.repo && (
          <a className="repo mono" href={`https://github.com/${room.repo}`} target="_blank" rel="noreferrer">
            {room.repo}
          </a>
        )}
        {view && <Clocks members={view.members()} />}
        {localState?.admin && (
          <>
            <button className="small" onClick={() => setDialog("invite")}>
              Invite
            </button>
            <button className="small ghost" onClick={() => setDialog("repo")}>
              Add repo
            </button>
          </>
        )}
      </header>
      {localState && localState.followers > 0 && localState.service !== "running" && <BackgroundBanner onDone={onLocalChange} />}
      {dialog && (
        <div className="modal-back" onClick={() => setDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 16 }}>
              <h2>{dialog === "invite" ? "Invite a teammate" : "Add a repo"}</h2>
              <button className="ghost small" onClick={() => setDialog(null)}>
                Close
              </button>
            </div>
            {dialog === "invite" ? (
              <InviteBox />
            ) : (
              <RepoPicker
                onDone={async () => {
                  await ak.refresh();
                  setRooms(ak.rooms());
                  setDialog(null);
                }}
              />
            )}
          </div>
        </div>
      )}
      {view ? <Room key={view.id} view={view} admin={!!localState?.admin} /> : <div className="center muted">You aren't in any room yet.</div>}
    </div>
  );
}

function Clocks({ members }: { members: RoomMemberView[] }) {
  const people = members.filter((m) => m.kind === "human" && m.timezone).slice(0, 4);
  if (!people.length) return <span className="clocks" />;
  return <span className="clocks">{people.map((p) => `${p.name} ${localTime(p.timezone!)}`).join("   ")}</span>;
}

function BackgroundBanner({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="banner">
      <Dot tone="warn" />
      Your agents only work while AutoKolab is open.
      <button
        className="small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await local.finish({ background: true });
            onDone();
          } catch (e) {
            setErr((e as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? "Turning on…" : "Let them work in the background"}
      </button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ room

const ONLINE_MS = 150_000;
const isOnline = (m: RoomMemberView) => !!m.last_seen_at && Date.now() - Date.parse(m.last_seen_at) < ONLINE_MS;

function Room({ view, admin }: { view: RoomView; admin: boolean }) {
  const ak = view.ak;
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<RoomMemberView[]>(view.members());
  const [board, setBoard] = useState<BulletinItem[]>([]);
  const [thread, setThread] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [, setTick] = useState(0);
  const [loadError, setLoadError] = useState("");
  const lastId = useRef(0);
  lastId.current = messages.length ? messages[messages.length - 1].id : 0;

  const addMessages = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh].sort((a, b) => a.id - b.id) : prev;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [recent, items] = await Promise.all([view.recent(300), view.boardList({ state: "active" })]);
        if (!alive) return;
        addMessages(recent);
        setBoard(items);
        if (recent.length) void view.markRead(recent[recent.length - 1].id).catch(() => undefined);
      } catch (e) {
        setLoadError((e as Error).message);
      }
    })();
    void ak.heartbeat().catch(() => undefined);
    const channels = [
      view.onMessage(async (m) => {
        await ak.memberFresh(m.sender_id);
        setMembers(view.members());
        addMessages([m]);
        void view.markRead(m.id).catch(() => undefined);
      }),
      ak.onMembersChange(() => setMembers(view.members())),
      view.onBulletinChange((b) => setBoard((prev) => [b, ...prev.filter((x) => x.id !== b.id)].filter((x) => x.state !== "done" && x.state !== "superseded"))),
    ];
    const poll = setInterval(async () => {
      await view.messagesAfter(lastId.current).then(addMessages).catch(() => undefined);
      await ak.refresh().then(() => setMembers(view.members())).catch(() => undefined);
    }, 30_000);
    const beat = setInterval(() => void ak.heartbeat().catch(() => undefined), 60_000);
    const tick = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(beat);
      clearInterval(tick);
      for (const c of channels) void ak.sb.removeChannel(c);
    };
  }, [view, ak, addMessages]);

  const shown = thread === null ? messages : messages.filter((m) => m.id === thread || m.thread_id === thread);

  return (
    <>
      {loadError && (
        <div className="banner">
          <Dot tone="bad" /> {loadError}
        </div>
      )}
      <div className="grid">
        <aside className="pane side left">
          <People view={view} members={members} />
        </aside>
        <main className="pane chat">
          {thread !== null && (
            <div className="threadbar">
              <span className="label">Thread #{thread}</span>
              <button className="link small" onClick={() => setThread(null)}>
                Back to all messages
              </button>
            </div>
          )}
          <Timeline view={view} messages={shown} admin={admin} onOpenThread={setThread} onReply={setReplyTo} />
          <Composer view={view} members={members} replyTo={replyTo} clearReply={() => setReplyTo(null)} thread={thread} />
        </main>
        <aside className="pane side right">
          <Work view={view} refreshKey={messages.length} />
          {board.length > 0 && (
            <div className="section">
              <span className="label">Pinned</span>
              {board.map((b) => (
                <div key={b.id} className="pin">
                  <Dot tone={b.state === "blocked" ? "bad" : b.state === "in_progress" ? "busy" : "off"} />
                  <span className="grow">
                    {b.title}
                    {b.assignee_id && <span className="muted"> · {ak.nameOf(b.assignee_id)}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ people

function People({ view, members }: { view: RoomView; members: RoomMemberView[] }) {
  const ak = view.ak;
  const [err, setErr] = useState("");
  const people = members.filter((m) => m.kind === "human" && !/^new-[0-9a-f]{6}$/.test(m.name));
  const agentsOf = (id: string) => members.filter((m) => m.kind === "agent" && m.owner_id === id && !/^new-[0-9a-f]{6}-/.test(m.name));
  const toggle = async (m: RoomMemberView) => {
    setErr("");
    try {
      await ak.setPaused(m.name, !m.paused);
      await ak.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="section">
      <span className="label">People and agents</span>
      {people.map((p) => (
        <div key={p.id} className="person-block">
          <div className="member">
            <Avatar name={p.name} kind="human" size={26} />
            <span className="who">
              <div className="name">
                {p.name}
                {p.id === ak.me.id && <span className="faint"> · you</span>}
              </div>
              <div className="sub">
                <Dot tone={isOnline(p) ? "ok" : "off"} />
                {isOnline(p) ? "online" : p.last_seen_at ? `seen ${ago(p.last_seen_at)}` : "not seen yet"}
                {p.timezone && <span className="mono"> · {localTime(p.timezone)}</span>}
              </div>
            </span>
          </div>
          {agentsOf(p.id).map((a) => {
            const st = agentState(a);
            return (
              <div key={a.id} className="member nested">
                <Avatar name={a.name} kind="agent" client={a.client} size={24} />
                <span className="who">
                  <div className="name">{a.name}</div>
                  <div className="sub">
                    <Dot tone={st.tone} /> {st.text}
                  </div>
                </span>
                {a.owner_id === ak.me.owner_id && a.role === "follower" && (
                  <button className="ghost small act" onClick={() => void toggle(a)}>
                    {a.paused ? "Resume" : "Pause"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function agentState(a: RoomMemberView): { tone: "ok" | "warn" | "bad" | "busy" | "off"; text: string } {
  if (a.paused) return { tone: "warn", text: "paused" };
  if (a.role === "lead") return isOnline(a) ? { tone: "ok", text: "active" } : { tone: "off", text: "in its person's Claude Code" };
  if (!isOnline(a) || a.runner_state === "offline") return { tone: "off", text: "offline" };
  if (a.runner_state === "working") return { tone: "busy", text: "working" };
  return { tone: "ok", text: "ready" };
}

// ------------------------------------------------------------------ messages

const SYSTEM = /^(Started on|Picked up) #\d+/;
const PROBLEM = /^(Blocked|Failed|Stopped|Couldn't)\b/;

function Timeline({
  view,
  messages,
  admin,
  onOpenThread,
  onReply,
}: {
  view: RoomView;
  messages: Message[];
  admin: boolean;
  onOpenThread: (id: number) => void;
  onReply: (m: Message) => void;
}) {
  const ak = view.ak;
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div
      className="messages"
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {!messages.length && <p className="empty">No messages yet. Say hello, or mention an agent with @ to give it work.</p>}
      {messages.map((m) => {
        const sender = ak.member(m.sender_id);
        if (SYSTEM.test(m.body)) {
          return (
            <div key={m.id} className="msg system">
              <Dot tone="busy" />
              <span>
                <strong style={{ color: "var(--text)", fontWeight: 500 }}>{sender?.name}</strong> {m.body.replace(/\.$/, "")}
              </span>
              <span className="mono faint">{time(m.created_at)}</span>
            </div>
          );
        }
        const problem = m.kind === "status" && PROBLEM.test(m.body);
        const access = (m.refs as { access_request?: { repo: string; github: string } }).access_request;
        return (
          <div key={m.id} className="msg">
            <Avatar name={sender?.name ?? "?"} kind={sender?.kind ?? "human"} client={sender?.client} size={28} />
            <div className="content">
              <div className="meta">
                <span className="name">{sender?.name ?? "someone"}</span>
                {m.to_id && <span className="to">→ {ak.nameOf(m.to_id)}</span>}
                <span className="time" title={new Date(m.created_at).toLocaleString()}>
                  {time(m.created_at)}
                </span>
                {problem && (
                  <span className="flag">
                    <Dot tone="bad" /> needs attention
                  </span>
                )}
                {m.kind === "question" && (
                  <span className="flag">
                    <Dot tone="warn" /> question
                  </span>
                )}
                <span className="actions">
                  {m.thread_id && (
                    <button className="link small" onClick={() => onOpenThread(m.thread_id!)}>
                      thread
                    </button>
                  )}
                  <button className="link small" onClick={() => onReply(m)}>
                    reply
                  </button>
                </span>
              </div>
              <div className="body">{m.body}</div>
              {access && <AccessCard repo={access.repo} github={access.github} admin={admin} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AccessCard({ repo, github, admin }: { repo: string; github: string; admin: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  if (!admin) return null;
  return (
    <div className="card-inline">
      <Dot tone={state === "done" ? "ok" : "warn"} />
      <span className="grow small">
        {state === "done" ? (
          <>
            Invited <strong>@{github}</strong> to {repo} on GitHub. Their setup continues by itself once they accept.
          </>
        ) : (
          <>
            <strong>@{github}</strong> needs access to <span className="mono">{repo}</span> on GitHub.
          </>
        )}
        {err && <span className="error"> {err}</span>}
      </span>
      {state !== "done" && (
        <button
          className="small primary"
          disabled={state === "busy"}
          onClick={async () => {
            setState("busy");
            setErr("");
            try {
              await local.grantAccess({ repo, github });
              setState("done");
            } catch (e) {
              setErr((e as Error).message);
              setState("idle");
            }
          }}
        >
          {state === "busy" ? "Adding…" : "Add them"}
        </button>
      )}
    </div>
  );
}

/** One box. "@name" anywhere sends it to that member; agents work out what kind of message it is. */
function Composer({
  view,
  members,
  replyTo,
  clearReply,
  thread,
}: {
  view: RoomView;
  members: RoomMemberView[];
  replyTo: Message | null;
  clearReply: () => void;
  thread: number | null;
}) {
  const ak = view.ak;
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const others = useMemo(() => members.filter((m) => m.id !== ak.me.id && !/^new-[0-9a-f]{6}/.test(m.name)), [members, ak]);

  useEffect(() => {
    if (!replyTo) return;
    const who = ak.member(replyTo.sender_id);
    if (who && who.id !== ak.me.id && !body.includes(`@${who.name}`)) setBody((b) => `@${who.name} ${b}`.trimEnd() + " ");
    box.current?.focus();
  }, [replyTo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (view.myRole() === "observer") return <div className="composer muted small">You can read this room but not post.</div>;

  // Longest names first, and a name only counts if it isn't part of a longer one
  // ("@lee" must not match "@lee-codex").
  const mentioned = [...others]
    .sort((a, b) => b.name.length - a.name.length)
    .find((m) => new RegExp(`(^|\\s)@${m.name}(?![a-z0-9-])`).test(body));
  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setErr("");
    try {
      await view.post({ body: text, kind: "chat", to: mentioned?.id ?? null, thread: replyTo ? replyTo.thread_id ?? replyTo.id : thread });
      setBody("");
      clearReply();
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
    <div className="composer">
      <div className="mentions">
        {others.map((m) => (
          <button key={m.id} type="button" className={`chip ${mentioned?.id === m.id ? "on" : ""}`} onClick={() => insert(m.name)}>
            <Avatar name={m.name} kind={m.kind} client={m.client} size={18} />
            {m.name}
          </button>
        ))}
      </div>
      <div className="box">
        <textarea
          ref={box}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setErr("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={mentioned ? `Message ${mentioned.name}…` : "Message the room. Start with @name to give someone work."}
          rows={2}
        />
        <button className="primary" onClick={() => void send()} disabled={busy || !body.trim()}>
          Send
        </button>
      </div>
      <div className="hint">
        <span>Enter to send · Shift+Enter for a new line</span>
        {(replyTo || thread !== null) && (
          <span>
            Replying in thread #{replyTo ? replyTo.thread_id ?? replyTo.id : thread}
            {replyTo && (
              <button className="link small" style={{ marginLeft: 6 }} onClick={clearReply}>
                cancel
              </button>
            )}
          </span>
        )}
        {err && <span className="error">{err}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ agent work

function Work({ view, refreshKey }: { view: RoomView; refreshKey: number }) {
  const ak = view.ak;
  const [entries, setEntries] = useState<WorkEntry[] | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    void view.workLog({ limit: 12 }).then(setEntries).catch(() => setEntries([]));
  }, [view, refreshKey]);
  const copy = (b: string) =>
    void navigator.clipboard?.writeText(`git fetch origin && git log origin/${b}`).then(() => {
      setCopied(b);
      setTimeout(() => setCopied(""), 1500);
    });
  return (
    <div className="section">
      <span className="label">Agent work</span>
      {entries && !entries.length && <p className="small muted">Nothing yet. When an agent picks up work, it shows here with the branch it's on.</p>}
      {entries?.map(({ run, instruction }) => {
        const agent = ak.member(run.runner_id);
        const tone = run.state === "running" ? "busy" : run.state === "done" ? "ok" : run.state === "queued" ? "off" : run.state === "blocked" ? "warn" : "bad";
        return (
          <div key={run.id} className="work">
            <div className="top">
              <Avatar name={agent?.name ?? "?"} kind="agent" client={agent?.client} size={22} />
              <strong className="grow" style={{ fontWeight: 500 }}>
                {agent?.name}
              </strong>
              <span className="stat">
                <Dot tone={tone} /> {run.state === "running" ? "working" : run.state}
              </span>
            </div>
            <div className="task">{instruction?.body.split("\n")[0] ?? `#${run.message_id}`}</div>
            {run.branch && (
              <button className="link mono branch" title="Copy a command to read this branch" onClick={() => copy(run.branch!)}>
                {copied === run.branch ? "copied" : run.branch}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ helpers

function localTime(tz: string): string {
  try {
    return new Date().toLocaleTimeString([], { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function time(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
