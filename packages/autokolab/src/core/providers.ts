// The model providers an API-model agent can use through OpenCode (DEC-26, CON-25): the name people
// see, and the environment variable OpenCode reads the provider's key from. The variables are the
// ones OpenCode takes from models.dev; checked against https://models.dev/api.json in Oct 2026.

/** One small request that succeeds only with a good key (AK-108): listing models, mostly. */
export interface KeyCheck {
  url: string;
  /** How the key is sent: "Authorization: Bearer", Anthropic's x-api-key, or Google's x-goog-api-key. */
  auth: "bearer" | "x-api-key" | "x-goog-api-key";
  headers?: Record<string, string>;
}

export interface Provider {
  /** The provider's name as people know it. */
  name: string;
  /** Where OpenCode looks for the key. */
  keyEnv: string;
  /** How `autokolab connect` and `autokolab key check` test a key; unset when we don't know one. */
  check?: KeyCheck;
}

const bearer = (url: string): KeyCheck => ({ url, auth: "bearer" });

export const PROVIDERS: Record<string, Provider> = {
  deepseek: { name: "DeepSeek", keyEnv: "DEEPSEEK_API_KEY", check: bearer("https://api.deepseek.com/models") },
  openai: { name: "OpenAI", keyEnv: "OPENAI_API_KEY", check: bearer("https://api.openai.com/v1/models") },
  anthropic: {
    name: "Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    check: { url: "https://api.anthropic.com/v1/models", auth: "x-api-key", headers: { "anthropic-version": "2023-06-01" } },
  },
  google: {
    name: "Google Gemini",
    keyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    check: { url: "https://generativelanguage.googleapis.com/v1beta/models", auth: "x-goog-api-key" },
  },
  // OpenRouter lists models for anyone; this one answers only to a real key.
  openrouter: { name: "OpenRouter", keyEnv: "OPENROUTER_API_KEY", check: bearer("https://openrouter.ai/api/v1/key") },
  mistral: { name: "Mistral", keyEnv: "MISTRAL_API_KEY", check: bearer("https://api.mistral.ai/v1/models") },
  groq: { name: "Groq", keyEnv: "GROQ_API_KEY", check: bearer("https://api.groq.com/openai/v1/models") },
  xai: { name: "xAI", keyEnv: "XAI_API_KEY", check: bearer("https://api.x.ai/v1/models") },
  moonshotai: { name: "Moonshot", keyEnv: "MOONSHOT_API_KEY", check: bearer("https://api.moonshot.ai/v1/models") },
  zhipuai: { name: "Zhipu", keyEnv: "ZHIPU_API_KEY" },
  togetherai: { name: "Together AI", keyEnv: "TOGETHER_API_KEY", check: bearer("https://api.together.xyz/v1/models") },
  "fireworks-ai": { name: "Fireworks", keyEnv: "FIREWORKS_API_KEY", check: bearer("https://api.fireworks.ai/inference/v1/models") },
  deepinfra: { name: "DeepInfra", keyEnv: "DEEPINFRA_API_KEY", check: bearer("https://api.deepinfra.com/v1/openai/models") },
  cerebras: { name: "Cerebras", keyEnv: "CEREBRAS_API_KEY", check: bearer("https://api.cerebras.ai/v1/models") },
};

/**
 * Models running on this computer: no key at all. OpenCode reaches them through its OpenAI-compatible
 * adapter, so the runner describes the provider in OpenCode's config.
 */
export interface LocalProvider {
  name: string;
  /** Where the model server listens unless the runner file says otherwise. */
  baseUrl: string;
}

export const LOCAL_PROVIDERS: Record<string, LocalProvider> = {
  ollama: { name: "Ollama", baseUrl: "http://127.0.0.1:11434" },
};

export function isLocalProvider(id: string): boolean {
  return Object.hasOwn(LOCAL_PROVIDERS, id);
}

/** The provider's name for messages: the known one, else its id as given. */
export function providerName(id: string): string {
  return PROVIDERS[id]?.name ?? LOCAL_PROVIDERS[id]?.name ?? id;
}

/** The variable that carries this provider's key: the owner's override first, then the known one. */
export function providerKeyEnv(id: string, override?: string): string | null {
  if (override) return override;
  return PROVIDERS[id]?.keyEnv ?? null;
}
