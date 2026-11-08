import type { Beat, BeatScore, ParsedEpisode, PromoTag } from "./types";
import type { LLM } from "./llm";
import { loadPrompt } from "./prompts";

export const TAGS: PromoTag[] = ["slap", "reveal", "betrayal", "threat", "kiss", "confession", "humiliation", "identity", "rescue", "other"];

export const TAGGER_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          hook: { type: "integer" },
          cliff: { type: "integer" },
          context_need: { type: "integer" },
          tag: { type: "string", enum: TAGS },
        },
        required: ["id", "hook", "cliff", "context_need", "tag"],
      },
    },
  },
  required: ["scores"],
};

const overlaps = (a: Beat, b: Beat) => a.start < b.end && b.start < a.end;

/** Content beats, plus camera-only beats (silent visuals) that no content beat covers. */
export function taggableBeats(p: ParsedEpisode): Beat[] {
  const content = p.beats.filter((b) => b.type !== "camera");
  return p.beats.filter((b) => b.type !== "camera" || !content.some((c) => overlaps(b, c)));
}

export const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function beatLine(b: Beat, withVisual = true): string {
  const who = b.type === "dialogue" ? `${b.display}${b.emotion ? `(${b.emotion})` : ""}` : b.type.toUpperCase();
  const vis = withVisual && b.visual ? ` [visual: ${b.visual.slice(0, 160)}]` : "";
  return `${b.id} | ${fmt(b.start)} | ${b.type} | ${who}: ${b.text}${vis}`;
}

export function buildTaggerPrompt(p: ParsedEpisode): string {
  return loadPrompt("tagger", {
    LOGLINE: p.meta.logline,
    CONTINUITY: p.meta.continuity,
    BEATS: taggableBeats(p).map((b) => beatLine(b)).join("\n"),
  });
}

const clamp = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

export async function tagEpisode(llm: LLM, p: ParsedEpisode): Promise<Record<string, BeatScore>> {
  const res = await llm.json<{ scores: Partial<BeatScore>[] }>(buildTaggerPrompt(p), TAGGER_SCHEMA, { temperature: 0.2 });
  const byId = new Map((res.scores ?? []).map((s) => [s.id, s]));
  const out: Record<string, BeatScore> = {};
  for (const b of taggableBeats(p)) {
    const s = byId.get(b.id);
    out[b.id] = {
      id: b.id,
      hook: clamp(s?.hook),
      cliff: clamp(s?.cliff),
      context_need: s ? clamp(s.context_need) : 5,
      tag: s?.tag && TAGS.includes(s.tag) ? s.tag : "other",
    };
  }
  return out;
}
