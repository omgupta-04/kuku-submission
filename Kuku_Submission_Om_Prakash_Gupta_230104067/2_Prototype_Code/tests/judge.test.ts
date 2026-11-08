import { describe, it, expect } from "vitest";
import { parseEpisode } from "@/lib/parser";
import { clipText, judgeCandidates, criticCandidates } from "@/lib/judge";
import type { Candidate } from "@/lib/types";
import type { LLM } from "@/lib/llm";

const p = parseEpisode(`EPISODE NUMBER: Episode 1
EPISODE LOGLINE: SECRET LOGLINE
CONTINUITY NOTES: n
SCENE 01
Scene heading: INT. A
Scene start: 00:00.00
Scene end: 00:30.00
**CAMERA:**
Start: (00:00.00) | End: (00:04.00)
Wide on the door.
**ANNA (Cold):**
Start: (00:01.00) | End: (00:03.00)
"Get out."
`, "e1.txt");
const cand: Candidate = { id: "c1", kind: "single", segments: [{ ep: 1, start: 0, end: 4, beatIds: p.beats.map((b) => b.id) }], duration: 4, preScore: 0, tag: "slap", scene: 1 };
const eps = new Map([[1, p]]);

describe("judge", () => {
  it("clip text has the lines but never the logline (judge is a first-time viewer)", () => {
    const t = clipText(cand, eps);
    expect(t).toContain("Get out.");
    expect(t).not.toContain("SECRET LOGLINE");
  });

  it("returns clamped results keyed by candidate id, with defaults for missing", async () => {
    const llm: LLM = { name: "f", json: async <T,>() => ({ results: [{ id: "c1", hook_text: "h", cliffhanger_text: "c", why: "w", standalone: 99, hook_3s: -1, cliff: 7, emotion: 6, spoiler_risk: "weird", title: "t" }] }) as T };
    const r = await judgeCandidates(llm, [cand, { ...cand, id: "c2" }], eps);
    expect(r.c1).toMatchObject({ standalone: 10, hook_3s: 0, cliff: 7, spoiler_risk: "low" });
    expect(r.c2.hook_3s).toBe(0);
  });

  it("critic output is keyed by id", async () => {
    const llm: LLM = { name: "f", json: async <T,>() => ({ results: [{ id: "c1", confusing: true, resolved: false, note: "n" }] }) as T };
    const r = await criticCandidates(llm, [cand], eps, { c1: { hook_text: "h", cliffhanger_text: "c" } });
    expect(r.c1).toEqual({ confusing: true, resolved: false, note: "n" });
  });
});
