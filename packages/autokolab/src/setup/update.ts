import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { readConfigFile, stateDir } from "../core/config.js";
import { connectFromConfig } from "../core/node.js";
import { CLI_PATH } from "./agents.js";

// The helper keeps itself up to date (AK-31). The installed helper is a git clone of the public
// repo at ~/.autokolab, built in place. The background service checks origin/main every 10
// minutes; when it's ahead and no agent is mid-run, it pulls, builds and restarts onto the new
// code. A failed pull or build goes back to the commit it was on. Dev checkouts are never touched.

export const UPSTREAM = "yellapragada1996/autokolab";
export const BRANCH = "main";
export const CHECK_MS = 10 * 60_000;
/** While an update waits for the agents to finish their runs, look again this often. */
export const IDLE_RETRY_MS = 60_000;

/** The repo folder this helper runs from: <root>/packages/autokolab/dist/cli.js. */
export function installRoot(cliPath = CLI_PATH): string {
  return resolve(dirname(cliPath), "..", "..", "..");
}

/** Where install.sh puts the helper: $AUTOKOLAB_DIR, or ~/.autokolab. */
export function installDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return env.AUTOKOLAB_DIR || join(home, ".autokolab");
}

/** Is this remote URL the public AutoKolab repo (https or ssh, with or without .git)? */
export function isUpstreamRemote(url: string): boolean {
  const m = url.trim().match(/github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  return !!m && m[1].toLowerCase() === UPSTREAM;
}

export interface CloneFacts {
  /** The folder the helper runs from, and the install folder, both with links resolved. */
  root: string;
  installDir: string;
  /** null when the folder isn't a git clone. */
  origin: string | null;
  branch: string | null;
  /** Changed tracked files: someone is editing this copy. */
  dirty: boolean;
}

/** Can this copy update itself? Only the installed clone of the public repo, on main, unedited. */
export function updatable(f: CloneFacts): { ok: true } | { ok: false; reason: string } {
  if (f.root !== f.installDir) return { ok: false, reason: `this is a developer copy (${f.root}), not the installed one; update it with git yourself` };
  if (f.origin === null) return { ok: false, reason: `${f.root} isn't a git clone` };
  if (!isUpstreamRemote(f.origin)) return { ok: false, reason: `${f.root} isn't a clone of github.com/${UPSTREAM}` };
  if (f.branch !== BRANCH) return { ok: false, reason: `${f.root} is on branch ${f.branch ?? "(none)"}, not ${BRANCH}` };
  if (f.dirty) return { ok: false, reason: `${f.root} has local changes` };
  return { ok: true };
}

export type AheadCheck = "up-to-date" | "behind" | "diverged";

/** From `git rev-list --left-right --count HEAD...origin/main`: commits only here, only there. */
export function aheadCheck(localOnly: number, remoteOnly: number): AheadCheck {
  if (remoteOnly === 0) return "up-to-date";
  return localOnly > 0 ? "diverged" : "behind";
}

/** An update may start only when no runner the service hosts has a run in progress. */
export function allIdle(runners: { idle(): boolean }[]): boolean {
  return runners.every((r) => r.idle());
}

/** npm next to the node that runs us (nvm, Homebrew), else whatever is on the PATH. */
export function npmBin(nodePath = process.execPath): string {
  const near = join(dirname(nodePath), "npm");
  return existsSync(near) ? near : "npm";
}

export type Step = string[];

/** What a build does (same as scripts/install.sh, without linking or opening the app). */
export function buildSteps(npm = npmBin()): Step[] {
  return [
    [npm, "ci", "--no-audit", "--no-fund", "--loglevel=error"],
    [npm, "run", "build", "--silent"],
  ];
}

export function pullSteps(): Step[] {
  return [["git", "pull", "--ff-only", "--quiet", "origin", BRANCH]];
}

/** After a failed pull or build: back to the commit we were on, and build that again. */
export function rollbackSteps(previous: string, npm = npmBin()): Step[] {
  return [["git", "reset", "--hard", "--quiet", previous], ...buildSteps(npm)];
}

// ------------------------------------------------------------------ state

/** What this machine remembers about updates: ~/.local/state/autokolab/update.json */
export interface UpdateState {
  /** The background service that checks for updates (so `autokolab update` can nudge it). */
  pid?: number;
  checked_at?: string;
  /** The version this machine last updated itself to, and when. */
  version?: string;
  updated_at?: string;
  /** The last version announced in the room: each is announced once. */
  announced?: string;
  /** The last version a failed update was announced for: each failure is announced once too. */
  failure_announced?: string;
  /** What the last attempt ended with, in plain English. */
  result?: string;
  result_at?: string;
  failed?: boolean;
  /** The schema version the admin was told is ready, and the one a failed database update was reported for (AK-32). */
  db_told?: number;
  db_failed?: number;
}

export function statePath(): string {
  return join(stateDir(), "update.json");
}

export function readState(): UpdateState {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8")) as UpdateState;
  } catch {
    return {};
  }
}

