// The model providers an API-model agent can use through OpenCode (DEC-26, CON-25): the name people
// see, and the environment variable OpenCode reads the provider's key from. The variables are the
// ones OpenCode takes from models.dev; checked against https://models.dev/api.json in Oct 2026.

export interface Provider {
  /** The provider's name as people know it. */
  name: string;
  /** Where OpenCode looks for the key. */
  keyEnv: string;
}

export const PROVIDERS: Record<string, Provider> = {
  deepseek: { name: "DeepSeek", keyEnv: "DEEPSEEK_API_KEY" },
  openai: { name: "OpenAI", keyEnv: "OPENAI_API_KEY" },
  anthropic: { name: "Anthropic", keyEnv: "ANTHROPIC_API_KEY" },
  google: { name: "Google Gemini", keyEnv: "GOOGLE_GENERATIVE_AI_API_KEY" },
  openrouter: { name: "OpenRouter", keyEnv: "OPENROUTER_API_KEY" },
  mistral: { name: "Mistral", keyEnv: "MISTRAL_API_KEY" },
  groq: { name: "Groq", keyEnv: "GROQ_API_KEY" },
  xai: { name: "xAI", keyEnv: "XAI_API_KEY" },
  moonshotai: { name: "Moonshot", keyEnv: "MOONSHOT_API_KEY" },
  zhipuai: { name: "Zhipu", keyEnv: "ZHIPU_API_KEY" },
  togetherai: { name: "Together AI", keyEnv: "TOGETHER_API_KEY" },
  "fireworks-ai": { name: "Fireworks", keyEnv: "FIREWORKS_API_KEY" },
  deepinfra: { name: "DeepInfra", keyEnv: "DEEPINFRA_API_KEY" },
  cerebras: { name: "Cerebras", keyEnv: "CEREBRAS_API_KEY" },
};

/** The provider's name for messages: the known one, else its id as given. */
export function providerName(id: string): string {
  return PROVIDERS[id]?.name ?? id;
}

/** The variable that carries this provider's key: the owner's override first, then the known one. */
export function providerKeyEnv(id: string, override?: string): string | null {
  if (override) return override;
  return PROVIDERS[id]?.keyEnv ?? null;
}
