import type { Beat, BeatScore, Candidate, ParsedEpisode, Segment } from "./types";
import { taggableBeats } from "./tagger";

export const MIN_DUR = 20;
export const MAX_DUR = 60;
const HOOK_MIN = 7;
const CLIFF_MIN = 7;
const PREROLL = 1.5;
const REACTION = /\b(reacts?|stares?|stunned|gasps?|flinch\w*|freezes?|eyes widen|horrified|shocked)\b/i;

export interface Scored { p: ParsedEpisode; s: Record<string, BeatScore> }

export const duration = (segs: Segment[]) => segs.reduce((a, g) => a + (g.end - g.start), 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Snap [start,end] outward so no dialogue line is cut in half; list the beats inside. */
function makeSegment(p: ParsedEpisode, start: number, end: number): Segment {
  const lines = p.beats.filter((b) => b.type === "dialogue");
  for (let i = 0; i < 6; i++) {
    let changed = false;
    for (const b of lines) {
      if (b.start < start - 1e-6 && b.end > start + 1e-6) { start = b.start; changed = true; }
      if (b.start < end - 1e-6 && b.end > end + 1e-6) { end = b.end; changed = true; }
    }
    if (!changed) break;
  }
  const beatIds = p.beats.filter((b) => b.start >= start - 1e-6 && b.start < end - 1e-6).map((b) => b.id);
  return { ep: p.meta.ep, start: r2(start), end: r2(end), beatIds };
}

const avgCtx = (sc: Scored, segs: Segment[]) => {
  const ids = new Set(segs.flatMap((g) => g.beatIds));
  const v = Object.values(sc.s).filter((b) => ids.has(b.id)).map((b) => b.context_need);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 5;
};

function topIdx(T: Beat[], s: Record<string, BeatScore>, key: "hook" | "cliff", min: number): Set<number> {
  const ranked = T.map((b, i) => ({ i, v: s[b.id]?.[key] ?? 0 })).sort((a, b) => b.v - a.v);
  const out = new Set<number>();
  ranked.forEach(({ i, v }, rank) => { if (v >= min || (rank < 3 && v >= 5)) out.add(i); });
  return out;
}

const sorted = (p: ParsedEpisode) => taggableBeats(p).sort((a, b) => a.start - b.start || a.end - b.end);
let uid = 0;
const cid = (p: string, ep: number) => `${p}${String(ep).padStart(2, "0")}_${String(++uid).padStart(4, "0")}`;

export function buildSingle(p: ParsedEpisode, s: Record<string, BeatScore>): Candidate[] {
  const T = sorted(p);
  const hooks = topIdx(T, s, "hook", HOOK_MIN);
  const cliffs = topIdx(T, s, "cliff", CLIFF_MIN);
  const out: Candidate[] = [];
  for (const i of hooks) {
    let start = T[i].start;
    const prev = T[i - 1];
    if (prev && T[i].type !== "dialogue" && REACTION.test(T[i].text) && start - prev.end <= PREROLL && start - prev.end >= 0) start = prev.start;
    for (let j = i; j < T.length; j++) {
      if (!cliffs.has(j)) continue;
      const seg = makeSegment(p, start, T[j].end);
      const dur = seg.end - seg.start;
      if (dur < MIN_DUR) continue;
      if (dur > MAX_DUR) break;
      const sc = { p, s };
      out.push({
        id: cid("s", p.meta.ep),
        kind: "single",
        segments: [seg],
        duration: r2(dur),
        preScore: r2((s[T[i].id]?.hook ?? 0) + (s[T[j].id]?.cliff ?? 0) - 0.5 * avgCtx(sc, [seg])),
        tag: s[T[i].id]?.tag ?? "other",
        scene: T[i].scene,
      });
    }
  }
  return out;
}

function forward(T: Beat[], i: number, minLen: number): number {
  let j = i;
  while (j < T.length - 1 && T[j].end - T[i].start < minLen) j++;
  return j;
}
function backward(T: Beat[], j: number, minLen: number): number {
  let i = j;
  while (i > 0 && T[j].end - T[i].start < minLen) i--;
  return i;
}

export function buildStitched(p: ParsedEpisode, s: Record<string, BeatScore>): Candidate[] {
  const T = sorted(p);
  const hooks = [...topIdx(T, s, "hook", HOOK_MIN)].slice(0, 3);
  const cliffs = [...topIdx(T, s, "cliff", CLIFF_MIN)].slice(0, 3);
  const out: Candidate[] = [];
  for (const h of hooks) for (const c of cliffs) {
    if (c <= h) continue;
    for (const [la, lb] of [[10, 12], [14, 16]]) {
      const a = makeSegment(p, T[h].start, T[forward(T, h, la)].end);
      const bi = backward(T, c, lb);
      const b = makeSegment(p, T[bi].start, T[c].end);
      if (b.start - a.end < 3) break; // too close: that is a single stretch, not a stitch
      const total = duration([a, b]);
      if (total < MIN_DUR || total > MAX_DUR) continue;
      out.push({
        id: cid("m", p.meta.ep), kind: "stitched", segments: [a, b], duration: r2(total),
        preScore: r2((s[T[h].id]?.hook ?? 0) + (s[T[c].id]?.cliff ?? 0) - 0.5 * avgCtx({ p, s }, [a, b])),
        tag: s[T[h].id]?.tag ?? "other", scene: T[h].scene,
      });
      break;
    }
  }
  return out;
}

/** Cliffhanger ending of episode N + opening hook of episode N+1 ("previously on" structure). */
export function buildCross(a: Scored, b: Scored): Candidate[] {
  const Ta = sorted(a.p);
  const Tb = sorted(b.p);
  if (!Ta.length || !Tb.length) return [];
  const tailIdx = Ta.map((_, i) => i).slice(-3);
  const c = tailIdx.reduce((best, i) => ((a.s[Ta[i].id]?.cliff ?? 0) > (a.s[Ta[best].id]?.cliff ?? 0) ? i : best), tailIdx[0]);
  const headIdx = Tb.map((_, i) => i).slice(0, 3);
  const h = headIdx.reduce((best, i) => ((b.s[Tb[i].id]?.hook ?? 0) > (b.s[Tb[best].id]?.hook ?? 0) ? i : best), headIdx[0]);
  if ((a.s[Ta[c].id]?.cliff ?? 0) < CLIFF_MIN || (b.s[Tb[h].id]?.hook ?? 0) < HOOK_MIN) return [];
  for (const [la, lb] of [[12, 12], [15, 15]]) {
    const sa = makeSegment(a.p, Ta[backward(Ta, c, la)].start, Ta[c].end);
    const sb = makeSegment(b.p, Tb[h].start, Tb[forward(Tb, h, lb)].end);
    const total = duration([sa, sb]);
    if (total < MIN_DUR || total > MAX_DUR) continue;
    return [{
      id: cid("x", a.p.meta.ep), kind: "cross-episode", segments: [sa, sb], duration: r2(total),
      preScore: r2((b.s[Tb[h].id]?.hook ?? 0) + (a.s[Ta[c].id]?.cliff ?? 0) - 0.5 * avgCtx(a, [sa]) / 2 - 0.5 * avgCtx(b, [sb]) / 2),
      tag: b.s[Tb[h].id]?.tag ?? "other", scene: Ta[c].scene,
    }];
  }
  return [];
}

function iou(x: Candidate, y: Candidate): number {
  let inter = 0;
  for (const a of x.segments) for (const b of y.segments)
    if (a.ep === b.ep) inter += Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const union = x.duration + y.duration - inter;
  return union > 0 ? inter / union : 0;
}

/** Keep the higher pre-score of any pair with IoU > 0.6. */
export function dedupe(cands: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  for (const c of [...cands].sort((a, b) => b.preScore - a.preScore))
    if (kept.every((k) => iou(k, c) <= 0.6)) kept.push(c);
  return kept;
}

export function selectCandidates(p: ParsedEpisode, s: Record<string, BeatScore>, k = 8): Candidate[] {
  return dedupe([...buildSingle(p, s), ...buildStitched(p, s)]).slice(0, k);
}
