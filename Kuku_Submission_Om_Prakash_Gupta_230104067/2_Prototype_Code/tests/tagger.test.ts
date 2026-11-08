import { describe, it, expect } from "vitest";
import { parseEpisode } from "@/lib/parser";
import { taggableBeats, buildTaggerPrompt, tagEpisode } from "@/lib/tagger";
import type { LLM } from "@/lib/llm";

const FIX = `EPISODE NUMBER: Episode 1
EPISODE LOGLINE: Bride jilted.
CONTINUITY NOTES: Start.
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
**CAMERA:**
Start: (00:10.00) | End: (00:14.00)
Silent close-up of a ring on the floor.
`;
const p = parseEpisode(FIX, "e1.txt");

describe("tagger", () => {
  it("sends content beats plus orphan camera beats, not merged camera lines", () => {
    expect(taggableBeats(p).map((b) => b.id)).toEqual(["e01_b002", "e01_b003"]);
  });

  it("prompt carries logline and beat ids", () => {
    const pr = buildTaggerPrompt(p);
    expect(pr).toContain("Bride jilted.");
    expect(pr).toContain("e01_b002");
    expect(pr).toContain("Get out.");
    expect(pr).toContain("Wide on the door");
  });

  it("clamps scores, drops unknown ids, defaults missing beats", async () => {
    const llm: LLM = {
      name: "fake",
      json: async <T,>() =>
        ({ scores: [
          { id: "e01_b002", hook: 14, cliff: -2, context_need: 3, tag: "slap" },
          { id: "zzz", hook: 9, cliff: 9, context_need: 1, tag: "other" },
        ] }) as T,
    };
    const s = await tagEpisode(llm, p);
    expect(Object.keys(s)).toEqual(["e01_b002", "e01_b003"]);
    expect(s.e01_b002).toMatchObject({ hook: 10, cliff: 0, tag: "slap" });
    expect(s.e01_b003).toMatchObject({ hook: 0, cliff: 0, tag: "other" });
  });
});
