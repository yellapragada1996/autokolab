// An AutoKolab token is "ak1.<member id>.<secret>". The member id is the Supabase Auth user id;
// the secret is that user's password. Members sign in with email + password derived from it,
// so the token is the only thing anyone needs to keep.
// (No Node imports here: the web view uses this file too.)

export const TOKEN_PREFIX = "ak1";
const EMAIL_DOMAIN = "autokolab.example.com"; // reserved domain: no mail is ever sent

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ParsedToken {
  memberId: string;
  email: string;
  password: string;
}

export function formatToken(memberId: string, secret: string): string {
  return `${TOKEN_PREFIX}.${memberId}.${secret}`;
}

export function memberEmail(memberId: string): string {
  return `${memberId}@${EMAIL_DOMAIN}`;
}

export function parseToken(token: string): ParsedToken {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX || !UUID.test(parts[1]) || parts[2].length < 20) {
    throw new Error("That doesn't look like an AutoKolab token (expected ak1.<id>.<secret>).");
  }
  return { memberId: parts[1], email: memberEmail(parts[1]), password: parts[2] };
}
