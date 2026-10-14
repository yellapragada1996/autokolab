import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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

const defaults: KeyLookup = { platform: process.platform, keychain: keychainRead, file: keyFile };

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