export function writeState(change: Partial<UpdateState>): UpdateState {
  const next = { ...readState(), ...change };
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(statePath(), JSON.stringify(next, null, 2) + "\n");
  return next;
}

/** On by default; `"auto_update": false` in ~/.config/autokolab/config.json turns it off. */
export function autoUpdateOn(cfg: { auto_update?: boolean } = readConfigFile()): boolean {
  return cfg.auto_update !== false;
}

/** The version to announce, if it hasn't been announced yet. */
export function toAnnounce(s: UpdateState): string | null {
  return s.version && s.version !== s.announced ? s.version : null;
}

export function machineName(person: string, os = platform()): string {
  return `${person}'s ${os === "darwin" ? "Mac" : "Linux computer"}`;
}

export function updatedLine(person: string, version: string, os = platform()): string {
  return `Updated AutoKolab on ${machineName(person, os)} to ${version}.`;
}

export function ago(fromIso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(fromIso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** `autokolab status`'s line, e.g. "Updates: automatic (last: d585ddd, 2h ago)". */
export function statusLine(on: boolean, s: UpdateState, now = Date.now()): string {
  const last = s.version && s.updated_at ? `last: ${s.version}, ${ago(s.updated_at, now)}` : "none yet";
  return `Updates: ${on ? "automatic" : "off (autokolab update --on turns them on)"} (${last})`;
}

// ------------------------------------------------------------------ doing it

function git(root: string, ...args: string[]): string | null {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

export function cloneFacts(root = installRoot()): CloneFacts {
  const inGit = git(root, "rev-parse", "--show-toplevel");
  return {
    root: real(root),
    installDir: real(installDir()),
    origin: inGit === null ? null : (git(root, "remote", "get-url", "origin") ?? ""),
    branch: git(root, "symbolic-ref", "--short", "-q", "HEAD"),
    dirty: (git(root, "status", "--porcelain", "--untracked-files=no") ?? "") !== "",
  };
}

export function shortHead(root = installRoot()): string | null {
  return git(root, "rev-parse", "--short", "HEAD");
}

/** Run one step without blocking the service; resolves with what went wrong, or null. */
function run(step: Step, cwd: string): Promise<string | null> {
  return new Promise((done) => {
    const [cmd, ...args] = step;
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, npm_config_update_notifier: "false" } });
    let out = "";
    const keep = (b: Buffer) => (out = (out + b.toString()).slice(-4000));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", (e) => done(`${cmd} couldn't start: ${e.message}`));
    child.on("close", (code) => done(code === 0 ? null : `\`${[cmd.split("/").pop(), ...args].join(" ")}\` failed${lastLine(out)}`));
  });
}

function lastLine(out: string): string {
  const lines = out.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length ? `: ${lines.slice(-3).join(" ").slice(0, 300)}` : "";
}

