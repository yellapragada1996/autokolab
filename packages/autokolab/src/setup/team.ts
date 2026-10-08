import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nodeSupabase } from "../core/node.js";
import pg from "pg";
import { readConfigFile, serviceRoleKey } from "../core/config.js";
import { codeHash, encryptPayload, formatInvite, newCode, type InvitePayload } from "../core/invite.js";
import { formatToken, memberEmail } from "../core/token.js";
import type { Member, Role, Room, RoomMember } from "../core/types.js";

// Team administration with the Supabase secret (service role) key. Runs only on the admin's
// machine. Every member gets an Auth user whose password is the secret part of their token.

export const SCHEMA_VERSION = 2;
const SQL_DIR = fileURLToPath(new URL("../../sql/", import.meta.url));

export function adminClient(url = process.env.AUTOKOLAB_URL || readConfigFile().url, key = serviceRoleKey()): SupabaseClient {
  if (!url) throw new Error("No Supabase URL configured. Run: autokolab init");
  return nodeSupabase(url, key);
}

/** Installed schema version, 0 if AutoKolab's tables aren't there yet. Throws on bad URL/key. */
export async function schemaVersion(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb.from("autokolab_meta").select("value").eq("key", "schema_version").maybeSingle();
  if (error) {
    if (/does not exist|Could not find the table|schema cache/i.test(error.message)) return 0;
    if (/Invalid API key|JWT|401|apikey/i.test(error.message)) throw new Error("Supabase rejected the secret key. Copy it again from Project Settings → API keys.");
    throw new Error(`Couldn't reach Supabase: ${error.message}`);
  }
  return Number(data?.value ?? 0);
}

export function schemaFiles(): { version: number; path: string; sql: string }[] {
  return readdirSync(SQL_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: parseInt(f, 10), path: SQL_DIR + f, sql: readFileSync(SQL_DIR + f, "utf8") }));
}

