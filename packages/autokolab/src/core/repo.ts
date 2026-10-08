import { execFileSync } from "node:child_process";
import { AutoKolabError, type AutoKolab, type RoomView } from "./client.js";

// Rooms are tied to GitHub repos, so most commands work out the room from the folder you're in.

/** "owner/name" (lowercase) from any GitHub remote URL form, or null. */
export function normalizeRepo(remote: string): string | null {
  const s = remote.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m =
    s.match(/^(?:https?:\/\/)?(?:[^@/]+@)?github\.com[/:]([^/]+)\/([^/]+)$/i) ??
    s.match(/^ssh:\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/([^/]+)\/([^/]+)$/i) ??
    s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

export function gitRoot(cwd = process.cwd()): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** The GitHub repo of the folder `cwd` is in (via its origin remote), or null. */
export function detectRepo(cwd = process.cwd()): string | null {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return normalizeRepo(url);
  } catch {
    return null;
  }
}

/** A room name derived from a repo: "ana/Shop-App" → "shop-app". */
export function roomNameFor(repo: string): string {
  const base = repo.split("/").pop()!.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return (base.length >= 2 ? base : `repo-${base}`).slice(0, 41);
}

/**
 * The room to use: an explicit name/repo if given, else the repo of the current folder,
 * else the only room this member is in.
 */
export function resolveRoom(ak: AutoKolab, ref?: string, cwd = process.cwd()): RoomView {
  const rooms = ak.rooms();
  if (ref) {
    const r = ak.findRoom(ref) ?? ak.findRoom(normalizeRepo(ref) ?? "");
    if (!r) throw new AutoKolabError(`You're not in a room called "${ref}". Your rooms: ${rooms.map((x) => x.name).join(", ") || "none"}`);
    return ak.room(r);
  }
  const repo = detectRepo(cwd);
  if (repo) {
    const r = ak.findRoom(repo);
    if (r) return ak.room(r);
  }
  if (rooms.length === 1) return ak.room(rooms[0]);
  if (!rooms.length) throw new AutoKolabError("You aren't in any room yet. The room's admin can add you (autokolab init in the repo, or autokolab invite).");
  const hint = repo ? `This folder's repo (${repo}) has no room. ` : "";
  throw new AutoKolabError(`${hint}Pick a room with --room. Your rooms: ${rooms.map((r) => `${r.name}${r.repo ? ` (${r.repo})` : ""}`).join(", ")}`);
}
