import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { updateConfigFile } from "../core/config.js";
import { claudeBin, which, type Engine } from "./agents.js";
import { openBrowser } from "./open.js";

// What the setup page needs to check and do on this computer: the AI tools (installed? signed
// in?), GitHub (signed in? can read the repo?), and where the repo lives. Sign-ins always happen
// in the official pages of Anthropic, OpenAI and GitHub; AutoKolab only starts them.

const QUIET = { encoding: "utf8" as const, timeout: 20_000 };

// ---------------------------------------------------------------- AI tools

export interface ToolStatus {
  installed: boolean;
  signedIn: boolean;
  /** Set while a sign-in is waiting for a code the person copies from the browser. */
  needsCode?: boolean;
  signInUrl?: string;
}

const signIns = new Map<string, { proc: ChildProcess; url?: string; needsCode?: boolean; code?: string }>();

function bin(engine: Engine): string | null {
  return engine === "claude" ? claudeBin() : which("codex");
}

export function toolStatus(engine: Engine): ToolStatus {
  const b = bin(engine);
  if (!b) return { installed: false, signedIn: false };
  let signedIn = false;
  if (engine === "claude") {
    const r = spawnSync(b, ["auth", "status"], QUIET);
    try {
      signedIn = !!JSON.parse(r.stdout).loggedIn;
    } catch {
      signedIn = false;
    }
  } else {
    signedIn = spawnSync(b, ["login", "status"], QUIET).status === 0;
  }
  const pending = signIns.get(engine);
  if (signedIn && pending) {
    pending.proc.kill();
    signIns.delete(engine);
  }
  return { installed: true, signedIn, needsCode: !signedIn && pending?.needsCode, signInUrl: !signedIn ? pending?.url : undefined };
}

const PACKAGES: Record<Engine, string> = { claude: "@anthropic-ai/claude-code", codex: "@openai/codex" };

/** Install Claude Code or Codex with npm. Resolves when done. */
export function installTool(engine: Engine): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("npm", ["install", "-g", PACKAGES[engine]], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new Error(`Couldn't run npm: ${e.message}`)));
    p.on("close", (code) => {
      if (code === 0) return resolve();
      if (/EACCES|permission denied/i.test(err)) {
        return reject(new Error(`Installing needs permission. In a terminal run: sudo npm install -g ${PACKAGES[engine]}`));
      }
      reject(new Error(`Install failed: ${err.trim().split("\n").slice(-3).join(" ")}`));
    });
  });
}

/**
 * Start the official sign-in for Claude Code or Codex. Opens the browser; Claude may then show a
 * code that the person pastes back (submitToolCode).
 */
export function startToolSignIn(engine: Engine): Promise<ToolStatus> {
  const b = bin(engine);
  if (!b) throw new Error("Install it first.");
  signIns.get(engine)?.proc.kill();
  const args = engine === "claude" ? ["auth", "login"] : ["login"];
  const proc = spawn(b, args, { stdio: ["pipe", "pipe", "pipe"] }); // the tool opens the browser itself
  const entry: { proc: ChildProcess; url?: string; needsCode?: boolean } = { proc };
  signIns.set(engine, entry);
  return new Promise((resolve) => {
    let out = "";
    const onData = (d: Buffer) => {
      out += d.toString();
      const url = out.match(/https:\/\/\S+/)?.[0];
      if (url && !entry.url) entry.url = url; // shown as a link in case the browser didn't open
      if (/paste code/i.test(out)) entry.needsCode = true;
    };
    proc.stdout!.on("data", onData);
    proc.stderr!.on("data", onData);
    proc.on("close", () => {
      if (signIns.get(engine) === entry) signIns.delete(engine);
    });
    setTimeout(() => resolve(toolStatus(engine)), 2500);
  });
}

export function submitToolCode(engine: Engine, code: string): void {
  const s = signIns.get(engine);
  if (!s) throw new Error("Start the sign-in again.");
  s.proc.stdin!.write(code.trim() + "\n");
}

// ---------------------------------------------------------------- GitHub

export interface GitHubStatus {
  ghInstalled: boolean;
  signedIn: boolean;
  login: string | null;
  canInstallGh: boolean;
  /** One-time code to type at github.com/login/device while signing in. */
  deviceCode?: string;
}

let ghSignIn: { proc: ChildProcess; code?: string } | null = null;

export function githubStatus(): GitHubStatus {
  const gh = which("gh");
  const canInstallGh = platform() === "darwin" && !!which("brew");
  if (!gh) return { ghInstalled: false, signedIn: false, login: null, canInstallGh };
  const r = spawnSync("gh", ["api", "user", "--jq", ".login"], QUIET);
  const login = r.status === 0 ? r.stdout.trim() : null;
  if (login && ghSignIn) {
    ghSignIn.proc.kill();
    ghSignIn = null;
    spawnSync("gh", ["auth", "setup-git"], QUIET); // let plain git use the same sign-in
  }
  return { ghInstalled: true, signedIn: !!login, login, canInstallGh, deviceCode: !login ? ghSignIn?.code : undefined };
}

