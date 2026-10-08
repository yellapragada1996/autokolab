import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

// An invite is one line: "akinv_<base64url(JSON {u, k, c})>" with the project URL, the public
// (anon/publishable) key and a random one-time code. The members' tokens are encrypted with a key
// derived from the code and stored in the database; redeeming returns the ciphertext once.
// So the database never sees the code or the tokens, and a used invite is worthless.

export const INVITE_PREFIX = "akinv_";

export interface InviteLink {
  url: string;
  anonKey: string;
  code: string;
}

export interface InvitePayload {
  /** Member id → token, for the person's seat and each agent seat. */
  tokens: Record<string, string>;
  members: { id: string; kind: "human" | "agent"; client: string | null }[];
  invitedBy: string;
}

export function newCode(): string {
  return randomBytes(18).toString("base64url");
}

export function codeHash(code: string): string {
  return createHash("sha256").update(`autokolab-invite:${code}`).digest("hex");
}

export function formatInvite(link: InviteLink): string {
  const json = JSON.stringify({ u: link.url, k: link.anonKey, c: link.code });
  return INVITE_PREFIX + Buffer.from(json).toString("base64url");
}

export function parseInvite(text: string): InviteLink {
  const t = text.trim().replace(/^autokolab join\s+/, "");
  if (!t.startsWith(INVITE_PREFIX)) throw new Error("That isn't an AutoKolab invite (it should start with akinv_).");
  try {
    const j = JSON.parse(Buffer.from(t.slice(INVITE_PREFIX.length), "base64url").toString("utf8"));
    if (typeof j.u !== "string" || typeof j.k !== "string" || typeof j.c !== "string") throw new Error();
    return { url: new URL(j.u).origin, anonKey: j.k, code: j.c };
  } catch {
    throw new Error("This invite looks damaged. Copy the whole line again (it's long).");
  }
}

function keyFor(code: string, salt: Buffer): Buffer {
  return scryptSync(code, salt, 32);
}

export function encryptPayload(payload: InvitePayload, code: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(code, salt), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return ["v1", salt, iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptPayload(blob: string, code: string): InvitePayload {
  const [v, salt, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new Error("Unsupported invite format.");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(code, Buffer.from(salt, "base64url")), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const json = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(json) as InvitePayload;
}
