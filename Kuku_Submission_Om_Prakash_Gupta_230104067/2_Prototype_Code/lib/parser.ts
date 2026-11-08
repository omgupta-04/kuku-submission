import type { Beat, BeatType, ParsedEpisode, Scene } from "./types";

/** "MM:SS.cc" -> seconds */
export function ts(s: string): number {
  const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) throw new Error(`bad timestamp: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

const RE_HEADER = /^\*\*(.+?):\*\*\s*$/;
const RE_TIME = /^Start:\s*\((\d+:\d+(?:\.\d+)?)\)\s*\|\s*End:\s*\((\d+:\d+(?:\.\d+)?)\)\s*$/i;
const RE_SCENE = /^SCENE\s+(\d+)\s*$/i;
const RE_SCENE_HEAD = /^Scene heading:\s*(.+)$/i;
const RE_SCENE_START = /^Scene start:\s*(\d+:\d+(?:\.\d+)?)\s*$/i;
const RE_SCENE_END = /^Scene end:\s*(\d+:\d+(?:\.\d+)?)\s*$/i;
const NOISE = /^(actions and dialogue:|--- SCRIPT (START|END) ---|EPISODE (NUMBER|LOGLINE):.*|CONTINUITY NOTES:.*)$/i;

export function normalizeSpeaker(name: string): string {
  return name.replace(/\s+/g, " ").trim().toUpperCase().replace(/^(LADY|LORD|THE)\s+/, "");
}

function splitHeader(h: string): { type: BeatType; display?: string; emotion?: string } {
  const label = h.trim();
  const up = label.toUpperCase();
  if (up === "CAMERA") return { type: "camera" };
  if (up === "ACTION") return { type: "action" };
  if (up === "SOUND FX" || up === "SFX") return { type: "sfx" };
  const m = /^(.*?)\s*(?:\((.*)\))?\s*$/.exec(label)!;
  return { type: "dialogue", display: m[1].trim().toUpperCase(), emotion: m[2]?.trim() || undefined };
}

function overlap(a: Beat, b: Beat): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function parseEpisode(text: string, file: string): ParsedEpisode {
  const lines = text.replace(/\r/g, "").split("\n");
  const ep = Number(/EPISODE NUMBER:\s*Episode\s*(\d+)/i.exec(text)?.[1] ?? /episode-(\d+)/i.exec(file)?.[1] ?? 0);
  const logline = /EPISODE LOGLINE:\s*(.+)/i.exec(text)?.[1].trim() ?? "";
  const continuity = /CONTINUITY NOTES:\s*(.+)/i.exec(text)?.[1].trim() ?? "";

  const scenes: Scene[] = [];
  const beats: Beat[] = [];
  const unparsed: string[] = [];
  let scene: Scene | null = null;
  let cur: { head: ReturnType<typeof splitHeader>; time?: [number, number]; body: string[] } | null = null;

  const flush = () => {
    if (!cur) return;
    const body = cur.body.join(" ").trim();
    if (!cur.time) {
      unparsed.push(`block without timestamps: ${cur.head.display ?? cur.head.type}`);
    } else {
      const display = cur.head.display;
      beats.push({
        ep,
        scene: scene?.n ?? 0,
        id: `e${String(ep).padStart(2, "0")}_b${String(beats.length + 1).padStart(3, "0")}`,
        type: cur.head.type,
        display,
        speaker: display ? normalizeSpeaker(display) : undefined,
        emotion: cur.head.emotion,
        start: cur.time[0],
        end: cur.time[1],
        text: body.replace(/^["“]|["”]$/g, "").trim(),
      });
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;
    let m: RegExpExecArray | null;
    if ((m = RE_SCENE.exec(line))) {
      flush();
      scene = { n: Number(m[1]), heading: "", start: 0, end: 0 };
      scenes.push(scene);
    } else if (scene && (m = RE_SCENE_HEAD.exec(line))) scene.heading = m[1].trim();
    else if (scene && (m = RE_SCENE_START.exec(line))) scene.start = ts(m[1]);
    else if (scene && (m = RE_SCENE_END.exec(line))) scene.end = ts(m[1]);
    else if ((m = RE_HEADER.exec(line))) {
      flush();
      cur = { head: splitHeader(m[1]), body: [] };
    } else if (cur && !cur.time && (m = RE_TIME.exec(line))) cur.time = [ts(m[1]), ts(m[2])];
    else if (cur && cur.time) cur.body.push(line);
    else unparsed.push(line);
  }
  flush();

  // Merge each CAMERA beat into the content beat it overlaps most (cuts tokens, keeps context).
  const content = beats.filter((b) => b.type !== "camera");
  for (const cam of beats.filter((b) => b.type === "camera")) {
    let best: Beat | null = null;
    let bestO = 0;
    for (const c of content) {
      const o = overlap(cam, c);
      if (o > bestO) { best = c; bestO = o; }
    }
    if (best) best.visual = best.visual ? `${best.visual} ${cam.text}` : cam.text;
  }

  const duration = Math.max(0, ...scenes.map((s) => s.end), ...beats.map((b) => b.end));
  return { meta: { ep, file, logline, continuity, duration }, scenes, beats, unparsed };
}
