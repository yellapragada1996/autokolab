import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAgentKey } from "../src/core/keys.js";
import { PROVIDERS, providerKeyEnv, providerName } from "../src/core/providers.js";
import { opencodeProvider, parseRunnerConfig, runnerTemplate } from "../src/runner/config.js";
import {
  RATE_LIMIT_STOP_AFTER,
  chooseModel,
  engineInvocation,
  engineLabel,
  isRateLimitLog,
  noUsage,
  opencodeInvocation,
  opencodeModel,
  parseEvent,
  providerProblem,
  runEngine,
  scrubber,
  type EngineRun,
} from "../src/runner/engines.js";
import { RATE_LIMIT_WAIT_MS, overSpend, spendNotice, usageLimit } from "../src/runner/limit.js";
import { Runner, failedTicketReport } from "../src/runner/runner.js";

// API-model agents through OpenCode (AK-107, DEC-26, CON-25). The sample output in fixtures/ is from
// a real `opencode run --format json` (OpenCode 1.19) against a stand-in for DeepSeek's API.

const AID = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";
const mcp = { command: "/usr/bin/node", args: ["/opt/autokolab/cli.js", "mcp", "--profile", "ana-deepseek"] };
const KEY = "test-key-0000-not-real";
const cfgFor = (extra = "", head = "") =>
  parseRunnerConfig(`agent_id = "${AID}"\nengine = "opencode"\n${head}\n[opencode]\nprovider = "deepseek"\nmodel = "deepseek-chat"\n${extra}`, "ana-deepseek");
const freshRun = (): EngineRun => ({ sessionId: null, finalText: "", exitCode: null, timedOut: false, aborted: false, isError: false, usage: noUsage() });
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8").split("\n").filter(Boolean);

describe("the opencode runner settings", () => {
  it("reads provider, model and daily dollars, with no limit by default", () => {
    const cfg = cfgFor("daily_usd = 5");
    expect(cfg.engine).toBe("opencode");
    expect(cfg.opencode).toMatchObject({ provider: "deepseek", model: "deepseek-chat", daily_usd: 5 });
    expect(cfg.opencode_bin).toBe("opencode");
    expect(cfgFor().opencode.daily_usd).toBe(0);
  });

  it("needs a provider, given or named in the model", () => {
    expect(() => parseRunnerConfig(`agent_id = "${AID}"\nengine = "opencode"`, "x")).toThrow(/opencode\.provider/);
    const fromModel = parseRunnerConfig(`agent_id = "${AID}"\nengine = "opencode"\n[opencode]\nmodel = "openrouter/qwen/qwen3-coder"`, "x");
    expect(opencodeProvider(fromModel)).toBe("openrouter");
    expect(() => cfgFor("daily_usd = -1")).toThrow(/daily_usd/);
  });

  it("writes a template that parses, with the connect line's choices and no key", () => {
    const text = runnerTemplate(AID, "opencode", { provider: "deepseek", model: "deepseek-chat", dailyUsd: 5 });
    const cfg = parseRunnerConfig(text, "ana-deepseek");
    expect(cfg.opencode).toMatchObject({ provider: "deepseek", model: "deepseek-chat", daily_usd: 5 });
    expect(text).not.toMatch(/api_key\s*=/);
    // The other engines' files still parse with the new section in them.
    expect(parseRunnerConfig(runnerTemplate(AID, "claude"), "lee-claude").opencode.daily_usd).toBe(0);
  });

  it("names the engine by its provider in messages", () => {
    expect(engineLabel(cfgFor())).toBe("DeepSeek");
    expect(engineLabel(parseRunnerConfig(`agent_id = "${AID}"\nengine = "codex"`, "x"))).toBe("Codex");
  });
});

describe("providers and their key variables", () => {
  it("maps each provider to the variable OpenCode reads", () => {
    expect(providerKeyEnv("deepseek")).toBe("DEEPSEEK_API_KEY");
    expect(providerKeyEnv("openrouter")).toBe("OPENROUTER_API_KEY");
    expect(providerKeyEnv("google")).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(providerKeyEnv("someone-new")).toBeNull();
    expect(providerKeyEnv("someone-new", "NEW_API_KEY")).toBe("NEW_API_KEY");
    for (const p of Object.values(PROVIDERS)) expect(p.keyEnv).toMatch(/^[A-Z][A-Z0-9_]*$/);
    expect(providerName("deepseek")).toBe("DeepSeek");
    expect(providerName("someone-new")).toBe("someone-new");
  });
});

