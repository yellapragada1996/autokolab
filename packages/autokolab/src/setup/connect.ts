import type { AutoKolab } from "../core/client.js";
import { profilesOf, type ConfigFile } from "../core/config.js";
import { ensureRunnerConfig } from "../runner/config.js";
import { CLIENT_ENGINE, register, type Engine } from "./agents.js";
import { info, ok, warn } from "./ui.js";

// Connect this machine's agents: register the MCP server with Claude Code / Codex and give each
// agent that leads or follows in a room a runner with safe default limits, so it works while its
// person is away. Followers carry out instructions; the lead answers the team, triages workers'
// questions and works its own tickets (DEC-17). Idempotent; used by `join`, `init`, `setup`.

export const ENGINE_LABEL: Record<Engine, string> = { claude: "Claude Code", codex: "Codex" };
export const INSTALL: Record<Engine, string> = {
  claude: "npm install -g @anthropic-ai/claude-code",
  codex: "npm install -g @openai/codex",
};

/** Room roles whose agents get a runner: both leads and followers work in the background. */
export function needsRunner(roles: (string | undefined)[]): boolean {
  return roles.some((r) => r === "lead" || r === "follower");
}

/** Connects every agent on this machine; returns the ones that run in the background. */
export function connectAgents(ak: AutoKolab, cfg: ConfigFile): { id: string; name: string; engine: Engine }[] {
  const runners: { id: string; name: string; engine: Engine }[] = [];
  for (const p of profilesOf(cfg).filter((x) => x.kind === "agent")) {
    const engine = CLIENT_ENGINE[p.client ?? ""];
    if (!engine) continue;
    const r = register(engine, p.id);
    if (r.result === "not-installed") warn(`${ENGINE_LABEL[engine]} isn't installed. Install and sign in (${INSTALL[engine]}), then run \`autokolab setup\`.`);
    else if (r.result === "failed") warn(`Couldn't connect ${ENGINE_LABEL[engine]}: ${r.detail}`);
    else ok(`${ENGINE_LABEL[engine]} connected as ${p.name}`);

    if (needsRunner(ak.rooms().map((room) => ak.membership(room.id, p.id)?.role))) {
      runners.push({ id: p.id, name: p.name, engine });
      const created = ensureRunnerConfig(p.id, p.name, engine);
      if (created) info(`Safe default limits for ${p.name}: ${created}`);
    }
  }
  return runners;
}
