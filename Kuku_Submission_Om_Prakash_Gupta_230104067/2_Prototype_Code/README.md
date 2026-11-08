# PromoFinder

Reads timestamped microdrama screenplays and returns **ranked promo clips (20-60 s)** with exact segment timestamps, the hook, the cliffhanger and a one-line reason. It only *finds* clips: no cutting, music or overlays.

- **AI** judges what is shocking, unresolved or needs context (beat tagger, promo judge, critic).
- **Code** does everything checkable: parsing, timing, snapping to line boundaries, duration, ranking math, QC rules.
- **Model is swappable by env vars only.** Gemini (free tier) by default.

```
.txt folder -> Parser -> Beat Tagger (LLM) -> Window Builder -> Judge (LLM) -> Ranker -> QC (rules + critic LLM + manual sample)
```

## Quick start

Requires Node 20+.

```bash
npm install
cp .env.example .env        # then put your key in LLM_API_KEY
npm test                    # 39 unit tests
```

### 1. CLI (produces the raw outputs)

Extract your screenplay zip into a folder first (the tool reads a folder of `.txt` files; keep it out of git, `/input` is already ignored).

```bash
npm run promos -- --in ./input --out ./outputs --publish
```

Writes to `./outputs`: `episodes/episode-NNN.json` (one per episode), `promos_ranked.json`, `promos_ranked.csv`, `qc_report.json`, `parse_report.json`.
`--publish` also writes the **script-free** files the Results page loads into `public/results/`.

Flags: `--concurrency 3`, `--no-cross` (skip cross-episode clips), `--no-critic` (skip second-pass critic), `--excerpts` (include full clip text in the JSON; off by default).
Re-runs are free: LLM replies are cached in `./cache` by hash of prompt+model.

No API key yet? Smoke-test everything offline with the built-in heuristic mock model (not a quality baseline):

```bash
LLM_PROVIDER=mock npm run promos -- --in ./samples --out ./tmp-out
```

### 2. Website

```bash
npm run dev      # http://localhost:3000
```

Run (upload a folder -> live progress -> summary -> episode drill-down -> JSON/CSV export), Methodology, Results (precomputed 50-episode output from `public/results`).

## Swapping the model

Only env vars change:

| Var | Example |
|---|---|
| `LLM_PROVIDER` | `gemini` (default), `openai-compatible` (Groq, OpenRouter, OpenAI, a Kuku-provided API), `mock` |
| `LLM_MODEL` | `gemini-3.1-flash-lite`, `llama-3.3-70b-versatile`, ... |
| `LLM_API_KEY` | your key |
| `LLM_BASE_URL` | only for `openai-compatible`, e.g. `https://api.groq.com/openai/v1` |

Prompts are plain files in [`prompts/`](prompts) and are shown on the Methodology page.

## Deploy to Vercel

1. Push this folder to a **private** GitHub repo (see Confidentiality).
2. Import it in Vercel (framework: Next.js, defaults are fine).
3. Add environment variables: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`.
   The web UI has no settings panel: it uses the server env vars, cross-episode clips on, critic on, 8 promos per episode max. Do **not** set `ACCESS_CODE` (the UI has no field to enter it and would be locked out). Keep the Vercel URL unlisted and watch your quota instead.
4. Deploy. The site is `noindex` and `robots.txt` disallows everything.

How the web run works: the browser sends **one episode per request** to `/api/analyze` (fits serverless time limits), then consecutive pairs to `/api/cross`, and ranks client-side. Nothing is stored on the server. (The PRD sketched SSE routes; client orchestration is the Vercel-timeout mitigation it also names.)

## Producing the deliverables

| Item | How |
|---|---|
| D2 raw outputs | `npm run promos -- --in ./input --out ./outputs --publish` with your key, upload `outputs/` unedited |
| Manual precision@k | Open `outputs/promos_ranked.json`, label ~20 promos by their `key`, save `outputs/manual_review.json` as `{"labels": {"e2@0.0-27.4": "good", "e5@12.0-41.5": "bad"}}` (`good`/`ok`/`bad`), re-run (cached, free). precision@5/10/20 appears in `qc_report.json` and on the Results page |
| D3 solution doc | not included; write it from the Methodology page + `qc_report.json` (tools used + one place the AI got it wrong) |
| D4 video | not included |

## Confidentiality

The screenplays are Kuku's and the brief says not to publish them. This repo ignores `/input`, `/cache`, `.env` and `*.zip`. Published results contain **timestamps, scores and the short hook/cliffhanger quotes only**, never full scripts (`public/results`). Even so, hook and cliffhanger lines are quotes from the script: use a private repo and an unlisted URL, and review `outputs/` before making anything public.

## Known limits (be upfront about these)

- It reads text, not video. Visual-only cliffhangers (a slap described only in a CAMERA line) can be under- or over-scored.
- Stitched and cross-episode clips can feel disjoint. Cross-episode clips join only *episode N ending + episode N+1 opening*; tag-based pairs across distant episodes (PRD 8.3) are not built.
- No ground-truth labels: quality = rules + critic + a small manual review. Scores are a shortlist for an editor.
- The mock provider is keyword-based and exists only for offline testing.

## Layout

```
app/            page + API routes (/api/analyze, /api/cross)
components/     Run, Methodology, Results, PromoCard, Timeline, Nav
lib/            parser, llm (adapter), tagger, windows, judge, ranker, qc, pipeline, finalize
prompts/        tagger.md, judge.md, critic.md
scripts/        run-cli.ts
tests/          vitest unit tests (synthetic fixtures only)
samples/        3 invented episodes for smoke tests
public/results/ precomputed output the Results page reads (generated by --publish)
outputs/        raw CLI outputs
```

## Findings from the full 50-episode run (gemini-3.1-flash-lite)

180 promos (65 single, 103 stitched, 12 cross-episode); 0 unparsed lines; 155/180 (86%) pass every rule.

- **Quiet episodes yield nothing (by design):** eps 6, 8, 17 have best hook/cliff scores of 4 or less (cozy cottage scenes), so no promo is proposed.
- **Missed episodes:** ep 7 has a hook (8) but no beat scores 7+ as a cliffhanger; ep 22 has hook 8 and cliff 10 but no valid 20-60 s window was built from them. Candidate building is stricter than the tagger scores suggest.
- **Critic is harsh:** it flags 118/180 as "confusing to a first-time viewer" (names and prior plot). Treat that flag as a ranking hint, not a veto.
- **Sound/visual cliffhangers:** some clips end on an SFX swell or a camera description (e.g. a "hiss of scorched parchment" opener in the top 5). The model counts these as hooks/cliffs; an editor should check them on video.
- **Rate limits:** free-tier Gemini returned 429s mid-run; the adapter now backs off up to 60 s and the cache makes re-runs resume where they stopped.
