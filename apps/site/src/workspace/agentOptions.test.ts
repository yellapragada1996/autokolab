import { describe, expect, it } from "vitest";
import { apiConnectLine, PROVIDERS, providerModel, suggestedName, validModel, validName } from "./agentOptions";

describe("agent options and CON-25", () => {
  const setup = { provider: "deepseek" as const, model: "deepseek-chat", name: "ana-deepseek", dailyUsd: 5 };
  it("matches the contract's example exactly", () => {
    expect(apiConnectLine("7KQM2PXA", setup)).toBe("curl -fsSL https://autokolab.vercel.app/install.sh | bash -s -- 7KQM2PXA --engine opencode --provider deepseek --model deepseek-chat --name ana-deepseek --daily-usd 5");
  });
  it("supports routing model names and no limit, and local models without a key option", () => {
    expect(apiConnectLine("7KQM2PXA", { ...setup, provider: "openrouter", model: "mistralai/devstral-2512", dailyUsd: 0 })).toContain("--model mistralai/devstral-2512 --name ana-deepseek --daily-usd 0");
    expect(apiConnectLine("7KQM2PXA", { ...setup, provider: "ollama", model: "qwen3-coder:latest", dailyUsd: 0 })).not.toContain("--key");
  });
  it("rejects shell syntax and invalid limits before building the line", () => {
    for (const model of ["$(cat file)", "x;ls", "x\nls", "--key", ""]) expect(() => apiConnectLine("7KQM2PXA", { ...setup, model })).toThrow();
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
    for (const p of PROVIDERS) expect(validModel(p.models[0])).toBe(true);
    expect(PROVIDERS.find((p) => p.id === "ollama")?.keyUrl).toBeNull();
    expect(providerModel("google/gemini-2.5-pro")).toBe("Gemini · gemini-2.5-pro");
    expect(providerModel("openrouter/mistralai/devstral-2512")).toBe("OpenRouter · mistralai/devstral-2512");
  });
});
