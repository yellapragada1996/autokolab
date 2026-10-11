import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectView, type RunUsageRow } from "../src/core/projects.js";
import { parseRunnerConfig } from "../src/runner/config.js";
import { claudeInvocation, noUsage, parseEvent, runEngine, type EngineRun } from "../src/runner/engines.js";
import { Runner, runUsageRow } from "../src/runner/runner.js";

// What each run used (AK-92): read from the tools' own output, never estimated, and recorded
// without ever getting in the run's way.

const freshRun = (): EngineRun => ({ sessionId: null, finalText: "", exitCode: null, timedOut: false, aborted: false, isError: false });
const AID = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";

describe("reading usage from the tools", () => {
  it("takes Claude Code's figures from its result event", () => {
    const run = freshRun();
    parseEvent(
      "claude",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Opened PR #12",
        session_id: "s1",
        num_turns: 41,
        total_cost_usd: 3.4172,
        usage: { input_tokens: 1200, cache_creation_input_tokens: 36000, cache_read_input_tokens: 480000, output_tokens: 9100, service_tier: "standard" },
      }),
      run,
    );
    expect(run.usage).toEqual({ inputTokens: 1200, cacheReadTokens: 480000, cacheWriteTokens: 36000, outputTokens: 9100, turns: 41, costUsd: 3.4172 });
  });

  it("counts a failed Claude run for what it used", () => {
    const run = freshRun();
    parseEvent("claude", JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, session_id: "s2", num_turns: 60, total_cost_usd: 1.5, usage: { input_tokens: 10, output_tokens: 20 } }), run);
    expect(run.isError).toBe(true);
    expect(run.usage).toEqual({ inputTokens: 10, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 20, turns: 60, costUsd: 1.5 });
  });

  it("leaves nulls where Claude Code says nothing, and ignores figures that aren't counts", () => {
    const run = freshRun();
    parseEvent("claude", JSON.stringify({ type: "result", subtype: "success", result: "ok" }), run);
    expect(run.usage).toEqual(noUsage());
    parseEvent("claude", JSON.stringify({ type: "result", subtype: "success", result: "ok", num_turns: "3", total_cost_usd: -1, usage: { input_tokens: "many", output_tokens: -4 } }), run);
    expect(run.usage).toEqual(noUsage());
  });

  it("takes Codex's tokens when a turn ends, and nothing it doesn't report", () => {
    const run = freshRun();
    parseEvent("codex", JSON.stringify({ type: "thread.started", thread_id: "t1" }), run);
    expect(run.usage).toBeUndefined();
    // input_tokens includes the cached ones.
    parseEvent("codex", JSON.stringify({ type: "turn.completed", usage: { input_tokens: 24763, cached_input_tokens: 24448, output_tokens: 122 } }), run);
    expect(run.usage).toEqual({ inputTokens: 315, cacheReadTokens: 24448, cacheWriteTokens: null, outputTokens: 122, turns: null, costUsd: null });
    parseEvent("codex", JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1000, output_tokens: 8 } }), run);
    expect(run.usage).toEqual({ inputTokens: 1315, cacheReadTokens: 24448, cacheWriteTokens: null, outputTokens: 130, turns: null, costUsd: null });
  });

  it("reports nothing for a Codex that prints no usage", () => {
    const run = freshRun();
    parseEvent("codex", JSON.stringify({ type: "turn.completed" }), run);
    parseEvent("codex", JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Done" } }), run);
    expect(run.usage).toBeUndefined();
    expect(runUsageRow("build", "t1", run, 12.4)).toEqual({
      kind: "build", ticket_id: "t1", model: null, input_tokens: null, cache_read_tokens: null, cache_write_tokens: null, output_tokens: null, turns: null, seconds: 12, cost_usd: null,
    });
  });
});

