import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ReadStream, WriteStream } from "node:tty";
import { dataDir, findProfile, readConfigFile } from "../core/config.js";
import { keyFile, keyProblem, readAgentKey, removeAgentKey, saveAgentKey, type KeySource, type KeyStore } from "../core/keys.js";
import { isLocalProvider, LOCAL_PROVIDERS, PROVIDERS, providerName } from "../core/providers.js";
import { loadRunnerConfig, opencodeProvider, runnerFileFor, type RunnerConfig } from "../runner/config.js";
import { which } from "./agents.js";
import { info, ok, warn } from "./ui.js";

// Adding an API-model agent from a terminal (AK-108, CON-25): the options on the connect line, the
// key typed here with hidden input (or read from an environment variable), one small request to the
// provider to check it before it's saved, and OpenCode installed for this user if it's missing.
// The key is never printed, logged, put in a command line or sent anywhere but its own provider.

/** What the connect line's options ask for. */
export interface ApiAgentOptions {
  engine: "opencode";
  /** OpenCode's provider id, e.g. "deepseek". */
  provider: string;
  /** The model's id at that provider, e.g. "deepseek-chat". */
  model: string;
  /** The agent's name; unset lets the website pick one. */
  name?: string;
  /** Dollars per day; 0 means no limit. */
  dailyUsd: number;
  /** Read the key from this environment variable instead of asking (containers, scripts). */
  keyEnv?: string;
}

const known = () => [...Object.keys(PROVIDERS), ...Object.keys(LOCAL_PROVIDERS)].join(", ");

/**
 * The connect line's options for an API-model agent, checked; null when none were given (today's
 * Claude Code and Codex behaviour). Throws a plain sentence when they're incomplete or wrong.
 */
export function apiAgentOptions(o: { engine?: string; provider?: string; model?: string; name?: string; dailyUsd?: string; keyEnv?: string }): ApiAgentOptions | null {
  const given = [o.engine, o.provider, o.model, o.name, o.dailyUsd, o.keyEnv].some((v) => v !== undefined);
  if (!given) return null;
  if (o.engine !== "opencode") {
    throw new Error(o.engine ? `AutoKolab doesn't know the engine "${o.engine}". Use --engine opencode.` : "Say which engine runs the agent: --engine opencode.");
  }
  const provider = (o.provider ?? "").trim().toLowerCase();
  if (!provider) throw new Error("Say which provider the agent uses, e.g. --provider deepseek.");
  if (!PROVIDERS[provider] && !isLocalProvider(provider)) {
    throw new Error(`AutoKolab doesn't know the provider "${provider}" yet. Use one of: ${known()}.`);
  }
  let model = (o.model ?? "").trim();
  if (model.startsWith(`${provider}/`)) model = model.slice(provider.length + 1);
  if (!model) throw new Error(`Say which ${providerName(provider)} model the agent uses, e.g. --model ${provider === "deepseek" ? "deepseek-chat" : "<model>"}.`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,79}$/.test(model)) throw new Error(`"${model}" doesn't look like a model name.`);
  const name = o.name?.trim().toLowerCase();
  if (name !== undefined && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(name)) {
    throw new Error("The agent's name can have lowercase letters, digits and dashes (2 to 40 characters).");
  }
  const dailyUsd = o.dailyUsd === undefined ? 0 : Number(o.dailyUsd);
  if (!Number.isFinite(dailyUsd) || dailyUsd < 0 || dailyUsd > 10_000) throw new Error("--daily-usd is dollars per day: a number like 5, or 0 for no limit.");
  if (o.keyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(o.keyEnv)) throw new Error("--key-env takes the name of an environment variable, like DEEPSEEK_API_KEY.");
  return { engine: "opencode", provider, model, name, dailyUsd, keyEnv: o.keyEnv };
}

// ---------------------------------------------------------------- the key

/** The key from an environment variable (--key-env). Only the variable's name is ever shown. */
export function keyFromEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = env[name]?.trim();
  if (!key) throw new Error(`The environment variable ${name} is empty or not set. Put the key in it, then run the line again.`);
  return key;
}

/**
 * Asks for the key in the terminal with nothing echoed. Works under `curl … | bash` too: stdin is
 * the script there, so it reads the terminal itself (/dev/tty).
 */
export async function askHidden(question: string): Promise<string> {
  let input: ReadStream;
  let output: WriteStream;
  let fds: number[] = [];
  if (process.stdin.isTTY && process.stdout.isTTY) {
    input = process.stdin as ReadStream;
    output = process.stdout as WriteStream;
  } else {
    try {
      fds = [openSync("/dev/tty", "r"), openSync("/dev/tty", "w")];
    } catch {
      fds.forEach((fd) => closeSync(fd));
      throw new Error("There's no terminal here to type the key in. Put the key in an environment variable and add --key-env <its name> to the line.");
    }
    input = new ReadStream(fds[0]);
    output = new WriteStream(fds[1]);
  }
  output.write(question);
  input.setRawMode(true);
  input.setEncoding("utf8");
  input.resume();
  return new Promise((resolve, reject) => {
    let typed = "";
    const finish = (err: Error | null) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (fds.length) {
        input.destroy();
        output.destroy();
      }
      if (err) reject(err);
      else resolve(typed.trim());
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(null);
        if (ch === "\u0003" || ch === "\u0004") return finish(new Error("Stopped. Nothing was saved."));
        if (ch === "\u007f" || ch === "\b") typed = typed.slice(0, -1);
        else if (ch === "\u0015") typed = "";
        else if (ch >= " ") typed += ch;
      }
    };
    input.on("data", onData);
  });
}

