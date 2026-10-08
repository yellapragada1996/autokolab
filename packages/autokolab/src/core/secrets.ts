// Client-side mirror of public.looks_like_secret() in the database migration. The database is
// the authority; checking here too gives a clearer error before anything leaves the machine.
const PATTERNS: RegExp[] = [
  /sk-ant-[a-z0-9_-]{16,}/i,
  /sk-(proj-|svcacct-)?[a-z0-9_-]{32,}/i,
  /gh[pousr]_[a-z0-9]{30,}/i,
  /github_pat_[a-z0-9_]{40,}/i,
  /AKIA[0-9A-Z]{16}/i,
  /aws_secret_access_key\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /xox[abprs]-[a-z0-9-]{10,}/i,
  /AIza[0-9A-Za-z_-]{35}/i,
  /sbp_[a-f0-9]{40}/i,
  /sb_secret_[a-z0-9_-]{20,}/i,
  /eyJ[a-z0-9_-]{10,}\.eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/i,
  /ak1\.[a-z0-9_-]{20,}/i,
  /akinv_[a-z0-9_-]{20,}/i,
  /sk_live_[a-z0-9]{16,}/i,
  /rk_live_[a-z0-9]{16,}/i,
];

export function looksLikeSecret(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

/** Replace anything secret-looking with a marker. Used on agent output before posting it. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const p of PATTERNS) out = out.replace(new RegExp(p.source, "gi"), "[redacted]");
  return out;
}
