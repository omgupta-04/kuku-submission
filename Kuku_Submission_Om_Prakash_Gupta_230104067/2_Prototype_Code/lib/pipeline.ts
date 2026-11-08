import type { Candidate, EpisodeBundle, ParsedEpisode, Promo } from "./types";
import type { LLM } from "./llm";
import { parseEpisode } from "./parser";
import { tagEpisode } from "./tagger";
import { buildCross, selectCandidates } from "./windows";
import { clipText, criticCandidates, judgeCandidates } from "./judge";
import { ruleChecks, type EpMap } from "./qc";

export interface AnalyzeOpts { maxPerEp?: number; critic?: boolean }

async function judgeAndCheck(llm: LLM, cands: Candidate[], parsedByEp: Map<number, ParsedEpisode>, epMap: EpMap, critic: boolean): Promise<Promo[]> {
  const judged = await judgeCandidates(llm, cands, parsedByEp);
  const crit = critic ? await criticCandidates(llm, cands, parsedByEp, judged) : {};
  return cands.map((c) => {
    const flags = ruleChecks(c, epMap);
    const cr = crit[c.id];
    const j = judged[c.id];
    const out: string[] = [...flags];
    if (cr?.confusing) out.push("critic_confusing");
    if (cr?.resolved) out.push("critic_resolved");
    if (cr?.resolved && j.cliff >= 7) out.push("judge_critic_disagree");
    return { ...c, ...j, score: 0, excerpt: clipText(c, parsedByEp), qc: { pass: flags.length === 0, flags: out, critic: cr } };
  });
}

export async function analyzeEpisode(llm: LLM, text: string, file: string, opts: AnalyzeOpts = {}): Promise<EpisodeBundle> {
  const parsed = parseEpisode(text, file);
  const scores = await tagEpisode(llm, parsed);
  const cands = selectCandidates(parsed, scores, opts.maxPerEp ?? 8);
  const promos = await judgeAndCheck(
    llm, cands, new Map([[parsed.meta.ep, parsed]]), new Map([[parsed.meta.ep, { p: parsed, s: scores }]]), opts.critic ?? true,
  );
  return { parsed, scores, promos };
}

/** Cliffhanger at the end of episode A + opening hook of episode B (consecutive episodes). */
export async function analyzeCross(llm: LLM, a: EpisodeBundle, b: EpisodeBundle, opts: AnalyzeOpts = {}): Promise<Promo[]> {
  const cands = buildCross({ p: a.parsed, s: a.scores }, { p: b.parsed, s: b.scores });
  if (!cands.length) return [];
  const parsedByEp = new Map([[a.parsed.meta.ep, a.parsed], [b.parsed.meta.ep, b.parsed]]);
  const epMap: EpMap = new Map([[a.parsed.meta.ep, { p: a.parsed, s: a.scores }], [b.parsed.meta.ep, { p: b.parsed, s: b.scores }]]);
  return judgeAndCheck(llm, cands, parsedByEp, epMap, opts.critic ?? true);
}

export { qcSummary, finalize, toCsv } from "./finalize";
export type { QCSummary, ShowResult, EpisodeBundle } from "./types";