async function runAllSteps(steps: Step[], cwd: string): Promise<string | null> {
  for (const s of steps) {
    const err = await run(s, cwd);
    if (err) return err;
  }
  return null;
}

export type UpdateResult =
  | { kind: "skipped"; reason: string }
  | { kind: "up-to-date"; version: string }
  | { kind: "waiting"; version: string }
  | { kind: "updated"; from: string; version: string }
  | { kind: "failed"; reason: string; version: string | null };

export interface UpdateOptions {
  root?: string;
  /** Called right before changing anything: true means go ahead (and hold new runs until done). */
  claimIdle?: () => boolean;
  log?: (msg: string) => void;
  /** Tests only: skip the "is this the installed clone of the public repo" check. */
  anyClone?: boolean;
}

/** Check origin/main and, if it's ahead and we may, pull, build, and roll back on failure. */
export async function updateNow(o: UpdateOptions = {}): Promise<UpdateResult> {
  const root = o.root ?? installRoot();
  const log = o.log ?? (() => undefined);
  const facts = cloneFacts(root);
  const can = updatable(o.anyClone ? { ...facts, root: facts.installDir, origin: `https://github.com/${UPSTREAM}` } : facts);
  if (!can.ok) return { kind: "skipped", reason: can.reason };

  const fetchErr = await run(["git", "fetch", "--quiet", "origin", BRANCH], root);
  writeState({ checked_at: new Date().toISOString() });
  if (fetchErr) return failed(`couldn't check for updates: ${fetchErr}`, null);
  const counts = git(root, "rev-list", "--left-right", "--count", `HEAD...origin/${BRANCH}`)?.split(/\s+/).map(Number);
  const previous = git(root, "rev-parse", "HEAD");
  if (!counts || counts.length !== 2 || !previous) return failed("couldn't compare with origin/main", null);
  const next = git(root, "rev-parse", "--short", `origin/${BRANCH}`) ?? "?";
  const state = aheadCheck(counts[0], counts[1]);
  if (state === "up-to-date") return { kind: "up-to-date", version: shortHead(root) ?? "?" };
  if (state === "diverged") return failed(`${root} has commits that aren't on origin/main, so it can't fast-forward to ${next}`, next);
  if (o.claimIdle && !o.claimIdle()) return { kind: "waiting", version: next };

  const from = previous.slice(0, 7);
  log(`Updating AutoKolab from ${from} to ${next}…`);
  const err = (await runAllSteps(pullSteps(), root)) ?? (await runAllSteps(buildSteps(), root));
  if (err) {
    log(`Update to ${next} failed (${err}); going back to ${from}.`);
    const back = await runAllSteps(rollbackSteps(previous), root);
    const reason = back ? `${err}. Going back to ${from} also failed: ${back}` : `${err}. Still running ${from}.`;
    return failed(reason, next);
  }
  const version = shortHead(root) ?? next;
  writeState({ version, updated_at: new Date().toISOString(), result: `Updated from ${from} to ${version}.`, result_at: new Date().toISOString(), failed: false });
  return { kind: "updated", from, version };
}

function failed(reason: string, version: string | null): UpdateResult {
  writeState({ result: `Update failed: ${reason}`, result_at: new Date().toISOString(), failed: true });
  return { kind: "failed", reason, version };
}

/** Is the service process that wrote the state file still alive? */
export function servicePid(s = readState()): number | null {
  if (!s.pid) return null;
  try {
    process.kill(s.pid, 0);
    return s.pid;
  } catch {
    return null;
  }
}

/** Running as the background service (launchd or systemd), not in someone's terminal. */
export function runningAsService(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTOKOLAB_SERVICE === "1" || env.XPC_SERVICE_NAME === "com.autokolab.runner";
}

// ------------------------------------------------------------------ in the service

/** What the updater needs from each runner the service hosts. */
export interface Hosted {
  /** If no run is in progress, hold new ones and return true. */
  holdIfIdle(): boolean;
  release(): void;
  note(msg: string): void;
  stop(): Promise<void>;
}