describe("the opencode command line", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const invoke = (...a: Parameters<typeof opencodeInvocation>) => {
    const inv = opencodeInvocation(...a);
    dirs.push(inv.tempDir);
    return inv;
  };

  it("runs headless with JSON events, the model as provider/model, and the error log on stderr", () => {
    const inv = invoke(cfgFor(), mcp, null, KEY);
    expect(inv.bin).toBe("opencode");
    expect(inv.args.slice(0, 3)).toEqual(["run", "--format", "json"]);
    expect(inv.args).toEqual(expect.arrayContaining(["--print-logs", "--log-level", "ERROR"]));
    expect(inv.args.slice(inv.args.indexOf("-m"), inv.args.indexOf("-m") + 2)).toEqual(["-m", "deepseek/deepseek-chat"]);
    expect(inv.args).not.toContain("--session");
    expect(inv.model).toBe("deepseek/deepseek-chat");
  });

  it("resumes a session and passes the provider's reasoning setting", () => {
    const inv = invoke(cfgFor(`variant = "high"`), mcp, "ses_abc", KEY);
    expect(inv.args.slice(inv.args.indexOf("--session"), inv.args.indexOf("--session") + 2)).toEqual(["--session", "ses_abc"]);
    expect(inv.args.slice(inv.args.indexOf("--variant"), inv.args.indexOf("--variant") + 2)).toEqual(["--variant", "high"]);
  });

  it("gives the key only through the provider's variable, never in the command line", () => {
    const inv = invoke(cfgFor(), mcp, null, KEY);
    expect(inv.env?.DEEPSEEK_API_KEY).toBe(KEY);
    expect(inv.secrets).toEqual([KEY]);
    expect(inv.args.join(" ")).not.toContain(KEY);
    expect(readFileSync(inv.env!.OPENCODE_CONFIG, "utf8")).not.toContain(KEY);
    expect(invoke(cfgFor(`key_env = "MY_KEY"`), mcp, null, KEY).env?.MY_KEY).toBe(KEY);
  });

  it("loads the AutoKolab tools and the owner's limits from its config file", () => {
    const cfg = cfgFor("", `[limits]\nprotected_branches = ["main", "prod"]\ndeny_paths = [".env.prod"]`);
    const conf = JSON.parse(readFileSync(invoke(cfg, mcp, null, KEY).env!.OPENCODE_CONFIG, "utf8"));
    expect(conf.mcp.autokolab).toEqual({ type: "local", command: ["/usr/bin/node", "/opt/autokolab/cli.js", "mcp", "--profile", "ana-deepseek"], enabled: true });
    expect(conf.share).toBe("disabled");
    expect(conf.autoupdate).toBe(false);
    const p = conf.permission;
    expect(p.external_directory).toBe("deny");
    expect(p.bash["git push --force*"]).toBe("deny");
    expect(p.bash["git commit --no-verify*"]).toBe("deny");
    expect(p.bash["git push origin main*"]).toBe("deny");
    expect(p.bash["git push origin HEAD:prod*"]).toBe("deny");
    expect(p.bash["*"]).toBe("allow");
    expect(p.edit["**/.env.prod"]).toBe("deny");
    expect(p.read[".env.prod"]).toBe("deny");
    // OpenCode applies the last matching rule, so "allow everything" has to come first.
    expect(Object.keys(p.bash)[0]).toBe("*");
    expect(Object.keys(p.edit)[0]).toBe("*");
  });

  it("uses the model set on AutoKolab, but only from the agent's own provider", () => {
    const cfg = cfgFor();
    expect(opencodeModel(cfg, chooseModel(cfg, { model: "deepseek/deepseek-reasoner", effort: null }))).toBe("deepseek/deepseek-reasoner");
    expect(opencodeModel(cfg, { model: "deepseek-reasoner" })).toBe("deepseek/deepseek-reasoner");
    expect(opencodeModel(cfg, {})).toBe("deepseek/deepseek-chat");
    expect(() => opencodeModel(cfg, { model: "openai/gpt-5" })).toThrow(/my API key is for DeepSeek/);
  });

  it("asks for the key only for opencode, and refuses to start without one", () => {
    const key = vi.fn(() => KEY);
    const claude = parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"`, "lee-claude");
    dirs.push(engineInvocation(claude, mcp, null, "/tmp/wt", {}, key).tempDir);
    expect(key).not.toHaveBeenCalled();
    dirs.push(engineInvocation(cfgFor(), mcp, null, "/tmp/wt", {}, key).tempDir);
    expect(key).toHaveBeenCalledTimes(1);
    expect(() => engineInvocation(cfgFor(), mcp, null, "/tmp/wt", {}, () => { throw new Error("I don't have an API key on this computer."); }))
      .toThrow(/don't have an API key/);
  });
});

