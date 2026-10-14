import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readConfigFile, writeConfigFile } from "../src/core/config.js";
import { keyFile, keyProblem, readAgentKey, removeAgentKey, saveAgentKey } from "../src/core/keys.js";
import { loadRunnerConfig, parseRunnerConfig, runnerConfigPath, runnerTemplate } from "../src/runner/config.js";
import { engineInvocation, opencodeInvocation } from "../src/runner/engines.js";
import { apiAgentOptions, checkKey, keyCheck, keyFromEnv, keyRemove, keySet } from "../src/setup/apimodel.js";
import { runConnect } from "../src/setup/pair.js";

// Connecting an API-model agent from a terminal (AK-108, CON-25): the connect line's options, the key
// check with the provider, where the key is kept, and that it shows up nowhere else.

const AID = "7a1c2a9e-1b2c-4d5e-8f90-123456789abc";
const KEY = "sk-fake-AK108-0123456789abcdef";
const linux = { platform: "linux" as const };
const mcp = { command: "/usr/bin/node", args: ["/opt/autokolab/cli.js", "mcp"] };

type Call = { url: string; init?: RequestInit };
/** A stand-in for the network: the website's /api/connect, and a provider that accepts only KEY. */
function fakeNet(o: { status?: number; models?: string[] } = {}) {
  const calls: Call[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith("/api/connect")) {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        url: "https://example.supabase.co",
        anonKey: "anon-public",
        project: { name: "AutoKolab", slug: "autokolab", repo: "yellapragada1996/autokolab" },
        agents: body.agents.map((a: { vendor: string; name?: string }) => ({ id: AID, name: a.name ?? `ana-${a.vendor}`, vendor: a.vendor, token: `ak1.${AID}.agent-secret` })),
      });
    }
    if (u.endsWith("/api/tags")) return Response.json({ models: (o.models ?? []).map((name) => ({ name, model: name })) });
    const auth = new Headers(init?.headers).get("authorization");
    if (o.status) return new Response("{}", { status: o.status });
    if (auth !== `Bearer ${KEY}`) return new Response('{"error":"bad key"}', { status: 401 });
    return Response.json({ object: "list", data: (o.models ?? ["deepseek-chat", "deepseek-reasoner"]).map((id) => ({ id })) });
  }) as typeof fetch;
  return { f, calls };
}

let home: string;
const saved: Record<string, string | undefined> = {};
const ENV = ["XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_DATA_HOME", "AUTOKOLAB_URL", "AUTOKOLAB_ANON_KEY", "AUTOKOLAB_TOKEN", "AK108_KEY", "OLLAMA_HOST"];
let out: string[];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ak-connect-api-"));
  for (const k of ENV) saved[k] = process.env[k];
  for (const k of ENV) delete process.env[k];
  process.env.XDG_CONFIG_HOME = join(home, "config");
  process.env.XDG_STATE_HOME = join(home, "state");
  process.env.XDG_DATA_HOME = join(home, "data");
  out = [];
  const grab = (...a: unknown[]) => void out.push(a.map(String).join(" "));
  vi.spyOn(console, "log").mockImplementation(grab);
  vi.spyOn(console, "error").mockImplementation(grab);
  vi.spyOn(console, "warn").mockImplementation(grab);
  vi.spyOn(process.stdout, "write").mockImplementation((s: string | Uint8Array) => (out.push(String(s)), true));
  vi.spyOn(process.stderr, "write").mockImplementation((s: string | Uint8Array) => (out.push(String(s)), true));
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(home, { recursive: true, force: true });
});

/** Every file under a folder. */
function files(dir: string): string[] {
  let found: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const n of names) {
    const p = join(dir, n);
    found = statSync(p).isDirectory() ? [...found, ...files(p)] : [...found, p];
  }
  return found;
}

const line = { engine: "opencode", provider: "deepseek", model: "deepseek-chat", name: "ana-deepseek", dailyUsd: "5" };

