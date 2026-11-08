import { describe, it, expect } from "vitest";
import type { Beat, BeatScore, ParsedEpisode } from "@/lib/types";
import { buildSingle, buildStitched, buildCross, dedupe, duration } from "@/lib/windows";

let n = 0;
function ep(num: number, specs: [number, number, number, number, Partial<Beat>?][]): { p: ParsedEpisode; s: Record<string, BeatScore> } {
  // spec: [start, end, hook, cliff, extra]
  const beats: Beat[] = [];
  const s: Record<string, BeatScore> = {};
  specs.forEach(([start, end, hook, cliff, extra], i) => {
    const id = `e${String(num).padStart(2, "0")}_b${String(i + 1).padStart(3, "0")}`;
    beats.push({ ep: num, scene: 1, id, type: "dialogue", speaker: "A", start, end, text: `line ${i}`, ...extra });
    s[id] = { id, hook, cliff, context_need: 2, tag: "betrayal" };
    n++;
  });
  const last = Math.max(...beats.map((b) => b.end));
  return { p: { meta: { ep: num, file: "f", logline: "", continuity: "", duration: last }, scenes: [{ n: 1, heading: "", start: 0, end: last }], beats, unparsed: [] }, s };
}

// 10 beats of 4s with 1s gaps; hook at beat 1 (0s), cliff at beat 6 (end 29s)
const flat = () => ep(1, Array.from({ length: 12 }, (_, i) => [i * 5, i * 5 + 4, i === 0 ? 9 : 1, i === 5 ? 9 : 1] as [number, number, number, number]));

describe("buildSingle", () => {
  it("starts on a hook beat and ends on a cliff beat boundary within 20-60s", () => {
    const { p, s } = flat();
    const c = buildSingle(p, s);
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) {
      expect(x.duration).toBeGreaterThanOrEqual(20);
      expect(x.duration).toBeLessThanOrEqual(60);
      expect(x.segments).toHaveLength(1);
    }
    expect(c[0].segments[0]).toMatchObject({ ep: 1, start: 0, end: 29 });
  });

  it("drops windows shorter than 20s", () => {
    const { p, s } = ep(1, [[0, 4, 9, 1], [5, 9, 1, 9]]);
    expect(buildSingle(p, s)).toEqual([]);
  });

  it("never cuts mid-line: extends end to cover a line that straddles it", () => {
    const { p, s } = ep(1, [[0, 4, 9, 1], [5, 20, 1, 1], [21, 24, 1, 9], [22, 30, 1, 1, ]]);
    const [c] = buildSingle(p, s);
    expect(c.segments[0].end).toBe(30);
  });

  it("pre-roll: pulls in a trigger beat ending within 1.5s before a reaction hook", () => {
    const { p, s } = ep(1, [[0, 3, 2, 1], [4, 8, 9, 1, { type: "action", text: "She stares, stunned." }], [9, 14, 1, 1], [15, 26, 1, 9]]);
    const c = buildSingle(p, s);
    expect(c[0].segments[0].start).toBe(0);
  });
});

describe("dedupe", () => {
  it("drops overlapping windows (IoU>0.6) keeping the higher pre-score", () => {
    const { p, s } = flat();
    const mk = (start: number, end: number, preScore: number) => ({ id: `${start}`, kind: "single" as const, segments: [{ ep: 1, start, end, beatIds: [] }], duration: end - start, preScore, tag: "other" as const, scene: 1 });
    const out = dedupe([mk(0, 30, 5), mk(1, 31, 9), mk(60, 90, 1)]);
    expect(out.map((c) => c.id)).toEqual(["1", "60"]);
    expect(p && s).toBeTruthy();
  });
});

describe("buildStitched", () => {
  it("joins best hook and best cliff from the same episode, chronological, 20-60s total", () => {
    const { p, s } = ep(1, Array.from({ length: 20 }, (_, i) => [i * 5, i * 5 + 4, i === 0 ? 9 : 1, i === 15 ? 9 : 1] as [number, number, number, number]));
    const c = buildStitched(p, s);
    expect(c.length).toBeGreaterThan(0);
    const x = c[0];
    expect(x.kind).toBe("stitched");
    expect(x.segments.length).toBeGreaterThanOrEqual(2);
    expect(x.segments.length).toBeLessThanOrEqual(3);
    expect(x.duration).toBeGreaterThanOrEqual(20);
    expect(x.duration).toBeLessThanOrEqual(60);
    expect(x.segments[0].start).toBeLessThan(x.segments[1].start);
    expect(duration(x.segments)).toBeCloseTo(x.duration);
  });
});

describe("buildCross", () => {
  it("joins the end of episode N with the opening of episode N+1", () => {
    const a = ep(1, Array.from({ length: 8 }, (_, i) => [i * 5, i * 5 + 4, 1, i === 7 ? 9 : 1] as [number, number, number, number]));
    const b = ep(2, Array.from({ length: 8 }, (_, i) => [i * 5, i * 5 + 4, i === 0 ? 9 : 1, 1] as [number, number, number, number]));
    const c = buildCross(a, b);
    expect(c.length).toBe(1);
    expect(c[0].kind).toBe("cross-episode");
    expect(c[0].segments.map((x) => x.ep)).toEqual([1, 2]);
    expect(c[0].duration).toBeGreaterThanOrEqual(20);
    expect(c[0].duration).toBeLessThanOrEqual(60);
  });

  it("returns nothing if episode N+1 does not open on a hook", () => {
    const a = ep(1, Array.from({ length: 8 }, (_, i) => [i * 5, i * 5 + 4, 1, i === 7 ? 9 : 1] as [number, number, number, number]));
    const b = ep(2, Array.from({ length: 8 }, (_, i) => [i * 5, i * 5 + 4, 1, 1] as [number, number, number, number]));
    expect(buildCross(a, b)).toEqual([]);
  });
});
