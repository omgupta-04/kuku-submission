import type { RawProvider } from "./llm";

/**
 * Offline stand-in LLM (LLM_PROVIDER=mock). Keyword heuristics only: it exists so the
 * pipeline, tests and UI can run without an API key. It is NOT a quality baseline.
 */
const HOOKY = /(slap|gasp|how dare|betray|traitor|never|dead|kill|secret|duke|blood|lie|cheat|divorce|poison|scream|!)/i;

const num = (n: number) => Math.max(0, Math.min(10, Math.round(n)));

function tagger(prompt: string): string {
  const scores = [];
  for (const line of prompt.split("\n")) {
    const m = /^(e\d+_b\d+) \| [^|]+ \| (\w+) \| ([^:]*): (.*)$/.exec(line);
    if (!m) continue;
    const text = m[4];
    const hook = HOOKY.test(text) ? 8 : /\?$/.test(text.trim()) ? 4 : 1;
    const cliff = /\?\s*(\[visual.*)?$/.test(text.trim()) || /\.\.\.|—$/.test(text.trim()) ? 8 : HOOKY.test(text) ? 5 : 1;
    const tag = /slap/i.test(text) ? "slap" : /secret|duke|identity/i.test(text) ? "identity" : /betray|traitor|cheat/i.test(text) ? "betrayal" : "other";
    scores.push({ id: m[1], hook: num(hook), cliff: num(cliff), context_need: 3, tag });
  }
  return JSON.stringify({ scores });
}

function clips(prompt: string): { id: string; lines: string[] }[] {
  return prompt
    .split(/=== CLIP /)
    .slice(1)
    .map((blk) => {
      const lines = blk.split("\n");
      return { id: lines[0].split(" ")[0], lines: lines.slice(1).filter((l) => /^\s+\[/.test(l)) };
    });
}

function judge(prompt: string): string {
  const results = clips(prompt).map(({ id, lines }) => {
    const first = (lines[0] ?? "").replace(/^\s+\[[^\]]*\]\s*/, "");
    const last = (lines[lines.length - 1] ?? "").replace(/^\s+\[[^\]]*\]\s*/, "");
    return {
      id, hook_text: first.slice(0, 120), cliffhanger_text: last.slice(0, 120),
      why: "Mock judge: opens on a charged line and ends on an open question.",
      standalone: 6, hook_3s: HOOKY.test(first) ? 8 : 4, cliff: /\?|\.\.\./.test(last) ? 8 : 4, emotion: 6,
      spoiler_risk: "low", title: `Mock clip ${id}`,
    };
  });
  return JSON.stringify({ results });
}

function critic(prompt: string): string {
  return JSON.stringify({ results: clips(prompt).map(({ id }) => ({ id, confusing: false, resolved: false, note: "Mock critic: no objection." })) });
}

export const mockProvider: RawProvider = async (prompt) => {
  if (prompt.includes("skeptical promo editor")) return critic(prompt);
  if (prompt.includes("scrolling Reels")) return judge(prompt);
  return tagger(prompt);
};
