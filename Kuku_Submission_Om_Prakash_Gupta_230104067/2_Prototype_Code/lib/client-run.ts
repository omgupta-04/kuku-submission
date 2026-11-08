import type { EpisodeBundle, Promo, ShowResult } from "./types";
import { finalize } from "./finalize";

export interface Settings {
  provider: string; // "" = server default
  model: string;
  apiKey: string;
  accessCode: string;
  maxPerEp: number;
  cross: boolean;
  critic: boolean;
}

export const DEFAULT_SETTINGS: Settings = { provider: "", model: "", apiKey: "", accessCode: "", maxPerEp: 8, cross: true, critic: true };

export type EpStatus = "queued" | "running" | "done" | "error";
export interface EpState { name: string; status: EpStatus; promos?: number; error?: string }
export type Stage = "reading" | "analyzing" | "cross" | "ranking" | "done";

export interface RunHooks {
  onStage(s: Stage, n?: number, total?: number): void;
  onEpisode(i: number, st: EpState): void;
}

export interface RunOutput { result: ShowResult; bundles: EpisodeBundle[] }

async function post<T>(url: string, body: unknown, s: Settings): Promise<T> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(s.accessCode ? { "x-access-code": s.accessCode } : {}) },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (r.ok) return j as T;
    last = j.error ?? `HTTP ${r.status}`;
    if (r.status < 500 && r.status !== 429) break; // client error: retrying will not help
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
  throw new Error(last);
}

const llm = (s: Settings) => ({ provider: s.provider || undefined, model: s.model || undefined, apiKey: s.apiKey || undefined });

export async function runShow(files: { name: string; text: string }[], s: Settings, hooks: RunHooks, concurrency = 3): Promise<RunOutput> {
  hooks.onStage("reading", files.length, files.length);
  const bundles: (EpisodeBundle | undefined)[] = new Array(files.length);
  files.forEach((f, i) => hooks.onEpisode(i, { name: f.name, status: "queued" }));

  hooks.onStage("analyzing", 0, files.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (next < files.length) {
      const i = next++;
      hooks.onEpisode(i, { name: files[i].name, status: "running" });
      try {
        const b = await post<EpisodeBundle>("/api/analyze", { file: files[i].name, text: files[i].text, critic: s.critic, maxPerEp: s.maxPerEp, llm: llm(s) }, s);
        bundles[i] = b;
        hooks.onEpisode(i, { name: files[i].name, status: "done", promos: b.promos.length });
      } catch (e) {
        hooks.onEpisode(i, { name: files[i].name, status: "error", error: (e as Error).message });
      }
      hooks.onStage("analyzing", ++done, files.length);
    }
  }));

  const ok = bundles.filter(Boolean).sort((a, b) => a!.parsed.meta.ep - b!.parsed.meta.ep) as EpisodeBundle[];
  if (!ok.length) throw new Error("No episode could be analyzed. Check the error shown on each episode.");

  const cross: Promo[] = [];
  if (s.cross && ok.length > 1) {
    const pairs = ok.slice(0, -1).map((a, i) => [a, ok[i + 1]] as const).filter(([a, b]) => b.parsed.meta.ep === a.parsed.meta.ep + 1);
    hooks.onStage("cross", 0, pairs.length);
    let c = 0, k = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, pairs.length) }, async () => {
      while (k < pairs.length) {
        const [a, b] = pairs[k++];
        try { cross.push(...(await post<{ promos: Promo[] }>("/api/cross", { a, b, critic: s.critic, llm: llm(s) }, s)).promos); } catch { /* pair skipped */ }
        hooks.onStage("cross", ++c, pairs.length);
      }
    }));
  }

  hooks.onStage("ranking");
  const result = finalize(ok, cross);
  hooks.onStage("done");
  return { result, bundles: ok };
}
