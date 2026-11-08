import type { BeatScore, Candidate, ParsedEpisode } from "./types";
import { taggableBeats } from "./tagger";
import { MAX_DUR, MIN_DUR } from "./windows";

export type EpMap = Map<number, { p: ParsedEpisode; s: Record<string, BeatScore> }>;

/** Deterministic checks. Returns flag names; empty = pass. */
export function ruleChecks(c: Candidate, eps: EpMap): string[] {
  const f: string[] = [];
  if (c.duration < MIN_DUR - 0.01 || c.duration > MAX_DUR + 0.01) f.push("duration_out_of_range");

  for (const g of c.segments) {
    const e = eps.get(g.ep);
    if (!e) { f.push("missing_episode"); continue; }
    if (g.start < 0 || g.end > e.p.meta.duration + 0.01) f.push("outside_episode");
    if (e.p.beats.some((b) => b.type === "dialogue" && ((b.start < g.start - 1e-6 && b.end > g.start + 1e-6) || (b.start < g.end - 1e-6 && b.end > g.end + 1e-6))))
      f.push("cuts_mid_line");
  }

  const first = c.segments[0];
  const fe = eps.get(first.ep);
  if (fe && !fe.p.beats.some((b) => b.type !== "camera" && b.start < first.start + 3 && b.end > first.start))
    f.push("no_content_in_first_3s");

  const last = c.segments[c.segments.length - 1];
  const le = eps.get(last.ep);
  if (le) {
    const T = taggableBeats(le.p).filter((b) => b.end <= last.end + 0.01).sort((a, b) => a.end - b.end);
    const tail = T[T.length - 1];
    if (!tail || (le.s[tail.id]?.cliff ?? 0) < 6) f.push("weak_cliffhanger");
  }
  return [...new Set(f)];
}

export type Label = "good" | "ok" | "bad";

/** Stable id for a promo across runs: its segment timestamps. */
export const promoKey = (p: { segments: { ep: number; start: number; end: number }[] }) =>
  p.segments.map((s) => `e${s.ep}@${s.start.toFixed(1)}-${s.end.toFixed(1)}`).join("+");

/** Share of the top-k *labelled* promos judged "good" (strict) or good/ok (lenient). */
export function precisionAtK(ranked: { segments: { ep: number; start: number; end: number }[] }[], labels: Record<string, Label>, k: number) {
  const lab = ranked.slice(0, k).map((p) => labels[promoKey(p)]).filter(Boolean) as Label[];
  if (!lab.length) return { k, labelled: 0, strict: null, lenient: null };
  return {
    k,
    labelled: lab.length,
    strict: lab.filter((l) => l === "good").length / lab.length,
    lenient: lab.filter((l) => l !== "bad").length / lab.length,
  };
}
