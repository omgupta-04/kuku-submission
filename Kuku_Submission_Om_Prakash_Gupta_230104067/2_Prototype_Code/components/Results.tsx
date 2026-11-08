"use client";
import { useEffect, useMemo, useState } from "react";
import type { Promo } from "@/lib/types";
import { FLAG_TEXT, segLabel } from "@/lib/format";
import { PromoCard } from "./PromoCard";

interface Ranked { model: string; generated: string; post_first: (Promo & { reason: string })[]; promos: (Promo & { key: string })[] }
interface Prec { k: number; labelled: number; strict: number | null; lenient: number | null }
interface QC { total: number; passed: number; rulePassRate: number; flagCounts: Record<string, number>; criticDisagreements: number; manual_review: Prec[] }
interface EpRow { ep: number; duration: number; beats: number; maxHook: number; maxCliff: number }

const get = <T,>(u: string) => fetch(u).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(u))));
const pct = (v: number | null) => (v == null ? "not yet reviewed" : `${Math.round(v * 100)}%`);

function Bars({ data, color, label }: { data: { k: string; v: number }[]; color: string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div className="card p-5">
      <p className="mb-3 text-sm font-medium">{label}</p>
      <div className="flex h-32 items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.k} title={`${d.k}: ${d.v}`} className="flex-1 rounded-t" style={{ height: `${(d.v / max) * 100}%`, background: color, minHeight: 2 }} />
        ))}
      </div>
    </div>
  );
}

