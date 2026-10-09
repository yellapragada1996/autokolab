import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// POST /api/connect: the helper on someone's computer brings their agents into a project with a
// pairing code (made on the website by a signed-in project member). New agents get their own
// sign-in here, because creating sign-ins needs the server key, which lives only in Vercel's
// environment. Agents that already exist on the computer join by themselves and never come here.
//
// Body: { code: "7KQM2PXA", agents: [{ vendor: "claude" | "codex", name?: "ana-claude" }] }
// Reply: { url, anonKey, project: { name, slug, repo }, agents: [{ id, name, vendor, token }] }

const EMAIL_DOMAIN = "autokolab.example.com"; // same as the helper's tokens: no mail is ever sent
const VENDORS = ["claude", "codex"] as const;
type Vendor = (typeof VENDORS)[number];

interface Req {
  method?: string;
  body?: unknown;
}
interface Res {
  status: (n: number) => Res;
  json: (b: unknown) => void;
  setHeader: (k: string, v: string) => void;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function friendly(m: string): string {
  return m.includes("AUTOKOLAB_") ? m.replace(/^.*AUTOKOLAB_[A-Z_]+:\s*/, "") : m;
}

export interface ConnectEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export async function connect(body: unknown, env: ConnectEnv, sb: SupabaseClient = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })) {
  const b = (body ?? {}) as { code?: unknown; agents?: unknown };
  const code = String(b.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) throw new HttpError(400, "That pairing code doesn't look right. Copy the line from the website again.");
  const wanted = Array.isArray(b.agents) ? (b.agents as { vendor?: unknown; name?: unknown }[]) : [];
  if (!wanted.length || wanted.length > 2) throw new HttpError(400, "Say which agents to connect (Claude Code and/or Codex).");
  const agents = wanted.map((a) => {
    if (!VENDORS.includes(a.vendor as Vendor)) throw new HttpError(400, `Unknown agent "${String(a.vendor)}".`);
    return { vendor: a.vendor as Vendor, name: typeof a.name === "string" ? a.name.slice(0, 40) : "" };
  });

  // Check the code before creating anything.
  const { data: pairing, error: pe } = await sb.from("device_pairings").select("code, profile_id, expires_at").eq("code", code).maybeSingle();
  if (pe) throw new HttpError(500, pe.message);
  if (!pairing || Date.parse(pairing.expires_at) < Date.now()) throw new HttpError(410, "That code has expired or doesn't exist. Get a new line on the website (it lasts 30 minutes).");
  const { data: profile } = await sb.from("profiles").select("github_login, name").eq("id", pairing.profile_id).maybeSingle();
  const who = (profile?.github_login ?? profile?.name ?? "agent").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";

  const out: { id: string; name: string; vendor: Vendor; token: string }[] = [];
  let project: unknown = null;
  for (const a of agents) {
    const secret = randomBytes(32).toString("base64url");
    const { data: created, error: ce } = await sb.auth.admin.createUser({
      email: `pending-${randomBytes(8).toString("hex")}@${EMAIL_DOMAIN}`,
      password: secret,
      email_confirm: true,
      app_metadata: { autokolab: true },
    });
    if (ce || !created.user) throw new HttpError(500, `Couldn't create the agent's sign-in: ${ce?.message}`);
    const id = created.user.id;
    try {
      const { error: ue } = await sb.auth.admin.updateUserById(id, { email: `${id}@${EMAIL_DOMAIN}`, email_confirm: true });
      if (ue) throw new Error(ue.message);
      const { data: paired, error: re } = await sb.rpc("pair_new_agent", { p_code: code, p_agent: id, p_vendor: a.vendor, p_name: a.name || `${who}-${a.vendor}` });
      if (re) throw new Error(friendly(re.message));
      const p = paired as { name: string; project: string; slug: string; repo: string | null };
      project = { name: p.project, slug: p.slug, repo: p.repo };
      out.push({ id, name: p.name, vendor: a.vendor, token: `ak1.${id}.${secret}` });
    } catch (e) {
      await sb.auth.admin.deleteUser(id).catch(() => undefined);
      throw new HttpError(400, (e as Error).message);
    }
  }
  return { url: env.url, anonKey: env.anonKey, project, agents: out };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const env = { url: process.env.VITE_SUPABASE_URL ?? "", anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? "", serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" };
  if (!env.url || !env.anonKey || !env.serviceKey) {
    return res.status(503).json({ error: "This AutoKolab site isn't set up to connect agents yet (its server key is missing)." });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    res.status(200).json(await connect(body, env));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