describe("the connect line's options", () => {
  it("without them, nothing changes", () => {
    expect(apiAgentOptions({})).toBeNull();
  });

  it("reads CON-25's options", () => {
    expect(apiAgentOptions({ ...line, keyEnv: "AK108_KEY" })).toEqual({ engine: "opencode", provider: "deepseek", model: "deepseek-chat", name: "ana-deepseek", dailyUsd: 5, keyEnv: "AK108_KEY" });
    expect(apiAgentOptions({ ...line, model: "deepseek/deepseek-chat", dailyUsd: undefined })).toMatchObject({ model: "deepseek-chat", dailyUsd: 0 });
    expect(apiAgentOptions({ engine: "opencode", provider: "ollama", model: "qwen2.5-coder:7b" })).toMatchObject({ provider: "ollama", model: "qwen2.5-coder:7b" });
  });

  it("says plainly what's wrong", () => {
    expect(() => apiAgentOptions({ ...line, engine: "aider" })).toThrow(/doesn't know the engine "aider"/);
    expect(() => apiAgentOptions({ provider: "deepseek" })).toThrow(/--engine opencode/);
    expect(() => apiAgentOptions({ ...line, provider: "acme" })).toThrow(/doesn't know the provider "acme".*deepseek/);
    expect(() => apiAgentOptions({ ...line, model: "" })).toThrow(/which DeepSeek model/);
    expect(() => apiAgentOptions({ ...line, dailyUsd: "five" })).toThrow(/dollars per day/);
    expect(() => apiAgentOptions({ ...line, dailyUsd: "-1" })).toThrow(/dollars per day/);
    expect(() => apiAgentOptions({ ...line, name: "Ana DeepSeek" })).toThrow(/lowercase letters/);
    expect(() => apiAgentOptions({ ...line, keyEnv: "not a name" })).toThrow(/environment variable/);
  });
});

describe("checking a key with its provider", () => {
  it("one request to the provider, with the key only there", async () => {
    const { f, calls } = fakeNet();
    expect(await checkKey("deepseek", KEY, { model: "deepseek-chat", fetch: f })).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.deepseek.com/models");
  });

  it("a rejected key, in the contract's words", async () => {
    const { f } = fakeNet();
    expect(await checkKey("deepseek", "sk-wrong", { fetch: f })).toEqual({
      ok: false,
      rejected: true,
      message: "DeepSeek didn't accept that key. Check you copied all of it, then run the line again.",
    });
    expect(await checkKey("deepseek", "sk-wrong", { fetch: f, again: "command" })).toMatchObject({ message: /then try again\.$/ });
  });

  it("a provider that can't be reached, or answers something else, saves nothing either", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await checkKey("deepseek", KEY, { fetch: down })).toMatchObject({ ok: false, rejected: false, message: /couldn't reach DeepSeek.*internet connection/ });
    expect(await checkKey("deepseek", KEY, { fetch: fakeNet({ status: 500 }).f })).toMatchObject({ ok: false, message: /answered 500/ });
  });

  it("notes a model the provider doesn't list, without stopping", async () => {
    const r = await checkKey("deepseek", KEY, { model: "deepseek-nope", fetch: fakeNet().f });
    expect(r).toMatchObject({ ok: true, note: /doesn't list a model called deepseek-nope/ });
  });

  it("sends the key the way each provider wants it", async () => {
    const { f, calls } = fakeNet({ status: 200 });
    await checkKey("google", KEY, { fetch: f });
    await checkKey("anthropic", KEY, { fetch: f });
    await checkKey("openrouter", KEY, { fetch: f });
    expect(new Headers(calls[0].init?.headers).get("x-goog-api-key")).toBe(KEY);
    expect(new Headers(calls[1].init?.headers).get("x-api-key")).toBe(KEY);
    expect(new Headers(calls[1].init?.headers).get("anthropic-version")).toBe("2023-06-01");
    expect(calls[2].url).toBe("https://openrouter.ai/api/v1/key");
    for (const c of calls.slice(0, 2)) expect(new Headers(c.init?.headers).get("authorization")).toBeNull();
  });

  it("a local model needs no key: Ollama must be running and have the model", async () => {
    expect(await checkKey("ollama", null, { model: "qwen2.5-coder:7b", fetch: fakeNet({ models: ["qwen2.5-coder:7b"] }).f })).toEqual({ ok: true });
    expect(await checkKey("ollama", null, { model: "llama3.2", fetch: fakeNet({ models: ["llama3.2:latest"] }).f })).toEqual({ ok: true });
    expect(await checkKey("ollama", null, { model: "llama3.2", fetch: fakeNet({ models: [] }).f })).toMatchObject({ ok: false, message: /ollama pull llama3.2/ });
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await checkKey("ollama", null, { fetch: down })).toMatchObject({ ok: false, message: /isn't running on this computer.*ollama serve/ });
  });

  it("says when a provider's key can't be checked in advance", async () => {
    expect(await checkKey("zhipuai", KEY, { fetch: fakeNet().f })).toMatchObject({ ok: true, note: /can't check a Zhipu key in advance/ });
  });

  it("reads --key-env, naming only the variable", () => {
    expect(keyFromEnv("AK108_KEY", { AK108_KEY: ` ${KEY}\n` })).toBe(KEY);
    expect(() => keyFromEnv("AK108_KEY", {})).toThrow("The environment variable AK108_KEY is empty or not set.");
  });
});

describe("keeping the key", () => {
  it("in a file only its owner can read, in a folder only its owner can open", () => {
    expect(saveAgentKey(AID, KEY, { platform: "linux" })).toBe("file");
    expect(statSync(keyFile(AID)).mode & 0o777).toBe(0o600);
    expect(statSync(join(keyFile(AID), "..")).mode & 0o777).toBe(0o700);
    expect(readAgentKey(AID, { platform: "linux" })).toEqual({ key: KEY, source: "file" });
    saveAgentKey(AID, "sk-replaced-0000", { platform: "linux" });
    expect(readAgentKey(AID, { platform: "linux" }).key).toBe("sk-replaced-0000");
  });

  it("in the keychain on a Mac, with no copy in a file; the file when the keychain can't", () => {
    mkdirSync(join(keyFile(AID), ".."), { recursive: true });
    writeFileSync(keyFile(AID), "old", { mode: 0o600 });
    const keychainWrite = vi.fn(() => true);
    expect(saveAgentKey(AID, KEY, { platform: "darwin", keychainWrite })).toBe("keychain");
    expect(keychainWrite).toHaveBeenCalledWith(AID, KEY);
    expect(() => statSync(keyFile(AID))).toThrow();
    expect(saveAgentKey(AID, KEY, { platform: "darwin", keychainWrite: () => false })).toBe("file");
  });

  it("refuses something that isn't a key", () => {
    expect(keyProblem(KEY)).toBeNull();
    expect(keyProblem("")).toMatch(/No key/);
    expect(keyProblem("sk-abc def")).toMatch(/doesn't look like an API key/);
    expect(keyProblem('sk-"abc')).toMatch(/doesn't look like an API key/);
    expect(() => saveAgentKey(AID, "two words", { platform: "linux" })).toThrow(/doesn't look like/);
  });

  it("removes it from wherever it is", () => {
    saveAgentKey(AID, KEY, { platform: "linux" });
    expect(removeAgentKey(AID, { platform: "linux" })).toBe(true);
    expect(removeAgentKey(AID, { platform: "linux" })).toBe(false);
    const keychainDelete = vi.fn(() => true);
    expect(removeAgentKey(AID, { platform: "darwin", keychainDelete })).toBe(true);
    expect(keychainDelete).toHaveBeenCalledWith(AID);
  });
});

describe("autokolab connect with an API model", () => {
  it("checks the key, creates one agent, keeps the key in the key store only, and says so", async () => {
    process.env.AK108_KEY = KEY;
    const { f, calls } = fakeNet();
    const r = await runConnect("7KQM-2PXA", { site: "https://ak.test", api: apiAgentOptions({ ...line, keyEnv: "AK108_KEY" }), setupTools: false, keyStore: linux, fetch: f });
    expect(r.agents).toEqual([{ id: AID, name: "ana-deepseek", engine: "opencode", created: true }]);

    // The key went to DeepSeek, before the agent was made; the website got only the vendor and name.
    expect(calls.map((c) => c.url)).toEqual(["https://api.deepseek.com/models", "https://ak.test/api/connect"]);
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({ code: "7KQM2PXA", agents: [{ vendor: "opencode", name: "ana-deepseek" }] });
    expect(String(calls[1].init?.body)).not.toContain(KEY);

    // Saved where CON-25 says off a Mac: a file only its owner can read.
    expect(readFileSync(keyFile(AID), "utf8").trim()).toBe(KEY);
    expect(statSync(keyFile(AID)).mode & 0o777).toBe(0o600);
    // The runner file has the agent's choices and no key.
    const cfg = loadRunnerConfig("ana-deepseek");
    expect(cfg).toMatchObject({ agent_id: AID, engine: "opencode", opencode: { provider: "deepseek", model: "deepseek-chat", daily_usd: 5 } });
    expect(readConfigFile().profiles?.[AID]).toMatchObject({ name: "ana-deepseek", kind: "agent", client: "opencode" });

    // The three lines.
    const said = out.join("\n");
    expect(said).toMatch(/ana-deepseek.* runs deepseek\/deepseek-chat\./);
    expect(said).toContain("Your key is stored on this computer only.");
    expect(said).toMatch(/It now shows on People: .*https:\/\/ak\.test\/p\/autokolab\/people/);

    // And the key is nowhere else: not in anything printed, nor in any other file or log.
    expect(said).not.toContain(KEY);
    const elsewhere = files(home).filter((p) => p !== keyFile(AID) && readFileSync(p, "utf8").includes(KEY));
    expect(elsewhere).toEqual([]);
  });

  it("asks for the key with the provider's name in the prompt when there's no --key-env", async () => {
    const ask = vi.fn(async () => KEY);
    await runConnect("7KQM2PXA", { site: "https://ak.test", api: apiAgentOptions(line), setupTools: false, keyStore: linux, fetch: fakeNet().f, ask });
    expect(ask).toHaveBeenCalledWith("  Paste your DeepSeek API key. It stays on this computer: ");
    expect(out.join("\n")).not.toContain(KEY);
  });

  it("a rejected key creates nothing and saves nothing", async () => {
    process.env.AK108_KEY = "sk-wrong-0000";
    const { f, calls } = fakeNet();
    await expect(runConnect("7KQM2PXA", { site: "https://ak.test", api: apiAgentOptions({ ...line, keyEnv: "AK108_KEY" }), setupTools: false, keyStore: linux, fetch: f })).rejects.toThrow(
      "DeepSeek didn't accept that key. Check you copied all of it, then run the line again.",
    );
    expect(calls.map((c) => c.url)).toEqual(["https://api.deepseek.com/models"]);
    expect(files(home)).toEqual([]);
  });

  it("a local model: no key asked for, and the runner file says where it listens", async () => {
    process.env.OLLAMA_HOST = "127.0.0.1:11500";
    const ask = vi.fn(async () => KEY);
    const { f, calls } = fakeNet({ models: ["qwen2.5-coder:7b"] });
    await runConnect("7KQM2PXA", { site: "https://ak.test", api: apiAgentOptions({ engine: "opencode", provider: "ollama", model: "qwen2.5-coder:7b", name: "ana-local" }), setupTools: false, keyStore: linux, fetch: f, ask });
    expect(ask).not.toHaveBeenCalled();
    expect(calls[0].url).toBe("http://127.0.0.1:11500/api/tags");
    expect(loadRunnerConfig("ana-local").opencode).toMatchObject({ provider: "ollama", model: "qwen2.5-coder:7b", base_url: "http://127.0.0.1:11500" });
    expect(out.join("\n")).not.toContain("Your key is stored");
  });
});

describe("autokolab key set, check and remove", () => {
  const setUp = (engine = "opencode") => {
    writeConfigFile({ url: "https://example.supabase.co", anonKey: "anon", profiles: { [AID]: { token: "t", name: "ana-deepseek", kind: "agent", client: engine } } });
    mkdirSync(join(runnerConfigPath("x"), ".."), { recursive: true });
    writeFileSync(runnerConfigPath("ana-deepseek"), runnerTemplate(AID, engine as "opencode", engine === "opencode" ? { provider: "deepseek", model: "deepseek-chat", dailyUsd: 0 } : undefined));
  };

  it("set: asks, checks, saves; check: says DeepSeek accepted it; remove: forgets it", async () => {
    setUp();
    await keySet("ana-deepseek", { ask: async () => KEY, fetch: fakeNet().f, store: linux });
    expect(readAgentKey(AID, { platform: "linux" }).key).toBe(KEY);
    await keyCheck("ana-deepseek", { fetch: fakeNet().f, store: linux });
    expect(out.join("\n")).toContain("DeepSeek accepted the key.");
    keyRemove("ana-deepseek", linux);
    expect(() => readAgentKey(AID, { platform: "linux" })).toThrow(/don't have an API key/);
    expect(out.join("\n")).not.toContain(KEY);
  });

  it("set refuses a rejected key and keeps the old one", async () => {
    setUp();
    saveAgentKey(AID, KEY, { platform: "linux" });
    await expect(keySet("ana-deepseek", { ask: async () => "sk-wrong-0000", fetch: fakeNet().f, store: linux })).rejects.toThrow("DeepSeek didn't accept that key. Check you copied all of it, then try again.");
    expect(readAgentKey(AID, { platform: "linux" }).key).toBe(KEY);
  });

  it("check names the fix when the provider stops accepting the key", async () => {
    setUp();
    saveAgentKey(AID, "sk-revoked-0000", { platform: "linux" });
    await expect(keyCheck("ana-deepseek", { fetch: fakeNet().f, store: linux })).rejects.toThrow("DeepSeek didn't accept ana-deepseek's key. Set a new one with `autokolab key set ana-deepseek`.");
  });

  it("work only for API-model agents on this computer", async () => {
    setUp("claude");
    await expect(keySet("ana-deepseek", { ask: async () => KEY })).rejects.toThrow(/Claude Code, which uses its own sign-in/);
    expect(() => keyRemove("someone-else")).toThrow(/no agent called someone-else on this computer/);
  });
});

describe("running a local model", () => {
  const cfg = parseRunnerConfig(`agent_id = "${AID}"\nengine = "opencode"\n[opencode]\nprovider = "ollama"\nmodel = "qwen2.5-coder:7b"\nbase_url = "http://127.0.0.1:11500/"`, "ana-local");

  it("tells OpenCode where the model is, and needs no key", () => {
    const key = vi.fn(() => KEY);
    const inv = engineInvocation(cfg, mcp, null, "/tmp/wt", {}, key);
    expect(key).not.toHaveBeenCalled();
    const conf = JSON.parse(readFileSync(inv.env!.OPENCODE_CONFIG, "utf8"));
    expect(conf.provider.ollama).toEqual({ npm: "@ai-sdk/openai-compatible", name: "Ollama", options: { baseURL: "http://127.0.0.1:11500/v1" }, models: { "qwen2.5-coder:7b": { name: "qwen2.5-coder:7b" } } });
    expect(inv.args).toContain("ollama/qwen2.5-coder:7b");
    expect(Object.keys(inv.env!)).toEqual(["OPENCODE_CONFIG"]);
    expect(inv.secrets).toEqual([]);
    rmSync(inv.tempDir, { recursive: true, force: true });
  });

  it("a cloud provider still refuses to start without its key", () => {
    const deepseek = parseRunnerConfig(`agent_id = "${AID}"\nengine = "opencode"\n[opencode]\nprovider = "deepseek"\nmodel = "deepseek-chat"`, "x");
    expect(() => opencodeInvocation(deepseek, mcp, null, undefined)).toThrow(/don't have an API key/);
  });

  it("the runner file keeps where OpenCode is and where the model listens", () => {
    const text = runnerTemplate(AID, "opencode", { provider: "ollama", model: "llama3.2", dailyUsd: 0, bin: "/home/ana/.local/share/autokolab/opencode/node_modules/.bin/opencode", baseUrl: "http://127.0.0.1:11500" });
    const c = parseRunnerConfig(text, "ana-local");
    expect(c.opencode_bin).toBe("/home/ana/.local/share/autokolab/opencode/node_modules/.bin/opencode");
    expect(c.opencode.base_url).toBe("http://127.0.0.1:11500");
    expect(parseRunnerConfig(runnerTemplate(AID, "opencode", { provider: "deepseek", model: "deepseek-chat", dailyUsd: 1 }), "x").opencode.base_url).toBeUndefined();
  });
});