describe("reading opencode's events", () => {
  it("gets the steps, the final text, the session and what the run used", () => {
    const run = freshRun();
    const plans: unknown[] = [];
    for (const line of fixture("opencode-run.jsonl")) {
      const before = run.plan;
      parseEvent("opencode", line, run);
      if (run.plan !== before) plans.push(run.plan);
    }
    expect(plans).toEqual([[
      { label: "Find the bug", status: "done" },
      { label: "Fix add()", status: "now" },
      { label: "Reply", status: "todo" },
    ]]);
    expect(run.finalText).toBe("I changed add() in calc.py to return a + b instead of a - b.");
    expect(run.sessionId).toBe("ses_ec41dc341ffeOjeJ3WL8ABLlqd");
    expect(run.isError).toBe(false);
    expect(run.reportsSteps).toBeUndefined();
    // Four model calls: the to-do list, the edit, an AutoKolab tool, the reply.
    expect(run.usage).toMatchObject({ inputTokens: 5100, outputTokens: 150, cacheReadTokens: 0, cacheWriteTokens: 0, turns: 4 });
    expect(run.usage!.costUsd).toBeCloseTo(0.000855, 9);
    expect(run.costUsd).toBeCloseTo(0.000855, 9);
  });

  it("notices when the agent keeps the ticket's steps itself, and adds reasoning to output", () => {
    const run = freshRun();
    parseEvent("opencode", JSON.stringify({ type: "tool_use", sessionID: "s", part: { tool: "autokolab_ticket_steps", state: { status: "error" } } }), run);
    expect(run.reportsSteps).toBeUndefined();
    parseEvent("opencode", JSON.stringify({ type: "tool_use", sessionID: "s", part: { tool: "autokolab_ticket_steps", state: { status: "completed" } } }), run);
    expect(run.reportsSteps).toBe(true);
    parseEvent("opencode", JSON.stringify({ type: "step_finish", part: { tokens: { input: 10, output: 5, reasoning: 7, cache: { read: 3, write: 1 } } } }), run);
    expect(run.usage).toMatchObject({ inputTokens: 10, outputTokens: 12, cacheReadTokens: 3, cacheWriteTokens: 1, turns: 1, costUsd: null });
    expect(run.costUsd).toBeUndefined();
  });

  it("drops cancelled to-dos", () => {
    const run = freshRun();
    const todos = [{ content: "Keep", status: "pending" }, { content: "Dropped", status: "cancelled" }];
    parseEvent("opencode", JSON.stringify({ type: "tool_use", part: { tool: "todowrite", state: { status: "completed", input: { todos } } } }), run);
    expect(run.plan).toEqual([{ label: "Keep", status: "todo" }]);
  });

  it("reads a provider's error and what it means", () => {
    const run = freshRun();
    for (const line of fixture("opencode-bad-key.jsonl")) parseEvent("opencode", line, run);
    expect(run.isError).toBe(true);
    expect(run.finalText).toMatch(/^Error: Authentication Fails.*\(HTTP 401\)$/);
    expect(providerProblem(run.finalText, "deepseek", "deepseek/deepseek-chat")?.kind).toBe("key");
  });
});