describe("runEngine returns what the run used", () => {
  const dir = mkdtempSync(join(tmpdir(), "ak-usage-"));
  const fake = join(dir, "fake-claude.mjs");
  writeFileSync(
    fake,
    `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "fake-1", model: "claude-fake-1" }));
  if (input.includes("CRASH")) process.exit(3);
  const usage = input.includes("SILENT") ? {} : { num_turns: 4, total_cost_usd: 0.25, usage: { input_tokens: 30, cache_read_input_tokens: 9000, cache_creation_input_tokens: 500, output_tokens: 700 } };
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "fake-1", result: "done", ...usage }));
});
`,
    { mode: 0o755 },
  );
  const cfg = parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"\nclaude_bin = "${fake}"\n[limits]\nmax_minutes = 1`, "p");
  const mcp = { command: process.execPath, args: ["cli.js", "mcp"] };
  const go = (prompt: string) => runEngine({ cfg, inv: claudeInvocation(cfg, mcp, null), cwd: dir, prompt, logFile: join(dir, `${Math.random()}.log`), signal: new AbortController().signal });

  it("the tool's figures when it reports them", async () => {
    const run = await go("hello");
    expect(run.usage).toEqual({ inputTokens: 30, cacheReadTokens: 9000, cacheWriteTokens: 500, outputTokens: 700, turns: 4, costUsd: 0.25 });
    expect(runUsageRow("reply", null, run, 7)).toEqual({
      kind: "reply", ticket_id: null, model: "claude-fake-1", input_tokens: 30, cache_read_tokens: 9000, cache_write_tokens: 500, output_tokens: 700, turns: 4, seconds: 7, cost_usd: 0.25,
    });
  });
  it("nulls when it doesn't, also when the run dies before reporting", async () => {
    expect((await go("SILENT")).usage).toEqual(noUsage());
    const crashed = await go("CRASH");
    expect(crashed.isError).toBe(true);
    expect(crashed.usage).toEqual(noUsage());
  });
});

