import { BIRCH, ME, workspace } from "./fixtures";
import { describe, expect, it } from "vitest";
import {
  apiConnectLine,
  codeMinutesLeft,
  newConnectedAgent,
  PROVIDERS,
  providerModel,
  suggestedName,
  validModel,
  modelName,
  validName,
} from "./agentOptions";
import { OPENCODE_MODELS } from "./opencodeModels.snapshot";

describe("agent options and CON-25", () => {
  const setup = {
    provider: "deepseek" as const,
    model: "deepseek-chat",
    name: "ana-deepseek",
    dailyUsd: 5,
  };
  it("matches the contract's example exactly", () => {
    expect(apiConnectLine("7KQM2PXA", setup)).toBe(
      "curl -fsSL https://autokolab.vercel.app/install.sh | bash -s -- 7KQM2PXA --engine opencode --provider deepseek --model deepseek-chat --name ana-deepseek --daily-usd 5",
    );
  });
  it("supports routing model names and no limit, and local models without a key option", () => {
    expect(
      apiConnectLine("7KQM2PXA", {
        ...setup,
        provider: "openrouter",
        model: "mistralai/devstral-2512",
        dailyUsd: 0,
      }),
    ).toContain("--model mistralai/devstral-2512 --name ana-deepseek --daily-usd 0");
    expect(
      apiConnectLine("7KQM2PXA", {
        ...setup,
        provider: "ollama",
        model: "qwen3-coder:latest",
        dailyUsd: 0,
      }),
    ).not.toContain("--key");
  });
  it("rejects shell syntax and invalid limits before building the line", () => {
    for (const model of ["$(cat file)", "x;ls", "x\nls", "--key", ""])
      expect(() => apiConnectLine("7KQM2PXA", { ...setup, model })).toThrow();
    for (const dailyUsd of [-1, NaN, Infinity, 10001]) expect(() => apiConnectLine("7KQM2PXA", { ...setup, dailyUsd })).toThrow();
    expect(() => apiConnectLine("CODE;ls", setup)).toThrow();
    expect(() => apiConnectLine("7KQM2PXA", { ...setup, name: "Ana" })).toThrow();
  });
  it("uses the helper's naming and model rules", () => {
    expect(suggestedName("Ana", "deepseek")).toBe("ana-deepseek");
    expect(suggestedName("Ana", "google")).toBe("ana-gemini");
    expect(validName("a")).toBe(false);
    expect(validName("a".repeat(41))).toBe(false);
    expect(validModel("qwen3-coder:latest")).toBe(true);
    expect(modelName("google", "google/gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(modelName("openrouter", "mistralai/devstral-2512")).toBe("mistralai/devstral-2512");
    for (const p of PROVIDERS) expect(validModel(p.models[0])).toBe(true);
    expect(PROVIDERS.find((p) => p.id === "ollama")?.keyUrl).toBeNull();
    expect(providerModel("google/gemini-2.5-pro")).toBe("Gemini · gemini-2.5-pro");
    expect(providerModel("openrouter/mistralai/devstral-2512")).toBe("OpenRouter · mistralai/devstral-2512");
  });
  it("offers only models OpenCode accepts (AK-143)", () => {
    // Ollama runs whatever is pulled on that computer, so OpenCode has no list for it.
    for (const p of PROVIDERS.filter((p) => p.id !== "ollama")) {
      const known = OPENCODE_MODELS[p.id];
      expect(known, `no OpenCode list for ${p.id}`).toBeDefined();
      for (const m of p.models) expect(known, `${p.id}/${m}`).toContain(m);
    }
    expect(OPENCODE_MODELS.deepseek).not.toContain("deepseek-v4-flash");
  });
});

describe("connecting and code expiry", () => {
  const setup = {
    provider: "deepseek" as const,
    model: "deepseek-flash",
    name: "ana-deepseek",
    dailyUsd: 5,
  };
  const now = Date.parse("2026-10-14T20:00:00Z");
  const a = {
    ...workspace([]).agentOf(BIRCH)!,
    vendor: "opencode" as const,
    display_name: setup.name,
    effective_model: "deepseek/deepseek-flash",
    last_seen_at: new Date(now).toISOString(),
  };
  it("recognizes only this owner's new agent with the chosen model", () => {
    expect(newConnectedAgent([a], new Set(), ME, "deepseek", setup, now)?.id).toBe(a.id);
    expect(newConnectedAgent([{ ...a, effective_model: null, model: null }], new Set(), ME, "deepseek", setup, now)?.id).toBe(a.id);
    for (const row of [
      { ...a, owner_profile_id: "someone-else" },
      { ...a, display_name: "other" },
      { ...a, effective_model: "deepseek/other" },
      { ...a, status: "offline" as const },
      { ...a, last_seen_at: null },
    ])
      expect(newConnectedAgent([row], new Set(), ME, "deepseek", setup, now)).toBeUndefined();
    expect(newConnectedAgent([a], new Set([a.id]), ME, "deepseek", setup, now)).toBeUndefined();
    expect(newConnectedAgent([a], new Set(), ME, "deepseek", setup, now + 6 * 60_000)).toBeUndefined();
    expect(newConnectedAgent([{ ...a, vendor: "codex" }], new Set(), ME, "codex", null, now)?.id).toBe(a.id);
  });
  it("counts down until expiry, never showing negative minutes", () => {
    const expiry = new Date(now + 30 * 60_000).toISOString();
    expect(codeMinutesLeft(expiry, now)).toBe(30);
    expect(codeMinutesLeft(expiry, now + 61_000)).toBe(29);
    expect(codeMinutesLeft(expiry, now + 30 * 60_000)).toBe(0);
    expect(codeMinutesLeft(expiry, now + 40 * 60_000)).toBe(0);
  });
});
