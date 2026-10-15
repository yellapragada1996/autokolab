import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { z } from "zod";
import { runnersDir } from "../core/config.js";
import { EFFORTS } from "../core/projects.js";

export { EFFORTS, type Effort } from "../core/projects.js";

// Runner limits for one agent: ~/.config/autokolab/runners/<agent>.toml, written by
// `autokolab join` with safe defaults. This is the owner's standing permission: inside it the agent
// never stops to ask; outside it, it reports "blocked". Editing is optional.

export const ENGINES = ["claude", "codex", "opencode"] as const;

const RunnerConfigSchema = z.object({
  /** The agent's member id (its name can change; this can't). */
  agent_id: z.string().uuid(),
  engine: z.enum(ENGINES),
  claude_bin: z.string().default("claude"),
  codex_bin: z.string().default("codex"),
  opencode_bin: z.string().default("opencode"),
  /** Also run tasks addressed to everyone in a room, not just to this agent. */
  accept_broadcast_tasks: z.boolean().default(false),
  /**
   * On start, pick up instructions sent while the runner was off, up to this many hours back.
   * Teammates' messages from before the start are skipped: they're conversation, not instructions.
   */
  catch_up_hours: z.number().min(0).max(168).default(24),
  /** Use this file's model and effort even when they're set on AutoKolab (DEC-18: the owner keeps the last word). */
  model_locked: z.boolean().default(false),
  /**
   * For a project's lead: review a worker's PR on its own once its tests pass (AK-59). Off, the
   * lead reviews only when someone asks it to.
   */
  auto_review: z.boolean().default(true),
  /**
   * A review of at most this many changed lines, with no risky files in the PR, runs on the engine's
   * review_model_small at review_effort_small (AK-117). 0 turns light reviews off.
   */
  review_small_lines: z.number().int().min(0).max(10_000).default(150),

  limits: z
    .object({
      max_minutes: z.number().int().min(1).max(24 * 60).default(60),
      /** Total agent working time per day; past it, instructions wait until tomorrow. */
      max_hours_per_day: z.number().min(0.5).max(24).default(3),
      max_turns: z.number().int().min(1).max(2000).default(300),
      /** A follower's reply run stops after this many turns, with one notice (AK-116). */
      reply_max_turns: z.number().int().min(1).max(200).default(15),
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
      /** For replies to teammate agents only (AK-91); "" uses the usual model. */
      reply_model: z.string().default("sonnet"),
      reply_effort: z.enum(EFFORTS).default("low"),
      /** For the lead's reviews of small, non-risky changes (AK-117); "" uses the usual model. */
      review_model_small: z.string().default("sonnet"),
      review_effort_small: z.enum(EFFORTS).default("low"),
    })
    .prefault({}),

  codex: z
    .object({
      sandbox: z.enum(["read-only", "workspace-write", "danger-full-access"]).default("workspace-write"),
      network: z.boolean().default(true),
      model: z.string().optional(),
      effort: z.enum(EFFORTS).optional(),
      /** For replies to teammate agents only (AK-91); unset keeps the usual model. */
      reply_model: z.string().optional(),
      reply_effort: z.enum(EFFORTS).default("low"),
      /** For the lead's reviews of small, non-risky changes (AK-117); unset keeps the usual model. */
      review_model_small: z.string().optional(),
      review_effort_small: z.enum(EFFORTS).default("low"),
    })
    .prefault({}),

  /** Any provider's model through OpenCode (DEC-26, CON-25). The key is never in this file. */
  opencode: z
    .object({
      /** OpenCode's provider id, e.g. "deepseek". */
      provider: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/).optional(),
      /** The model, as "provider/model" or just the model's id. */
      model: z.string().optional(),
      /** Dollars per day; 0 means no limit. */
      daily_usd: z.number().min(0).default(0),
      /** The provider's own reasoning setting (OpenCode's --variant, e.g. "high"); unset is the model's default. */
      variant: z.string().optional(),
      /** The variable OpenCode reads the key from, for a provider AutoKolab doesn't know yet. */
      key_env: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
      /** Where a model on this computer listens (Ollama); unset is the provider's usual address. */
      base_url: z.string().url().optional(),
      effort: z.enum(EFFORTS).optional(),
      reply_model: z.string().optional(),
      reply_effort: z.enum(EFFORTS).default("low"),
      review_model_small: z.string().optional(),
      review_effort_small: z.enum(EFFORTS).default("low"),
    })
    .prefault({}),
});

