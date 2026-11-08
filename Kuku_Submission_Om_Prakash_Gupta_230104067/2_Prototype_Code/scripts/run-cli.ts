/* CLI: npm run promos -- --in ./show_folder --out ./outputs [--publish] [--no-cross] [--no-critic] [--excerpts] [--concurrency 3] */
import fs from "node:fs";
import path from "node:path";
import { configFromEnv, createLLM } from "../lib/llm";
import { mockProvider } from "../lib/mockllm";
import { analyzeCross, analyzeEpisode, finalize, toCsv, type EpisodeBundle } from "../lib/pipeline";
import { precisionAtK, promoKey, type Label } from "../lib/qc";
import type { Promo } from "../lib/types";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const val = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

async function main() {
  const inDir = val("in", "input");
  const outDir = val("out", "outputs");
  const files = fs.readdirSync(inDir).filter((f) => f.toLowerCase().endsWith(".txt")).sort();
  if (!files.length) throw new Error(`no .txt files in ${inDir} (extract your zip first)`);

  const cfg = configFromEnv();
  if (cfg.provider !== "mock" && !cfg.apiKey) throw new Error("LLM_API_KEY missing. Copy .env.example to .env, or set LLM_PROVIDER=mock for an offline smoke test.");
  const llm = createLLM(cfg, mockProvider);
  console.log(`model=${llm.name} files=${files.length}`);

  let done = 0;
  const critic = !flag("no-critic");
  const bundles: EpisodeBundle[] = await pool(files, Number(val("concurrency", "3")), async (f) => {
    const b = await analyzeEpisode(llm, fs.readFileSync(path.join(inDir, f), "utf8"), f, { critic });
    console.log(`[${++done}/${files.length}] ${f}: ${b.parsed.beats.length} beats, ${b.promos.length} promos, ${b.parsed.unparsed.length} unparsed`);
    return b;
  });
  bundles.sort((a, b) => a.parsed.meta.ep - b.parsed.meta.ep);

  const cross: Promo[] = [];
  if (!flag("no-cross")) {
    const pairs = bundles.slice(0, -1).map((b, i) => [b, bundles[i + 1]] as const);
    for (const x of await pool(pairs, Number(val("concurrency", "3")), ([a, b]) => analyzeCross(llm, a, b, { critic }))) cross.push(...x);
    console.log(`cross-episode promos: ${cross.length}`);
  }

  const keepText = flag("excerpts");
  const strip = (p: Promo): Promo => (keepText ? p : { ...p, excerpt: undefined });
  const res = finalize(bundles, cross);

  // Optional human labels: outputs/manual_review.json = { "labels": { "<key from promos_ranked.json>": "good|ok|bad" } }
  let labels: Record<string, Label> = {};
  const mr = path.join(outDir, "manual_review.json");
  if (fs.existsSync(mr)) labels = JSON.parse(fs.readFileSync(mr, "utf8")).labels ?? {};
  const manual = [5, 10, 20].map((k) => precisionAtK(res.promos, labels, k));

  const ranked = res.promos.map((p) => ({ key: promoKey(p), ...strip(p) }));
  fs.mkdirSync(path.join(outDir, "episodes"), { recursive: true });
  for (const b of bundles) {
    const m = b.parsed.meta;
    fs.writeFileSync(
      path.join(outDir, "episodes", `episode-${String(m.ep).padStart(3, "0")}.json`),
      JSON.stringify({
        ep: m.ep, file: m.file, meta: m, scenes: b.parsed.scenes,
        beats: b.parsed.beats.map(({ id, type, scene, start, end }) => ({ id, type, scene, start, end })),
        scores: b.scores, promos: b.promos.map(strip),
      }, null, 2),
    );
  }
  const promosJson = { model: llm.name, generated: new Date().toISOString(), post_first: res.postFirst.map(strip), promos: ranked };
  fs.writeFileSync(path.join(outDir, "promos_ranked.json"), JSON.stringify(promosJson, null, 2));
  fs.writeFileSync(path.join(outDir, "promos_ranked.csv"), toCsv(res.promos));
  const qc = { model: llm.name, ...res.qc, manual_review: manual, parse: res.parseReport };
  fs.writeFileSync(path.join(outDir, "qc_report.json"), JSON.stringify(qc, null, 2));
  fs.writeFileSync(path.join(outDir, "parse_report.json"), JSON.stringify(res.parseReport, null, 2));

  if (flag("publish")) {
    const pub = path.join("public", "results");
    fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(path.join(pub, "promos_ranked.json"), JSON.stringify({ ...promosJson, post_first: res.postFirst.map((p) => ({ ...p, excerpt: undefined })), promos: ranked.map((p) => ({ ...p, excerpt: undefined })) }));
    fs.writeFileSync(path.join(pub, "qc_report.json"), JSON.stringify(qc));
    fs.writeFileSync(path.join(pub, "episodes.json"), JSON.stringify(bundles.map((b) => ({
      ep: b.parsed.meta.ep, duration: b.parsed.meta.duration, logline: b.parsed.meta.logline,
      beats: b.parsed.beats.filter((x) => x.type !== "camera").length,
      maxHook: Math.max(0, ...Object.values(b.scores).map((s) => s.hook)),
      maxCliff: Math.max(0, ...Object.values(b.scores).map((s) => s.cliff)),
    }))));
    console.log("published to public/results (no script text)");
  }

  const unparsed = res.parseReport.reduce((a, r) => a + r.unparsed, 0);
  console.log(`\nepisodes=${bundles.length} promos=${res.promos.length} (cross=${cross.length}) rulePass=${(res.qc.rulePassRate * 100).toFixed(0)}% unparsedLines=${unparsed}`);
  console.log(`outputs -> ${outDir}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