/** Hold every runner, or none: an update starts only when all of them are idle. */
export function holdAll(runners: Hosted[]): boolean {
  const held: Hosted[] = [];
  for (const r of runners) {
    if (!r.holdIfIdle()) {
      for (const h of held) h.release();
      return false;
    }
    held.push(r);
  }
  return true;
}

/** Post a quiet line to each of the machine's person's rooms. */
async function announce(line: (person: string) => string): Promise<void> {
  const cfg = readConfigFile();
  if (!cfg.me) return;
  const ak = await connectFromConfig(cfg.me);
  try {
    for (const room of ak.rooms()) await ak.room(room).post({ kind: "status", body: line(ak.me.name) });
  } finally {
    await ak.close();
  }
}

function result(text: string, failed = false): void {
  writeState({ result: text, result_at: new Date().toISOString(), failed });
}

/**
 * The service's updater: says once in the room which version it's now on, checks on start and
 * every 10 minutes (or right away when `autokolab update` asks, with SIGUSR2), applies an update
 * when every runner is idle, and exits so launchd/systemd start it again on the new code.
 */
export function startUpdater(runners: Hosted[], exit: () => void = () => process.exit(0)): void {
  const note = (msg: string) => runners.forEach((r) => r.note(msg));

  const pending = toAnnounce(readState());
  if (pending) {
    void announce((person) => updatedLine(person, pending))
      .then(() => writeState({ announced: pending }))
      .catch((e) => note(`Couldn't say in the room that I updated: ${(e as Error).message}`));
  }

  if (!runningAsService()) {
    note("Automatic updates run in the background service only (autokolab service install).");
    return;
  }
  // Only the service takes SIGUSR2, so only it is named here for `autokolab update` to nudge.
  writeState({ pid: process.pid });
  if (!autoUpdateOn()) note("Automatic updates are off (autokolab update --on turns them on).");

  let updating = false;
  let retry: NodeJS.Timeout | null = null;
  let lastSkip = "";
  const check = async (asked: boolean) => {
    if (updating || (!asked && !autoUpdateOn())) return;
    updating = true;
    if (retry) clearTimeout(retry);
    retry = null;
    let held = false;
    try {
      const r = await updateNow({ claimIdle: () => (held = holdAll(runners)), log: note });
      if (r.kind === "skipped") {
        if (r.reason !== lastSkip || asked) note(`Not updating: ${r.reason}.`);
        lastSkip = r.reason;
        if (asked) result(`Not updating: ${r.reason}.`);
      } else if (r.kind === "up-to-date") {
        if (asked) result(`Already up to date (${r.version}).`);
      } else if (r.kind === "waiting") {
        note(`Update to ${r.version} is ready; waiting until no agent is mid-run.`);
        if (asked) result(`Update to ${r.version} is ready; it applies as soon as no agent is mid-run.`);
        retry = setTimeout(() => void check(asked), IDLE_RETRY_MS);
      } else if (r.kind === "failed") {
        note(`Update failed: ${r.reason}`);
        const version = r.version;
        if (version && readState().failure_announced !== version) {
          const still = shortHead() ?? "the old version";
          await announce((person) => `Couldn't update AutoKolab on ${machineName(person)} to ${version}; still running ${still}. ${r.reason}`.slice(0, 1000))
            .then(() => writeState({ failure_announced: version }))
            .catch(() => undefined);
        }
      } else {
        note(`Updated to ${r.version}. Restarting onto the new code.`);
        await Promise.all(runners.map((x) => x.stop().catch(() => undefined)));
        exit();
        return;
      }
    } catch (e) {
      note(`Update check failed: ${(e as Error).message}`);
    } finally {
      if (held) runners.forEach((x) => x.release());
      updating = false;
    }
  };

  process.on("SIGUSR2", () => void check(true));
  setTimeout(() => void check(false), 30_000).unref();
  setInterval(() => void check(false), CHECK_MS).unref();
}
