const STAGES = [
  { n: "1", t: "Parser", who: "Code", i: "Raw .txt screenplays", o: "Timed beats (dialogue, action, SFX) with camera lines merged in as visual context", d: "Regex per block. Handles case variants, speaker aliases (LADY ANNA = ANNA), overlapping times, optional emotion. Unparsed lines are counted in parse_report.json." },
  { n: "2", t: "Beat tagger", who: "AI", i: "Logline + compact beat list", o: "Per beat: hook, cliff, context need (0-10) and trope tag", d: "One call per episode. The model returns beat ids only, never timestamps, so it cannot invent a time." },
  { n: "3", t: "Window builder", who: "Code", i: "Beats + scores", o: "Candidate clips: single stretch, stitched, cross-episode", d: "Starts on a hook beat, ends on a cliff beat, snapped to line boundaries (never mid-line), 20-60 s, IoU>0.6 duplicates removed, top 8 per episode." },
  { n: "4", t: "Promo judge", who: "AI", i: "Clip text only (no logline)", o: "Hook text, cliffhanger text, why, standalone, hook_3s, cliff, emotion, spoiler risk", d: "Sees only the clip, like a first-time viewer, so the standalone score is honest." },
  { n: "5", t: "Ranker", who: "Code", i: "Judge scores", o: "Global ranking + post-first 5", d: "Weighted formula plus a diversity penalty so the top list is not five slaps from one scene." },
  { n: "6", t: "QC", who: "Code + AI + human", i: "Ranked promos", o: "qc_report.json", d: "Rule checks, a second-pass critic prompt, and a manual sample with precision@5/10/20." },
];

export default function Methodology({ prompts }: { prompts: Record<string, string> }) {
  return (
    <section id="methodology" className="scroll-mt-4 py-16">
      <p className="eyebrow">02 · Methodology</p>
      <h2 className="mt-3 text-4xl md:text-5xl">How the clips are found</h2>
      <p className="mt-2 max-w-2xl text-muted">AI makes the judgment calls (what is shocking, what is unresolved, what needs context). Code does everything that can be checked: parsing, timing, duration, snapping and ranking math.</p>

      <div className="card mt-6 overflow-x-auto p-5">
        <svg viewBox="0 0 960 120" className="min-w-[760px]" role="img" aria-label="Pipeline: parser, tagger, windows, judge, ranker, QC">
          {STAGES.map((s, i) => (
            <g key={s.n} transform={`translate(${i * 160 + 6},20)`}>
              <rect width="140" height="76" rx="16" fill={s.who === "AI" ? "#fbe6e0" : s.who === "Code" ? "#ece7dc" : "#e0f0ea"} stroke="#e2dccf" />
              <text x="70" y="34" textAnchor="middle" fontSize="14" fontWeight="600" fill="#1a1714">{s.t}</text>
              <text x="70" y="56" textAnchor="middle" fontSize="12" fill="#6b6358">{s.who}</text>
              {i < STAGES.length - 1 && <path d={`M142 38 h14 m-5 -5 l5 5 l-5 5`} stroke="#6b6358" fill="none" />}
            </g>
          ))}
        </svg>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"><span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-accent-soft ring-1 ring-line" />AI judgment</span><span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-sunk ring-1 ring-line" />Code (deterministic)</span><span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-ok-bg ring-1 ring-line" />Code + AI + human</span></p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {STAGES.map((s) => (
          <div key={s.n} className="card p-5 text-sm">
            <p className="font-semibold">{s.n}. {s.t} <span className="chip ml-1">{s.who}</span></p>
            <p className="mt-2 text-muted">{s.d}</p>
            <p className="mt-2"><b>In:</b> {s.i}</p>
            <p><b>Out:</b> {s.o}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-5 text-sm">
          <p className="font-semibold">Ranking formula</p>
          <pre className="mt-2 overflow-auto rounded-lg bg-sunk p-3 font-mono text-xs">{`score = 0.30*hook_3s + 0.30*cliff + 0.20*standalone
      + 0.15*emotion + 0.05*duration_fit
      - spoiler_penalty   (med 0.5, high 1.5)
duration_fit = 10 for 25-45 s, linear to 0 at 20 / 60 s
diversity: -0.4 per already-picked clip with the same tag
           and -0.4 per one from the same scene`}</pre>
          <p className="mt-3 font-semibold">QC rules (code)</p>
          <ul className="mt-1 list-disc pl-5 text-muted"><li>Total length 20-60 s</li><li>Dialogue, action or SFX in the first 3 s</li><li>Last beat scores 6+ as a cliffhanger</li><li>No dialogue line cut in half</li><li>All timestamps inside the episode</li></ul>
        </div>
        <div className="card p-5 text-sm">
          <p className="font-semibold">Scale and cost</p>
          <table className="mt-2 w-full"><tbody>
            {[["Calls per episode", "3 (tag, judge, critic)"], ["50-episode show", "~150 calls + ~49 cross-episode pairs"], ["Tokens per show", "roughly 0.5-1M, fits a free Flash tier"], ["Time", "a few minutes at concurrency 3"], ["Many shows", "linear and cacheable; batch APIs for ~50% off on paid tiers"], ["Human", "editor approves the top 10; rejections become labels to tune weights"]].map(([a, b]) => (<tr key={a} className="border-t border-line"><td className="py-2 pr-3 font-medium">{a}</td><td className="text-muted">{b}</td></tr>))}
          </tbody></table>
          <p className="mt-3 font-semibold">Swap the model</p>
          <p className="text-muted">Set <code>LLM_PROVIDER</code>, <code>LLM_MODEL</code>, <code>LLM_API_KEY</code> (and <code>LLM_BASE_URL</code> for OpenAI-compatible). No code change.</p>
        </div>
      </div>

      <div className="card mt-6 p-5 text-sm">
        <p className="font-semibold">Assumptions and limitations</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Script timestamps equal final-edit timestamps. Duration is the sum of segment lengths.</li>
          <li>It reads text, not video: acting, framing and audio are invisible. Visual-only cliffhangers are scored from camera/action lines and can be wrong.</li>
          <li>Stitched clips can feel disjoint; cross-episode clips only join an episode ending to the next opening (tag-based pairs across distant episodes are not built).</li>
          <li>No ground-truth labels exist, so quality is judged by rules, a critic prompt and a small manual review. Treat scores as a shortlist for an editor, not a verdict.</li>
          <li>Spoilers are flagged, not blocked. English only.</li>
        </ul>
      </div>

      <details className="card mt-6 p-5 text-sm">
        <summary className="cursor-pointer font-semibold">Prompts (versioned in /prompts)</summary>
        {Object.entries(prompts).map(([k, v]) => (
          <div key={k} className="mt-4"><p className="font-mono text-xs text-muted">prompts/{k}.md</p><pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-sunk p-3 font-mono text-xs">{v}</pre></div>
        ))}
      </details>
    </section>
  );
}
