// Keep error wording in one place. Only the UI boundary logs; this formatter is pure.
const technical = /\b(uuid|syntax|constraint|relation|column|table|JWT|SQL|JSON|token|stack|postgres\w*|supabase|schema|PGRST\w*|TypeError|NetworkError)\b|https?:|www\.|\b(?:select|insert into|update|delete from)\b|[\n\r{}<>`]|\b\w+_\w+\b|\bat \S+\s*\(/i;
const permission = "You don't have permission to do that here.";
const signIn = "Your sign-in expired. Reload the page.";
const database = "This needs the latest database update. Ask the project's owner to apply it.";
const network = "Couldn't reach AutoKolab. Check your connection and try again.";

/** Turn any failure into words a person can act on, without exposing its diagnostic text. */
export function plainError(error: unknown, what?: string): string {
  const record = error && typeof error === "object" ? error as { message?: unknown; code?: unknown; name?: unknown } : null;
  const message = typeof error === "string" ? error : typeof record?.message === "string" ? record.message : "";
  const code = typeof record?.code === "string" ? record.code : "";
  const name = typeof record?.name === "string" ? record.name : "";
  const action = what && what.length <= 70 && /^[a-z][a-z '-]+$/i.test(what) && !technical.test(what) ? what : null;
  const fallback = action ? `Couldn't ${action}. Try again; if it keeps happening, tell Captain.` : "Something went wrong. Try again; if it keeps happening, tell Captain.";

  // These codes carry human wording. Reject malformed diagnostics even with this prefix.
  const custom = /^AUTOKOLAB_[A-Z0-9_]+:\s*(.+)$/.exec(message);
  if (custom && !technical.test(custom[1]) && custom[1].length <= 240) {
    const sentence = custom[1].trim().replace(/\blead\b/gi, "Captain");
    if (sentence) return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  }
  if (/^(42501|403)$/.test(code) || /row[- ]level security|permission denied|insufficient privilege|not authorized|access denied/i.test(message)) return permission;
  if (/^(PGRST30[12]|401)$/.test(code) || /\bJWT\b|invalid.*(?:token|session|sign-in)|(?:token|session|sign-in).*(?:expired|invalid)|refresh token|invalid login credentials|not authenticated|AuthSessionMissing/i.test(`${name} ${message}`)) return signIn;
  if (/^(42883|42703|PGRST20[24])$/.test(code) || /could not find (?:the )?(?:function|column)|(?:function|column).*does not exist|schema cache/i.test(message)) return database;
  if (/failed to fetch|fetch failed|NetworkError|Load failed|network (?:request|error)|timed? ?out|timeout|AbortError/i.test(`${name} ${message}`)) return network;
  return fallback;
}

/** Use once where a request failure becomes a visible message; preserve the original for debugging. */
export function reportError(error: unknown, what?: string): string {
  console.error(error);
  return plainError(error, what);
}
