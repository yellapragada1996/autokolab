import { envStopKind, envStopQuestion, type EnvStopKind } from "../core/projects.js";

// Before a build run starts its model, the runner proves it can deliver the work (AK-153): the
// worktree's Git folder is writable, this machine can reach GitHub, `gh` is signed in when it's the
// tool that opens pull requests, and the repo's setup script (AK-123) succeeded. An agent that can't
// commit, push or open a pull request would otherwise spend a whole run on work it can't hand in.
//
// It runs from the same context the runner delivers from (Git pointed at the worktree's real Git
// folder, the machine's own `gh`), which is as close as the runner can get to the engine's sandbox.
//
// A pass is remembered for a while, so a follow-up run doesn't repeat the checks; a failure holds
// the build, tells the machine's owner once, and is retried on its own without starting the model.

/** Why a build couldn't start, in AK-151's failure classes (AK-153). */
export type PreflightKind = "env_git" | "env_network" | "env_auth" | "env_setup";

export type PreflightResult = { ok: true } | PreflightFailure;

/** A preflight that didn't pass: what stopped the build, and why. */
export interface PreflightFailure {
  ok: false;
  kind: PreflightKind;
  why: string;
}

/** A passing preflight is trusted for this long, so a follow-up run doesn't pay for it again. */
export const PREFLIGHT_PASS_TTL_MS = 30 * 60_000;
/** A held build tries its preflight again after this long, without starting the model. */
export const PREFLIGHT_RETRY_MS = 10 * 60_000;
/** A single preflight command that hangs this long counts as a failure. */
export const PREFLIGHT_GIT_TIMEOUT_MS = 30_000;

/** The commands, injected so the checks can be tested without touching a real machine. */
export interface PreflightIo {
  /** Git against the worktree's real Git folder; throws with git's message on failure. */
  git(cwd: string, ...args: string[]): string;
  /** Whether `gh` is installed on this machine (the tool the runner opens pull requests with). */
  hasGh: boolean;
  /** Runs `gh`; never throws. */
  gh(args: string[]): { ok: boolean; out: string; err: string };
  /** A random token for the temp ref's name. */
  token(): string;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The checks, in order: the setup script that already ran, then a temp ref (a Git write), then
 * GitHub over `origin` (the network), then `gh`'s sign-in. The temp ref is removed either way.
 */
export function checkPreflight(io: PreflightIo, cwd: string, setupFailed?: string | null): PreflightResult {
  if (setupFailed) return { ok: false, kind: "env_setup", why: setupFailed };

  const ref = `refs/autokolab-preflight/${io.token()}`;
  try {
    io.git(cwd, "update-ref", ref, "HEAD");
  } catch (e) {
    return { ok: false, kind: "env_git", why: message(e) };
  }
  try {
    io.git(cwd, "update-ref", "-d", ref);
  } catch {
    // The temp ref couldn't be removed; it's harmless and no reason to hold the build.
  }

  try {
    io.git(cwd, "ls-remote", "--heads", "origin");
  } catch (e) {
    return { ok: false, kind: "env_network", why: message(e) };
  }

  if (io.hasGh) {
    const r = io.gh(["auth", "status"]);
    if (!r.ok) return { ok: false, kind: "env_auth", why: r.err.trim() || r.out.trim() || "gh isn't signed in to GitHub" };
  }
  return { ok: true };
}

const PREFLIGHT_STOP: Record<PreflightKind, EnvStopKind> = {
  env_git: "read-only-git",
  env_network: "no-network",
  env_auth: "no-auth",
  env_setup: "setup-failed",
};

/** The AK-149 stop kind a preflight failure is, so its sentence is the one the lead would write too. */
export function preflightStopKind(kind: PreflightKind): EnvStopKind {
  return PREFLIGHT_STOP[kind];
}

/**
 * One plain sentence for "Needs you", for the machine's owner. It's exactly the sentence the lead's
 * own runner writes for this stop (AK-149), so its rewrite changes nothing and the ticket clears
 * cleanly once the preflight passes (AK-153).
 */
export function preflightQuestion(agent: string, owner: string, kind: PreflightKind): string {
  return envStopQuestion(agent, owner, PREFLIGHT_STOP[kind]);
}

/** Whether a ticket's "Needs you" is this preflight's own stop, whatever exact words it uses. */
export function isPreflightQuestion(question: string | null | undefined, kind: PreflightKind): boolean {
  return envStopKind(question) === PREFLIGHT_STOP[kind];
}

/** A build held back by a failing preflight: retried at `until` without starting the model (AK-153). */
export interface PreflightHold {
  /** The ticket's project slug and key, so the retry can find it again. */
  project: string;
  key: string;
  /** When to try the preflight again (ms). */
  until: number;
  kind: PreflightKind;
  /** The plain sentence already put in "Needs you", so it's only written once. */
  question: string;
}

/** The held builds whose retry is due now. */
export function preflightDue(holds: Record<string, PreflightHold>, now = Date.now()): string[] {
  return Object.entries(holds)
    .filter(([, h]) => h.until <= now)
    .map(([id]) => id);
}

/** A per-worktree memory of a passing preflight (AK-153): a fresh pass skips the checks. */
export class PreflightCache {
  private passes = new Map<string, number>();

  constructor(private ttl = PREFLIGHT_PASS_TTL_MS) {}

  fresh(path: string, now = Date.now()): boolean {
    return (this.passes.get(path) ?? 0) > now;
  }

  pass(path: string, now = Date.now()): void {
    this.passes.set(path, now + this.ttl);
  }

  clear(path: string): void {
    this.passes.delete(path);
  }
}