/** Apply pending schema files using a Postgres connection string. */
export async function applySchema(dbUrl: string, from: number): Promise<number> {
  const client = new pg.Client({ connectionString: dbUrl, ssl: dbUrl.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(`Couldn't connect to the database: ${(e as Error).message}. Check the connection string and password.`);
  }
  let version = from;
  try {
    for (const f of schemaFiles().filter((x) => x.version > from)) {
      await client.query("begin");
      try {
        await client.query(f.sql);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Setting up the database failed in ${f.path.split("/").pop()}: ${(e as Error).message}`);
      }
      version = f.version;
    }
    // Make the new tables visible to the API right away.
    await client.query("notify pgrst, 'reload schema'").catch(() => undefined);
  } finally {
    await client.end();
  }
  return version;
}

/** Check the public key works too (anonymous call that must fail with our own error). */
export async function checkPublicKey(url: string, anonKey: string): Promise<void> {
  const sb = nodeSupabase(url, anonKey);
  const { error } = await sb.rpc("redeem_invite", { code_hash: "check" });
  if (!error || !error.message.includes("AUTOKOLAB_INVITE")) {
    throw new Error(`The publishable/anon key didn't work (${error?.message ?? "unexpected answer"}). Copy it again from Project Settings → API keys.`);
  }
}

// ---------------------------------------------------------------- members

export interface Team {
  members: Member[];
  rooms: Room[];
  memberships: RoomMember[];
}

export async function loadTeam(sb = adminClient()): Promise<Team> {
  const [m, r, rm] = await Promise.all([
    sb.from("members").select("*").order("created_at"),
    sb.from("rooms").select("*").order("created_at"),
    sb.from("room_members").select("*"),
  ]);
  for (const x of [m, r, rm]) if (x.error) throw new Error(x.error.message);
  return { members: m.data as Member[], rooms: r.data as Room[], memberships: rm.data as RoomMember[] };
}

export interface MemberSpec {
  name: string;
  kind: "agent" | "human";
  /** The person's member id; omit for a person (they own themselves). */
  ownerId?: string;
  client: string | null;
  timezone?: string | null;
}

/** Create a member and return its token. */
export async function createMember(spec: MemberSpec, sb = adminClient()): Promise<{ member: Member; token: string }> {
  const secret = randomBytes(32).toString("base64url");
  // Create the Auth user with a placeholder email to learn its id, then set the email derived
  // from that id so tokens stay self-contained.
  const { data, error } = await sb.auth.admin.createUser({
    email: `pending-${randomBytes(8).toString("hex")}@autokolab.example.com`,
    password: secret,
    email_confirm: true,
    app_metadata: { autokolab: true },
  });
  if (error || !data.user) throw new Error(`Couldn't create ${spec.name}: ${error?.message}`);
  const id = data.user.id;
  try {
    const { error: e1 } = await sb.auth.admin.updateUserById(id, { email: memberEmail(id), email_confirm: true });
    if (e1) throw new Error(e1.message);
    const row = { id, name: spec.name, kind: spec.kind, owner_id: spec.ownerId ?? id, client: spec.client, timezone: spec.timezone ?? null };
    const { data: member, error: e2 } = await sb.from("members").insert(row).select("*").single();
    if (e2) throw new Error(e2.message.includes("members_name_key") ? `The name "${spec.name}" is already taken.` : e2.message);
    return { member: member as Member, token: formatToken(id, secret) };
  } catch (e) {
    await sb.auth.admin.deleteUser(id).catch(() => undefined);
    throw e;
  }
}

/** New token for an existing member (the old one stops working); also un-revokes. */
export async function rotateToken(member: Member, sb = adminClient()): Promise<string> {
  const secret = randomBytes(32).toString("base64url");
  const { error } = await sb.auth.admin.updateUserById(member.id, { password: secret, ban_duration: "none" });
  if (error) throw new Error(error.message);
  await sb.from("members").update({ revoked: false }).eq("id", member.id);
  return formatToken(member.id, secret);
}

/** Get a token for this member: create it, or rotate the token if it already exists. */
export async function issueMember(spec: MemberSpec, team: Team, sb = adminClient()): Promise<{ member: Member; token: string; created: boolean }> {
  const existing = team.members.find((m) => m.name === spec.name);
  if (existing) {
    const sameOwner = spec.ownerId ? existing.owner_id === spec.ownerId : existing.owner_id === existing.id && spec.kind === "human";
    if (!sameOwner) throw new Error(`The name "${spec.name}" is already taken. Pick another.`);
    return { member: existing, token: await rotateToken(existing, sb), created: false };
  }
  const r = await createMember(spec, sb);
  team.members.push(r.member);
  return { ...r, created: true };
}

export async function revokeMember(name: string, sb = adminClient()): Promise<Member> {
  const { data, error } = await sb.from("members").update({ revoked: true, runner_state: "offline" }).eq("name", name).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No member named "${name}".`);
  await sb.auth.admin.updateUserById((data as Member).id, { ban_duration: "876000h" });
  return data as Member;
}

// ---------------------------------------------------------------- rooms

export async function ensureRoom(repo: string, name: string, team: Team, sb = adminClient()): Promise<{ room: Room; created: boolean }> {
  const existing = team.rooms.find((r) => r.repo === repo);
  if (existing) return { room: existing, created: false };
  let candidate = name;
  for (let i = 2; team.rooms.some((r) => r.name === candidate); i++) candidate = `${name}-${i}`;
  const { data, error } = await sb.from("rooms").insert({ name: candidate, repo }).select("*").single();
  if (error) throw new Error(error.message);
  team.rooms.push(data as Room);
  return { room: data as Room, created: true };
}

export async function addToRoom(roomId: string, memberId: string, role: Role, canInstruct: boolean, team: Team, sb = adminClient()): Promise<void> {
  const row = { room_id: roomId, member_id: memberId, role, can_instruct: canInstruct };
  const { error } = await sb.from("room_members").upsert(row, { onConflict: "room_id,member_id" });
  if (error) throw new Error(error.message);
  team.memberships = team.memberships.filter((x) => !(x.room_id === roomId && x.member_id === memberId));
  team.memberships.push({ ...row, added_at: new Date().toISOString() });
}

/** The role a member usually has (from their other rooms), for adding them to a new room. */
export function usualRole(team: Team, memberId: string): { role: Role; canInstruct: boolean } | null {
  const rows = team.memberships.filter((m) => m.member_id === memberId);
  if (!rows.length) return null;
  const last = rows.sort((a, b) => a.added_at.localeCompare(b.added_at))[rows.length - 1];
  return { role: last.role, canInstruct: last.can_instruct };
}

// ---------------------------------------------------------------- invites

export async function createInvite(opts: { url: string; anonKey: string; payload: InvitePayload; days: number; label: string; info?: Record<string, unknown> }, sb = adminClient()): Promise<{ invite: string; expires: Date }> {
  const code = newCode();
  const expires = new Date(Date.now() + opts.days * 86400_000);
  const { error } = await sb.from("invites").insert({
    code_hash: codeHash(code),
    payload: encryptPayload(opts.payload, code),
    person: opts.label,
    info: opts.info ?? {},
    expires_at: expires.toISOString(),
  });
  if (error) throw new Error(error.message);
  return { invite: formatInvite({ url: opts.url, anonKey: opts.anonKey, code }), expires };
}
