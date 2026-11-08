import { configFromEnv, createLLM, type LLM } from "./llm";
import { mockProvider } from "./mockllm";

export interface Overrides { provider?: string; model?: string; apiKey?: string; baseUrl?: string }

/** Env defaults, optionally overridden per request ("bring your own key"). Keys are never stored or logged. */
export function llmFor(o: Overrides = {}): LLM {
  const env = configFromEnv();
  const cfg = {
    ...env,
    provider: o.provider || env.provider,
    model: o.model || env.model,
    apiKey: o.apiKey || env.apiKey,
    baseUrl: o.baseUrl || env.baseUrl,
    cacheDir: undefined, // serverless FS is read-only/ephemeral
  };
  if (cfg.provider !== "mock" && !cfg.apiKey) throw new Error("No API key configured. Set LLM_API_KEY on the server or paste your own key in Settings.");
  return createLLM(cfg, mockProvider);
}

/** Optional shared secret so a public deployment cannot burn the owner's free-tier quota. */
export function checkAccess(req: Request): string | null {
  const code = process.env.ACCESS_CODE;
  if (code && req.headers.get("x-access-code") !== code) return "Access code required (or wrong). Ask the owner, or use your own API key.";
  return null;
}
