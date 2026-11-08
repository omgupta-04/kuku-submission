"use client";
import type { Promo } from "@/lib/types";
import { FLAG_TEXT, segLabel } from "@/lib/format";

export function QCChips({ promo }: { promo: Promo }) {
  const flags = promo.qc?.flags ?? [];
  if (!promo.qc) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="chip" style={{ background: promo.qc.pass ? "var(--ok-bg)" : "var(--warn-bg)", color: promo.qc.pass ? "var(--hook)" : "var(--bad)" }}>
        {promo.qc.pass ? "rules pass" : "rules fail"}
      </span>
      {flags.map((f) => (
        <span key={f} title={FLAG_TEXT[f]} className="chip" style={{ background: "var(--warn-bg)", color: "var(--cliff)" }}>{f.replace(/_/g, " ")}</span>
      ))}
    </div>
  );
}

export function PromoCard({ promo, onClick, active }: { promo: Promo; onClick?: () => void; active?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`card p-5 ${onClick ? "cursor-pointer hover:-translate-y-0.5 transition-transform" : ""} ${active ? "ring-2 ring-accent/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {promo.rank != null && <span className="grid size-9 place-items-center rounded-lg bg-ink text-sm font-semibold text-white">{promo.rank}</span>}
          <div>
            <h4 className="font-semibold leading-tight">{promo.title}</h4>
            <p className="font-mono text-xs text-muted">{segLabel(promo)} · {promo.duration.toFixed(0)}s</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-lg font-semibold">{promo.score.toFixed(1)}</span>
          <span className="chip">{promo.kind}</span>
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div><dt className="inline font-medium text-hook">Hook · </dt><dd className="inline">{promo.hook_text}</dd></div>
        <div><dt className="inline font-medium text-cliff">Cliffhanger · </dt><dd className="inline">{promo.cliffhanger_text}</dd></div>
        <div><dt className="inline font-medium text-muted">Why · </dt><dd className="inline">{promo.why}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="chip">{promo.tag}</span>
        <span className="chip">spoiler: {promo.spoiler_risk}</span>
        <QCChips promo={promo} />
      </div>
    </div>
  );
}
