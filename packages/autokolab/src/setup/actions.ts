import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import {
  acceptRepoInvitation,
  addCollaborator,
  canRead,
  chooseFolder,
  cloneInto,
  defaultReposFolder,
  githubStatus,
  installTool,
  rememberRepo,
  startToolSignIn,
  submitToolCode,
  toolStatus,
  type GitHubStatus,
  type ToolStatus,
} from "./machine.js";
import { setDailyLimit } from "../runner/config.js";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AutoKolab } from "../core/client.js";
import { profilesOf, readConfigFile, supabaseOrigin, updateConfigFile, writeConfigFile, type ConfigFile } from "../core/config.js";
import { codeHash, decryptPayload, parseInvite } from "../core/invite.js";
import { connectFromConfig, nodeConnect, nodeSupabase } from "../core/node.js";
import { detectRepo, gitRoot, roomNameFor } from "../core/repo.js";
import type { InvitePayload } from "../core/invite.js";
import { findAccess } from "../runner/repos.js";
import { CLI_PATH, CLIENT_ENGINE, ENGINE_CLIENT, engineBin, installedEngines, register, writeInstructions, type Engine } from "./agents.js";
import { connectAgents, ENGINE_LABEL, needsRunner } from "./connect.js";
import { localTimezone, renameLocally, suggestedPersonName } from "./naming.js";
import { installService, serviceStatus } from "./service.js";
import {
  addToRoom,
  adminClient,
  applySchema,
  checkPublicKey,
  createInvite,
  ensureRoom,
  issueMember,
  loadTeam,
  schemaFiles,
  schemaVersion,
  SCHEMA_VERSION,
  usualRole,
} from "./team.js";
import { NAME_RULE } from "./ui.js";
import { randomBytes } from "node:crypto";

// Everything the setup page can do, as plain functions. The local app server (server.ts) calls
// these; errors are written for people, since the page shows them as they are.

export class UserError extends Error {}

const ENGINES: Engine[] = ["claude", "codex"];

// ---------------------------------------------------------------- state

export interface SetupState {
  keys: { url: string | null; hasPublicKey: boolean; hasSecretKey: boolean };
  database: "ready" | "missing" | "unknown";
  databaseError?: string;
  admin: boolean;
  me: { id: string; name: string; needsName: boolean } | null;
  agents: { id: string; name: string; engine: Engine; needsName: boolean; installed: boolean }[];
  engines: Record<Engine, boolean>;
  rooms: { id: string; name: string; repo: string | null; canRead: boolean | null }[];
  /** Agents on this machine that lead or follow in a room (they need the background runner to work while you're away). */
  followers: number;
  service: "running" | "stopped" | "not-installed";
  /** Fully set up: a named person with at least one room. */
  ready: boolean;
}

const placeholder = (name: string) => /^new-[0-9a-f]{6}(-|$)/.test(name);

