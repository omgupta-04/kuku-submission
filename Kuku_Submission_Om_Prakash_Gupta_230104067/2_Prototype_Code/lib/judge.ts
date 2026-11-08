import type { Candidate, JudgeResult, ParsedEpisode, QCResult } from "./types";
import type { LLM } from "./llm";
import { loadPrompt } from "./prompts";
import { fmt, taggableBeats } from "./tagger";

type Eps = Map<number, ParsedEpisode>;

/** Script text of a candidate. Deliberately excludes logline/continuity: the judge is a first-time viewer. */
export function clipText(c: Candidate, eps: Eps): string {
  return c.segments
    .map((g, i) => {
      const p = eps.get(g.ep);
      const ids = new Set(g.beatIds);
      const lines = p ? taggableBeats(p).filter((b) => ids.has(b.id)) : [];
      const body = lines
        .map((b) => {
          const who = b.type === "dialogue" ? `${b.display}${b.emotion ? ` (${b.emotion})` : ""}` : b.type.toUpperCase();
          return `  [${fmt(Math.max(0, b.start - g.start))}] ${who}: ${b.text}${b.visual ? ` {visual: ${b.visual.slice(0, 160)}}` : ""}`;
        })
        .join("\n");
      return `Segment ${i + 1} (${(g.end - g.start).toFixed(1)}s):\n${body}`;
    })
    .join("\n");
}

const clamp = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
const str = (v: unknown) => (typeof v === "string" ? v : "");

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" }, hook_text: { type: "string" }, cliffhanger_text: { type: "string" }, why: { type: "string" },
          standalone: { type: "integer" }, hook_3s: { type: "integer" }, cliff: { type: "integer" }, emotion: { type: "integer" },
          spoiler_risk: { type: "string", enum: ["low", "med", "high"] }, title: { type: "string" },
        },
        required: ["id", "hook_text", "cliffhanger_text", "why", "standalone", "hook_3s", "cliff", "emotion", "spoiler_risk", "title"],
      },
    },
  },
  required: ["results"],
};

const CRITIC_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, confusing: { type: "boolean" }, resolved: { type: "boolean" }, note: { type: "string" } },
        required: ["id", "confusing", "resolved", "note"],
      },
    },
  },
  required: ["results"],
};

export async function judgeCandidates(llm: LLM, cands: Candidate[], eps: Eps): Promise<Record<string, JudgeResult>> {
  if (!cands.length) return {};
  const clips = cands.map((c) => `=== CLIP ${c.id} (${c.duration.toFixed(1)}s) ===\n${clipText(c, eps)}`).join("\n\n");
  const res = await llm.json<{ results: Partial<JudgeResult & { id: string }>[] }>(loadPrompt("judge", { CLIPS: clips }), JUDGE_SCHEMA, { temperature: 0.2 });
  const by = new Map((res.results ?? []).map((r) => [r.id, r]));
  const out: Record<string, JudgeResult> = {};
  for (const c of cands) {
    const r = by.get(c.id);
    out[c.id] = {
      hook_text: str(r?.hook_text), cliffhanger_text: str(r?.cliffhanger_text), why: str(r?.why) || "No rationale returned.",
      standalone: clamp(r?.standalone), hook_3s: clamp(r?.hook_3s), cliff: clamp(r?.cliff), emotion: clamp(r?.emotion),
      spoiler_risk: r?.spoiler_risk === "med" || r?.spoiler_risk === "high" ? r.spoiler_risk : "low",
      title: str(r?.title) || c.id,
    };
  }
  return out;
}

export async function criticCandidates(
  llm: LLM, cands: Candidate[], eps: Eps, judged: Record<string, Pick<JudgeResult, "hook_text" | "cliffhanger_text">>,
): Promise<Record<string, NonNullable<QCResult["critic"]>>> {
  if (!cands.length) return {};
  const clips = cands
    .map((c) => `=== CLIP ${c.id} (${c.duration.toFixed(1)}s) ===\n${clipText(c, eps)}\nColleague's hook: "${judged[c.id]?.hook_text}"\nColleague's cliffhanger: "${judged[c.id]?.cliffhanger_text}"`)
    .join("\n\n");
  const res = await llm.json<{ results: { id: string; confusing: boolean; resolved: boolean; note: string }[] }>(loadPrompt("critic", { CLIPS: clips }), CRITIC_SCHEMA, { temperature: 0.2 });
  const out: Record<string, NonNullable<QCResult["critic"]>> = {};
  for (const r of res.results ?? []) out[r.id] = { confusing: !!r.confusing, resolved: !!r.resolved, note: str(r.note) };
  return out;
}