describe("plain reasons for provider errors", () => {
  const why = (text: string) => providerProblem(text, "deepseek", "deepseek/deepseek-chat");

  it("a rejected key", () => {
    expect(why("Error: Authentication Fails, Your api key: ****abcd is invalid (HTTP 401)")).toEqual({
      kind: "key",
      reason: "DeepSeek rejected my API key; set a new one with `autokolab key set`",
    });
    expect(why("Error: Incorrect API key provided")?.kind).toBe("key");
  });

  it("no credit, including OpenAI's quota error that comes as a 429", () => {
    expect(why("Error: Insufficient Balance (HTTP 402)")).toEqual({ kind: "credit", reason: "my DeepSeek account has no credit left; add credit on DeepSeek's site" });
    expect(why("Error: You exceeded your current quota, please check your plan and billing details. (HTTP 429)")?.kind).toBe("credit");
  });

  it("a model that doesn't exist, seen only in the error log", () => {
    const stdout = "Error: Unexpected server error. Check server logs for details.";
    const stderr = 'level=ERROR message=failed error="ProviderModelNotFoundError: Model not found: deepseek/deepseek-chat."';
    expect(why(stdout)).toBeNull();
    expect(why(`${stdout}\n${stderr}`)).toEqual({ kind: "model", reason: "deepseek-chat isn't a DeepSeek model in OpenCode; pick another model for me" });
    expect(why("Error: Model Not Exist (HTTP 400)")).toEqual({ kind: "model", reason: "DeepSeek doesn't have the model deepseek/deepseek-chat; pick another model for me" });
  });

  it("OpenCode's own refusal names the model it likely meant (AK-143)", () => {
    // Recorded from OpenCode 1.19.0 run with -m deepseek/deepseek-v4-flash.
    const out = [...fixture("opencode-model-not-found.jsonl"), ...fixture("opencode-model-not-found.stderr")].join("\n");
    expect(providerProblem(out, "deepseek", "deepseek/deepseek-v4-flash")).toEqual({
      kind: "model",
      reason: "deepseek-v4-flash isn't a DeepSeek model in OpenCode (did you mean deepseek-flash?); pick another model for me",
    });
    const routed = 'error="ProviderModelNotFoundError: Model not found: openrouter/qwen/qwen3-codr. Did you mean: openrouter/qwen/qwen3-coder?"';
    expect(providerProblem(routed, "openrouter", "openrouter/qwen/qwen3-codr")?.reason).toBe("qwen/qwen3-codr isn't an OpenRouter model in OpenCode (did you mean qwen/qwen3-coder?); pick another model for me");
  });

  it("rate limits, and nothing for other failures", () => {
    expect(why("AI_APICallError: Rate limit reached for requests")?.kind).toBe("rate");
    expect(why("Error: Too Many Requests (HTTP 429)")?.kind).toBe("rate");
    expect(why("Error: connect ECONNREFUSED 127.0.0.1:443")).toBeNull();
  });

  it("only the main agent's rate-limit errors count, not its title helper's", () => {
    const line = (small: boolean) => `timestamp=2026-10-14T19:27:44.121Z level=ERROR run=f26f message="stream error" providerID=deepseek small=${small} agent=build error.error="AI_APICallError: Rate limit reached for requests"`;
    expect(isRateLimitLog(line(false))).toBe(true);
    expect(isRateLimitLog(line(true))).toBe(false);
    expect(isRateLimitLog("level=ERROR message=failed error=Authentication Fails")).toBe(false);
  });

  it("a rate limit waits like a usage limit", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const run = { finalText: "", isError: true, aborted: false, timedOut: false, rateLimited: true };
    expect(usageLimit(run, now)?.until.getTime()).toBe(now.getTime() + RATE_LIMIT_WAIT_MS);
    expect(usageLimit({ ...run, rateLimited: false }, now)).toBeNull();
  });
});

