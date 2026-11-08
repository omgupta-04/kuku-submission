import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface LLM {
  name: string;
  json<T>(prompt: string, schema: object, opts?: { temperature?: number }): Promise<T>;
}

export class RateLimitError extends Error {
  constructor(msg = "rate limited (429)") { super(msg); }
}

export type RawProvider = (prompt: string, schema: object, opts: { temperature: number }) => Promise<string>;

interface WrapOpts {
  model: string;
  cacheDir?: string;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Adds cache, 429 backoff, and one JSON-repair retry around any raw text provider. */
export function wrapProvider(raw: RawProvider, o: WrapOpts): LLM {
  const sleep = o.sleep ?? wait;
  const maxRetries = o.maxRetries ?? 8;

  async function call(prompt: string, schema: object, temperature: number): Promise<string> {
    for (let i = 0; ; i++) {
      try {
        return await raw(prompt, schema, { temperature });
      } catch (e) {
        if (!(e instanceof RateLimitError) || i >= maxRetries) throw e;
        await sleep(Math.min(60000, 4000 * 2 ** i));
      }
    }
  }

  const parse = (s: string) => JSON.parse(s.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());

  return {
    name: o.model,
    async json<T>(prompt: string, schema: object, opts?: { temperature?: number }): Promise<T> {
      const temperature = opts?.temperature ?? 0.2;
      const key = crypto.createHash("sha256").update(`${o.model}\n${temperature}\n${prompt}`).digest("hex");
      const file = o.cacheDir ? path.join(o.cacheDir, `${key}.json`) : undefined;
      if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as T;

      let text = await call(prompt, schema, temperature);
      let out: T;
      try {
        out = parse(text);
      } catch (err) {
        text = await call(
          `${prompt}\n\nYour previous reply was not valid JSON (${(err as Error).message}). Reply again with ONLY valid JSON.`,
          schema,
          temperature,
        );
        try { out = parse(text); } catch (err2) { throw new Error(`LLM returned invalid JSON twice: ${(err2 as Error).message}`); }
      }
      if (file) {
        try { fs.mkdirSync(o.cacheDir!, { recursive: true }); fs.writeFileSync(file, JSON.stringify(out)); } catch { /* read-only FS (serverless): skip cache */ }
      }
      return out;
    },
  };
}

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  cacheDir?: string;
}

function gemini(cfg: LLMConfig): RawProvider {
  return async (prompt, schema, { temperature }) => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey ?? "" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
      }),
    });
    if (r.status === 429 || r.status === 503) throw new RateLimitError(`gemini ${r.status}`);
    if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  };
}

function openaiCompatible(cfg: LLMConfig): RawProvider {
  const base = (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  return async (prompt, schema, { temperature }) => {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey ?? ""}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: `${prompt}\n\nReturn JSON matching this schema:\n${JSON.stringify(schema)}` }],
      }),
    });
    if (r.status === 429) throw new RateLimitError();
    if (!r.ok) throw new Error(`llm ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content ?? "";
  };
}

/** Provider picked by config only: swapping model = env var change. */
export function createLLM(cfg: LLMConfig, mock?: RawProvider): LLM {
  let raw: RawProvider;
  if (cfg.provider === "mock") {
    if (!mock) throw new Error("mock provider not supplied");
    raw = mock;
  } else if (cfg.provider === "gemini") raw = gemini(cfg);
  else if (cfg.provider === "openai-compatible") raw = openaiCompatible(cfg);
  else throw new Error(`unknown LLM_PROVIDER: ${cfg.provider}`);
  return wrapProvider(raw, { model: `${cfg.provider}:${cfg.model}`, cacheDir: cfg.cacheDir });
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): LLMConfig {
  return {
    provider: env.LLM_PROVIDER ?? "gemini",
    model: env.LLM_MODEL ?? "gemini-3.1-flash-lite",
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL,
    cacheDir: env.LLM_CACHE_DIR ?? "cache",
  };
}
