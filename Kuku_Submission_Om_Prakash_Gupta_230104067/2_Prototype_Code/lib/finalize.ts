import type { EpisodeBundle, Promo, QCSummary, ShowResult } from "./types";
import { postFirst, rankPromos } from "./ranker";

export function qcSummary(promos: Promo[]): QCSummary {
  const flagCounts: Record<string, number> = {};
  for (const p of promos) for (const f of p.qc?.flags ?? []) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  const passed = promos.filter((p) => p.qc?.pass).length;
  return {
    total: promos.length,
    passed,
    rulePassRate: promos.length ? passed / promos.length : 0,
    flagCounts,
    criticDisagreements: flagCounts.judge_critic_disagree ?? 0,
  };
}

export function finalize(bundles: EpisodeBundle[], cross: Promo[]): ShowResult {
  const all = [...bundles.flatMap((b) => b.promos), ...cross];
  const promos = rankPromos(all);
  return {
    promos,
    postFirst: postFirst(promos),
    qc: qcSummary(promos),
    parseReport: bundles
      .map((b) => ({ ep: b.parsed.meta.ep, file: b.parsed.meta.file, beats: b.parsed.beats.length, unparsed: b.parsed.unparsed.length, unparsedSample: b.parsed.unparsed.slice(0, 5) }))
      .sort((x, y) => x.ep - y.ep),
  };
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function toCsv(promos: Promo[]): string {
  const head = "rank,score,kind,title,segments,duration_s,tag,hook,cliffhanger,why,spoiler_risk,qc_pass,qc_flags";
  const rows = promos.map((p) =>
    [
      p.rank, p.score, p.kind, q(p.title), q(p.segments.map((s) => `Ep${s.ep} ${mmss(s.start)}-${mmss(s.end)}`).join(" + ")),
      p.duration, p.tag, q(p.hook_text), q(p.cliffhanger_text), q(p.why), p.spoiler_risk, p.qc?.pass, q((p.qc?.flags ?? []).join(";")),
    ].join(","),
  );
  return [head, ...rows].join("\n") + "\n";
}