export async function getState(): Promise<SetupState> {
  const cfg = readConfigFile();
  const engines = { claude: !!engineBin("claude"), codex: !!engineBin("codex") };
  const state: SetupState = {
    keys: { url: cfg.url ?? null, hasPublicKey: !!cfg.anonKey, hasSecretKey: !!cfg.serviceRoleKey },
    database: "unknown",
    admin: !!cfg.serviceRoleKey,
    me: null,
    agents: [],
    engines,
    rooms: [],
    followers: 0,
    service: serviceStatus(),
    ready: false,
  };
  if (cfg.url && cfg.serviceRoleKey) {
    try {
      state.database = (await schemaVersion(adminClient(cfg.url, cfg.serviceRoleKey))) >= SCHEMA_VERSION ? "ready" : "missing";
    } catch (e) {
      state.databaseError = (e as Error).message;
    }
  }
  if (cfg.me && cfg.profiles?.[cfg.me] && cfg.url && cfg.anonKey) {
    if (state.database === "unknown" && !cfg.serviceRoleKey) state.database = "ready";
    let ak: AutoKolab | null = null;
    try {
      ak = await connectFromConfig(cfg.me);
      state.me = { id: ak.me.id, name: ak.me.name, needsName: placeholder(ak.me.name) };
      for (const p of profilesOf(cfg).filter((x) => x.kind === "agent")) {
        const engine = CLIENT_ENGINE[p.client ?? ""];
        const m = ak.member(p.id);
        if (!engine || !m || m.revoked) continue;
        state.agents.push({ id: m.id, name: m.name, engine, needsName: placeholder(m.name), installed: engines[engine] });
        if (needsRunner(ak.rooms().map((r) => ak!.membership(r.id, m.id)?.role))) state.followers++;
      }
      state.rooms = ak.rooms().map((r) => ({ id: r.id, name: r.name, repo: r.repo, canRead: null }));
    } catch (e) {
      state.databaseError = (e as Error).message;
    } finally {
      await ak?.close();
    }
  }
  state.ready = !!state.me && !state.me.needsName && !state.agents.some((a) => a.needsName) && state.rooms.length > 0;
  return state;
}

// ---------------------------------------------------------------- starting a team

/** Values found in a .env file next to the AutoKolab install (filled in by hand earlier). */
export function envFileKeys(): Partial<Record<"url" | "publicKey" | "secretKey" | "dbUrl", string>> {
  const path = join(dirname(CLI_PATH), "..", "..", "..", ".env");
  if (!existsSync(path)) return {};
  const vals: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) vals[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return {
    url: vals.AUTOKOLAB_URL,
    publicKey: vals.AUTOKOLAB_ANON_KEY,
    secretKey: vals.AUTOKOLAB_SERVICE_ROLE_KEY,
    dbUrl: vals.AUTOKOLAB_DB_URL,
  };
}

