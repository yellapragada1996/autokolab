import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { configDir } from "../core/config.js";

// Each run gets its own block of ports (AK-125), so two runs on one computer (two agents, or one
// agent's parallel tickets) can both start a dev server or tests without clashing. The blocks held
// right now are kept in one file per computer, under a lock, so two runners can't pick the same one.

export const PORT_COUNT = 10;
/** Blocks start here, below the ports macOS and Linux hand out on their own (32768 and up). */
export const FIRST_PORT = 20000;
const BLOCKS = 1000;
/** A hold older than this is from a run that ended without letting go. */
const HOLD_MAX_MS = 24 * 3600_000;
/** A lock older than this was left by a process that died holding it. */
const LOCK_STALE_MS = 30_000;

interface Hold {
  id: string;
  pid: number;
  ticket: string | null;
  at: number;
}

export interface PortBlock {
  /** The first port of the block. */
  port: number;
  count: number;
  /** The run's environment: AUTOKOLAB_PORT, AUTOKOLAB_PORT_COUNT and, for a ticket, AUTOKOLAB_TICKET. */
  env: Record<string, string>;
  /** Let the block go. Safe to call more than once. */
  release(): Promise<void>;
}

export interface PortOptions {
  /** Where the holds are kept; ~/.config/autokolab by default. */
  dir?: string;
  first?: number;
  blocks?: number;
  /** Whether nothing listens on a port; tests swap it. */
  isFree?: (port: number) => Promise<boolean>;
  now?: () => number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function listens(port: number, host?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.listen({ port, host, exclusive: true }, () => s.close(() => resolve(true)));
  });
}

/** Nothing listens on the port, on this computer's own address or on any. */
export async function portIsFree(port: number): Promise<boolean> {
  return (await listens(port, "127.0.0.1")) && (await listens(port));
}

async function withLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, "ports.lock");
  for (let i = 0; ; i++) {
    try {
      mkdirSync(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { recursive: true, force: true });
      } catch {
        /* let go meanwhile */
      }
      if (i > 400) throw new Error("Another run on this computer kept the port lock for too long.");
      await sleep(25);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function readHolds(file: string): Record<string, Hold> {
  try {
    const v = JSON.parse(readFileSync(file, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeHolds(file: string, holds: Record<string, Hold>): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(holds, null, 2)}\n`);
  renameSync(tmp, file);
}

/** Holds whose run is still going: its process is alive and it isn't a day old. */
function current(holds: Record<string, Hold>, now: number): Record<string, Hold> {
  return Object.fromEntries(Object.entries(holds).filter(([, h]) => h && alive(h.pid) && now - h.at < HOLD_MAX_MS));
}

/**
 * Hold a block of PORT_COUNT ports no other run on this computer holds and nothing listens on,
 * until release(). Null when every block is taken.
 */
export async function claimPorts(ticket: string | null, opts: PortOptions = {}): Promise<PortBlock | null> {
  const dir = opts.dir ?? configDir();
  const file = join(dir, "ports.json");
  const first = opts.first ?? FIRST_PORT;
  const blocks = opts.blocks ?? BLOCKS;
  const isFree = opts.isFree ?? portIsFree;
  const now = opts.now ?? Date.now;
  const id = randomUUID();

  const port = await withLock(dir, async () => {
    const holds = current(readHolds(file), now());
    for (let b = 0; b < blocks; b++) {
      const start = first + b * PORT_COUNT;
      if (holds[start]) continue;
      let free = true;
      for (let p = start; p < start + PORT_COUNT && free; p++) free = await isFree(p);
      if (!free) continue;
      holds[start] = { id, pid: process.pid, ticket, at: now() };
      writeHolds(file, holds);
      return start;
    }
    writeHolds(file, holds);
    return null;
  });
  if (port === null) return null;

  let released = false;
  const env: Record<string, string> = { AUTOKOLAB_PORT: String(port), AUTOKOLAB_PORT_COUNT: String(PORT_COUNT) };
  if (ticket) env.AUTOKOLAB_TICKET = ticket;
  return {
    port,
    count: PORT_COUNT,
    env,
    release: async () => {
      if (released) return;
      released = true;
      await withLock(dir, async () => {
        const holds = current(readHolds(file), now());
        if (holds[port]?.id === id) delete holds[port];
        writeHolds(file, holds);
      });
    },
  };
}