describe("recording a run", () => {
  const row: RunUsageRow = runUsageRow("review", "t1", { model: "claude-opus-5-5", usage: { ...noUsage(), outputTokens: 5 } }, 30);

  it("sends the numbers and the model's name, and nothing else", async () => {
    const sent: Record<string, unknown>[] = [];
    const view = Object.assign(Object.create(ProjectView.prototype), {
      runUsageMissing: false,
      project: { id: "p1" },
      sb: { rpc: async (_fn: string, args: Record<string, unknown>) => (sent.push(args), { data: 1, error: null }) },
    }) as ProjectView;
    expect(await view.recordRunUsage(row)).toBe(true);
    expect(sent).toEqual([
      { p_project: "p1", p_kind: "review", p_seconds: 30, p_ticket: "t1", p_model: "claude-opus-5-5", p_input_tokens: null, p_cache_read_tokens: null, p_cache_write_tokens: null, p_output_tokens: 5, p_turns: null, p_cost_usd: null },
    ]);
  });

  it("stops asking a database that can't record it yet (before schema 20)", async () => {
    const calls: string[] = [];
    const view = (error: { message: string; code?: string } | null) =>
      Object.assign(Object.create(ProjectView.prototype), {
        runUsageMissing: false,
        project: { id: "p1" },
        sb: { rpc: async (fn: string) => (calls.push(fn), { data: error ? null : 1, error }) },
      }) as ProjectView;
    const old = view({ code: "PGRST202", message: "Could not find the function public.record_run_usage(p_kind, p_project, p_seconds) in the schema cache" });
    expect(await old.recordRunUsage(row)).toBe(false);
    expect(await old.recordRunUsage(row)).toBe(false);
    expect(calls).toEqual(["record_run_usage"]);
    expect(await view({ code: "42P01", message: 'relation "public.run_usage" does not exist' }).recordRunUsage(row)).toBe(false);
    // A refusal from a database that has it is a real error.
    await expect(view({ message: "AUTOKOLAB_FORBIDDEN: not a member of this project" }).recordRunUsage(row)).rejects.toThrow(/not a member/);
  });

  it("records every kind of run, failed ones too, and never fails or holds up the run", async () => {
    const rows: RunUsageRow[] = [];
    const logged: string[] = [];
    const runner = Object.assign(Object.create(Runner.prototype), { isAgentRow: true, log: (m: string) => logged.push(m) });
    const p = { recordRunUsage: async (u: RunUsageRow) => (rows.push(u), true) };
    const failed: EngineRun = { ...freshRun(), isError: true, timedOut: true, usage: { ...noUsage(), outputTokens: 9 } };
    for (const kind of ["build", "review", "reply", "question"] as const) runner.recordRun(p, kind, kind === "reply" ? null : "t1", failed, Date.now() - 2000);
    expect(rows.map((r) => r.kind)).toEqual(["build", "review", "reply", "question"]);
    expect(rows[0]).toMatchObject({ ticket_id: "t1", output_tokens: 9, input_tokens: null, seconds: 2 });
    // A room with no project, or a run that never started, has nothing to record.
    runner.recordRun(undefined, "reply", null, failed, Date.now());
    runner.recordRun(p, "build", "t1", undefined, Date.now());
    expect(rows).toHaveLength(4);
    // The database being away is logged and goes no further; a database that never answers isn't waited for.
    expect(() => runner.recordRun({ recordRunUsage: async () => Promise.reject(new Error("offline")) }, "build", "t1", failed, Date.now())).not.toThrow();
    expect(() => runner.recordRun({ recordRunUsage: () => new Promise(() => undefined) }, "build", "t1", failed, Date.now())).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(logged).toEqual(["Couldn't record what the build run used (trying again next run): offline"]);
  });

  it("keeps recording after a permission error: it's thrown, not taken for a missing table (AK-93)", async () => {
    let calls = 0;
    const view = Object.assign(Object.create(ProjectView.prototype), {
      runUsageMissing: false,
      project: { id: "p1" },
      sb: { rpc: async () => (calls++, { data: null, error: { code: "42501", message: "permission denied for table run_usage" } }) },
    }) as ProjectView;
    await expect(view.recordRunUsage(row)).rejects.toThrow(/permission denied/);
    await expect(view.recordRunUsage(row)).rejects.toThrow(/permission denied/);
    expect(calls).toBe(2);
    // A missing table, either way PostgREST says it, does switch it off.
    for (const error of [
      { code: "PGRST205", message: "Could not find the table 'public.run_usage' in the schema cache" },
      { code: "42883", message: "function public.record_run_usage(uuid, text, integer) does not exist" },
    ]) {
      const old = Object.assign(Object.create(ProjectView.prototype), { runUsageMissing: false, project: { id: "p1" }, sb: { rpc: async () => ({ data: null, error }) } }) as ProjectView;
      expect(await old.recordRunUsage(row)).toBe(false);
    }
  });

  it("says a failure once, tries every run, and says it again only after it worked in between", async () => {
    const logged: string[] = [];
    const runner = Object.assign(Object.create(Runner.prototype), { isAgentRow: true, log: (m: string) => logged.push(m) });
    let fail = true;
    let tries = 0;
    const p = { recordRunUsage: async () => (tries++, fail ? Promise.reject(new Error("permission denied")) : true) };
    const settle = () => new Promise((r) => setTimeout(r, 0));
    const run: EngineRun = { ...freshRun(), usage: noUsage() };
    for (let i = 0; i < 3; i++) {
      runner.recordRun(p, "build", "t1", run, Date.now());
      await settle();
    }
    expect(tries).toBe(3);
    expect(logged).toHaveLength(1);
    fail = false;
    runner.recordRun(p, "review", "t1", run, Date.now());
    await settle();
    fail = true;
    runner.recordRun(p, "reply", null, run, Date.now());
    await settle();
    expect(tries).toBe(5);
    expect(logged).toEqual([
      "Couldn't record what the build run used (trying again next run): permission denied",
      "Couldn't record what the reply run used (trying again next run): permission denied",
    ]);
  });
});
