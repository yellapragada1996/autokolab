import { useEffect, useRef, useState } from "react";
import { ClaudeMark, CodexMark, Dot, GitHubMark } from "./icons";
import {
  clearPendingInvite,
  local,
  NAME_RULE,
  pendingInvite,
  toName,
  type Engine,
  type InvitePreview,
  type InviteResult,
  type RepoState,
  type RepoSuggestion,
  type SetupState,
  type ToolStatus,
} from "./local";

// First-time setup in the browser, driven by the AutoKolab app on this computer. Every step
// checks what's already in place and only asks for what's missing.
//   Starting a team: project → database → you and your AI → repo → invite
//   Joining a team:  invite → you → repo access → your AI → permissions → done

type Step = "welcome" | "keys" | "database" | "you" | "repo" | "done" | "join" | "name" | "access" | "agents" | "consent" | "joined";

const START: [Step, string][] = [["keys", "Project"], ["database", "Database"], ["you", "You"], ["repo", "Repo"], ["done", "Invite"]];
const JOIN: [Step, string][] = [["join", "Invite"], ["name", "You"], ["access", "Repo"], ["agents", "AI agents"], ["consent", "Permissions"], ["joined", "Done"]];
const ENGINES: Engine[] = ["claude", "codex"];
const TOOL: Record<Engine, { title: string; maker: string; signIn: string }> = {
  claude: { title: "Claude Code", maker: "Anthropic", signIn: "Sign in with Claude" },
  codex: { title: "Codex", maker: "OpenAI", signIn: "Sign in with ChatGPT" },
};

export function firstStep(s: SetupState): Step {
  if (s.me && !s.admin) {
    if (s.me.needsName) return "name";
    if (s.agents.some((a) => a.needsName)) return "access";
    return s.followers && s.service !== "running" ? "consent" : "joined";
  }
  if (s.admin) {
    if (s.database !== "ready") return "database";
    if (!s.me) return "you";
    if (!s.rooms.length) return "repo";
    return "done";
  }
  return pendingInvite ? "join" : "welcome";
}

