import { hostname } from "node:os";
import { profilesOf, readConfigFile, supabaseOrigin, updateConfigFile, type ConfigFile } from "../core/config.js";
import { keyProblem, saveAgentKey, type KeyStore } from "../core/keys.js";
import { connectFromConfig } from "../core/node.js";
import { isLocalProvider, providerName } from "../core/providers.js";
import { ensureRunnerConfig } from "../runner/config.js";
import { askHidden, checkKey, checkOpencodeModel, findOpencode, installOpencode, keyFromEnv, type ApiAgentOptions } from "./apimodel.js";
import { CLIENT_ENGINE, ENGINE_CLIENT, register, type Engine } from "./agents.js";
import { ENGINE_LABEL, INSTALL } from "./connect.js";
import { canRead, toolStatus } from "./machine.js";
import { installService, restartServiceIfInstalled, serviceStatus } from "./service.js";
import { bold, fail, info, ok, warn } from "./ui.js";

// `autokolab connect <code>`: the line the website gives you. It brings this computer's agents
// (Claude Code, Codex) into the project the code was made for:
// - an agent this computer already has joins with its own sign-in;
// - a new one gets its sign-in from the website's server;
// then each is connected to its tool (MCP), gets a runner with safe limits, and the runner service
// starts. Run it again any time, e.g. after installing Codex. Nothing to answer: it never prompts.
//
// With --engine opencode and the other CON-25 options it instead creates one API-model agent: OpenCode
// is installed if it's missing, the key is asked for here with hidden input (or read from --key-env),
// checked with the provider, and saved on this computer only. A rejected key creates nothing.

export const DEFAULT_SITE = "https://autokolab.vercel.app";

interface Paired {
  id: string;
  name: string;
  engine: Engine;
  created: boolean;
}

type Project = { name: string; slug: string; repo: string | null };
type NewAgent = { id: string; name: string; vendor: string; token: string };

export interface ConnectOptions {
  site?: string;
  /** Which agents to connect; default: the ones installed here. */
  engines?: Engine[];
  /** Connect them to their tools, install OpenCode if needed and start the runner service (off only in tests). */
  setupTools?: boolean;
  /** Start or restart the background runner service (off: --no-service, e.g. in a container). */
  service?: boolean;
  /** One API-model agent instead of Claude Code and Codex (CON-25). */
  api?: ApiAgentOptions | null;
  /** For tests: OpenCode, the network, and the key prompt. */
  opencodeBin?: string;
  fetch?: typeof fetch;
  ask?: (question: string) => Promise<string>;
  keyStore?: Partial<KeyStore>;
}

const plain = (m: string) => m.replace(/^.*AUTOKOLAB_[A-Z_]+:\s*/, "");

/** If this computer has its person's room identity (from before the website), link it to the website sign-in that made the code. */
async function linkPerson(cfg: ConfigFile, code: string): Promise<void> {
  const person = cfg.me ? cfg.profiles?.[cfg.me] : undefined;
  if (person?.kind !== "human") return;
  const ak = await connectFromConfig(cfg.me);
  const { data, error } = await ak.sb.rpc("link_my_profile", { p_code: code });
  await ak.close();
  if (error) throw new Error(plain(error.message));
  const r = data as { name: string; merged: boolean };
  if (r.merged) ok(`Linked your website sign-in to ${r.name}, your name in the room`);
}

