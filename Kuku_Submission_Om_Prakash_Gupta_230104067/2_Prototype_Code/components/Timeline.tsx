"use client";
import type { Promo } from "@/lib/types";
import { mmss } from "@/lib/format";

/** Episode bar 0..duration with promo segments; green tick = hook (segment start), amber tick = cliff (segment end). */
export default function Timeline({ ep, duration, promos, selected, onSelect }: { ep: number; duration: number; promos: Promo[]; selected?: string; onSelect: (id: string) => void }) {
  const pct = (t: number) => `${(t / Math.max(duration, 1)) * 100}%`;
  return (
    <div>
      <div className="relative h-14 rounded-lg bg-sunk">
        {promos.flatMap((p) =>
          p.segments.filter((s) => s.ep === ep).map((s, i) => (
            <button
              key={`${p.id}${i}`}
              onClick={() => onSelect(p.id)}
              title={`${p.title} ${mmss(s.start)}–${mmss(s.end)}`}
              className={`absolute top-2 bottom-2 rounded-md border ${selected === p.id ? "border-accent bg-accent/30" : "border-accent/30 bg-accent/15 hover:bg-accent/25"}`}
              style={{ left: pct(s.start), width: pct(s.end - s.start) }}
            >
              <span className="absolute -left-px top-0 h-full w-[3px] rounded-l bg-hook" />
              <span className="absolute -right-px top-0 h-full w-[3px] rounded-r bg-cliff" />
            </button>
          )),
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted"><span>00:00</span><span>{mmss(duration)}</span></div>
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-hook" />hook</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-cliff" />cliffhanger</span>
      </div>
    </div>
  );
}
