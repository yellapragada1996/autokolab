import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { configDir } from "./config.js";

// An API-model agent's key (DEC-20, CON-25). It stays on its owner's computer: the macOS keychain
// (service "autokolab", account the agent's id), else ~/.config/autokolab/keys/<agent id> with mode
// 0600. Only the runner reads it, and only to hand it to the engine's process.

export function keysDir(): string {
  return join(configDir(), "keys");
}

export function keyFile(agentId: string): string {
  return join(keysDir(), agentId);
}

/** Where a key was found, for messages; never the key itself. */
export type KeySource = "keychain" | "file";

export interface KeyLookup {
  platform: NodeJS.Platform;
  /** The keychain read; returns null when there's no entry. */
  keychain: (agentId: string) => string | null;
  /** The key file's path. */
  file: (agentId: string) => string;
}

export interface KeyStore extends KeyLookup {
  /** Saves to the keychain; returns false when it can't (no keychain, locked, not a Mac). */
  keychainWrite: (agentId: string, key: string) => boolean;
  /** Removes the keychain entry; returns whether there was one. */
  keychainDelete: (agentId: string) => boolean;
}

function keychainRead(agentId: string): string | null {
  try {
    return execFileSync("security", ["find-generic-password", "-s", "autokolab", "-a", agentId, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
  } catch {
    return null; // No entry (or no keychain): the file is next.
  }
}

/**
 * `security` reads its commands from stdin in interactive mode (-i), so the key never appears in a
 * command line where other users could see it (ps). -U replaces an existing entry.
 */
function keychainWrite(agentId: string, key: string): boolean {
  const r = spawnSync("security", ["-i"], {
    input: `add-generic-password -U -s autokolab -a ${agentId} -w "${key}"\n`,
    stdio: ["pipe", "ignore", "ignore"],
    timeout: 10_000,
  });
  return r.status === 0 && keychainRead(agentId)?.trim() === key;
}

function keychainDelete(agentId: string): boolean {
  const r = spawnSync("security", ["delete-generic-password", "-s", "autokolab", "-a", agentId], { stdio: "ignore", timeout: 10_000 });
  return r.status === 0;
}

const defaults: KeyStore = { platform: process.platform, keychain: keychainRead, file: keyFile, keychainWrite, keychainDelete };

/**
 * Why a pasted key can't be one, in a plain sentence; null when it looks fine. API keys are one run
 * of printable characters; spaces, quotes or backslashes mean something else got pasted along.
 */
export function keyProblem(key: string): string | null {
  if (!key) return "No key was given.";
  if (key.length > 1000) return "That's too long to be an API key. Check you copied only the key.";
  if (!/^[\x21-\x7e]+$/.test(key) || /["'\\]/.test(key)) {
    return "That doesn't look like an API key: it has spaces, quotes or other characters keys don't have. Copy only the key.";
  }
  return null;
}

/**
 * Saves the agent's key (CON-25): the keychain on a Mac, otherwise (or when the keychain can't take
 * it) a file only its owner can read. Returns where it went. Never prints or logs the key.
 */
export function saveAgentKey(agentId: string, key: string, store: Partial<KeyStore> = {}): KeySource {
  const s = { ...defaults, ...store };
  const problem = keyProblem(key);
  if (problem) throw new Error(problem);
  const path = s.file(agentId);
  if (s.platform === "darwin" && s.keychainWrite(agentId, key)) {
    rmSync(path, { force: true }); // an older copy in a file would only be a second place to leak from
    return "keychain";
  }
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${key}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600); // whatever the umask
  renameSync(tmp, path);
  return "file";
}

/** Removes the agent's key from this computer, wherever it is. Returns whether there was one. */
export function removeAgentKey(agentId: string, store: Partial<KeyStore> = {}): boolean {
  const s = { ...defaults, ...store };
  const fromKeychain = s.platform === "darwin" && s.keychainDelete(agentId);
  let fromFile = true;
  try {
    rmSync(s.file(agentId));
  } catch {
    fromFile = false;
  }
  return fromKeychain || fromFile;
}

/**
 * The agent's key and where it came from. Throws a plain sentence when there is none, when the file
 * can be read by others than its owner, or when it's empty. The message never contains the key.
 */
export function readAgentKey(agentId: string, lookup: Partial<KeyLookup> = {}): { key: string; source: KeySource } {
  const l = { ...defaults, ...lookup };
  if (l.platform === "darwin") {
    const k = l.keychain(agentId)?.trim();
    if (k) return { key: k, source: "keychain" };
  }
  const path = l.file(agentId);
  let mode: number;
  try {
    mode = statSync(path).mode & 0o777;
  } catch {
    throw new Error(`I don't have an API key on this computer. Add one with \`autokolab key set\`.`);
  }
  if (mode & 0o077) {
    throw new Error(`My API key file (${path}) can be read by other users, so I won't use it. Run \`chmod 600 ${path}\` and try again.`);
  }
  let key: string;
  try {
    key = readFileSync(path, "utf8").trim();
  } catch (e) {
    throw new Error(`I couldn't read my API key file (${path}): ${(e as NodeJS.ErrnoException).code ?? "unknown error"}.`);
  }
  if (!key) throw new Error(`My API key file (${path}) is empty. Add the key with \`autokolab key set\`.`);
  return { key, source: "file" };
}