/** New agents get their sign-in from the website (CON-16); they're saved in this computer's settings. */
async function pairNew(site: string, code: string, agents: { vendor: string; name?: string }[], f: typeof fetch, client: (vendor: string) => string): Promise<{ project: Project | null; agents: NewAgent[] }> {
  let res: Response;
  try {
    res = await f(`${site}/api/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, machine: hostname(), agents }),
    });
  } catch (err) {
    throw new Error(`Couldn't reach ${site}: ${(err as Error).message}`);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; url?: string; anonKey?: string; project?: Project; agents?: NewAgent[] };
  if (!res.ok || !body.agents) throw new Error(body.error ?? `The website answered ${res.status}.`);
  const cfg = readConfigFile();
  if (cfg.url && body.url && supabaseOrigin(cfg.url) !== supabaseOrigin(body.url)) {
    throw new Error("This computer is set up for a different AutoKolab backend. Ask for help before mixing the two.");
  }
  updateConfigFile((c) => {
    c.url ??= body.url;
    c.anonKey ??= body.anonKey;
    c.profiles ??= {};
    for (const a of body.agents!) c.profiles[a.id] = { token: a.token, name: a.name, kind: "agent", client: client(a.vendor) };
  });
  return { project: body.project ?? null, agents: body.agents };
}

function startService(): void {
  if (serviceStatus() === "not-installed") {
    const s = installService();
    if (s.ok) ok("Your agents now work in the background (and start again when you log in).");
    else fail(`Couldn't start the background runner: ${s.message}. Run \`autokolab run\` to start it by hand.`);
  } else {
    restartServiceIfInstalled();
    ok("Background runner restarted with your agents.");
  }
}

const normalCode = (raw: string) => {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) throw new Error("That code doesn't look right. Copy the whole line from the website again.");
  return code;
};
const siteOf = (site?: string) => (site ?? process.env.AUTOKOLAB_SITE ?? DEFAULT_SITE).replace(/\/+$/, "");

export async function runConnect(
  rawCode: string,
  opts: ConnectOptions = {},
): Promise<{ project: Project | null; agents: { id: string; name: string; engine: Engine | "opencode"; created: boolean }[] }> {
  if (opts.api) return connectApiAgent(rawCode, opts.api, opts);
  const setupTools = opts.setupTools ?? true;
  const code = normalCode(rawCode);
  const site = siteOf(opts.site);

  console.log(`\n  ${bold("Connecting this computer's agents")}`);
  const engines: Engine[] = [];
  for (const e of ["claude", "codex"] as Engine[]) {
    if (opts.engines) {
      if (opts.engines.includes(e)) engines.push(e);
      continue;
    }
    const t = toolStatus(e);
    if (!t.installed) {
      info(`${ENGINE_LABEL[e]} isn't installed here (to add it later: ${INSTALL[e]}, then run this line again).`);
      continue;
    }
    if (!t.signedIn) warn(`${ENGINE_LABEL[e]} is installed but not signed in. Sign in (${e === "claude" ? "run claude" : "codex login"}) so it can work; it's connected either way.`);
    engines.push(e);
  }
  if (!engines.length) throw new Error(`Neither Claude Code nor Codex is installed. Install one (${INSTALL.claude}, or ${INSTALL.codex}), sign in, and run this line again.`);

  const cfg = readConfigFile();
  const existing = new Map<Engine, { id: string; name: string }>();
  for (const p of profilesOf(cfg)) {
    const e = CLIENT_ENGINE[p.client ?? ""];
    if (p.kind === "agent" && e && !existing.has(e)) existing.set(e, { id: p.id, name: p.name });
  }

  const paired: Paired[] = [];
  let project: Project | null = null;

  await linkPerson(cfg, code);

  // Agents this computer already has join by themselves.
  for (const e of engines) {
    const have = existing.get(e);
    if (!have) continue;
    try {
      const ak = await connectFromConfig(have.id);
      const { data, error } = await ak.sb.rpc("pair_existing_agent", { p_code: code });
      await ak.close();
      if (error) throw new Error(plain(error.message));
      const r = data as { name: string; project: string; slug: string; repo: string | null };
      project = { name: r.project, slug: r.slug, repo: r.repo };
      paired.push({ id: have.id, name: r.name, engine: e, created: false });
    } catch (err) {
      throw new Error(`Couldn't bring ${have.name} in: ${(err as Error).message}`);
    }
  }

  // New agents get their sign-in from the website.
  const fresh = engines.filter((e) => !existing.has(e));
  if (fresh.length) {
    const r = await pairNew(site, code, fresh.map((vendor) => ({ vendor })), opts.fetch ?? fetch, (v) => ENGINE_CLIENT[v as Engine]);
    project = r.project ?? project;
    for (const a of r.agents) paired.push({ id: a.id, name: a.name, engine: a.vendor as Engine, created: true });
  }

  // Connect each to its tool, and give it a runner so it works while its person is away.
  for (const p of paired) {
    ok(`${p.name} (${ENGINE_LABEL[p.engine]}) ${p.created ? "joined" : "is in"} ${project?.name ?? "the project"}`);
    if (!setupTools) continue;
    const r = register(p.engine, p.id);
    if (r.result === "failed") warn(`Couldn't connect ${ENGINE_LABEL[p.engine]} to AutoKolab: ${r.detail}`);
    const limits = ensureRunnerConfig(p.id, p.name, p.engine);
    if (limits) info(`Safe default limits for ${p.name}: ${limits}`);
  }

  if (project?.repo && !canRead(project.repo)) {
    warn(`This computer can't read github.com/${project.repo} yet. Ask the project's owner to add you on GitHub; your agents start working once you can.`);
  }

  if (!setupTools) return { project, agents: paired };
  if (opts.service ?? true) startService();
  else info("Start them with `autokolab run` (the background service wasn't touched).");

  console.log(`\n  Done. Open ${bold(`${site}${project ? `/p/${project.slug}/people` : ""}`)} to see them on the board.\n`);
  return { project, agents: paired };
}

/** One API-model agent (CON-25): OpenCode, the key checked before anything is created, the key kept here. */
async function connectApiAgent(rawCode: string, api: ApiAgentOptions, opts: ConnectOptions) {
  const setupTools = opts.setupTools ?? true;
  const code = normalCode(rawCode);
  const site = siteOf(opts.site);
  const f = opts.fetch ?? fetch;
  const name = providerName(api.provider);
  const local = isLocalProvider(api.provider);
  const model = `${api.provider}/${api.model}`;

  console.log(`\n  ${bold(`Adding ${api.name ?? "an agent"} (${name}) to this computer`)}`);
  const bin = opts.opencodeBin ?? (setupTools ? findOpencode() ?? installOpencode() : undefined);
  const baseUrl = local ? process.env.OLLAMA_HOST?.replace(/^(?!https?:\/\/)/, "http://") : undefined;

  // The key, checked with the provider before anything is created.
  let key: string | null = null;
  if (!local) {
    key = api.keyEnv ? keyFromEnv(api.keyEnv) : await (opts.ask ?? askHidden)(`  Paste your ${name} API key. It stays on this computer: `);
    const problem = keyProblem(key);
    if (problem) throw new Error(`${problem} Then run the line again.`);
  }
  // OpenCode's names are the ones that count (AK-143): a model the provider lists under another name
  // never runs. When OpenCode can't say, the provider's own list is the next best check.
  const known = bin && !local ? checkOpencodeModel(bin, api.provider, api.model, key) : null;
  if (known && !known.ok) throw new Error(known.message);
  if (bin && !local && !known) warn(`I couldn't ask OpenCode whether it has ${api.model}; the agent's first run will show it.`);
  const check = await checkKey(api.provider, key, { model: known ? undefined : api.model, baseUrl, fetch: f });
  if (!check.ok) throw new Error(check.message);
  if (check.note) warn(check.note);
  else ok(local ? `${name} is running and has ${api.model}` : `${name} accepted the key`);

  await linkPerson(readConfigFile(), code);
  const r = await pairNew(site, code, [{ vendor: "opencode", ...(api.name ? { name: api.name } : {}) }], f, (v) => v);
  const agent = r.agents[0];

  if (key) {
    try {
      saveAgentKey(agent.id, key, opts.keyStore);
    } catch (e) {
      warn(`${agent.name} was added, but its key couldn't be saved (${(e as Error).message}). Add it with \`autokolab key set ${agent.name}\`.`);
    }
  }
  ensureRunnerConfig(agent.id, agent.name, "opencode", { provider: api.provider, model: api.model, dailyUsd: api.dailyUsd, bin, baseUrl });
  if (api.dailyUsd > 0) info(`It stops for the day once it has spent $${api.dailyUsd}.`);

  if (setupTools && r.project?.repo && !canRead(r.project.repo)) {
    warn(`This computer can't read github.com/${r.project.repo} yet. Ask the project's owner to add you on GitHub; the agent starts working once you can.`);
  }
  if (setupTools && (opts.service ?? true)) startService();
  else if (setupTools) info(`Start it with \`autokolab run ${agent.name}\` (the background service wasn't touched).`);

  console.log(`\n  ${bold(agent.name)} runs ${model}.`);
  if (!local) console.log("  Your key is stored on this computer only.");
  console.log(`  It now shows on People: ${bold(`${site}${r.project ? `/p/${r.project.slug}/people` : ""}`)}\n`);
  return { project: r.project, agents: [{ id: agent.id, name: agent.name, engine: "opencode" as const, created: true }] };
}