export async function saveKeys(input: { url?: string; publicKey?: string; secretKey?: string }): Promise<{ database: "ready" | "missing" }> {
  const env = envFileKeys();
  const cfg = readConfigFile();
  const rawUrl = input.url?.trim() || env.url || cfg.url;
  const publicKey = input.publicKey?.trim() || env.publicKey || cfg.anonKey;
  const secretKey = input.secretKey?.trim() || env.secretKey || cfg.serviceRoleKey;
  if (!rawUrl || !publicKey || !secretKey) throw new UserError("Fill in all three: the project URL, the publishable key and the secret key.");
  let url: string;
  try {
    url = supabaseOrigin(rawUrl);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  let version: number;
  try {
    version = await schemaVersion(adminClient(url, secretKey));
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  if (version >= SCHEMA_VERSION) {
    try {
      await checkPublicKey(url, publicKey);
    } catch (e) {
      throw new UserError((e as Error).message);
    }
  }
  writeConfigFile({ ...cfg, url, anonKey: publicKey, serviceRoleKey: secretKey });
  return { database: version >= SCHEMA_VERSION ? "ready" : "missing" };
}

export function schemaSql(): string {
  return schemaFiles()
    .map((f) => f.sql)
    .join("\n\n");
}

export async function setUpDatabase(input: { dbUrl?: string }): Promise<void> {
  const cfg = readConfigFile();
  if (!cfg.url || !cfg.serviceRoleKey) throw new UserError("Connect your Supabase project first.");
  const sb = adminClient(cfg.url, cfg.serviceRoleKey);
  let version = await schemaVersion(sb);
  if (version < SCHEMA_VERSION) {
    const dbUrl = input.dbUrl?.trim() || envFileKeys().dbUrl;
    if (!dbUrl) throw new UserError("Paste the connection string, or run the SQL in Supabase's SQL editor and try again.");
    try {
      version = await applySchema(dbUrl, version);
    } catch (e) {
      throw new UserError((e as Error).message);
    }
    for (let i = 0; i < 10 && (await schemaVersion(sb)) < SCHEMA_VERSION; i++) await new Promise((r) => setTimeout(r, 1000));
  }
  if ((await schemaVersion(sb)) < SCHEMA_VERSION) throw new UserError("The tables still aren't there. If you ran the SQL by hand, give it a few seconds and try again.");
  await checkPublicKey(cfg.url, cfg.anonKey!).catch((e) => {
    throw new UserError((e as Error).message);
  });
}

function checkName(name: string, takenBy: { name: string }[]): string {
  const n = name.trim();
  const rule = NAME_RULE(n);
  if (rule) throw new UserError(rule);
  if (takenBy.some((m) => m.name === n)) throw new UserError(`"${n}" is already taken. Pick another.`);
  return n;
}

/** Admin: create the person using this machine and an agent per chosen tool. */
export async function createTeamMember(input: { name: string; agents: Partial<Record<Engine, string>> }): Promise<void> {
  const cfg = readConfigFile();
  if (!cfg.serviceRoleKey) throw new UserError("Only the person who set up the team can do this.");
  const sb = adminClient();
  const team = await loadTeam(sb);
  const tz = localTimezone() ?? null;
  const live = team.members.filter((m) => !m.revoked);

  let meId = cfg.me && team.members.some((m) => m.id === cfg.me && !m.revoked) ? cfg.me : undefined;
  if (!meId) {
    const name = checkName(input.name, live);
    const { member, token } = await issueMember({ name, kind: "human", client: "web", timezone: tz }, team, sb);
    meId = member.id;
    updateConfigFile((c) => {
      c.me = member.id;
      c.profiles = { ...c.profiles, [member.id]: { token, name, kind: "human", client: "web" } };
    });
  }
  for (const e of ENGINES) {
    const wanted = input.agents[e]?.trim();
    if (!wanted) continue;
    const have = profilesOf(readConfigFile()).find((p) => p.kind === "agent" && p.client === ENGINE_CLIENT[e]);
    if (have && team.members.some((m) => m.id === have.id && !m.revoked)) continue;
    const name = checkName(wanted, team.members.filter((m) => !m.revoked));
    const { member, token } = await issueMember({ name, kind: "agent", client: ENGINE_CLIENT[e], ownerId: meId, timezone: tz }, team, sb);
    updateConfigFile((c) => {
      c.profiles = { ...c.profiles, [member.id]: { token, name, kind: "agent", client: ENGINE_CLIENT[e] } };
    });
    register(e, member.id);
  }
}

// ---------------------------------------------------------------- repos

export interface RepoSuggestion {
  path: string;
  repo: string;
}

const SEARCH_ROOTS = ["Documents", "Projects", "projects", "code", "Code", "src", "dev", "Developer", "GitHub", "git", "repos", "work", "Desktop"];
const SKIP = new Set(["node_modules", "Library", "Applications", "Pictures", "Music", "Movies", "dist", "build", "vendor", "target"]);

/** Git repos with a GitHub remote in the usual places under the home folder. */
export function suggestRepos(): RepoSuggestion[] {
  const found = new Map<string, RepoSuggestion>();
  let budget = 3000;
  const walk = (dir: string, depth: number) => {
    if (budget-- <= 0 || depth > 3) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes(".git")) {
      const repo = detectRepo(dir);
      if (repo && !found.has(repo)) found.set(repo, { path: dir, repo });
      return;
    }
    for (const e of entries) {
      if (e.startsWith(".") || SKIP.has(e)) continue;
      const p = join(dir, e);
      try {
        if (statSync(p).isDirectory()) walk(p, depth + 1);
      } catch {
        /* unreadable */
      }
    }
  };
  for (const r of SEARCH_ROOTS) {
    const p = join(homedir(), r);
    if (existsSync(p)) walk(p, 1);
  }
  return [...found.values()].sort((a, b) => a.repo.localeCompare(b.repo));
}

/** Admin: make a room for the repo at `path` (or "owner/name"), with you and your agents leading. */
export async function addRepo(input: { path: string; addEveryone?: boolean; instructions?: boolean }): Promise<{ room: string; repo: string; instructions: string[] }> {
  const cfg = readConfigFile();
  if (!cfg.serviceRoleKey || !cfg.me) throw new UserError("Only the person who set up the team can add repos.");
  const raw = input.path.trim().replace(/^~(?=\/|$)/, homedir());
  const root = existsSync(raw) ? gitRoot(raw) : null;
  const repo = root ? detectRepo(root) : null;
  if (existsSync(raw) && !root) throw new UserError("That folder isn't a git repository.");
  if (root && !repo) throw new UserError("That repo has no GitHub remote (origin). Push it to GitHub first.");
  if (!repo) throw new UserError("Pick a folder from the list, or paste the full path to your repo.");

  const sb = adminClient();
  const team = await loadTeam(sb);
  const { room } = await ensureRoom(repo, roomNameFor(repo), team, sb);
  await addToRoom(room.id, cfg.me, "human", true, team, sb);
  const mine = profilesOf(cfg).filter((p) => p.kind === "agent");
  for (const a of mine) if (team.members.some((m) => m.id === a.id && !m.revoked)) await addToRoom(room.id, a.id, "lead", true, team, sb);
  if (input.addEveryone !== false) {
    for (const m of team.members) {
      if (m.revoked || m.owner_id === cfg.me || team.memberships.some((x) => x.room_id === room.id && x.member_id === m.id)) continue;
      const usual = usualRole(team, m.id) ?? { role: m.kind === "agent" ? "follower" : "human", canInstruct: false };
      await addToRoom(room.id, m.id, usual.role, usual.canInstruct, team, sb);
    }
  }
  const instructions = root && input.instructions !== false ? writeInstructions(root) : [];
  return { room: room.name, repo, instructions };
}

// ---------------------------------------------------------------- invites

export async function invite(input: { lead?: boolean; days?: number }): Promise<{ command: string; invite: string; expires: string; installLine: string | null }> {
  const cfg = readConfigFile();
  if (!cfg.serviceRoleKey) throw new UserError("Only the person who set up the team can invite people.");
  const sb = adminClient();
  const team = await loadTeam(sb);
  if (!team.rooms.length) throw new UserError("Add a repo first, so there's a room to invite them to.");
  const lead = !!input.lead;
  const seat = `new-${randomBytes(3).toString("hex")}`;
  const payload: InvitePayload = { tokens: {}, members: [], invitedBy: team.members.find((m) => m.id === cfg.me)?.name ?? "your team" };
  const person = await issueMember({ name: seat, kind: "human", client: "web" }, team, sb);
  const seats = [{ client: "web", issued: person }];
  for (const e of ENGINES) {
    seats.push({ client: ENGINE_CLIENT[e], issued: await issueMember({ name: `${seat}-${e}`, kind: "agent", client: ENGINE_CLIENT[e], ownerId: person.member.id }, team, sb) });
  }
  for (const s of seats) {
    const m = s.issued.member;
    payload.tokens[m.id] = s.issued.token;
    payload.members.push({ id: m.id, kind: m.kind, client: s.client });
    for (const room of team.rooms) {
      if (m.kind === "human") await addToRoom(room.id, m.id, "human", lead, team, sb);
      else await addToRoom(room.id, m.id, lead ? "lead" : "follower", lead, team, sb);
    }
  }
  const info = {
    invited_by: payload.invitedBy,
    rooms: team.rooms.map((r) => r.name),
    repos: team.rooms.map((r) => r.repo).filter(Boolean),
    lead,
  };
  const { invite: code, expires } = await createInvite({ url: cfg.url!, anonKey: cfg.anonKey!, payload, days: input.days ?? 7, label: seat, info }, sb);
  const source = detectRepo(dirname(CLI_PATH));
  // One line does everything: get AutoKolab (or update it), install it, and open the join page.
  const installLine = source
    ? `(git clone -q https://github.com/${source}.git ~/.autokolab 2>/dev/null || git -C ~/.autokolab pull -q) && ~/.autokolab/scripts/install.sh ${code}`
    : null;
  return { command: `autokolab join ${code}`, invite: code, expires: expires.toISOString(), installLine };
}

// ---------------------------------------------------------------- joining

export interface InvitePreview {
  invitedBy: string;
  rooms: string[];
  repos: string[];
  lead: boolean;
  expiresAt: string;
  used: boolean;
  expired: boolean;
}

/** What an invite is for, without using it up. */
export async function peekInvite(input: { invite: string }): Promise<InvitePreview> {
  let link;
  try {
    link = parseInvite(input.invite);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  const { data, error } = await nodeSupabase(link.url, link.anonKey).rpc("peek_invite", { code_hash: codeHash(link.code) });
  if (error) throw new UserError(error.message.replace(/^.*AUTOKOLAB_INVITE:\s*/, ""));
  const d = data as Record<string, unknown>;
  return {
    invitedBy: String(d.invited_by ?? "Your team"),
    rooms: (d.rooms as string[]) ?? [],
    repos: (d.repos as string[]) ?? [],
    lead: !!d.lead,
    expiresAt: String(d.expires_at),
    used: !!d.used,
    expired: !!d.expired,
  };
}

/** Admin: invites not used yet. */
export async function listInvites(): Promise<{ id: number; label: string; expiresAt: string }[]> {
  const sb = adminClient();
  const { data, error } = await sb.from("invites").select("id, person, expires_at, used_at").is("used_at", null).gt("expires_at", new Date().toISOString()).order("id");
  if (error) throw new UserError(error.message);
  return (data as { id: number; person: string; expires_at: string }[]).map((i) => ({ id: i.id, label: i.person, expiresAt: i.expires_at }));
}

/** Admin: cancel an unused invite and remove its placeholder seats. */
export async function cancelInvite(input: { id: number }): Promise<void> {
  const sb = adminClient();
  const { data, error } = await sb.from("invites").select("person, used_at").eq("id", input.id).maybeSingle();
  if (error || !data) throw new UserError("That invite no longer exists.");
  if (data.used_at) throw new UserError("That invite was already used.");
  await sb.from("invites").delete().eq("id", input.id);
  const team = await loadTeam(sb);
  const seats = team.members.filter((m) => m.name === data.person || m.name.startsWith(`${data.person}-`));
  for (const m of seats) {
    await sb.from("members").update({ revoked: true }).eq("id", m.id);
    await sb.auth.admin.updateUserById(m.id, { ban_duration: "876000h" }).catch(() => undefined);
  }
}

export async function redeem(input: { invite: string }): Promise<void> {
  let link;
  try {
    link = parseInvite(input.invite);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  const anon = nodeSupabase(link.url, link.anonKey);
  const { data: blob, error } = await anon.rpc("redeem_invite", { code_hash: codeHash(link.code) });
  if (error) throw new UserError(error.message.replace(/^.*AUTOKOLAB_INVITE:\s*/, ""));
  const payload = decryptPayload(blob as string, link.code);
  const person = payload.members.find((m) => m.kind === "human")!;
  const cfg: ConfigFile = readConfigFile();
  if (cfg.url && cfg.url !== link.url) cfg.profiles = {};
  cfg.url = link.url;
  cfg.anonKey = link.anonKey;
  cfg.me = person.id;
  cfg.profiles = { ...cfg.profiles };
  for (const m of payload.members) cfg.profiles[m.id] = { token: payload.tokens[m.id], name: m.id.slice(0, 8), kind: m.kind, client: m.client };
  writeConfigFile(cfg);
  const ak = await nodeConnect({ url: cfg.url, anonKey: cfg.anonKey, token: payload.tokens[person.id] });
  try {
    for (const m of payload.members) renameLocally(m.id, ak.nameOf(m.id));
    await ak.updateMember(person.id, { timezone: localTimezone() }).catch(() => undefined);
  } finally {
    await ak.close();
  }
}

async function retire(ak: AutoKolab, id: string): Promise<void> {
  await ak.updateMember(id, { retire: true });
  updateConfigFile((c) => void delete c.profiles?.[id]);
}

// ---------------------------------------------------------------- this computer: repos and access

export interface RepoState {
  repo: string;
  room: string;
  canRead: boolean;
  localPath: string | null;
  foundPath: string | null;
}

export async function repoStates(): Promise<{ github: GitHubStatus; repos: RepoState[]; defaultFolder: string }> {
  const cfg = readConfigFile();
  const ak = await connectFromConfig(cfg.me);
  try {
    const github = githubStatus();
    const found = new Map(suggestRepos().map((r) => [r.repo, r.path]));
    const repos = ak
      .rooms()
      .filter((r) => r.repo)
      .map((r) => {
        const repo = r.repo!;
        let readable = github.signedIn ? canRead(repo) : false;
        if (!readable && github.signedIn && acceptRepoInvitation(repo)) readable = canRead(repo);
        const local = cfg.repos?.[repo];
        return {
          repo,
          room: r.name,
          canRead: readable,
          localPath: local && existsSync(join(local, ".git")) ? local : null,
          foundPath: found.get(repo) ?? null,
        };
      });
    return { github, repos, defaultFolder: defaultReposFolder() };
  } finally {
    await ak.close();
  }
}

/** Ask the team admin (in the room) to add this person on GitHub. */
export async function requestAccess(input: { repo: string }): Promise<void> {
  const gh = githubStatus();
  if (!gh.login) throw new UserError("Sign in to GitHub first.");
  const ak = await connectFromConfig(readConfigFile().me);
  try {
    const room = ak.rooms().find((r) => r.repo === input.repo);
    if (!room) throw new UserError("You're not in a room for that repo.");
    const admin = ak.membersOf(room.id).find((m) => m.kind === "human" && m.can_instruct && m.id !== ak.me.id);
    await ak.room(room).post({
      kind: "chat",
      to: admin?.id ?? null,
      body: `Please give me access to github.com/${input.repo} (my GitHub is @${gh.login}).`,
      refs: { access_request: { repo: input.repo, github: gh.login } },
    });
  } finally {
    await ak.close();
  }
}

/** Admin: add a teammate to the GitHub repo (from an access request). */
export async function grantAccess(input: { repo: string; github: string }): Promise<void> {
  try {
    addCollaborator(input.repo, input.github);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
}

export async function useFolder(input: { repo: string; path: string }): Promise<void> {
  const path = input.path.replace(/^~(?=\/|$)/, homedir());
  const root = existsSync(path) ? gitRoot(path) : null;
  if (!root) throw new UserError("That folder isn't a copy of the repo.");
  if (detectRepo(root) !== input.repo) throw new UserError(`That folder is a different repo (${detectRepo(root) ?? "no GitHub remote"}).`);
  rememberRepo(input.repo, root);
}

export async function downloadRepo(input: { repo: string; pick?: boolean }): Promise<{ path: string }> {
  let parent = defaultReposFolder();
  if (input.pick) {
    const chosen = chooseFolder("Where should AutoKolab put the repo?");
    if (!chosen) throw new UserError("No folder chosen.");
    parent = chosen;
  }
  try {
    return { path: await cloneInto(input.repo, parent) };
  } catch (e) {
    throw new UserError((e as Error).message);
  }
}

// ---------------------------------------------------------------- this computer: AI tools

export function tools(): Record<Engine, ToolStatus> {
  return { claude: toolStatus("claude"), codex: toolStatus("codex") };
}

export async function installAgentTool(input: { engine: Engine }): Promise<void> {
  try {
    await installTool(input.engine);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
}

export async function signInAgentTool(input: { engine: Engine }): Promise<ToolStatus> {
  try {
    return await startToolSignIn(input.engine);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
}

export function agentToolCode(input: { engine: Engine; code: string }): void {
  try {
    submitToolCode(input.engine, input.code);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
}

/** Joiner: keep an agent seat (with a name) or let it go. */
export async function setUpAgent(input: { id: string; name?: string; use: boolean }): Promise<void> {
  if (!input.use) return removeAgent({ id: input.id });
  if (input.name) await rename({ id: input.id, name: input.name });
  const p = readConfigFile().profiles?.[input.id];
  const engine = CLIENT_ENGINE[p?.client ?? ""];
  if (engine) register(engine, input.id);
}

/** Name yourself or one of your agents (also used for joiners' placeholder names). */
export async function rename(input: { id: string; name: string }): Promise<void> {
  const cfg = readConfigFile();
  const ak = await connectFromConfig(cfg.me);
  try {
    const name = input.name.trim();
    const rule = NAME_RULE(name);
    if (rule) throw new UserError(rule);
    try {
      await ak.updateMember(input.id, { name, timezone: localTimezone() });
    } catch (e) {
      throw new UserError((e as Error).message);
    }
    renameLocally(input.id, name);
    const p = readConfigFile().profiles?.[input.id];
    const engine = CLIENT_ENGINE[p?.client ?? ""];
    if (p?.kind === "agent" && engine) register(engine, input.id);
  } finally {
    await ak.close();
  }
}

export async function removeAgent(input: { id: string }): Promise<void> {
  const ak = await connectFromConfig(readConfigFile().me);
  try {
    await retire(ak, input.id);
  } finally {
    await ak.close();
  }
}

/** Connect this machine's agents and (optionally) start the background runner. */
export async function finishMachine(input: { background?: boolean; maxHoursPerDay?: number }): Promise<{ service: string; repos: { repo: string; canRead: boolean }[] }> {
  const cfg = readConfigFile();
  const ak = await connectFromConfig(cfg.me);
  try {
    const runners = connectAgents(ak, cfg);
    if (input.maxHoursPerDay) for (const f of runners) setDailyLimit(f.id, input.maxHoursPerDay);
    let service: string = serviceStatus();
    if (runners.length && input.background) {
      const s = installService();
      if (!s.ok) throw new UserError(s.message);
      service = "running";
    }
    const repos = ak.rooms().filter((r) => r.repo).map((r) => ({ repo: r.repo!, canRead: !!findAccess(r.repo!) }));
    const me = ak.me.name;
    const agents = profilesOf(readConfigFile()).filter((p) => p.kind === "agent").map((p) => p.name);
    for (const r of ak.rooms()) {
      const already = (await ak.room(r).recent(50)).some((m) => m.sender_id === ak.me.id && m.body.startsWith(`${me} joined`));
      if (!already) await ak.room(r).post({ kind: "chat", body: `${me} joined${agents.length ? ` with ${agents.join(" and ")}` : ""}.` }).catch(() => undefined);
    }
    return { service, repos };
  } finally {
    await ak.close();
  }
}

/** Sign-in for this machine's person, for the room view. */
export function signIn(): { url: string; anonKey: string; token: string } {
  const cfg = readConfigFile();
  const p = cfg.me ? cfg.profiles?.[cfg.me] : undefined;
  if (!cfg.url || !cfg.anonKey || !p) throw new UserError("Not set up yet.");
  return { url: cfg.url, anonKey: cfg.anonKey, token: p.token };
}

export function suggestions(): { personName: string; engineLabels: Record<Engine, string> } {
  return { personName: suggestedPersonName(), engineLabels: ENGINE_LABEL };
}
