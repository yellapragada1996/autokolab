import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// One config file per machine, the same on macOS and Linux:
//   $XDG_CONFIG_HOME/autokolab/config.json  (default ~/.config/autokolab/config.json)
// `autokolab init` and `autokolab join` write it; people shouldn't need to edit it.
// Environment variables override it: AUTOKOLAB_URL, AUTOKOLAB_ANON_KEY, AUTOKOLAB_TOKEN,
// AUTOKOLAB_PROFILE, AUTOKOLAB_SERVICE_ROLE_KEY.

export interface Profile {
  token: string;
  /** Display name; the key in `profiles` is the member id, so renames never break anything. */
  name: string;
  kind: "human" | "agent";
  client?: string | null;
}

export interface ConfigFile {
  url?: string;
  anonKey?: string;
  /** Only on the admin's machine. Never give this to anyone. */
  serviceRoleKey?: string;
  /** Member id of the person using this machine. */
  me?: string;
  /** Member id → identity. A machine holds its person's identity plus their agents'. */
  profiles?: Record<string, Profile>;
  /** "owner/name" → this computer's copy of the repo (chosen or downloaded during setup). */
  repos?: Record<string, string>;
}

export interface ResolvedConfig {
  url: string;
  anonKey: string;
  token: string;
  profile: string;
}

export function configDir(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "autokolab");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

/** Per-agent runner limits: ~/.config/autokolab/runners/<agent>.toml */
export function runnersDir(): string {
  return join(configDir(), "runners");
}

export function stateDir(): string {
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "autokolab");
}

/** Clones and worktrees the runner manages. */
export function dataDir(): string {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "autokolab");
}

export function readConfigFile(): ConfigFile {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ConfigFile;
  } catch (e) {
    throw new Error(`Couldn't read ${p}: ${(e as Error).message}`);
  }
}

export function writeConfigFile(cfg: ConfigFile): string {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  chmodSync(p, 0o600);
  return p;
}

export function updateConfigFile(fn: (cfg: ConfigFile) => void): ConfigFile {
  const cfg = readConfigFile();
  fn(cfg);
  writeConfigFile(cfg);
  return cfg;
}

/** Find an identity on this machine by member id or name. */
export function findProfile(cfg: ConfigFile, ref: string): [string, Profile] | undefined {
  const entries = Object.entries(cfg.profiles ?? {});
  return entries.find(([id]) => id === ref) ?? entries.find(([, p]) => p.name === ref);
}

/** Identities on this machine, the person first. */
export function profilesOf(cfg: ConfigFile): (Profile & { id: string })[] {
  return Object.entries(cfg.profiles ?? {})
    .map(([id, p]) => ({ ...p, id }))
    .sort((a, b) => (a.id === cfg.me ? -1 : b.id === cfg.me ? 1 : a.name.localeCompare(b.name)));
}

/** Supabase shows its URL in several forms (e.g. ending in /rest/v1/); only the origin is used. */
export function supabaseOrigin(url: string): string {
  try {
    return new URL(url.trim()).origin;
  } catch {
    throw new Error("The Supabase URL doesn't look right. It should look like https://abcdefghijklmnop.supabase.co");
  }
}

export function resolveConfig(profileRef?: string): ResolvedConfig {
  const file = readConfigFile();
  const rawUrl = process.env.AUTOKOLAB_URL || file.url;
  const url = rawUrl ? supabaseOrigin(rawUrl) : undefined;
  const anonKey = process.env.AUTOKOLAB_ANON_KEY || file.anonKey;
  if (!url || !anonKey) {
    throw new Error("AutoKolab isn't set up on this machine yet. Run `autokolab init` (first person) or `autokolab join <invite>`.");
  }
  if (process.env.AUTOKOLAB_TOKEN) return { url, anonKey, token: process.env.AUTOKOLAB_TOKEN, profile: "env" };
  const ref = profileRef || process.env.AUTOKOLAB_PROFILE || file.me;
  const found = ref ? findProfile(file, ref) : undefined;
  if (!found) {
    const have = profilesOf(file).map((p) => p.name);
    throw new Error(`No AutoKolab identity "${ref ?? "?"}" on this machine.${have.length ? ` Available: ${have.join(", ")}.` : ""}`);
  }
  return { url, anonKey, token: found[1].token, profile: found[0] };
}

export function serviceRoleKey(): string {
  const key = process.env.AUTOKOLAB_SERVICE_ROLE_KEY || readConfigFile().serviceRoleKey;
  if (!key) {
    throw new Error("This needs the team admin's machine (the one that ran `autokolab init` with the Supabase secret key).");
  }
  return key;
}