export function Setup({ initial, onFinished }: { initial: SetupState; onFinished: () => void }) {
  const [state, setState] = useState(initial);
  const [step, setStep] = useState<Step>(firstStep(initial));
  const refresh = async (next?: Step) => {
    const s = await local.state();
    setState(s);
    setStep(next ?? firstStep(s));
  };
  const flow = JOIN.some(([s]) => s === step) ? JOIN : START.some(([s]) => s === step) ? START : null;
  const at = flow ? flow.findIndex(([s]) => s === step) : -1;

  return (
    <div className="setup">
      <div className="setup-top">
        <Wordmark />
        {flow && (
          <div className="steps">
            {flow.map(([s, label], i) => (
              <span key={s} className={i === at ? "now" : i < at ? "done" : ""}>
                {String(i + 1).padStart(2, "0")} {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="setup-body">
        <div className="setup-card">
          {step === "welcome" && <Welcome onStart={() => setStep("keys")} onJoin={() => setStep("join")} />}
          {step === "keys" && <Keys onDone={(db) => void refresh(db === "ready" ? undefined : "database")} onBack={() => setStep("welcome")} />}
          {step === "database" && <Database onDone={() => void refresh()} />}
          {step === "you" && <AdminYou state={state} onDone={() => void refresh()} />}
          {step === "repo" && <RepoPicker onDone={() => void refresh("done")} />}
          {step === "done" && <Done state={state} onOpen={onFinished} />}
          {step === "join" && <Join onDone={() => void refresh("name")} onBack={() => setStep("welcome")} />}
          {step === "name" && <JoinName state={state} onDone={() => void refresh("access")} />}
          {step === "access" && <Access onDone={() => setStep("agents")} />}
          {step === "agents" && <JoinAgents state={state} onDone={() => void refresh().then(() => setStep("consent"))} />}
          {step === "consent" && <Consent state={state} onDone={() => void refresh("joined")} />}
          {step === "joined" && <Joined state={state} onOpen={onFinished} />}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ shared bits

export function Wordmark() {
  return (
    <span className="wordmark">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="3" fill="currentColor" />
        <path d="M7 17l5-10 5 10M9.2 13h5.6" stroke="var(--bg)" strokeWidth="2" fill="none" />
      </svg>
      AUTOKOLAB
    </span>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  return { busy, error, setError, run };
}

/** Poll something every few seconds while the component is mounted. */
function usePoll<T>(fn: () => Promise<T>, ms: number): [T | null, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const tick = () => void fnRef.current().then(setValue).catch(() => undefined);
  useEffect(() => {
    tick();
    const t = setInterval(tick, ms);
    return () => clearInterval(t);
  }, [ms]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, tick];
}

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="small"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        })
      }
    >
      {done ? "Copied" : label}
    </button>
  );
}

function Check({ tone = "ok", children }: { tone?: "ok" | "warn" | "bad" | "busy" | "off"; children: React.ReactNode }) {
  return (
    <div className="check">
      <Dot tone={tone} />
      <span>{children}</span>
    </div>
  );
}

function NameField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const problem = value ? NAME_RULE(value) : null;
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(toName(e.target.value))} spellCheck={false} />
      {problem ? <small className="error">{problem}</small> : hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

// ------------------------------------------------------------------ welcome

function Welcome({ onStart, onJoin }: { onStart: () => void; onJoin: () => void }) {
  return (
    <>
      <h1>Welcome to AutoKolab</h1>
      <p className="lead">One room where you, your teammates and your AI coding agents work on the same repo, from any computer.</p>
      <div className="choices">
        <button className="choice" onClick={onJoin}>
          <strong>Join a team</strong>
          <span>Someone sent you an invite.</span>
        </button>
        <button className="choice" onClick={onStart}>
          <strong>Start a new team</strong>
          <span>You'll connect a Supabase project, then invite people.</span>
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ starting a team

function Keys({ onDone, onBack }: { onDone: (db: "ready" | "missing") => void; onBack: () => void }) {
  const [found, setFound] = useState<{ url: boolean; publicKey: boolean; secretKey: boolean } | null>(null);
  const [url, setUrl] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const { busy, error, run } = useAction();
  useEffect(() => {
    void local.env().then(setFound).catch(() => setFound({ url: false, publicKey: false, secretKey: false }));
  }, []);
  const allFound = found?.url && found.publicKey && found.secretKey;
  if (!found) return <p className="muted">Looking for your keys…</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => onDone((await local.saveKeys({ url, publicKey, secretKey })).database));
      }}
    >
      <h1>Connect your Supabase project</h1>
      <p className="lead">Where your team's messages are kept.</p>
      {allFound ? (
        <div className="panel">
          <Check>Found your project URL and keys in your .env file.</Check>
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginBottom: 16 }}>
            In Supabase, open your project, then Project Settings → API Keys.
          </p>
          {!found.url && (
            <label className="field">
              <span>Project URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://abcdefghijklmnop.supabase.co" />
            </label>
          )}
          {!found.publicKey && (
            <label className="field">
              <span>Publishable key</span>
              <input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="sb_publishable_…" />
            </label>
          )}
          {!found.secretKey && (
            <label className="field">
              <span>Secret key</span>
              <input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="sb_secret_…" />
              <small className="muted">Stays on this computer. Never share it.</small>
            </label>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="ghost" onClick={onBack}>
          Back
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </div>
    </form>
  );
}

function Database({ onDone }: { onDone: () => void }) {
  const [hasDbUrl, setHasDbUrl] = useState<boolean | null>(null);
  const [dbUrl, setDbUrl] = useState("");
  const [sql, setSql] = useState("");
  const { busy, error, run } = useAction();
  useEffect(() => {
    void local.env().then((e) => setHasDbUrl(e.dbUrl)).catch(() => setHasDbUrl(false));
  }, []);
  return (
    <>
      <h1>Set up the database</h1>
      <p className="lead">A one-time step that creates AutoKolab's tables in your project.</p>
      {hasDbUrl ? (
        <div className="panel">
          <Check>Found your database connection in your .env file.</Check>
        </div>
      ) : (
        <label className="field">
          <span>Database connection string</span>
          <input type="password" value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} placeholder="postgresql://postgres.…@…pooler.supabase.com:5432/postgres" />
          <small className="muted">Supabase → Connect (top bar) → Session pooler. Put your database password in place of [YOUR-PASSWORD].</small>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" onClick={() => void run(async () => (await local.setUpDatabase({ dbUrl }), onDone()))} disabled={busy || hasDbUrl === null}>
          {busy ? "Setting up…" : "Set up database"}
        </button>
      </div>
      <details style={{ marginTop: 24 }} onToggle={(e) => (e.currentTarget.open && !sql ? void local.schema().then((s) => setSql(s.sql)) : undefined)}>
        <summary className="muted small" style={{ cursor: "pointer" }}>
          Rather do it by hand?
        </summary>
        <p className="small muted" style={{ margin: "8px 0" }}>
          Copy this into Supabase → SQL Editor, press Run, then come back and press Set up database.
        </p>
        <Copy text={sql} label="Copy the SQL" />
      </details>
    </>
  );
}

function AdminYou({ state, onDone }: { state: SetupState; onDone: () => void }) {
  const [name, setName] = useState(state.me?.name ?? "");
  const { busy, error, setError, run } = useAction();
  useEffect(() => {
    if (!state.me) void local.suggestions().then((s) => setName((n) => n || s.personName));
  }, [state.me]);
  return (
    <>
      <h1>You and your AI</h1>
      <p className="lead">Pick the names your team will see. You can change them later.</p>
      {state.me ? (
        <div className="panel">
          <Check>You're {state.me.name}.</Check>
        </div>
      ) : (
        <NameField label="Your name" value={name} onChange={setName} />
      )}
      <h2 className="label">Your AI agents</h2>
      <AgentCards
        seats={ENGINES.map((e) => ({ engine: e, defaultName: name ? `${name}-${e}` : "", defaultUse: state.engines[e] }))}
        busy={busy}
        error={error}
        submitLabel="Continue"
        onSubmit={(choices) => {
          const bad = NAME_RULE(name);
          if (bad) return setError(bad);
          void run(async () => {
            const agents = Object.fromEntries(choices.filter((c) => c.use).map((c) => [c.engine, c.name])) as Partial<Record<Engine, string>>;
            await local.createMe({ name, agents });
            onDone();
          });
        }}
      />
    </>
  );
}

export function RepoPicker({ onDone }: { onDone: () => void }) {
  const [repos, setRepos] = useState<RepoSuggestion[] | null>(null);
  const [path, setPath] = useState("");
  const [notes, setNotes] = useState(true);
  const [result, setResult] = useState<{ room: string; repo: string; instructions: string[] } | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => {
    void local.repos().then(setRepos).catch(() => setRepos([]));
  }, []);
  if (result) {
    return (
      <>
        <h1>Repo connected</h1>
        <div className="panel">
          <Check>
            Room <strong>{result.room}</strong> for <span className="mono">github.com/{result.repo}</span>
          </Check>
          {result.instructions.length > 0 && (
            <Check tone="warn">Added AutoKolab notes to {result.instructions.join(" and ")}. Commit and push them so every agent reads them.</Check>
          )}
        </div>
        <div className="actions">
          <button className="primary" onClick={onDone}>
            Continue
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <h1>Which repo will you work on together?</h1>
      <p className="lead">Everyone on the team works on this same GitHub repo. You can add more later.</p>
      {repos === null ? (
        <p className="muted">Looking for your repos…</p>
      ) : (
        <div className="panel" style={{ padding: "4px 16px", maxHeight: 280, overflowY: "auto" }}>
          {repos.map((r) => (
            <label key={r.path} className="repo-row" style={{ cursor: "pointer" }}>
              <input type="radio" name="repo" checked={path === r.path} onChange={() => setPath(r.path)} />
              <GitHubMark />
              <span className="grow">
                <div style={{ fontWeight: 500 }}>{r.repo}</div>
                <div className="mono muted">{r.path.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~")}</div>
              </span>
            </label>
          ))}
          {!repos.length && <p className="muted small" style={{ padding: "10px 0" }}>No GitHub repos found in the usual folders. Paste the folder path below.</p>}
        </div>
      )}
      <label className="field">
        <span>Or paste the folder path</span>
        <input value={repos?.some((r) => r.path === path) ? "" : path} onChange={(e) => setPath(e.target.value)} placeholder="~/code/my-project" />
      </label>
      <label className="row small">
        <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
        Add short AutoKolab notes to the repo's CLAUDE.md and AGENTS.md, so agents know how to work together
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy || !path} onClick={() => void run(async () => setResult(await local.addRepo({ path, instructions: notes })))}>
          {busy ? "Connecting…" : "Connect repo"}
        </button>
      </div>
    </>
  );
}

function Done({ state, onOpen }: { state: SetupState; onOpen: () => void }) {
  return (
    <>
      <h1>You're set up, {state.me?.name}</h1>
      <p className="lead">Now invite the people you work with.</p>
      <div className="panel quiet">
        {state.rooms.map((r) => (
          <Check key={r.id}>
            Room <strong>{r.name}</strong> <span className="mono muted">github.com/{r.repo}</span>
          </Check>
        ))}
        {state.agents.map((a) => (
          <Check key={a.id}>
            {a.name} works through {TOOL[a.engine].title}
          </Check>
        ))}
      </div>
      <h2 className="label">Invite a teammate</h2>
      <InviteBox />
      <div className="actions">
        <button className="primary" onClick={onOpen}>
          Open the room
        </button>
      </div>
    </>
  );
}

export function InviteBox() {
  const [lead, setLead] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [pending, setPending] = useState<{ id: number; label: string; expiresAt: string }[]>([]);
  const { busy, error, run } = useAction();
  const loadPending = () => void local.invites().then(setPending).catch(() => undefined);
  useEffect(loadPending, []);
  return (
    <>
      {result ? (
        <div className="panel">
          <p className="small">
            Send this to your teammate in a direct message. They paste it into the Terminal app on their computer; it installs AutoKolab and
            opens the join page. It works once, until {new Date(result.expires).toLocaleDateString()}.
          </p>
          <pre className="codebox">{result.installLine ?? result.command}</pre>
          <div className="row">
            <Copy text={result.installLine ?? result.command} label="Copy" />
            <button className="ghost small" onClick={() => setResult(null)}>
              Make another
            </button>
          </div>
        </div>
      ) : (
        <div className="panel">
          <p className="small muted" style={{ marginBottom: 12 }}>
            You'll get one line to send them. They choose their own name and connect their own AI when they join.
          </p>
          <label className="row small" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} />
            Their agents can assign work too (otherwise they carry out your side's instructions)
          </label>
          {error && <p className="error">{error}</p>}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setResult(await local.invite({ lead }));
                loadPending();
              })
            }
          >
            {busy ? "Creating…" : "Create invite"}
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span className="label">Waiting to be used</span>
          {pending.map((p) => (
            <div key={p.id} className="row small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <Dot tone="warn" />
              <span className="grow muted">Invite · expires {new Date(p.expiresAt).toLocaleDateString()}</span>
              <button className="ghost small" onClick={() => void local.cancelInvite({ id: p.id }).then(loadPending)}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ AI agent cards

interface Seat {
  engine: Engine;
  id?: string;
  defaultName: string;
  defaultUse: boolean;
}
interface Choice {
  engine: Engine;
  id?: string;
  use: boolean;
  name: string;
}

/** One card per AI tool: install it, sign in, name the agent, choose to use it. */
function AgentCards({ seats, busy, error, submitLabel, onSubmit }: { seats: Seat[]; busy: boolean; error: string; submitLabel: string; onSubmit: (c: Choice[]) => void }) {
  const [tools, refreshTools] = usePoll(() => local.tools(), 3000);
  const [use, setUse] = useState<Record<Engine, boolean>>(() => Object.fromEntries(seats.map((s) => [s.engine, s.defaultUse])) as Record<Engine, boolean>);
  const [names, setNames] = useState<Partial<Record<Engine, string>>>({});
  const [local_error, setLocalError] = useState("");
  const nameOf = (s: Seat) => names[s.engine] ?? s.defaultName;
  const submit = () => {
    const chosen = seats.filter((s) => use[s.engine]);
    if (!chosen.length) return setLocalError("Pick at least one AI agent.");
    const bad = chosen.map((s) => NAME_RULE(nameOf(s))).find(Boolean);
    if (bad) return setLocalError(bad);
    const notReady = chosen.find((s) => !tools?.[s.engine]?.signedIn);
    if (notReady) return setLocalError(`${TOOL[notReady.engine].title} needs to be installed and signed in first.`);
    setLocalError("");
    onSubmit(seats.map((s) => ({ engine: s.engine, id: s.id, use: use[s.engine], name: nameOf(s) })));
  };
  return (
    <>
      {seats.map((s) => (
        <ToolCard
          key={s.engine}
          engine={s.engine}
          status={tools?.[s.engine] ?? null}
          use={use[s.engine]}
          onUse={(v) => setUse((u) => ({ ...u, [s.engine]: v }))}
          name={nameOf(s)}
          onName={(v) => setNames((n) => ({ ...n, [s.engine]: v }))}
          onChanged={refreshTools}
        />
      ))}
      {(local_error || error) && <p className="error">{local_error || error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy || !tools} onClick={submit}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </>
  );
}

function ToolCard(props: {
  engine: Engine;
  status: ToolStatus | null;
  use: boolean;
  onUse: (v: boolean) => void;
  name: string;
  onName: (v: string) => void;
  onChanged: () => void;
}) {
  const { engine, status } = props;
  const t = TOOL[engine];
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();
  const state = !status
    ? { tone: "off" as const, text: "Checking…" }
    : !status.installed
      ? { tone: "off" as const, text: "Not installed" }
      : !status.signedIn
        ? { tone: "warn" as const, text: "Sign in needed" }
        : { tone: "ok" as const, text: "Ready" };
  return (
    <div className={`tool ${props.use ? "" : "off"}`}>
      <div className="head">
        <span className="avatar agent" style={{ width: 36, height: 36 }}>
          {engine === "claude" ? <ClaudeMark size={22} /> : <CodexMark size={22} />}
        </span>
        <span>
          <strong>{t.title}</strong>
          <div className="small muted">{t.maker}</div>
        </span>
        <span className="state stat">
          <Dot tone={state.tone} /> {state.text}
        </span>
        <label className="row small" style={{ marginLeft: 16 }}>
          <input type="checkbox" checked={props.use} onChange={(e) => props.onUse(e.target.checked)} />
          Use
        </label>
      </div>
      {props.use && (
        <div className="body">
          {status && !status.installed && (
            <div className="row">
              <button disabled={busy} onClick={() => void run(async () => (await local.installTool({ engine }), props.onChanged()))}>
                {busy ? "Installing… (about a minute)" : `Install ${t.title}`}
              </button>
            </div>
          )}
          {status?.installed && !status.signedIn && (
            <div className="row wrap">
              <button className="primary" disabled={busy} onClick={() => void run(async () => (await local.toolSignIn({ engine }), props.onChanged()))}>
                {t.signIn}
              </button>
              {status.signInUrl && (
                <a className="small muted" href={status.signInUrl} target="_blank" rel="noreferrer">
                  Browser didn't open? Open the sign-in page
                </a>
              )}
            </div>
          )}
          {status?.needsCode && (
            <div className="row">
              <input className="grow" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the code from the sign-in page" />
              <button disabled={!code || busy} onClick={() => void run(async () => (await local.toolCode({ engine, code }), setCode(""), props.onChanged()))}>
                Submit
              </button>
            </div>
          )}
          <NameField label="Agent name" value={props.name} onChange={props.onName} hint={`How the team sees your ${t.title} agent.`} />
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ joining a team

function Join({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [invite, setInvite] = useState(pendingInvite ?? "");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const { busy, error, setError, run } = useAction();
  useEffect(() => {
    const code = invite.trim();
    if (!/akinv_/.test(code)) return setPreview(null);
    const t = setTimeout(() => {
      void local
        .peekInvite({ invite: code })
        .then((p) => {
          setPreview(p);
          setError(p.used ? "This invite was already used. Ask for a new one." : p.expired ? "This invite has expired. Ask for a new one." : "");
        })
        .catch((e) => setError((e as Error).message));
    }, 300);
    return () => clearTimeout(t);
  }, [invite]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = preview && !preview.used && !preview.expired;
  return (
    <>
      {ok ? (
        <>
          <h1>{preview.invitedBy} invited you</h1>
          <p className="lead">
            To work together on {preview.repos.map((r, i) => (
              <span key={r}>
                {i > 0 && ", "}
                <span className="mono">{r}</span>
              </span>
            ))}
            . {preview.lead ? "Your AI agents can assign work too." : `Your AI agents will help with the work ${preview.invitedBy}'s side hands out.`}
          </p>
        </>
      ) : (
        <>
          <h1>Join your team</h1>
          <p className="lead">Paste the invite you were sent.</p>
        </>
      )}
      {!pendingInvite || !ok ? (
        <label className="field">
          <span>Invite</span>
          <textarea value={invite} onChange={(e) => setInvite(e.target.value)} rows={3} spellCheck={false} placeholder="akinv_…" />
        </label>
      ) : null}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {!pendingInvite && (
          <button type="button" className="ghost" onClick={onBack}>
            Back
          </button>
        )}
        <button
          className="primary"
          disabled={busy || !ok}
          onClick={() =>
            void run(async () => {
              await local.join({ invite: invite.trim() });
              clearPendingInvite();
              onDone();
            })
          }
        >
          {busy ? "Joining…" : "Join the team"}
        </button>
      </div>
    </>
  );
}

function JoinName({ state, onDone }: { state: SetupState; onDone: () => void }) {
  const [name, setName] = useState(state.me?.needsName ? "" : state.me?.name ?? "");
  const { busy, error, setError, run } = useAction();
  useEffect(() => {
    if (state.me?.needsName) void local.suggestions().then((s) => setName((n) => n || s.personName));
  }, [state.me]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const bad = NAME_RULE(name);
        if (bad) return setError(bad);
        void run(async () => (await local.rename({ id: state.me!.id, name }), onDone()));
      }}
    >
      <h1>What should we call you?</h1>
      <p className="lead">This is how the team sees you. You can change it later.</p>
      <NameField label="Your name" value={name} onChange={setName} />
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy || !name}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </form>
  );
}

/** GitHub sign-in, repo access (asks the admin if needed), and this computer's copy of the repo. */
function Access({ onDone }: { onDone: () => void }) {
  const [data, refresh] = usePoll(() => local.repoStates(), 5000);
  const [requested, setRequested] = useState<Record<string, boolean>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const { busy, error, run } = useAction();
  if (!data) return <p className="muted">Checking GitHub…</p>;
  const gh = data.github;
  const allReadable = data.repos.every((r) => r.canRead);
  const allPlaced = data.repos.every((r) => r.localPath || skipped[r.repo]);
  return (
    <>
      <h1>Get the code</h1>
      <p className="lead">Everyone works on the same GitHub repo. Your computer needs access to it and a copy of it.</p>

      <div className="tool">
        <div className="head">
          <span className="avatar agent" style={{ width: 36, height: 36 }}>
            <GitHubMark size={20} />
          </span>
          <span>
            <strong>GitHub</strong>
            <div className="small muted">{gh.login ? `Signed in as @${gh.login}` : "Where the code lives"}</div>
          </span>
          <span className="state stat">
            <Dot tone={gh.signedIn ? "ok" : "warn"} /> {gh.signedIn ? "Ready" : gh.ghInstalled ? "Sign in needed" : "Not installed"}
          </span>
        </div>
        {!gh.signedIn && (
          <div className="body">
            {!gh.ghInstalled ? (
              gh.canInstallGh ? (
                <div className="row">
                  <button disabled={busy} onClick={() => void run(async () => (await local.installGh(), refresh()))}>
                    {busy ? "Installing…" : "Install GitHub's tool"}
                  </button>
                </div>
              ) : (
                <p className="small">
                  Install GitHub's command line tool from <a href="https://cli.github.com" target="_blank" rel="noreferrer">cli.github.com</a>, then come back.
                </p>
              )
            ) : gh.deviceCode ? (
              <div>
                <p className="small" style={{ marginBottom: 8 }}>
                  On the GitHub page that just opened, enter this code:
                </p>
                <div className="row">
                  <span className="codebox" style={{ fontSize: 20, letterSpacing: "0.15em", margin: 0 }}>
                    {gh.deviceCode}
                  </span>
                  <Copy text={gh.deviceCode} />
                </div>
              </div>
            ) : gh.signingIn ? (
              <p className="small muted">Starting GitHub sign-in…</p>
            ) : (
              <>
                <div className="row">
                  <button className="primary" disabled={busy} onClick={() => void run(async () => (await local.githubSignIn(), refresh()))}>
                    {busy ? "Starting…" : "Sign in with GitHub"}
                  </button>
                </div>
                {gh.error && (
                  <p className="small">
                    <span className="error">GitHub sign-in didn't start: {gh.error}</span>
                  </p>
                )}
                <details open={!!gh.error}>
                  <summary className="small muted" style={{ cursor: "pointer" }}>
                    Or sign in from Terminal
                  </summary>
                  <p className="small" style={{ marginTop: 8 }}>
                    Open the Terminal app and run <span className="mono">gh auth login</span>. Choose GitHub.com, then HTTPS, then Yes, then
                    "Login with a web browser", and follow the steps. This page notices when you're done.
                  </p>
                </details>
              </>
            )}
          </div>
        )}
      </div>

      {gh.signedIn &&
        data.repos.map((r) => (
          <RepoCard
            key={r.repo}
            r={r}
            requested={!!requested[r.repo]}
            onRequest={() => void run(async () => (await local.requestAccess({ repo: r.repo }), setRequested((x) => ({ ...x, [r.repo]: true }))))}
            onUse={(path) => void run(async () => (await local.useFolder({ repo: r.repo, path }), refresh()))}
            onDownload={(pick) => void run(async () => (await local.downloadRepo({ repo: r.repo, pick }), refresh()))}
            onSkip={() => setSkipped((x) => ({ ...x, [r.repo]: true }))}
            busy={busy}
            defaultFolder={data.defaultFolder}
          />
        ))}

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={!gh.signedIn || !allReadable || !allPlaced} onClick={onDone}>
          Continue
        </button>
      </div>
    </>
  );
}

function RepoCard(p: {
  r: RepoState;
  requested: boolean;
  onRequest: () => void;
  onUse: (path: string) => void;
  onDownload: (pick: boolean) => void;
  onSkip: () => void;
  busy: boolean;
  defaultFolder: string;
}) {
  const { r } = p;
  const tilde = (s: string) => s.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~");
  return (
    <div className="tool">
      <div className="head">
        <span className="avatar agent" style={{ width: 36, height: 36 }}>
          <GitHubMark size={18} />
        </span>
        <span className="grow">
          <strong className="mono" style={{ fontSize: 14 }}>
            {r.repo}
          </strong>
          <div className="small muted">{r.localPath ? tilde(r.localPath) : "No copy on this computer yet"}</div>
        </span>
        <span className="state stat">
          <Dot tone={!r.canRead ? "warn" : r.localPath ? "ok" : "off"} /> {!r.canRead ? "No access yet" : r.localPath ? "Ready" : "Not downloaded"}
        </span>
      </div>
      {!r.canRead ? (
        <div className="body">
          {p.requested ? (
            <p className="small">
              Asked for access. As soon as they add you on GitHub, this continues by itself. <span className="muted">Checking every few seconds…</span>
            </p>
          ) : (
            <div className="row wrap">
              <span className="small grow">Your GitHub account can't open this repo yet.</span>
              <button className="primary" disabled={p.busy} onClick={p.onRequest}>
                Ask for access
              </button>
            </div>
          )}
        </div>
      ) : (
        !r.localPath && (
          <div className="body">
            {r.foundPath && (
              <div className="row wrap">
                <span className="small grow">
                  Found a copy at <span className="mono">{tilde(r.foundPath)}</span>
                </span>
                <button className="primary" disabled={p.busy} onClick={() => p.onUse(r.foundPath!)}>
                  Use this one
                </button>
              </div>
            )}
            <div className="row wrap">
              <button className={r.foundPath ? "" : "primary"} disabled={p.busy} onClick={() => p.onDownload(false)}>
                {p.busy ? "Downloading…" : `Download to ${tilde(p.defaultFolder)}`}
              </button>
              <button className="ghost" disabled={p.busy} onClick={() => p.onDownload(true)}>
                Choose a folder…
              </button>
              <button className="link small" onClick={p.onSkip}>
                Skip
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function JoinAgents({ state, onDone }: { state: SetupState; onDone: () => void }) {
  const me = state.me?.name ?? "me";
  const { busy, error, run } = useAction();
  return (
    <>
      <h1>Connect your AI</h1>
      <p className="lead">Pick the coding agents you use. They join the team under the names you choose.</p>
      <AgentCards
        seats={state.agents.map((a) => ({ engine: a.engine, id: a.id, defaultName: a.needsName ? `${me}-${a.engine}` : a.name, defaultUse: a.installed }))}
        busy={busy}
        error={error}
        submitLabel="Continue"
        onSubmit={(choices) =>
          void run(async () => {
            for (const c of choices) await local.setUpAgent({ id: c.id!, name: c.use ? c.name : undefined, use: c.use });
            onDone();
          })
        }
      />
    </>
  );
}

const HOURS = [1, 3, 8, 24];

function Consent({ state, onDone }: { state: SetupState; onDone: () => void }) {
  const [hours, setHours] = useState(3);
  const { busy, error, run } = useAction();
  const agents = state.agents.map((a) => a.name).join(" and ") || "Your agents";
  if (!state.followers) {
    return (
      <>
        <h1>Almost done</h1>
        <p className="lead">Your agents can assign work, so nothing needs to run in the background.</p>
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => void run(async () => (await local.finish({}), onDone()))}>
            Finish
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <h1>Let your agents work while you're away</h1>
      <p className="lead">
        {agents} will pick up the team's instructions on this computer, even when you're not here. Here's exactly what they may do.
      </p>
      <div className="panel">
        <span className="label">Allowed</span>
        <ul className="limits">
          <li>
            <Dot tone="ok" /> Work in their own copy of the repo, on their own branches
          </li>
          <li>
            <Dot tone="ok" /> Push those branches and open pull requests for review
          </li>
          <li>
            <Dot tone="ok" /> Post questions and progress in the team room
          </li>
        </ul>
        <span className="label">Never</span>
        <ul className="limits">
          <li>
            <Dot tone="bad" /> Push to main or production branches, or force-push
          </li>
          <li>
            <Dot tone="bad" /> Read or change secret files like .env.prod, or deploy anything
          </li>
          <li>
            <Dot tone="bad" /> Touch anything outside their copy of the repo
          </li>
        </ul>
      </div>
      <div className="panel">
        <span className="label">Daily limit</span>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          Agent work uses your Claude or ChatGPT plan. After this much work in a day, new instructions wait until tomorrow.
        </p>
        <div className="seg">
          {HOURS.map((h) => (
            <button key={h} className={hours === h ? "on" : ""} onClick={() => setHours(h)}>
              {h === 24 ? "No limit" : `${h} hour${h > 1 ? "s" : ""}`}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted">You can pause your agents any time from the room.</p>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="ghost" disabled={busy} onClick={() => void run(async () => (await local.finish({ background: false }), onDone()))}>
          Not now
        </button>
        <button className="primary" disabled={busy} onClick={() => void run(async () => (await local.finish({ background: true, maxHoursPerDay: hours }), onDone()))}>
          {busy ? "Turning on…" : "Turn on"}
        </button>
      </div>
    </>
  );
}

function Joined({ state, onOpen }: { state: SetupState; onOpen: () => void }) {
  return (
    <>
      <h1>You're in, {state.me?.name}</h1>
      <p className="lead">Your agents will say hello in the room in a minute, with what they understood about the project.</p>
      <div className="panel quiet">
        {state.agents.map((a) => (
          <Check key={a.id}>
            {a.name} is connected through {TOOL[a.engine].title}
          </Check>
        ))}
        {state.followers > 0 && (
          <Check tone={state.service === "running" ? "ok" : "warn"}>
            {state.service === "running" ? "Working in the background" : "Only working while AutoKolab is open"}
          </Check>
        )}
      </div>
      <div className="actions">
        <button className="primary" onClick={onOpen}>
          Open the room
        </button>
      </div>
    </>
  );
}
