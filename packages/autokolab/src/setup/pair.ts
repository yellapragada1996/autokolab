import { hostname } from "node:os";
import { profilesOf, readConfigFile, supabaseOrigin, updateConfigFile } from "../core/config.js";
import { connectFromConfig } from "../core/node.js";
import { ensureRunnerConfig } from "../runner/config.js";
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

export const DEFAULT_SITE = "https://autokolab.vercel.app";

interface Paired {
  id: string;
  name: string;
  engine: Engine;
  created: boolean;
}

export async function runConnect(
  rawCode: string,
  opts: {
    site?: string;
    /** Which agents to connect; default: the ones installed here. */
    engines?: Engine[];
    /** Connect them to their tools and start the runner service (off only in tests). */
    setupTools?: boolean;
  } = {},
): Promise<{ project: { name: string; slug: string; repo: string | null } | null; agents: { id: string; name: string; engine: Engine; created: boolean }[] }> {
  const setupTools = opts.setupTools ?? true;
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) throw new Error("That code doesn't look right. Copy the whole line from the website again.");
  const site = (opts.site ?? process.env.AUTOKOLAB_SITE ?? DEFAULT_SITE).replace(/\/+$/, "");

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
  let project: { name: string; slug: string; repo: string | null } | null = null;

  // If this computer has its person's room identity (from before the website), link it to the
  // website sign-in that made the code, so their agents here are recognised as theirs.
  const person = cfg.me ? cfg.profiles?.[cfg.me] : undefined;
  if (person?.kind === "human") {
    const ak = await connectFromConfig(cfg.me);
    const { data, error } = await ak.sb.rpc("link_my_profile", { p_code: code });
    await ak.close();
    if (error) throw new Error(error.message.replace(/^.*AUTOKOLAB_[A-Z_]+:\s*/, ""));
    const r = data as { name: string; merged: boolean };
    if (r.merged) ok(`Linked your website sign-in to ${r.name}, your name in the room`);
  }

  // Agents this computer already has join by themselves.
  for (const e of engines) {
    const have = existing.get(e);
    if (!have) continue;
    try {
      const ak = await connectFromConfig(have.id);
      const { data, error } = await ak.sb.rpc("pair_existing_agent", { p_code: code });
      await ak.close();
      if (error) throw new Error(error.message.replace(/^.*AUTOKOLAB_[A-Z_]+:\s*/, ""));
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
    let res: Response;
    try {
      res = await fetch(`${site}/api/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, machine: hostname(), agents: fresh.map((vendor) => ({ vendor })) }),
      });
    } catch (err) {
      throw new Error(`Couldn't reach ${site}: ${(err as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      url?: string;
      anonKey?: string;
      project?: { name: string; slug: string; repo: string | null };
      agents?: { id: string; name: string; vendor: Engine; token: string }[];
    };
    if (!res.ok || !body.agents) throw new Error(body.error ?? `The website answered ${res.status}.`);
    if (cfg.url && body.url && supabaseOrigin(cfg.url) !== supabaseOrigin(body.url)) {
      throw new Error("This computer is set up for a different AutoKolab backend. Ask for help before mixing the two.");
    }
    updateConfigFile((c) => {
      c.url ??= body.url;
      c.anonKey ??= body.anonKey;
      c.profiles ??= {};
      for (const a of body.agents!) c.profiles[a.id] = { token: a.token, name: a.name, kind: "agent", client: ENGINE_CLIENT[a.vendor] };
    });
    project = body.project ?? project;
    for (const a of body.agents) paired.push({ id: a.id, name: a.name, engine: a.vendor, created: true });
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
  if (serviceStatus() === "not-installed") {
    const s = installService();
    if (s.ok) ok("Your agents now work in the background (and start again when you log in).");
    else fail(`Couldn't start the background runner: ${s.message}. Run \`autokolab run\` to start it by hand.`);
  } else {
    restartServiceIfInstalled();
    ok("Background runner restarted with your agents.");
  }

  console.log(`\n  Done. Open ${bold(`${site}${project ? `/p/${project.slug}/people` : ""}`)} to see them on the board.\n`);
  return { project, agents: paired };
}
