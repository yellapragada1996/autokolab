import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatMember } from "../src/core/format.js";
import { EFFORTS, MODEL_CHANGE_PREFIX, leadGuide, modelChangeMessage, modelText, nextModel } from "../src/core/projects.js";
import type { Member } from "../src/core/types.js";
import { AGENT_MODEL_INPUT } from "../src/mcp/server.js";
import { isRunnerNotice } from "../src/runner/runner.js";
import { looksLikeSecret, redactSecrets } from "../src/core/secrets.js";
import { formatToken, memberEmail, parseToken } from "../src/core/token.js";

describe("tokens", () => {
  const id = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";
  it("round-trips", () => {
    const t = formatToken(id, "s".repeat(43));
    expect(parseToken(t)).toEqual({ memberId: id, email: memberEmail(id), password: "s".repeat(43) });
  });
  it("rejects malformed tokens", () => {
    expect(() => parseToken("ak1.nope.secretsecretsecretsecret")).toThrow(/AutoKolab token/);
    expect(() => parseToken(`ak2.${id}.secretsecretsecretsecret`)).toThrow();
    expect(() => parseToken(`ak1.${id}.short`)).toThrow();
  });
  it("tokens themselves count as secrets", () => {
    expect(looksLikeSecret(formatToken(id, "x".repeat(43)))).toBe(true);
  });
});

describe("secret detection", () => {
  const bad = [
    "sk-ant-api03-abcdefghijklmnopqrstuv",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123",
    "AKIAIOSFODNN7EXAMPLE",
    "-----BEGIN RSA PRIVATE KEY-----",
    "xoxb-1234567890-abcdefghij",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    "sk_live_abcdefghijklmnop",
  ];
  it.each(bad)("flags %s", (s) => expect(looksLikeSecret(`use ${s} please`)).toBe(true));
  it("leaves normal text alone", () => {
    for (const s of ["Fix the zones API", "See PR #12, branch zones-api", "sk-learn is a library", "commit 3f1c2a9e1b2c"]) {
      expect(looksLikeSecret(s)).toBe(false);
    }
  });
  it("redacts", () => {
    expect(redactSecrets("key: ghp_abcdefghijklmnopqrstuvwxyz0123456789 end")).toBe("key: [redacted] end");
  });
  it("matches the database's pattern list", () => {
    const sql = readFileSync(new URL("../sql/001_init.sql", import.meta.url), "utf8");
    const block = sql.slice(sql.indexOf("function public.looks_like_secret"), sql.indexOf("-- ---", sql.indexOf("function public.looks_like_secret")));
    const sqlPatterns = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const src = readFileSync(new URL("../src/core/secrets.ts", import.meta.url), "utf8");
    const tsPatterns = [...src.matchAll(/^\s+\/(.+)\/i,$/gm)].map((m) => m[1].replace(/\\\//g, "/"));
    expect(tsPatterns.map((p) => p.replace(/\\\\/g, "\\"))).toEqual(sqlPatterns);
  });
});

describe("agents' model and effort", () => {
  const names: Record<string, string> = { lead: "ana-claude", ana: "ana" };
  const nameOf = (id: string) => names[id] ?? "someone";

  it("shows the model and effort, who set them, or that its machine decides", () => {
    expect(modelText({ model: "sonnet", effort: "medium", model_set_by: "lead" }, nameOf)).toBe("sonnet · medium (set by ana-claude)");
    expect(modelText({ model: "opus", effort: null, model_set_by: "ana" }, nameOf)).toBe("opus · its machine's effort (set by ana)");
    expect(modelText({ model: null, effort: "low", model_set_by: null }, nameOf)).toBe("its machine's model · low");
    expect(modelText({ model: null, effort: null, model_set_by: "lead" }, nameOf)).toBe("model set on its machine");
  });
  it("the agents tool adds it to agents only", () => {
    const agent = { id: "a1", name: "lee-codex", kind: "agent", owner_id: "lee", last_seen_at: null, runner_state: "offline", paused: false } as unknown as Member;
    expect(formatMember({ nameOf: () => "lee" }, agent, "sonnet · medium (set by ana-claude)")).toBe("lee-codex (agent; lee's agent; sonnet · medium (set by ana-claude); seen never)");
    expect(formatMember({ nameOf: () => "lee" }, agent)).toBe("lee-codex (agent; lee's agent; seen never)");
    const person = { ...agent, name: "lee", kind: "human" } as unknown as Member;
    expect(formatMember({ nameOf: () => "lee" }, person, "x")).toBe("lee (human; seen never)");
  });
  it("set_agent_model sets both: the value not being changed is passed back", () => {
    const cur = { model: "sonnet", effort: "medium" };
    expect(nextModel(cur, { model: "opus" })).toEqual({ model: "opus", effort: "medium" });
    expect(nextModel(cur, { effort: "high" })).toEqual({ model: "sonnet", effort: "high" });
    expect(nextModel({ model: null, effort: null }, { effort: "low" })).toEqual({ model: null, effort: "low" });
    expect(nextModel(cur, { model: "opus", effort: "max" })).toEqual({ model: "opus", effort: "max" });
    expect(nextModel(cur, { clear: true })).toEqual({ model: null, effort: null });
    expect(() => nextModel(cur, {})).toThrow(/model, an effort, or clear/);
    expect(() => nextModel(cur, { clear: true, model: "opus" })).toThrow(/clear on its own/);
  });
  it("tells the agent what changed and why, as a notice that doesn't start a run", () => {
    const m = modelChangeMessage("ana-claude", { model: "opus", effort: "high" }, "AK-23 is a multi-table migration.");
    expect(m).toBe("Model change: ana-claude switched you to opus · high effort: AK-23 is a multi-table migration. Applies from your next run.");
    expect(m.startsWith(MODEL_CHANGE_PREFIX)).toBe(true);
    expect(isRunnerNotice(m)).toBe(true);
    expect(modelChangeMessage("ana-claude", { model: null, effort: null }, "back to normal")).toContain("handed your model and effort back to your machine: back to normal.");
  });
  it("agent_model's input: agent and reason required, the five effort levels, a short reason", () => {
    const input = z.object(AGENT_MODEL_INPUT);
    expect(input.safeParse({ agent: "lee-codex", model: "opus", effort: "high", reason: "hard migration" }).success).toBe(true);
    expect(input.safeParse({ agent: "lee-codex", clear: true, reason: "routine work again" }).success).toBe(true);
    expect(input.safeParse({ agent: "lee-codex", model: "opus" }).success).toBe(false);
    expect(input.safeParse({ agent: "lee-codex", effort: "ultracode", reason: "x" }).success).toBe(false);
    expect(input.safeParse({ agent: "lee-codex", effort: "high", reason: "x".repeat(301) }).success).toBe(false);
    expect([...EFFORTS]).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });
  it("leadGuide tells the lead when to use agent_model, with a reason", () => {
    const g = leadGuide("Shop", ["ana"]);
    expect(g).toMatch(/change a worker's model and effort with agent_model when the work calls for it: stronger .* lighter/);
    expect(g).toContain("always give the reason");
    expect(g).toContain("model_locked");
  });
});