export function installGh(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!which("brew")) return reject(new Error("Install GitHub's tool from https://cli.github.com, then press Check again."));
    const p = spawn("brew", ["install", "gh"], { stdio: "ignore" });
    p.on("error", (e) => reject(e));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error("Couldn't install it. Get it from https://cli.github.com"))));
  });
}

/** GitHub's device sign-in: shows a code, opens github.com/login/device. */
export function startGitHubSignIn(): Promise<GitHubStatus> {
  if (!which("gh")) throw new Error("Install GitHub's tool first.");
  ghSignIn?.proc.kill();
  const proc = spawn("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--skip-ssh-key"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GH_BROWSER: "true", BROWSER: "true" }, // we open the page ourselves
  });
  const entry: { proc: ChildProcess; code?: string } = { proc };
  ghSignIn = entry;
  return new Promise((resolve) => {
    let out = "";
    const onData = (d: Buffer) => {
      out += d.toString();
      const code = out.match(/one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/)?.[1];
      if (code && !entry.code) {
        entry.code = code;
        proc.stdin!.write("\n");
        openBrowser("https://github.com/login/device");
      }
    };
    proc.stdout!.on("data", onData);
    proc.stderr!.on("data", onData);
    proc.on("close", () => {
      if (ghSignIn === entry) ghSignIn = null;
    });
    setTimeout(() => resolve(githubStatus()), 2500);
  });
}

export function canRead(repo: string): boolean {
  return spawnSync("gh", ["repo", "view", repo, "--json", "name"], QUIET).status === 0 ||
    spawnSync("git", ["ls-remote", "--heads", `https://github.com/${repo}.git`], { ...QUIET, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).status === 0;
}

/** Accept a pending GitHub invitation to this repo, if there is one. Returns true if accepted. */
export function acceptRepoInvitation(repo: string): boolean {
  const r = spawnSync("gh", ["api", "user/repository_invitations", "--jq", `.[] | select(.repository.full_name | ascii_downcase == "${repo}") | .id`], QUIET);
  const id = r.stdout.trim().split("\n")[0];
  if (r.status !== 0 || !id) return false;
  return spawnSync("gh", ["api", "-X", "PATCH", `user/repository_invitations/${id}`], QUIET).status === 0;
}

/** Admin: invite a GitHub user to the repo with write access, using this machine's GitHub sign-in. */
export function addCollaborator(repo: string, login: string): void {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Error("That isn't a GitHub username.");
  const r = spawnSync("gh", ["api", "-X", "PUT", `repos/${repo}/collaborators/${login}`, "-f", "permission=push"], QUIET);
  if (r.status !== 0) {
    const msg = r.stderr.trim();
    if (/404|Not Found/i.test(msg)) throw new Error(`You can't add people to ${repo} (only its owner or admins can).`);
    throw new Error(`GitHub said: ${msg.split("\n")[0]}`);
  }
}

// ---------------------------------------------------------------- folders

export function defaultReposFolder(): string {
  return join(homedir(), "AutoKolab");
}

/** The system folder picker (macOS, or Linux with zenity). Null if cancelled or unavailable. */
export function chooseFolder(prompt: string): string | null {
  try {
    if (platform() === "darwin") {
      const out = execFileSync("osascript", ["-e", `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`], { encoding: "utf8" });
      return out.trim().replace(/\/$/, "") || null;
    }
    if (which("zenity")) {
      const out = execFileSync("zenity", ["--file-selection", "--directory", `--title=${prompt}`], { encoding: "utf8" });
      return out.trim() || null;
    }
  } catch {
    /* cancelled */
  }
  return null;
}

/** Clone the repo into `parent/<name>` and remember it as this machine's copy. */
export function cloneInto(repo: string, parent: string): Promise<string> {
  const target = join(parent.replace(/^~(?=\/|$)/, homedir()), repo.split("/")[1]);
  if (existsSync(join(target, ".git"))) {
    rememberRepo(repo, target);
    return Promise.resolve(target);
  }
  mkdirSync(parent.replace(/^~(?=\/|$)/, homedir()), { recursive: true });
  return new Promise((resolve, reject) => {
    const useGh = !!which("gh");
    const p = useGh
      ? spawn("gh", ["repo", "clone", repo, target], { stdio: ["ignore", "ignore", "pipe"] })
      : spawn("git", ["clone", `https://github.com/${repo}.git`, target], { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    let err = "";
    p.stderr!.on("data", (d) => (err += d));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Download failed: ${err.trim().split("\n").pop()}`));
      rememberRepo(repo, target);
      resolve(target);
    });
  });
}

export function rememberRepo(repo: string, path: string): void {
  updateConfigFile((c) => {
    c.repos = { ...c.repos, [repo]: path };
  });
}
