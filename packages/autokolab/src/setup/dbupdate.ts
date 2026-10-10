import { readConfigFile, updateConfigFile, type ConfigFile } from "../core/config.js";
import { connectFromConfig } from "../core/node.js";
import { envFileKeys } from "./actions.js";
import { adminClient, applySchema, schemaFiles, schemaVersion, SCHEMA_VERSION } from "./team.js";
import { readState, writeState } from "./update.js";

// Database updates apply themselves (AK-32). Only the team admin's machine has the secret key and
// the database connection string. When its helper starts (which includes right after it updated
// itself, AK-31) it compares the live schema version with the one this code expects. Behind and
// auto_migrate on: apply the pending files in one transaction and say so in the room. Behind and
// off: tell the admin once in the room how to do it. `autokolab db update` runs the same code.

export type DbDecision =
  | { kind: "up-to-date"; version: number }
  /** The database is newer than this helper: never touch it. */
  | { kind: "ahead"; live: number; helper: number }
  /** Behind, and this machine can't update it (not the admin's, or no connection string). */
  | { kind: "behind"; live: number; helper: number }
  | { kind: "apply"; live: number; helper: number }
  /** Behind, automatic updates are off: tell the admin. */
  | { kind: "tell"; live: number; helper: number };

export interface DbFacts {
  live: number;
  helper: number;
  /** This machine has the secret key and a connection string. */
  admin: boolean;
  /** auto_migrate is on, or a person asked for it (`autokolab db update`). */
  auto: boolean;
}

export function decide(f: DbFacts): DbDecision {
  if (f.live === f.helper) return { kind: "up-to-date", version: f.live };
  if (f.live > f.helper) return { kind: "ahead", live: f.live, helper: f.helper };
  if (!f.admin) return { kind: "behind", live: f.live, helper: f.helper };
  return { kind: f.auto ? "apply" : "tell", live: f.live, helper: f.helper };
}

/** Off unless the admin turned it on: it changes the live database. */
export function autoMigrateOn(cfg: Pick<ConfigFile, "auto_migrate"> = readConfigFile()): boolean {
  return cfg.auto_migrate === true;
}

/** "012_merge_policy.sql" → "merge policy" */
export function fileLabel(name: string): string {
  return name.replace(/^.*\//, "").replace(/^\d+_/, "").replace(/\.sql$/, "").replace(/_/g, " ");
}

/** "version 12 (merge policy)", or "version 12 (agent model, merge policy)" for several files. */
export function versionLabel(live: number, helper: number, files: { version: number; path: string }[] = schemaFiles()): string {
  const names = files.filter((f) => f.version > live && f.version <= helper).map((f) => fileLabel(f.path));
  return names.length ? `version ${helper} (${names.join(", ")})` : `version ${helper}`;
}

export function appliedLine(live: number, helper: number, files?: { version: number; path: string }[]): string {
  return `Updated the database to ${versionLabel(live, helper, files)}.`;
}

export function tellLine(live: number, helper: number, files?: { version: number; path: string }[]): string {
  return `A database update is ready (${versionLabel(live, helper, files)}). Run \`autokolab db update\` or turn on automatic updates (\`autokolab db update --on\`).`;
}

export function aheadLine(live: number, helper: number): string {
  return `The database is at version ${live}, newer than this helper (version ${helper}). Update AutoKolab on this machine first (autokolab update); nothing was changed.`;
}

/** `autokolab status`'s line. */
export function dbStatusLine(live: number, helper: number): string {
  if (live === helper) return `Database: version ${live} (up to date)`;
  if (live > helper) return `Database: version ${live}, newer than this helper (${helper}): run \`autokolab update\``;
  return `Database: behind: ${live} → ${helper}`;
}

// ------------------------------------------------------------------ doing it

/** The connection string, from the environment or the .env next to the helper. Never printed. */
export function dbUrl(): string | undefined {
  return process.env.AUTOKOLAB_DB_URL || envFileKeys().dbUrl || undefined;
}

function hasSecretKey(cfg: ConfigFile): boolean {
  return !!(process.env.AUTOKOLAB_SERVICE_ROLE_KEY || cfg.serviceRoleKey);
}

/** The admin's machine: it has the secret key and a database connection string. */
export function isAdminMachine(cfg: ConfigFile = readConfigFile()): boolean {
  return hasSecretKey(cfg) && !!dbUrl();
}

/** The live schema version, read with the secret key on the admin's machine, else as this person. */
export async function liveVersion(cfg: ConfigFile = readConfigFile()): Promise<number> {
  if (hasSecretKey(cfg)) return schemaVersion(adminClient());
  if (!cfg.me) throw new Error("AutoKolab isn't set up on this machine yet.");
  const ak = await connectFromConfig(cfg.me);
  try {
    return await schemaVersion(ak.sb);
  } finally {
    await ak.close();
  }
}

export type DbResult = DbDecision | { kind: "applied"; live: number; version: number };

/**
 * Check the database and act on it. `byHand` is `autokolab db update`: apply even when automatic
 * updates are off. Throws (without the connection string) if applying fails; nothing is changed then.
 */
export async function checkDatabase(o: { byHand?: boolean; log?: (msg: string) => void } = {}): Promise<DbResult> {
  const cfg = readConfigFile();
  const live = await liveVersion(cfg);
  const d = decide({ live, helper: SCHEMA_VERSION, admin: isAdminMachine(cfg), auto: !!o.byHand || autoMigrateOn(cfg) });
  if (d.kind !== "apply") return d;
  o.log?.(`Updating the database from version ${d.live} to ${versionLabel(d.live, d.helper)}…`);
  const version = await applySchema(dbUrl()!, d.live);
  writeState({ db_told: undefined, db_failed: undefined });
  return { kind: "applied", live: d.live, version };
}

/** Post a quiet line to each of this machine's person's rooms. */
async function postToMyRooms(body: string): Promise<void> {
  const cfg = readConfigFile();
  if (!cfg.me) return;
  const ak = await connectFromConfig(cfg.me);
  try {
    for (const room of ak.rooms()) await ak.room(room).post({ kind: "status", body });
  } finally {
    await ak.close();
  }
}

/**
 * On the helper's start: update the database if this is the admin's machine and it's allowed to,
 * else tell the admin once per version. Never throws; problems go to `note`.
 */
export async function databaseOnStart(note: (msg: string) => void): Promise<void> {
  try {
    if (!isAdminMachine()) return;
    const r = await checkDatabase({ log: note });
    if (r.kind === "applied") {
      const line = appliedLine(r.live, r.version);
      note(line);
      await postToMyRooms(line);
    } else if (r.kind === "tell") {
      note(tellLine(r.live, r.helper));
      if (readState().db_told !== r.helper) {
        await postToMyRooms(tellLine(r.live, r.helper));
        writeState({ db_told: r.helper });
      }
    } else if (r.kind === "ahead") {
      note(aheadLine(r.live, r.helper));
    }
  } catch (e) {
    const msg = `Database update failed: ${(e as Error).message}`;
    note(msg);
    if (readState().db_failed !== SCHEMA_VERSION) {
      await postToMyRooms(msg.slice(0, 1000))
        .then(() => writeState({ db_failed: SCHEMA_VERSION }))
        .catch(() => undefined);
    }
  }
}

export function setAutoMigrate(on: boolean): void {
  updateConfigFile((c) => void (c.auto_migrate = on));
}