export type Engine = (typeof ENGINES)[number];

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
  if (r.data.engine === "opencode" && !opencodeProvider(r.data)) {
    throw new Error(`Runner limits for ${profile} have problems:\n  opencode.provider: say which provider this agent uses, e.g. provider = "deepseek"`);
  }
  return { ...r.data, profile };
}

/** The OpenCode agent's provider: the toml's, else the one its model names. */
export function opencodeProvider(cfg: Pick<RunnerConfig, "opencode">): string | undefined {
  return cfg.opencode.provider ?? (cfg.opencode.model?.includes("/") ? cfg.opencode.model.split("/")[0] : undefined);
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

/** What an API-model agent runs (CON-25): set when it's connected. */
export interface ApiModel {
  provider: string;
  model: string;
  dailyUsd: number;
  /** The OpenCode that `autokolab connect` found or installed, so the background service finds it too. */
  bin?: string;
  /** Where a model on this computer listens (Ollama), when it isn't the usual address. */
  baseUrl?: string;
}

export function runnerTemplate(agentId: string, engine: Engine, api?: ApiModel): string {
  return `# AutoKolab runner limits for this agent, set once by its person. Inside them the agent works
# unattended and never stops to ask; anything outside them is reported as "blocked" instead.
# Changes apply when the runner restarts (autokolab restart). Model and effort are different: the
# ones set on AutoKolab (People page, or the project's lead) apply from the next run, no restart, and
# win over the model and effort below unless model_locked is true.

agent_id = "${agentId}"
engine = "${engine}"
${api?.bin ? `opencode_bin = ${JSON.stringify(api.bin)}\n` : ""}# model_locked = true             # always use the model and effort in this file, whatever AutoKolab says
auto_review = true                # as the project's lead: review each finished PR once its tests pass (false: only when asked)
review_small_lines = 150          # a review of up to this many changed lines, nothing risky, uses review_model_small (0: never)

[limits]
max_minutes = 60               # per instruction; the run is stopped after this
max_hours_per_day = 3          # total agent work per day; after that, instructions wait for tomorrow
max_turns = 300                # Claude Code only
reply_max_turns = 15           # a reply to a teammate stops after this many turns (not for the project's lead)
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
# effort = "high"                 # low, medium, high, xhigh or max; medium if not set
# Quick replies to another agent's question, answer or chat use these instead (model_locked = true
# keeps the model and effort above for replies too):
# reply_model = "sonnet"          # "" to use the model above
# reply_effort = "low"
# As the project's lead, reviews of small changes with nothing risky use these:
# review_model_small = "sonnet"   # "" to use the model above
# review_effort_small = "low"

[codex]
sandbox = "workspace-write"
network = true                    # needed for git push, installs, gh
# model = "gpt-5-codex"
# effort = "high"                 # low, medium, high, xhigh or max; medium if not set
# Quick replies to another agent's question, answer or chat use these instead (model_locked = true
# keeps the model and effort above for replies too):
# reply_model = "gpt-5-codex"     # not set: the model above
# reply_effort = "low"
# As the project's lead, reviews of small changes with nothing risky use these:
# review_model_small = "gpt-5-codex"  # not set: the model above
# review_effort_small = "low"

[opencode]
# Any provider's model through OpenCode. Its API key is never in this file: it's in this computer's
# keychain (macOS) or in ~/.config/autokolab/keys/<agent id> (mode 600), and goes only to OpenCode.
${api ? `provider = ${JSON.stringify(api.provider)}` : `# provider = "deepseek"`}
${api ? `model = ${JSON.stringify(api.model)}` : `# model = "deepseek-flash"        # \`opencode models deepseek\` lists them`}
daily_usd = ${api ? api.dailyUsd : 0}                     # dollars per day; work stops for the day once it's spent (0: no limit)
# variant = "high"                # the provider's reasoning setting, if the model has one
# key_env = "MY_PROVIDER_API_KEY" # only for a provider AutoKolab doesn't know yet
${api?.baseUrl ? `base_url = ${JSON.stringify(api.baseUrl)}` : `# base_url = "http://127.0.0.1:11434" # where a model on this computer (Ollama) listens`}
`;
}

/** Create the limits file for an agent if it doesn't have one yet. Returns its path if created. */
export function ensureRunnerConfig(agentId: string, name: string, engine: Engine, api?: ApiModel): string | null {
  if (runnerFileFor(agentId)) return null;
  mkdirSync(runnersDir(), { recursive: true });
  const path = runnerConfigPath(name);
  writeFileSync(path, runnerTemplate(agentId, engine, api));
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
