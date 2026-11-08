import { describe, it, expect } from "vitest";
import type { Beat, BeatScore, Candidate, ParsedEpisode, Promo } from "@/lib/types";
import { durationFit, scorePromo, rankPromos, postFirst } from "@/lib/ranker";
import { ruleChecks } from "@/lib/qc";

const base = (o: Partial<Promo>): Promo => ({
  id: "x", kind: "single", segments: [{ ep: 1, start: 0, end: 30, beatIds: [] }], duration: 30, preScore: 0, tag: "betrayal", scene: 1,
  hook_text: "h", cliffhanger_text: "c", why: "w", standalone: 8, hook_3s: 8, cliff: 8, emotion: 8, spoiler_risk: "low", title: "t", score: 0, ...o,
});

describe("durationFit", () => {
  it("is 10 in the sweet spot, linear to 0 at 20 and 60", () => {
    expect(durationFit(30)).toBe(10);
    expect(durationFit(45)).toBe(10);
    expect(durationFit(20)).toBe(0);
    expect(durationFit(60)).toBe(0);
    expect(durationFit(22.5)).toBeCloseTo(5);
    expect(durationFit(52.5)).toBeCloseTo(5);
  });
});

describe("scorePromo", () => {
  it("applies the weights and spoiler penalty", () => {
    expect(scorePromo(base({}))).toBeCloseTo(0.3 * 8 + 0.3 * 8 + 0.2 * 8 + 0.15 * 8 + 0.05 * 10);
    expect(scorePromo(base({ spoiler_risk: "med" }))).toBeCloseTo(scorePromo(base({})) - 0.5);
    expect(scorePromo(base({ spoiler_risk: "high" }))).toBeCloseTo(scorePromo(base({})) - 1.5);
  });
});

describe("rankPromos", () => {
  it("orders by score with diversity: second same-tag/same-scene clip is demoted", () => {
    const a = base({ id: "a", hook_3s: 10 });
    const b = base({ id: "b", hook_3s: 9.9 });
    const c = base({ id: "c", hook_3s: 8, tag: "kiss", scene: 2, segments: [{ ep: 2, start: 0, end: 30, beatIds: [] }] });
    const r = rankPromos([a, b, c]);
    expect(r.map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(r.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it("postFirst returns 5 with a reason string", () => {
    const ps = rankPromos(Array.from({ length: 8 }, (_, i) => base({ id: `p${i}`, tag: i % 2 ? "kiss" : "slap", scene: i, segments: [{ ep: i + 1, start: 0, end: 30, beatIds: [] }] })));
    const top = postFirst(ps);
    expect(top).toHaveLength(5);
    expect(top[0].reason).toMatch(/\w/);
  });
});

function epOf(beats: Partial<Beat>[], dur = 100): ParsedEpisode {
  return {
    meta: { ep: 1, file: "f", logline: "", continuity: "", duration: dur }, scenes: [], unparsed: [],
    beats: beats.map((b, i) => ({ ep: 1, scene: 1, id: `e01_b${i + 1}`, type: "dialogue", start: 0, end: 1, text: "t", ...b }) as Beat),
  };
}
const sc = (m: Record<string, number>): Record<string, BeatScore> =>
  Object.fromEntries(Object.entries(m).map(([id, cliff]) => [id, { id, hook: 5, cliff, context_need: 2, tag: "other" as const }]));

describe("ruleChecks", () => {
  const p = epOf([{ start: 0, end: 4 }, { start: 25, end: 30 }]);
  const cand: Candidate = { id: "c", kind: "single", segments: [{ ep: 1, start: 0, end: 30, beatIds: ["e01_b1", "e01_b2"] }], duration: 30, preScore: 0, tag: "other", scene: 1 };
  const eps = new Map([[1, { p, s: sc({ e01_b1: 2, e01_b2: 8 }) }]]);

  it("passes a good clip", () => {
    expect(ruleChecks(cand, eps)).toEqual([]);
  });
  it("flags duration out of range", () => {
    expect(ruleChecks({ ...cand, duration: 15 }, eps)).toContain("duration_out_of_range");
  });
  it("flags a weak ending", () => {
    const e2 = new Map([[1, { p, s: sc({ e01_b1: 2, e01_b2: 3 }) }]]);
    expect(ruleChecks(cand, e2)).toContain("weak_cliffhanger");
  });
  it("flags a silent opening (camera only in first 3s)", () => {
    const p2 = epOf([{ type: "camera", start: 0, end: 5 }, { start: 25, end: 30 }]);
    expect(ruleChecks(cand, new Map([[1, { p: p2, s: sc({ e01_b2: 8 }) }]]))).toContain("no_content_in_first_3s");
  });
  it("flags timestamps beyond episode duration and mid-line cuts", () => {
    const p3 = epOf([{ start: 0, end: 4 }, { start: 25, end: 40 }], 35);
    const f = ruleChecks(cand, new Map([[1, { p: p3, s: sc({ e01_b2: 8 }) }]]));
    expect(f).toContain("cuts_mid_line");
    const f2 = ruleChecks({ ...cand, segments: [{ ep: 1, start: 0, end: 36, beatIds: [] }] }, new Map([[1, { p: p3, s: sc({}) }]]));
    expect(f2).toContain("outside_episode");
  });
});

import { precisionAtK, promoKey } from "@/lib/qc";
describe("precisionAtK", () => {
  it("scores only labelled promos in the top k", () => {
    const mk = (ep: number) => ({ segments: [{ ep, start: 0, end: 30 }] });
    const ranked = [mk(1), mk(2), mk(3), mk(4)];
    const labels = { [promoKey(ranked[0])]: "good", [promoKey(ranked[1])]: "bad", [promoKey(ranked[2])]: "ok" } as const;
    expect(precisionAtK(ranked, labels, 3)).toEqual({ k: 3, labelled: 3, strict: 1 / 3, lenient: 2 / 3 });
    expect(precisionAtK(ranked, {}, 3).strict).toBeNull();
  });
});
