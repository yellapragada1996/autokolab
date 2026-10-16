/**
 * Suggestions, not a fixed catalogue. Provider ids match the helper and OpenCode, and every model is
 * one OpenCode accepts (pinned by opencodeModels.snapshot.ts, AK-143).
 */
export const PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "Coding and reasoning with pay-per-use pricing",
    models: ["deepseek-flash", "deepseek-v4-pro"],
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "google",
    name: "Gemini",
    description: "Google's models, with an API key",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models billed separately from ChatGPT",
    models: ["gpt-5", "gpt-5-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Coding models from Mistral",
    models: ["mistral-large-latest", "codestral-latest"],
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Hundreds of models through one key",
    models: ["mistralai/devstral-2512", "deepseek/deepseek-chat"],
    keyUrl: "https://openrouter.ai/settings/keys",
  },
  {
    id: "ollama",
    name: "A model on your computer",
    description: "Ollama · no key, no cost",
    models: ["qwen3-coder", "devstral"],
    keyUrl: null,
  },
] as const;
export type ProviderId = (typeof PROVIDERS)[number]["id"];
export type AgentChoice = ProviderId | "claude" | "codex";
export const providerOf = (id: string) => PROVIDERS.find((p) => p.id === id);
export const validName = (name: string) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(name);
export const validModel = (model: string) => /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,79}$/.test(model);
export const suggestedName = (login: string, provider: string) =>
  `${
    login
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 28) || "my"
  }-${provider === "google" ? "gemini" : provider}`;
export interface ApiSetup {
  provider: ProviderId;
  model: string;
  name: string;
  dailyUsd: number;
}

/** CON-25, with shell-safe values only; never a key in a command. */
export function apiConnectLine(code: string, setup: ApiSetup): string {
  if (
    !/^[A-Za-z0-9]{8}$/.test(code) ||
    !providerOf(setup.provider) ||
    !validName(setup.name) ||
    !validModel(setup.model) ||
    !Number.isFinite(setup.dailyUsd) ||
    setup.dailyUsd < 0 ||
    setup.dailyUsd > 10_000
  )
    throw new Error("Check the code, model, name and daily spend limit.");
  return `curl -fsSL https://autokolab.vercel.app/install.sh | bash -s -- ${code} --engine opencode --provider ${setup.provider} --model ${setup.model} --name ${setup.name} --daily-usd ${setup.dailyUsd}`;
}

export const modelName = (provider: string, value: string) =>
  value.trim().startsWith(`${provider}/`) ? value.trim().slice(provider.length + 1) : value.trim();

export function providerModel(model: string | null | undefined): string {
  if (!model) return "Model hasn't been reported yet";
  const slash = model.indexOf("/");
  if (slash < 0) return model;
  const id = model.slice(0, slash);
  return `${(id === "ollama" ? "Ollama" : providerOf(id)?.name) ?? id} · ${model.slice(slash + 1)}`;
}

/** Fresh arrivals only: an old agent or someone else's check-in isn't proof this line worked. */
export function newConnectedAgent(
  agents: Iterable<import("../lib/data").Agent>,
  baseline: Set<string>,
  owner: string,
  choice: AgentChoice | null,
  setup: ApiSetup | null,
  now: number,
) {
  return [...agents].find(
    (a) =>
      !baseline.has(a.id) &&
      a.owner_profile_id === owner &&
      a.status !== "offline" &&
      !!a.last_seen_at &&
      now - Date.parse(a.last_seen_at) < 5 * 60_000 &&
      (setup
        ? a.vendor === "opencode" &&
          a.display_name === setup.name &&
          (!(a.effective_model ?? a.model) || (a.effective_model ?? a.model) === `${setup.provider}/${setup.model}`)
        : a.vendor === choice),
  );
}
export const codeMinutesLeft = (expiresAt: string, now: number) => Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
