import { describe, it, expect } from "vitest";
import { wrapProvider } from "@/lib/llm";
import { mockProvider } from "@/lib/mockllm";
import { analyzeEpisode, analyzeCross, finalize, toCsv } from "@/lib/pipeline";

const llm = wrapProvider(mockProvider, { model: "mock" });

// Synthetic episode: opens on a slap, ends on a question. 14 lines x 3s.
function episode(n: number, opener: string, closer: string): string {
  const mm = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
  const lines = [opener, ...Array.from({ length: 12 }, (_, i) => `Filler talk number ${i}.`), closer];
  const body = lines
    .map((t, i) => `**ANNA (Tense):**\nStart: (${mm(i * 3)}) | End: (${mm(i * 3 + 2.5)})\n"${t}"\n`)
    .join("\n");
  return `EPISODE NUMBER: Episode ${n}\nEPISODE LOGLINE: A test.\nCONTINUITY NOTES: none\n\n--- SCRIPT START ---\n\nSCENE 01\nScene heading: INT. HALL – DAY\nScene start: 00:00.00\nScene end: ${mm(lines.length * 3)}\n\n${body}\n--- SCRIPT END ---\n`;
}

describe("pipeline", () => {
  it("analyzeEpisode returns judged promos with timestamps and QC flags", async () => {
    const b = await analyzeEpisode(llm, episode(1, "She slap him!", "Who is the Duke?"), "e1.txt");
    expect(b.promos.length).toBeGreaterThan(0);
    const p = b.promos[0];
    expect(p.segments[0].ep).toBe(1);
    expect(p.duration).toBeGreaterThanOrEqual(20);
    expect(p.hook_text).toMatch(/slap/i);
    expect(p.qc).toBeDefined();
    expect(p.excerpt).toContain("slap");
  });

  it("analyzeCross links consecutive episodes", async () => {
    const a = await analyzeEpisode(llm, episode(1, "Quiet start.", "Who is the Duke?"), "e1.txt");
    const b = await analyzeEpisode(llm, episode(2, "She slap him!", "Quiet end."), "e2.txt");
    const x = await analyzeCross(llm, a, b);
    expect(x).toHaveLength(1);
    expect(x[0].kind).toBe("cross-episode");
    expect(x[0].segments.map((s) => s.ep)).toEqual([1, 2]);
  });

  it("finalize ranks globally, picks post-first and summarises QC; csv has one row per promo", async () => {
    const a = await analyzeEpisode(llm, episode(1, "She slap him!", "Who is the Duke?"), "e1.txt");
    const b = await analyzeEpisode(llm, episode(2, "Traitor!", "Where is she?"), "e2.txt");
    const r = finalize([a, b], []);
    expect(r.promos.map((p) => p.rank)).toEqual(r.promos.map((_, i) => i + 1));
    expect(r.postFirst.length).toBeLessThanOrEqual(5);
    expect(r.qc.total).toBe(r.promos.length);
    expect(r.qc.rulePassRate).toBeGreaterThanOrEqual(0);
    expect(r.parseReport).toHaveLength(2);
    expect(toCsv(r.promos).trim().split("\n")).toHaveLength(r.promos.length + 1);
  });
});
