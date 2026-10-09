import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { z } from "zod";
import { runnersDir } from "../core/config.js";

// Runner limits for one agent: ~/.config/autokolab/runners/<agent>.toml, written by
// `autokolab join` with safe defaults. This is the owner's standing permission: inside it the agent
// never stops to ask; outside it, it reports "blocked". Editing is optional.

/** How hard the agent thinks: the five levels both Claude Code and Codex accept (schema 10). */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

const RunnerConfigSchema = z.object({
  /** The agent's member id (its name can change; this can't). */
  agent_id: z.string().uuid(),
  engine: z.enum(["claude", "codex"]),
  claude_bin: z.string().default("claude"),
  codex_bin: z.string().default("codex"),
  /** Also run tasks addressed to everyone in a room, not just to this agent. */
  accept_broadcast_tasks: z.boolean().default(false),
  /** On start, pick up instructions sent while the runner was off, up to this many hours back. */
  catch_up_hours: z.number().min(0).max(168).default(24),
  /** Use this file's model and effort even when they're set on AutoKolab (DEC-18: the owner keeps the last word). */
  model_locked: z.boolean().default(false),

  limits: z
    .object({
      max_minutes: z.number().int().min(1).max(24 * 60).default(60),
      /** Total agent working time per day; past it, instructions wait until tomorrow. */
      max_hours_per_day: z.number().min(0.5).max(24).default(3),
      max_turns: z.number().int().min(1).max(2000).default(300),
      /** Agents stop waking each other in a thread once this many messages follow the last person's. */
      max_agent_turns: z.number().int().min(2).max(100).default(12),
      protected_branches: z.array(z.string()).default(["main", "master", "prod", "production"]),
      deny_paths: z.array(z.string()).default([".env.prod", ".env.production"]),
      /** Extra rules in plain language, added to every instruction. */
      rules: z.array(z.string()).default([]),
    })
    .prefault({}),

  claude: z
    .object({
      permission_mode: z.enum(["default", "acceptEdits", "bypassPermissions", "plan"]).default("acceptEdits"),
      allowed_tools: z
        .array(z.string())
        .default([
          "Read", "Edit", "Write", "Glob", "Grep", "TodoWrite", "WebFetch", "WebSearch",
          "Bash(git:*)", "Bash(gh:*)", "Bash(npm:*)", "Bash(npx:*)", "Bash(pnpm:*)", "Bash(yarn:*)",
          "Bash(node:*)", "Bash(python3:*)", "Bash(pytest:*)", "Bash(ls:*)", "Bash(cat:*)",
          "Bash(mkdir:*)", "Bash(mv:*)", "Bash(cp:*)", "Bash(rg:*)", "Bash(grep:*)", "Bash(find:*)",
        ]),
      disallowed_tools: z.array(z.string()).default([]),
      model: z.string().optional(),
      effort: z.enum(EFFORTS).optional(),
    })
    .prefault({}),

  codex: z
    .object({
      sandbox: z.enum(["read-only", "workspace-write", "danger-full-access"]).default("workspace-write"),
      network: z.boolean().default(true),
      model: z.string().optional(),
      effort: z.enum(EFFORTS).optional(),
    })
    .prefault({}),
});

export type RunnerConfig = z.infer<typeof RunnerConfigSchema> & { profile: string };

/** `profile` is the file's name (the agent's name when it was set up), used in messages. */
export function parseRunnerConfig(text: string, profile: string): RunnerConfig {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new Error(`Runner limits for ${profile} aren't valid TOML: ${(e as Error).message}`);
  }
  const r = RunnerConfigSchema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Runner limits for ${profile} have problems:\n${issues}`);
  }
  return { ...r.data, profile };
}

export function runnerConfigPath(name: string): string {
  return join(runnersDir(), `${name}.toml`);
}

/** Runner limits files on this machine (one per agent), by file name. */
export function runnerFiles(): string[] {
  if (!existsSync(runnersDir())) return [];
  return readdirSync(runnersDir())
    .filter((f) => f.endsWith(".toml"))
    .map((f) => f.slice(0, -5))
    .sort();
}

export function loadRunnerConfig(name: string): RunnerConfig {
  const path = runnerConfigPath(name);
  if (!existsSync(path)) throw new Error(`No runner set up for ${name} on this machine.`);
  return parseRunnerConfig(readFileSync(path, "utf8"), name);
}

/** The runner limits file for an agent id, if this machine has one. */
export function runnerFileFor(agentId: string): string | undefined {
  return runnerFiles().find((f) => {
    try {
      return loadRunnerConfig(f).agent_id === agentId;
    } catch {
      return false;
    }
  });
}

export function runnerTemplate(agentId: string, engine: "claude" | "codex"): string {
  return `# AutoKolab runner limits for this agent, set once by its person. Inside them the agent works
# unattended and never stops to ask; anything outside them is reported as "blocked" instead.
# Changes apply when the runner restarts (autokolab restart). Model and effort are different: the
# ones set on AutoKolab (People page, or the project's lead) apply from the next run, no restart, and
# win over the model and effort below unless model_locked is true.

agent_id = "${agentId}"
engine = "${engine}"
# model_locked = true             # always use the model and effort in this file, whatever AutoKolab says

[limits]
max_minutes = 60               # per instruction; the run is stopped after this
max_hours_per_day = 3          # total agent work per day; after that, instructions wait for tomorrow
max_turns = 300                # Claude Code only
max_agent_turns = 12           # agents stop replying to each other in a thread after this many turns with no person
protected_branches = ["main", "master", "prod", "production"]   # agents never push or merge here
deny_paths = [".env.prod", ".env.production"]                   # agents never read or change these
rules = [
  "Never deploy or publish anything.",
]

[claude]
permission_mode = "acceptEdits"   # tools outside the allow list are refused automatically
# allowed_tools = ["Read", "Edit", "Write", "Glob", "Grep", "Bash(git:*)", "Bash(pnpm:*)", "Bash(gh:*)"]
# model = "claude-sonnet-5-5"
# effort = "high"                 # low, medium, high, xhigh or max

[codex]
sandbox = "workspace-write"
network = true                    # needed for git push, installs, gh
# model = "gpt-5-codex"
# effort = "high"                 # low, medium, high, xhigh or max
`;
}

/** Create the limits file for an agent if it doesn't have one yet. Returns its path if created. */
export function ensureRunnerConfig(agentId: string, name: string, engine: "claude" | "codex"): string | null {
  if (runnerFileFor(agentId)) return null;
  mkdirSync(runnersDir(), { recursive: true });
  const path = runnerConfigPath(name);
  writeFileSync(path, runnerTemplate(agentId, engine));
  return path;
}

/** Change the daily working-time limit in an agent's limits file (keeps everything else as is). */
export function setDailyLimit(agentId: string, hours: number): void {
  const file = runnerFileFor(agentId);
  if (!file) return;
  const path = runnerConfigPath(file);
  const text = readFileSync(path, "utf8");
  const line = `max_hours_per_day = ${hours}`;
  const next = /^max_hours_per_day\s*=.*$/m.test(text)
    ? text.replace(/^max_hours_per_day\s*=.*$/m, line)
    : text.replace(/^\[limits\]\s*$/m, `[limits]\n${line}`);
  writeFileSync(path, next);
}
