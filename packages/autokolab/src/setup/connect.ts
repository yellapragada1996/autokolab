import type { AutoKolab } from "../core/client.js";
import { profilesOf, type ConfigFile } from "../core/config.js";
import { ensureRunnerConfig } from "../runner/config.js";
import { CLIENT_ENGINE, register, type Engine } from "./agents.js";
import { info, ok, warn } from "./ui.js";

// Connect this machine's agents: register the MCP server with Claude Code / Codex and give each
// follower agent a runner with safe default limits, so it carries out instructions while its person
// is away. Lead agents don't need one: their person talks to them in Claude Code / Codex directly,
// and they reach the others through the AutoKolab tools. Idempotent; used by `join`, `init`, `setup`.

export const ENGINE_LABEL: Record<Engine, string> = { claude: "Claude Code", codex: "Codex" };
export const INSTALL: Record<Engine, string> = {
  claude: "npm install -g @anthropic-ai/claude-code",
  codex: "npm install -g @openai/codex",
};

export function connectAgents(ak: AutoKolab, cfg: ConfigFile): { id: string; name: string; engine: Engine }[] {
  const followers: { id: string; name: string; engine: Engine }[] = [];
  for (const p of profilesOf(cfg).filter((x) => x.kind === "agent")) {
    const engine = CLIENT_ENGINE[p.client ?? ""];
    if (!engine) continue;
    const r = register(engine, p.id);
    if (r.result === "not-installed") warn(`${ENGINE_LABEL[engine]} isn't installed. Install and sign in (${INSTALL[engine]}), then run \`autokolab setup\`.`);
    else if (r.result === "failed") warn(`Couldn't connect ${ENGINE_LABEL[engine]}: ${r.detail}`);
    else ok(`${ENGINE_LABEL[engine]} connected as ${p.name}`);

    const follows = ak.rooms().some((room) => ak.membership(room.id, p.id)?.role === "follower");
    if (follows) {
      followers.push({ id: p.id, name: p.name, engine });
      const created = ensureRunnerConfig(p.id, p.name, engine);
      if (created) info(`Safe default limits for ${p.name}: ${created}`);
    }
  }
  return followers;
}