export default function Results() {
  const [rk, setRk] = useState<Ranked | null>(null);
  const [qc, setQc] = useState<QC | null>(null);
  const [eps, setEps] = useState<EpRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [fEp, setFEp] = useState("");
  const [fTag, setFTag] = useState("");
  const [fKind, setFKind] = useState("");
  const [fMin, setFMin] = useState(20);
  const [fMax, setFMax] = useState(60);
  const [sort, setSort] = useState<"rank" | "score" | "duration" | "ep">("rank");

  useEffect(() => {
    Promise.all([get<Ranked>("/results/promos_ranked.json"), get<QC>("/results/qc_report.json"), get<EpRow[]>("/results/episodes.json")])
      .then(([a, b, c]) => { setRk(a); setQc(b); setEps(c); })
      .catch(() => setMissing(true));
  }, []);

  const rows = useMemo(() => {
    if (!rk) return [];
    const r = rk.promos.filter((p) =>
      (!fEp || p.segments.some((s) => s.ep === Number(fEp))) && (!fTag || p.tag === fTag) && (!fKind || p.kind === fKind) && p.duration >= fMin && p.duration <= fMax);
    const by = { rank: (p: Promo) => p.rank ?? 0, score: (p: Promo) => -p.score, duration: (p: Promo) => p.duration, ep: (p: Promo) => p.segments[0].ep };
    return [...r].sort((a, b) => by[sort](a) - by[sort](b));
  }, [rk, fEp, fTag, fKind, fMin, fMax, sort]);

  const tags = useMemo(() => {
    const m: Record<string, number> = {};
    rk?.promos.forEach((p) => (m[p.tag] = (m[p.tag] ?? 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rk]);

  const perEp = useMemo(() => {
    const m: Record<number, number> = {};
    rk?.promos.forEach((p) => (m[p.segments[0].ep] = (m[p.segments[0].ep] ?? 0) + 1));
    return eps.map((e) => ({ k: `Ep ${e.ep}`, v: m[e.ep] ?? 0 }));
  }, [rk, eps]);

  const failures = useMemo(() => (rk?.promos ?? []).filter((p) => p.qc && p.qc.flags.length).slice(0, 8), [rk]);

  return (
    <section id="results" className="scroll-mt-4 py-16">
      <p className="eyebrow">03 · Results</p>
      <h2 className="mt-3 text-4xl md:text-5xl">What it found in 50 episodes</h2>
      <p className="mt-2 max-w-2xl text-muted">Precomputed on the full 50-episode run. Script text is not published here: only timestamps, short quoted hook/cliffhanger lines and scores.</p>

      {missing && (
        <div className="card mt-6 p-6 text-sm">
          <p className="font-medium">No precomputed results bundled yet.</p>
          <p className="mt-1 text-muted">Run <code className="rounded bg-sunk px-1.5 py-0.5">npm run promos -- --in ./input --out ./outputs --publish</code> with your API key, then redeploy. See the README.</p>
        </div>
      )}

      {rk && qc && (
        <div className="mt-8 space-y-10">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Promos", rk.promos.length], ["Cross-episode", rk.promos.filter((p) => p.kind === "cross-episode").length], ["Rule pass rate", `${Math.round(qc.rulePassRate * 100)}%`], ["Model", rk.model]].map(([k, v]) => (
              <div key={String(k)} className="card p-5"><p className="text-sm text-muted">{k}</p><p className={`mt-1 font-semibold leading-tight ${String(v).length > 10 ? "text-base [overflow-wrap:anywhere]" : "text-3xl"}`}>{v}</p></div>
            ))}
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold">Post these first</h3>
            <div className="grid gap-4 lg:grid-cols-2">{rk.post_first.map((p) => (<div key={p.id}><PromoCard promo={p} /><p className="mt-2 px-1 text-xs text-muted">{p.reason}</p></div>))}</div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold">Leaderboard</h3>
            <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
              <label className="grid gap-1"><span className="text-muted">Episode</span><select className="rounded-lg border border-line bg-white px-2 py-1.5" value={fEp} onChange={(e) => setFEp(e.target.value)}><option value="">All</option>{eps.map((e) => <option key={e.ep}>{e.ep}</option>)}</select></label>
              <label className="grid gap-1"><span className="text-muted">Tag</span><select className="rounded-lg border border-line bg-white px-2 py-1.5" value={fTag} onChange={(e) => setFTag(e.target.value)}><option value="">All</option>{tags.map(([t]) => <option key={t}>{t}</option>)}</select></label>
              <label className="grid gap-1"><span className="text-muted">Type</span><select className="rounded-lg border border-line bg-white px-2 py-1.5" value={fKind} onChange={(e) => setFKind(e.target.value)}><option value="">All</option><option>single</option><option>stitched</option><option>cross-episode</option></select></label>
              <label className="grid gap-1"><span className="text-muted">Duration {fMin}–{fMax}s</span><span className="flex gap-2"><input type="range" min={20} max={60} value={fMin} onChange={(e) => setFMin(Math.min(Number(e.target.value), fMax))} /><input type="range" min={20} max={60} value={fMax} onChange={(e) => setFMax(Math.max(Number(e.target.value), fMin))} /></span></label>
              <label className="grid gap-1"><span className="text-muted">Sort</span><select className="rounded-lg border border-line bg-white px-2 py-1.5" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="rank">Rank</option><option value="score">Score</option><option value="duration">Duration</option><option value="ep">Episode</option></select></label>
            </div>
            <div className="card overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-sunk text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">#</th><th className="p-3">Clip</th><th className="p-3">Where</th><th className="p-3">Hook</th><th className="p-3">Cliffhanger</th><th className="p-3">Score</th></tr></thead>
                <tbody>
                  {rows.slice(0, 100).map((p) => (
                    <tr key={p.key + p.id} className="border-t border-line align-top">
                      <td className="p-3 font-semibold">{p.rank}</td>
                      <td className="p-3"><div className="font-medium">{p.title}</div><div className="text-xs text-muted">{p.kind} · {p.tag} · {p.duration.toFixed(0)}s</div></td>
                      <td className="p-3 font-mono text-xs">{segLabel(p)}</td>
                      <td className="p-3">{p.hook_text}</td><td className="p-3">{p.cliffhanger_text}</td>
                      <td className="p-3 font-semibold">{p.score.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Showing {Math.min(rows.length, 100)} of {rows.length}.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Bars data={perEp} color="var(--accent)" label="Promos per episode" />
            <Bars data={eps.map((e) => ({ k: `Ep ${e.ep}`, v: e.maxHook }))} color="var(--hook)" label="Best hook score per episode" />
            <Bars data={eps.map((e) => ({ k: `Ep ${e.ep}`, v: e.maxCliff }))} color="var(--cliff)" label="Best cliff score per episode" />
          </div>
          <div className="card p-5">
            <p className="mb-3 text-sm font-medium">Tag distribution</p>
            {tags.map(([t, n]) => (<div key={t} className="mb-1.5 flex items-center gap-3 text-sm"><span className="w-24 text-muted">{t}</span><div className="h-2.5 flex-1 rounded bg-sunk"><div className="h-full rounded bg-accent" style={{ width: `${(n / tags[0][1]) * 100}%` }} /></div><span className="w-8 text-right">{n}</span></div>))}
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold">Quality checks</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="card p-5 text-sm">
                <p className="font-medium">Manual review (precision@k)</p>
                <p className="mt-1 text-xs text-muted">Human labels of top picks: good / ok / bad. strict = good only; lenient = good or ok.</p>
                <table className="mt-3 w-full"><tbody>{qc.manual_review.map((m) => (<tr key={m.k} className="border-t border-line"><td className="py-2">@{m.k}</td><td>{m.labelled} labelled</td><td>strict {pct(m.strict)}</td><td>lenient {pct(m.lenient)}</td></tr>))}</tbody></table>
              </div>
              <div className="card p-5 text-sm">
                <p className="font-medium">Rule and critic flags</p>
                <p className="mt-1 text-xs text-muted">{qc.passed}/{qc.total} promos pass every rule. Critic disagreements with the judge: {qc.criticDisagreements}.</p>
                <ul className="mt-3 space-y-1">{Object.entries(qc.flagCounts).map(([f, n]) => (<li key={f} className="flex justify-between border-t border-line py-1.5"><span title={FLAG_TEXT[f]}>{f.replace(/_/g, " ")}</span><span className="font-mono">{n}</span></li>))}</ul>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-lg font-semibold">Failure gallery</h3>
            <p className="mb-3 text-sm text-muted">Promos the checks flagged, with the reason. Expected failure modes: hook needs unseen context, visual-only cliffhangers, disjoint stitches, reaction-shot hooks that lose the trigger, LLM over-scoring dialogue.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {failures.map((p) => (<div key={p.key + p.id}><PromoCard promo={p} /><ul className="mt-2 list-disc px-5 text-xs text-muted">{p.qc!.flags.map((f) => <li key={f}>{FLAG_TEXT[f] ?? f}</li>)}{p.qc?.critic?.note && <li>{p.qc.critic.note}</li>}</ul></div>))}
              {!failures.length && <p className="text-sm text-muted">No flagged promos in this run.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