/** The words that end a failure: "run the line again" on connect, "try again" for `key set`. */
export type Again = "line" | "command";
const againWords = (a: Again) => (a === "line" ? "run the line again" : "try again");

export type KeyCheckResult =
  | { ok: true; note?: string }
  | { ok: false; rejected: boolean; message: string };

export interface CheckOptions {
  model?: string;
  /** Where a local model server listens (Ollama). */
  baseUrl?: string;
  again?: Again;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Checks a key with one small request to its provider: listing models, mostly (for a local model,
 * that it's running and has the model). Only the provider ever sees the key.
 */
export async function checkKey(provider: string, key: string | null, o: CheckOptions = {}): Promise<KeyCheckResult> {
  const f = o.fetch ?? fetch;
  const again = againWords(o.again ?? "line");
  const name = providerName(provider);
  const signal = AbortSignal.timeout(o.timeoutMs ?? 15_000);
  const model = o.model?.startsWith(`${provider}/`) ? o.model.slice(provider.length + 1) : o.model;

  if (isLocalProvider(provider)) {
    const base = (o.baseUrl ?? LOCAL_PROVIDERS[provider].baseUrl).replace(/\/+$/, "");
    let tags: { models?: { name?: string; model?: string }[] };
    try {
      const res = await f(`${base}/api/tags`, { signal });
      if (!res.ok) return { ok: false, rejected: false, message: `${name} at ${base} answered ${res.status}. Check it's running, then ${again}.` };
      tags = (await res.json()) as typeof tags;
    } catch {
      return { ok: false, rejected: false, message: `${name} isn't running on this computer (nothing answers at ${base}). Start it with \`ollama serve\`, then ${again}.` };
    }
    const have = (tags.models ?? []).flatMap((m) => [m.name, m.model]).filter((x): x is string => !!x);
    if (model && !have.some((h) => h === model || h === `${model}:latest`)) {
      return { ok: false, rejected: false, message: `${name} doesn't have the model ${model} yet. Run \`ollama pull ${model}\`, then ${again}.` };
    }
    return { ok: true };
  }

  const check = PROVIDERS[provider]?.check;
  if (!check) return { ok: true, note: `AutoKolab can't check a ${name} key in advance; the agent's first run will show whether it works.` };
  if (!key) return { ok: false, rejected: true, message: "No key was given." };
  const headers: Record<string, string> = { ...check.headers };
  if (check.auth === "bearer") headers.authorization = `Bearer ${key}`;
  else headers[check.auth] = key;
  let res: Response;
  try {
    res = await f(check.url, { headers, signal });
  } catch (e) {
    const why = (e as Error).name === "TimeoutError" ? "it didn't answer in time" : "the connection failed";
    return { ok: false, rejected: false, message: `I couldn't reach ${name} to check the key (${why}). Check this computer's internet connection, then ${again}.` };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, rejected: true, message: `${name} didn't accept that key. Check you copied all of it, then ${again}.` };
  }
  if (!res.ok) return { ok: false, rejected: false, message: `${name} answered ${res.status} when I checked the key, so I didn't save it. Wait a minute, then ${again}.` };
  // Providers that list their models in OpenAI's shape can say whether the model exists.
  const body = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
  const ids = Array.isArray(body?.data) ? body.data.map((m) => m.id).filter((x): x is string => typeof x === "string") : [];
  if (model && ids.length && !ids.includes(model)) {
    return { ok: true, note: `${name} accepted the key, but doesn't list a model called ${model}. If the agent's first run fails, pick another model on the People page.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- OpenCode itself

/** The version AutoKolab was tested with (DEC-26). */
export const OPENCODE_VERSION = "1.19.0";

/** Where AutoKolab installs OpenCode for this user, when it isn't installed already. */
export function opencodeDir(): string {
  return join(dataDir(), "opencode");
}

/** Whether this OpenCode runs at all (a half-finished install doesn't). */
function runs(bin: string): boolean {
  return spawnSync(bin, ["--version"], { stdio: "ignore", timeout: 30_000 }).status === 0;
}

/** OpenCode on this computer that works: AutoKolab's own copy, else one on the PATH. */
export function findOpencode(): string | null {
  const own = join(opencodeDir(), "node_modules", ".bin", "opencode");
  if (existsSync(own) && runs(own)) return own;
  const onPath = which("opencode");
  return onPath && runs(onPath) ? onPath : null;
}

/**
 * The install folder's package.json. OpenCode's package fetches its program in an install script,
 * and npm 12 runs a dependency's install scripts only when the project allows them (allowScripts),
 * pinned here to the version AutoKolab tested. Older npm ignores the field and runs them anyway.
 */
export function opencodePackageJson(): string {
  return JSON.stringify({ private: true, allowScripts: { [`opencode-ai@${OPENCODE_VERSION}`]: true } }, null, 2) + "\n";
}

/** Installs OpenCode for this user with npm (no sudo) and returns its path. */
export function installOpencode(): string {
  const dir = opencodeDir();
  info(`Installing OpenCode ${OPENCODE_VERSION}, the open-source coding agent that runs API models. It's about 190 MB, goes in ${dir}, and needs no sudo.`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), opencodePackageJson());
  const r = spawnSync("npm", ["install", "--prefix", dir, "--no-audit", "--no-fund", "--loglevel=error", `opencode-ai@${OPENCODE_VERSION}`], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  const bin = join(dir, "node_modules", ".bin", "opencode");
  if (r.status !== 0 || !existsSync(bin)) {
    throw new Error(`Couldn't install OpenCode (npm ${r.error ? r.error.message : `exited with ${r.status}`}). Check the messages above, then run the line again.`);
  }
  if (!runs(bin)) throw new Error(`OpenCode was installed in ${dir} but doesn't start. Check the messages above, then run the line again.`);
  ok(`OpenCode ${OPENCODE_VERSION} installed`);
  return bin;
}

// ---------------------------------------------------------------- autokolab key …

/** An API-model agent on this computer, by name or id, with its runner settings. */
export function localApiAgent(ref: string): { id: string; name: string; cfg: RunnerConfig; provider: string } {
  const found = findProfile(readConfigFile(), ref);
  if (!found || found[1].kind !== "agent") {
    throw new Error(`There's no agent called ${ref} on this computer. A key can only be set on the computer its agent runs on.`);
  }
  const [id, p] = found;
  const file = runnerFileFor(id);
  if (!file) throw new Error(`${p.name} has no runner settings on this computer yet. Connect it with the line from the website first.`);
  const cfg = loadRunnerConfig(file);
  if (cfg.engine !== "opencode") {
    throw new Error(`${p.name} runs on ${cfg.engine === "claude" ? "Claude Code" : "Codex"}, which uses its own sign-in, not an API key.`);
  }
  return { id, name: p.name, cfg, provider: opencodeProvider(cfg)! };
}

const placeOf = (source: KeySource, id: string) => (source === "keychain" ? "in this computer's keychain" : `in ${keyFile(id)}, which only you can read`);

/** `autokolab key set <agent>`: ask (or read --key-env), check with the provider, then save. */
export async function keySet(ref: string, o: { keyEnv?: string; fetch?: typeof fetch; ask?: (q: string) => Promise<string>; store?: Partial<KeyStore> } = {}): Promise<void> {
  const a = localApiAgent(ref);
  const name = providerName(a.provider);
  if (isLocalProvider(a.provider)) {
    ok(`${a.name} runs a model on this computer (${name}), so it needs no key.`);
    return;
  }
  const key = o.keyEnv ? keyFromEnv(o.keyEnv) : await (o.ask ?? askHidden)(`  Paste ${a.name}'s ${name} API key. It stays on this computer: `);
  const problem = keyProblem(key);
  if (problem) throw new Error(problem);
  const r = await checkKey(a.provider, key, { model: a.cfg.opencode.model, again: "command", fetch: o.fetch });
  if (!r.ok) throw new Error(r.message);
  if (r.note) warn(r.note);
  else ok(`${name} accepted the key.`);
  const source = saveAgentKey(a.id, key, o.store);
  ok(`Saved ${a.name}'s key ${placeOf(source, a.id)}. It's used from the agent's next run.`);
}

/** `autokolab key check <agent>`: is the saved key still accepted? */
export async function keyCheck(ref: string, o: { fetch?: typeof fetch; store?: Partial<KeyStore> } = {}): Promise<void> {
  const a = localApiAgent(ref);
  const name = providerName(a.provider);
  if (isLocalProvider(a.provider)) {
    const r = await checkKey(a.provider, null, { model: a.cfg.opencode.model, baseUrl: a.cfg.opencode.base_url, again: "command", fetch: o.fetch });
    if (!r.ok) throw new Error(r.message);
    ok(`${name} is running and has ${a.cfg.opencode.model ?? "the model"}. ${a.name} needs no key.`);
    return;
  }
  const { key } = readAgentKey(a.id, o.store);
  const r = await checkKey(a.provider, key, { model: a.cfg.opencode.model, again: "command", fetch: o.fetch });
  if (!r.ok) {
    throw new Error(r.rejected ? `${name} didn't accept ${a.name}'s key. Set a new one with \`autokolab key set ${a.name}\`.` : r.message);
  }
  if (r.note) warn(r.note);
  else ok(`${name} accepted the key.`);
}

/** `autokolab key remove <agent>`: forget the key on this computer. */
export function keyRemove(ref: string, store?: Partial<KeyStore>): void {
  const a = localApiAgent(ref);
  if (removeAgentKey(a.id, store)) ok(`Removed ${a.name}'s key from this computer. It can't work until you add one with \`autokolab key set ${a.name}\`.`);
  else info(`${a.name} has no key on this computer.`);
}