describe("the agent's key", () => {
  let dir: string;
  const file = () => join(dir, AID);
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ak-keys-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("comes from the keychain on a Mac, before any file", () => {
    writeFileSync(file(), "from-file-0000", { mode: 0o600 });
    const keychain = vi.fn(() => "from-keychain-0000\n");
    expect(readAgentKey(AID, { platform: "darwin", keychain, file })).toEqual({ key: "from-keychain-0000", source: "keychain" });
    expect(keychain).toHaveBeenCalledWith(AID);
  });

  it("falls back to the 0600 file, and on Linux never asks the keychain", () => {
    writeFileSync(file(), "from-file-0000\n", { mode: 0o600 });
    expect(readAgentKey(AID, { platform: "darwin", keychain: () => null, file }).key).toBe("from-file-0000");
    const keychain = vi.fn(() => "x");
    expect(readAgentKey(AID, { platform: "linux", keychain, file })).toEqual({ key: "from-file-0000", source: "file" });
    expect(keychain).not.toHaveBeenCalled();
  });

  it("refuses a file others can read, and says plainly when there's no key", () => {
    writeFileSync(file(), "from-file-0000");
    chmodSync(file(), 0o644);
    expect(() => readAgentKey(AID, { platform: "linux", file })).toThrow(/can be read by other users.*chmod 600/);
    chmodSync(file(), 0o640);
    expect(() => readAgentKey(AID, { platform: "linux", file })).toThrow(/can be read by other users/);
    rmSync(file());
    expect(() => readAgentKey(AID, { platform: "linux", file })).toThrow(/don't have an API key on this computer/);
    writeFileSync(file(), "  \n", { mode: 0o600 });
    expect(() => readAgentKey(AID, { platform: "linux", file })).toThrow(/is empty/);
  });

  it("never puts the key in its errors", () => {
    writeFileSync(file(), KEY, { mode: 0o644 });
    chmodSync(file(), 0o644);
    try {
      readAgentKey(AID, { platform: "linux", file });
    } catch (e) {
      expect((e as Error).message).not.toContain(KEY);
    }
  });
});

describe("the daily spend limit", () => {
  it("stops once the day's dollars reach the limit; 0 means none", () => {
    expect(overSpend(4.99, 5)).toBe(false);
    expect(overSpend(5, 5)).toBe(true);
    expect(overSpend(1000, 0)).toBe(false);
    expect(spendNotice(5, "DeepSeek")).toBe("I've spent today's $5 limit on DeepSeek. I'll carry on tomorrow.");
    expect(spendNotice(2.5, "DeepSeek")).toBe("I've spent today's $2.50 limit on DeepSeek. I'll carry on tomorrow.");
  });

  describe("in the runner", () => {
    const state = mkdtempSync(join(tmpdir(), "ak-spend-"));
    const was = process.env.XDG_STATE_HOME;
    beforeEach(() => {
      process.env.XDG_STATE_HOME = state;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 14, 22, 0));
    });
    afterEach(() => {
      vi.useRealTimers();
      if (was === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = was;
    });
    afterAll(() => rmSync(state, { recursive: true, force: true }));

    const runner = (cfg = cfgFor("daily_usd = 1")) => {
      const logs: string[] = [];
      const notes: (string | null)[] = [];
      const r = Object.assign(Object.create(Runner.prototype), {
        ak: { me: { id: `agent-${Math.random()}`, paused: false } },
        cfg,
        isAgentRow: false,
        projects: [],
        spendUnknownSaid: false,
        spendNoticeDay: "",
        log: (m: string) => logs.push(m),
        setStatus: async (_s: string, note: string | null) => void notes.push(note),
      });
      return { r, logs, notes };
    };
    const costing = (usd: number | null, turns = 1): EngineRun => ({ ...{ sessionId: null, finalText: "", exitCode: 0, timedOut: false, aborted: false, isError: false }, usage: { ...noUsage(), turns, costUsd: usd } });

    it("adds up each run's cost and stops at the limit, with one notice for the day", async () => {
      const { r, notes } = runner();
      r.addUsage(60, costing(0.6));
      expect(r.overLimit()).toBe(false);
      r.addUsage(60, costing(0.45));
      expect(r.spentToday()).toBeCloseTo(1.05);
      expect(r.overLimit()).toBe(true);
      await r.noteSpendLimit();
      await r.noteSpendLimit();
      expect(notes).toEqual(["I've spent today's $1 limit on DeepSeek. I'll carry on tomorrow."]);
    });

    it("starts again after local midnight", () => {
      const { r } = runner();
      r.addUsage(60, costing(2));
      expect(r.overLimit()).toBe(true);
      vi.setSystemTime(new Date(2026, 9, 15, 0, 1));
      expect(r.spentToday()).toBe(0);
      expect(r.overLimit()).toBe(false);
    });

    it("says once when the engine reports no cost, and has no limit at 0", () => {
      const { r, logs } = runner();
      r.addUsage(60, costing(null));
      r.addUsage(60, costing(null));
      expect(logs.filter((l) => /can't be enforced/.test(l))).toHaveLength(1);
      const none = runner(cfgFor("daily_usd = 0"));
      none.r.addUsage(60, costing(50));
      expect(none.r.overLimit()).toBe(false);
    });

    it("leaves Claude and Codex agents alone", () => {
      const { r } = runner(parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"`, "lee-claude"));
      r.addUsage(60, costing(99));
      expect(r.overLimit()).toBe(false);
    });
  });
});

describe("running opencode", () => {
  const dir = mkdtempSync(join(tmpdir(), "ak-opencode-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  // A stand-in for the opencode binary: replays the recorded run, says whether it got the key, and
  // for "BUSY" logs rate limits the way OpenCode does while it keeps retrying.
  const fake = join(dir, "opencode");
  writeFileSync(
    fake,
    `#!/usr/bin/env node
const fs = require("fs");
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", async () => {
  if (input.includes("BUSY")) {
    for (let i = 0; i < 10; i++) {
      process.stderr.write('level=ERROR message="stream error" session.id=ses_busy1 small=false agent=build error.error="AI_APICallError: Rate limit reached for requests"\\n');
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 60000));
  }
  if (input.includes("NOMODEL")) {
    for (const line of ${JSON.stringify(fixture("opencode-model-not-found.jsonl"))}) console.log(line);
    for (const line of ${JSON.stringify(fixture("opencode-model-not-found.stderr"))}) process.stderr.write(line + "\\n");
    // More log after it, enough to push it out of the last 2000 characters.
    for (let i = 0; i < 40; i++) process.stderr.write('level=ERROR message="share subscriber failed" type=session.updated cause="Cause([Interrupt])"\\n');
    process.exit(1);
  }
  for (const line of ${JSON.stringify(fixture("opencode-run.jsonl"))}) console.log(line);
  const key = process.env.DEEPSEEK_API_KEY;
  console.log(JSON.stringify({ type: "text", sessionID: "s1", part: { type: "text", text: "key " + (key ? "given: " + key : "missing") + ", config " + (fs.existsSync(process.env.OPENCODE_CONFIG) ? "found" : "missing") } }));
});
`,
    { mode: 0o755 },
  );
  const cfg = cfgFor("", `opencode_bin = "${fake}"\n[limits]\nmax_minutes = 1`);
  const go = (prompt: string, logFile = join(dir, `${Math.random()}.log`)) =>
    runEngine({ cfg, inv: opencodeInvocation(cfg, mcp, null, KEY), cwd: dir, prompt, logFile, signal: new AbortController().signal });

  it("gives the engine its key and config, and keeps the key out of the log and the reply", async () => {
    const logFile = join(dir, "run.log");
    const run = await go("fix it", logFile);
    expect(run).toMatchObject({ exitCode: 0, isError: false, model: "deepseek/deepseek-chat" });
    expect(run.finalText).toBe("key given: [redacted], config found");
    expect(run.usage?.turns).toBe(4);
    const log = readFileSync(logFile, "utf8");
    expect(log).toContain("key given: [redacted]");
    expect(log).not.toContain(KEY);
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it(`stops after ${RATE_LIMIT_STOP_AFTER} rate-limit refusals in a row, to wait`, async () => {
    const run = await go("BUSY");
    expect(run).toMatchObject({ isError: true, rateLimited: true, aborted: false, timedOut: false, sessionId: "ses_busy1" });
    expect(run.problem?.kind).toBe("rate");
    expect(run.finalText).toBe("Stopped: DeepSeek is limiting how fast I can send requests.");
    expect(usageLimit(run)).not.toBeNull();
  }, 20_000);

  it("a model OpenCode doesn't have: the plain reason and the likely name, not \"Unexpected server error\" (AK-143)", async () => {
    const run = await go("NOMODEL");
    expect(run).toMatchObject({ isError: true, exitCode: 1 });
    expect(run.rateLimited).toBeFalsy();
    const reason = "deepseek-v4-flash isn't a DeepSeek model in OpenCode (did you mean deepseek-flash?); pick another model for me";
    expect(run.problem).toEqual({ kind: "model", reason });
    expect(run.finalText).toBe(`Stopped: ${reason}.`);

    // On the ticket and on the agent.
    const report = failedTicketReport(run, run.finalText, "AK-9", 60);
    expect(report.comment).toBe(`Stopped: ${reason}.`);
    expect(report.agentNote).toBe(`Stopped on AK-9: ${reason}`.slice(0, 200));
    expect(report.comment + report.agentNote).not.toMatch(/Unexpected server error/);
  });

  it("a failed run without a known reason, or one that only waits, doesn't mark the agent", () => {
    expect(failedTicketReport({ timedOut: false }, "Error: boom", "AK-9", 60)).toEqual({ why: "the run failed", comment: "Stopped: the run failed.\n\nError: boom", agentNote: null });
    expect(failedTicketReport({ timedOut: true }, "", "AK-9", 60)).toMatchObject({ comment: "Stopped: hit the 60-minute limit.", agentNote: null });
    expect(failedTicketReport({ timedOut: false, problem: { kind: "rate", reason: "busy" } }, "", "AK-9", 60).agentNote).toBeNull();
  });

  it("scrubs only real secret values", () => {
    expect(scrubber([KEY, ""])(`a ${KEY} b ${KEY}`)).toBe("a [redacted] b [redacted]");
    expect(scrubber()("nothing")).toBe("nothing");
  });
});
