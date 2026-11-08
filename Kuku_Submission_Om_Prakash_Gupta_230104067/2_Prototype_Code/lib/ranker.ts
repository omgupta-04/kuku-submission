import type { Promo } from "./types";

export function durationFit(d: number): number {
  if (d >= 25 && d <= 45) return 10;
  if (d < 25) return Math.max(0, ((d - 20) / 5) * 10);
  return Math.max(0, ((60 - d) / 15) * 10);
}

export function scorePromo(p: Promo): number {
  const spoiler = p.spoiler_risk === "high" ? 1.5 : p.spoiler_risk === "med" ? 0.5 : 0;
  return 0.3 * p.hook_3s + 0.3 * p.cliff + 0.2 * p.standalone + 0.15 * p.emotion + 0.05 * durationFit(p.duration) - spoiler;
}

const firstEp = (p: Promo) => p.segments[0].ep;

/** Greedy MMR-style ordering: repeated tag / same scene already picked costs 0.4 each. */
export function rankPromos(promos: Promo[], lambda = 0.4): Promo[] {
  const pool = promos.map((p) => ({ ...p, score: Math.round(scorePromo(p) * 1000) / 1000 }));
  const out: Promo[] = [];
  while (pool.length) {
    let bi = 0, bv = -Infinity;
    pool.forEach((p, i) => {
      const pen = out.reduce((a, o) => a + (o.tag === p.tag ? lambda : 0) + (firstEp(o) === firstEp(p) && o.scene === p.scene ? lambda : 0), 0);
      const v = p.score - pen;
      if (v > bv) { bv = v; bi = i; }
    });
    out.push({ ...pool.splice(bi, 1)[0], rank: out.length + 1 });
  }
  return out;
}

export interface PostFirst extends Promo { reason: string }

/** Top 5 to post first: among the top 15, early episodes get a funnel bonus (they lead into ep 1). */
export function postFirst(ranked: Promo[]): PostFirst[] {
  return ranked
    .slice(0, 15)
    .map((p) => ({ p, v: p.score + (Math.max(0, 50 - firstEp(p)) / 50) * 0.5 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 5)
    .map(({ p }) => ({
      ...p,
      reason: `${p.why} Ep ${firstEp(p)}${firstEp(p) <= 5 ? " is early in the funnel, so a new viewer can start from episode 1" : ""}; ${p.tag} is a reliably strong trope; spoiler risk ${p.spoiler_risk}.`,
    }));
}
