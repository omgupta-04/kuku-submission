"use client";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { DEFAULT_SETTINGS, runShow, type EpState, type RunOutput, type Settings, type Stage } from "@/lib/client-run";
import { toCsv } from "@/lib/finalize";
import { download, mmss } from "@/lib/format";
import { PromoCard, QCChips } from "./PromoCard";
import Timeline from "./Timeline";

type F = { name: string; text: string };

async function entriesToFiles(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const it of Array.from(items)) { const e = it.webkitGetAsEntry?.(); if (e) await walk(e); }
  return out;
}

const STEPS: { id: Stage; label: string }[] = [
  { id: "reading", label: "Reading files" },
  { id: "analyzing", label: "Tag beats · build clips · judge · QC" },
  { id: "cross", label: "Cross-episode clips" },
  { id: "ranking", label: "Ranking" },
];

export default function Run() {
  const [files, setFiles] = useState<F[]>([]);
  const settings: Settings = DEFAULT_SETTINGS;
  const [stage, setStage] = useState<{ s: Stage; n?: number; total?: number } | null>(null);
  const [eps, setEps] = useState<EpState[]>([]);
  const [out, setOut] = useState<RunOutput | null>(null);
  const [err, setErr] = useState("");
  const [ep, setEp] = useState<number | null>(null);
  const [sel, setSel] = useState<string | undefined>();
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  async function ingest(list: File[]) {
    const txt = list.filter((f) => f.name.toLowerCase().endsWith(".txt")).sort((a, b) => a.name.localeCompare(b.name));
    setFiles(await Promise.all(txt.map(async (f) => ({ name: f.name, text: await f.text() }))));
    setOut(null); setStage(null); setEps([]);
    setErr(txt.length ? "" : `No .txt files found (got ${list.length} file${list.length === 1 ? "" : "s"}). Extract your zip first and choose the .txt files or the folder.`);
  }

  async function start() {
    setErr(""); setOut(null); setEp(null); setSel(undefined);
    try {
      const o = await runShow(files, settings, {
        onStage: (s, n, total) => setStage({ s, n, total }),
        onEpisode: (i, st) => setEps((p) => { const c = [...p]; c[i] = st; return c; }),
      });
      setOut(o);
      setEp(o.result.promos[0]?.segments[0].ep ?? o.bundles[0].parsed.meta.ep);
    } catch (e) { setErr((e as Error).message); }
  }

  const running = stage && stage.s !== "done" && !out && !err;
  const bundle = out?.bundles.find((b) => b.parsed.meta.ep === ep);
  const epPromos = useMemo(() => out?.result.promos.filter((p) => p.segments.some((s) => s.ep === ep)) ?? [], [out, ep]);
  const selected = out?.result.promos.find((p) => p.id === sel) ?? epPromos[0];

  const kpi = out && (() => {
    const p = out.result.promos;
    return [
      ["Episodes", String(out.bundles.length)],
      ["Promos found", String(p.length)],
      ["Avg duration", `${(p.reduce((a, x) => a + x.duration, 0) / Math.max(p.length, 1)).toFixed(0)}s`],
      ["QC pass rate", `${(out.result.qc.rulePassRate * 100).toFixed(0)}%`],
    ];
  })();

  return (
    <section id="run" className="scroll-mt-4 py-16">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <p className="eyebrow">01 · Run</p>
        <h1 className="mt-3 max-w-4xl text-5xl md:text-6xl">
          Drop a show&apos;s screenplays. Get ranked promo clips with exact timestamps.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">Hook in the first 3 seconds, a cliffhanger ending, and a one-line reason. Finding only: no cutting, music or overlays.</p>
        <ol className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted">
          {["Add .txt screenplays", "Find promos", "Review and export"].map((t, i) => (
            <li key={t} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full border border-line font-mono text-[11px] text-ink">{i + 1}</span>{t}</li>
          ))}
        </ol>
      </motion.div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={async (e) => { e.preventDefault(); setDrag(false); await ingest(e.dataTransfer.items?.length ? await entriesToFiles(e.dataTransfer.items) : Array.from(e.dataTransfer.files)); }}
        className={`mt-8 grid place-items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${drag ? "border-accent bg-accent-soft" : "border-[#cfc7b7] bg-surface"}`}
      >
        <input ref={input} type="file" multiple accept=".txt,text/plain" className="hidden" onChange={(e) => e.target.files && ingest(Array.from(e.target.files))} />
        <input
          ref={folderInput} type="file" multiple className="hidden"
          // @ts-expect-error non-standard but widely supported folder picker
          webkitdirectory=""
          onChange={(e) => e.target.files && ingest(Array.from(e.target.files))}
        />
        <p className="text-lg font-medium">{files.length ? `${files.length} episode file${files.length > 1 ? "s" : ""} ready` : "Drag .txt files or a show folder here"}</p>
        <div className="mt-3 flex gap-3">
          <button type="button" className="btn" onClick={() => input.current?.click()}>Choose files</button>
          <button type="button" className="btn" onClick={() => folderInput.current?.click()}>Choose folder</button>
        </div>
        <p className="mt-3 text-sm text-muted">.txt screenplay files only. Files are read in your browser and sent to the server one episode at a time.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={!files.length || !!running} onClick={start}>{running ? "Running…" : "Find promos"}</button>
        {out && (
          <>
            <button className="btn" onClick={() => download("promos_ranked.json", JSON.stringify(out.result.promos.map((p) => ({ ...p, excerpt: undefined })), null, 2), "application/json")}>Download JSON</button>
            <button className="btn" onClick={() => download("promos_ranked.csv", toCsv(out.result.promos), "text/csv")}>Download CSV</button>
          </>
        )}
      </div>

      {err && <p className="card mt-4 border-bad/40 p-4 text-sm text-bad">{err}</p>}

      {stage && !out && (
        <div className="card mt-6 p-6">
          <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {STEPS.map((s, i) => {
              const cur = STEPS.findIndex((x) => x.id === stage.s);
              const state = i < cur ? "done" : i === cur ? "now" : "todo";
              return (
                <li key={s.id} className={state === "todo" ? "text-muted" : state === "now" ? "font-medium text-accent" : "text-hook"}>
                  {state === "done" ? "✓" : state === "now" ? "●" : "○"} {s.label}{state === "now" && stage.total ? ` (${stage.n ?? 0}/${stage.total})` : ""}
                </li>
              );
            })}
          </ol>
          <div className="mt-5 grid gap-1.5 sm:grid-cols-2">
            {eps.map((e, i) => (
              <div key={i} className="text-xs">
                <div className="flex justify-between"><span className="truncate">{e.name}</span><span className={e.status === "error" ? "text-bad" : "text-muted"}>{e.status}{e.promos != null ? ` · ${e.promos}` : ""}</span></div>
                <div className="mt-0.5 h-1.5 rounded bg-sunk"><div className={`h-full rounded ${e.status === "error" ? "bg-bad" : "bg-accent"} ${e.status === "running" ? "animate-pulse" : ""}`} style={{ width: e.status === "done" || e.status === "error" ? "100%" : e.status === "running" ? "55%" : "0%" }} /></div>
                {e.error && <p className="mt-0.5 text-bad">{e.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {out && kpi && (
        <div className="mt-8 space-y-8">
          {eps.some((e) => e.status === "error") && <p className="card p-4 text-sm text-bad">{eps.filter((e) => e.status === "error").length} episode(s) failed and are not in the results. Re-run to retry.</p>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpi.map(([k, v]) => (<div key={k} className="card p-5"><p className="text-sm text-muted">{k}</p><p className="mt-1 text-3xl font-semibold">{v}</p></div>))}
          </div>
          <div>
            <h3 className="mb-3 text-lg font-semibold">Post these first</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {out.result.postFirst.map((p) => (<div key={p.id}><PromoCard promo={p} /><p className="mt-2 px-1 text-xs text-muted">{p.reason}</p></div>))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold">Episode drill-down</h3>
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="card max-h-[480px] overflow-auto p-2">
                {out.bundles.map((b) => (
                  <button key={b.parsed.meta.ep} onClick={() => { setEp(b.parsed.meta.ep); setSel(undefined); }}
                    className={`flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm ${ep === b.parsed.meta.ep ? "bg-sunk font-medium" : "hover:bg-sunk/50"}`}>
                    <span>Episode {b.parsed.meta.ep}</span><span className="text-muted">{out.result.promos.filter((p) => p.segments.some((s) => s.ep === b.parsed.meta.ep)).length}</span>
                  </button>
                ))}
              </div>
              {bundle && (
                <div className="card space-y-5 p-5">
                  <p className="text-sm text-muted">{bundle.parsed.meta.logline}</p>
                  <Timeline ep={bundle.parsed.meta.ep} duration={bundle.parsed.meta.duration} promos={epPromos} selected={selected?.id} onSelect={setSel} />
                  {selected ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">{epPromos.map((p) => (<button key={p.id} onClick={() => setSel(p.id)} className={`chip ${p.id === selected.id ? "ring-2 ring-accent/40" : ""}`}>#{p.rank} {p.title}</button>))}</div>
                      <PromoCard promo={selected} />
                      <QCChips promo={selected} />
                      {selected.qc?.critic && <p className="text-sm text-muted">Critic: {selected.qc.critic.note}</p>}
                      {selected.segments.map((g, i) => {
                        const b = out.bundles.find((x) => x.parsed.meta.ep === g.ep);
                        const ids = new Set(g.beatIds);
                        const rows = b?.parsed.beats.filter((x) => ids.has(x.id) && b.scores[x.id]) ?? [];
                        return (
                          <div key={i}>
                            <p className="mb-1 text-sm font-medium">Segment {i + 1}: Ep {g.ep} {mmss(g.start)}–{mmss(g.end)}</p>
                            <div className="overflow-auto rounded-lg border border-line text-xs">
                              <table className="w-full">
                                <thead className="bg-sunk text-left"><tr><th className="p-2">Time</th><th className="p-2">Line</th><th className="p-2">Hook</th><th className="p-2">Cliff</th></tr></thead>
                                <tbody>{rows.map((r) => (<tr key={r.id} className="border-t border-line"><td className="p-2 font-mono">{mmss(r.start)}</td><td className="p-2">{r.type === "dialogue" ? `${r.display}: ` : `[${r.type}] `}{r.text}</td><td className="p-2">{b!.scores[r.id].hook}</td><td className="p-2">{b!.scores[r.id].cliff}</td></tr>))}</tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm text-muted">No promo candidates in this episode.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
