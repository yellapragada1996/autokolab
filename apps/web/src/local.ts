// Talks to the AutoKolab app running on this computer (`autokolab`), which does the setup work.
// Available only when the page was opened by it: the session code comes in the URL fragment
// (#s=…), optionally with an invite to join (&i=akinv_…).

const KEY = "autokolab.session";
const INVITE_KEY = "autokolab.invite";

export type Engine = "claude" | "codex";

export interface SetupState {
  keys: { url: string | null; hasPublicKey: boolean; hasSecretKey: boolean };
  database: "ready" | "missing" | "unknown";
  databaseError?: string;
  admin: boolean;
  me: { id: string; name: string; needsName: boolean } | null;
  agents: { id: string; name: string; engine: Engine; needsName: boolean; installed: boolean }[];
  engines: Record<Engine, boolean>;
  rooms: { id: string; name: string; repo: string | null }[];
  followers: number;
  service: "running" | "stopped" | "not-installed";
  ready: boolean;
}

export interface InviteResult {
  command: string;
  invite: string;
  expires: string;
  installLine: string | null;
}

export interface InvitePreview {
  invitedBy: string;
  rooms: string[];
  repos: string[];
  lead: boolean;
  expiresAt: string;
  used: boolean;
  expired: boolean;
}

export interface RepoSuggestion {
  path: string;
  repo: string;
}

export interface ToolStatus {
  installed: boolean;
  signedIn: boolean;
  needsCode?: boolean;
  signInUrl?: string;
}

export interface GitHubStatus {
  ghInstalled: boolean;
  signedIn: boolean;
  login: string | null;
  canInstallGh: boolean;
  deviceCode?: string;
}

export interface RepoState {
  repo: string;
  room: string;
  canRead: boolean;
  localPath: string | null;
  foundPath: string | null;
}

function readFragment(): { session: string | null; invite: string | null } {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const s = params.get("s");
  const i = params.get("i");
  if (s) {
    history.replaceState(null, "", location.pathname + location.search);
    try {
      sessionStorage.setItem(KEY, s);
      if (i) sessionStorage.setItem(INVITE_KEY, i);
    } catch {
      /* ignore */
    }
  }
  // Served by the AutoKolab app itself: the page's HTML carries the current session.
  const fromPage = document.querySelector<HTMLMetaElement>('meta[name="autokolab-session"]')?.content || null;
  try {
    return { session: s ?? fromPage ?? sessionStorage.getItem(KEY), invite: i ?? sessionStorage.getItem(INVITE_KEY) };
  } catch {
    return { session: s ?? fromPage, invite: i };
  }
}

const fragment = readFragment();

// Opening AutoKolab again hands this page a new session in the address; load it properly.
window.addEventListener("hashchange", () => {
  if (/(^#|&)s=/.test(location.hash)) location.reload();
});

/** Fired when the page's session no longer matches the running app (it was restarted). */
export const STALE_EVENT = "autokolab-stale";
const code = fragment.session;

/** True when this page was opened by the AutoKolab app on this computer. */
export const isLocal = !!code;
/** An invite handed over by the installer, to prefill the join page. */
export const pendingInvite = fragment.invite;
export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignore */
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method,
    headers: { "X-AutoKolab-Session": code ?? "", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({ error: "AutoKolab isn't responding. Is its Terminal window still open?" }));
  if (r.status === 401) window.dispatchEvent(new Event(STALE_EVENT));
  if (!r.ok) throw new Error(data?.error ?? "Something went wrong.");
  return data as T;
}

export const local = {
  state: () => call<SetupState>("GET", "state"),
  env: () => call<{ url: boolean; publicKey: boolean; secretKey: boolean; dbUrl: boolean }>("GET", "env"),
  suggestions: () => call<{ personName: string }>("GET", "suggestions"),
  schema: () => call<{ sql: string }>("GET", "schema"),
  repos: () => call<RepoSuggestion[]>("GET", "repos"),
  signIn: () => call<{ url: string; anonKey: string; token: string }>("GET", "signin"),
  saveKeys: (b: { url?: string; publicKey?: string; secretKey?: string }) => call<{ database: "ready" | "missing" }>("POST", "keys", b),
  setUpDatabase: (b: { dbUrl?: string }) => call<void>("POST", "database", b),
  createMe: (b: { name: string; agents: Partial<Record<Engine, string>> }) => call<void>("POST", "me", b),
  addRepo: (b: { path: string; addEveryone?: boolean; instructions?: boolean }) => call<{ room: string; repo: string; instructions: string[] }>("POST", "repos", b),
  invite: (b: { lead?: boolean }) => call<InviteResult>("POST", "invite", b),
  invites: () => call<{ id: number; label: string; expiresAt: string }[]>("GET", "invites"),
  cancelInvite: (b: { id: number }) => call<void>("POST", "invites/cancel", b),
  peekInvite: (b: { invite: string }) => call<InvitePreview>("POST", "invite/peek", b),
  join: (b: { invite: string }) => call<void>("POST", "join", b),
  rename: (b: { id: string; name: string }) => call<void>("POST", "rename", b),
  setUpAgent: (b: { id: string; name?: string; use: boolean }) => call<void>("POST", "agent", b),
  finish: (b: { background?: boolean; maxHoursPerDay?: number }) => call<{ service: string; repos: { repo: string; canRead: boolean }[] }>("POST", "finish", b),
  repoStates: () => call<{ github: GitHubStatus; repos: RepoState[]; defaultFolder: string }>("GET", "repo-states"),
  useFolder: (b: { repo: string; path: string }) => call<void>("POST", "repo/use", b),
  downloadRepo: (b: { repo: string; pick?: boolean }) => call<{ path: string }>("POST", "repo/download", b),
  requestAccess: (b: { repo: string }) => call<void>("POST", "access/request", b),
  grantAccess: (b: { repo: string; github: string }) => call<void>("POST", "access/grant", b),
  github: () => call<GitHubStatus>("GET", "github"),
  installGh: () => call<void>("POST", "github/install"),
  githubSignIn: () => call<GitHubStatus>("POST", "github/signin"),
  tools: () => call<Record<Engine, ToolStatus>>("GET", "tools"),
  installTool: (b: { engine: Engine }) => call<void>("POST", "tools/install", b),
  toolSignIn: (b: { engine: Engine }) => call<ToolStatus>("POST", "tools/signin", b),
  toolCode: (b: { engine: Engine; code: string }) => call<void>("POST", "tools/code", b),
};

export const NAME_RULE = (v: string) => (/^[a-z0-9][a-z0-9-]{1,40}$/.test(v) ? null : "Use lowercase letters, numbers and dashes, at least 2 characters.");
export const toName = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 41);
