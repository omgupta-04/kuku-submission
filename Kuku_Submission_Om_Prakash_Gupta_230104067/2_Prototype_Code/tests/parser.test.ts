import { describe, it, expect } from "vitest";
import { parseEpisode, ts } from "@/lib/parser";

const FIX = `EPISODE NUMBER: Episode 7
EPISODE LOGLINE: A bride is left at the altar.
CONTINUITY NOTES: Second week.

--- SCRIPT START ---

SCENE 01
Scene heading: INT. HALL – DAY
SCENE START: 00:00.00
Scene end: 00:10.00

Actions and dialogue:

**CAMERA:**
Start: (00:00.00) | End: (00:04.00)
Wide shot of the hall.

**LADY ANNA (Shaken, Pleading):**
Start: (00:01.00) | End: (00:03.50)
"He left me."

**ANNA :**
Start: (00:04.00) | End: (00:05.00)
"Why?"

**SOUND FX:**
Start: (00:05.00) | End: (00:06.00)
A glass shatters.

**ACTION:**
Start: (00:06.00) | End: (01:02.25)
Anna slaps him.

SCENE 02
Scene heading: INT. GARDEN – NIGHT
Scene start: 01:10.00
Scene end: 01:30.00

**CAMERA:**
Start: (01:10.00) | End: (01:12.00)
Close-up.

--- SCRIPT END ---
`;

describe("ts", () => {
  it("parses MM:SS.cc", () => {
    expect(ts("01:02.25")).toBeCloseTo(62.25);
    expect(ts("00:00.00")).toBe(0);
  });
});

describe("parseEpisode", () => {
  const p = parseEpisode(FIX, "episode-007-Episode 1.txt");

  it("reads meta", () => {
    expect(p.meta.ep).toBe(7);
    expect(p.meta.logline).toMatch(/left at the altar/);
    expect(p.meta.continuity).toMatch(/Second week/);
    expect(p.meta.duration).toBeCloseTo(90);
  });

  it("reads scenes case-insensitively", () => {
    expect(p.scenes).toHaveLength(2);
    expect(p.scenes[0]).toMatchObject({ n: 1, start: 0, end: 10 });
  });

  it("parses all blocks with types, ids and scenes", () => {
    expect(p.beats.map((b) => b.type)).toEqual(["camera", "dialogue", "dialogue", "sfx", "action", "camera"]);
    expect(p.beats[0].id).toBe("e07_b001");
    expect(p.beats[5].scene).toBe(2);
    expect(p.unparsed).toEqual([]);
  });

  it("normalizes speakers, keeps emotion optional, strips quotes", () => {
    const [, a, b] = p.beats;
    expect(a).toMatchObject({ speaker: "ANNA", display: "LADY ANNA", emotion: "Shaken, Pleading", text: "He left me." });
    expect(b).toMatchObject({ speaker: "ANNA", emotion: undefined, text: "Why?" });
  });

  it("merges overlapping camera text into the best content beat as visual", () => {
    expect(p.beats[1].visual).toMatch(/Wide shot/);
    expect(p.beats[5].visual).toBeUndefined();
  });

  it("reports unparsed lines instead of dropping silently", () => {
    const bad = parseEpisode(FIX.replace("Start: (00:05.00) | End: (00:06.00)", "Start broken"), "x.txt");
    expect(bad.unparsed.length).toBeGreaterThan(0);
  });
});
