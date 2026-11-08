export type BeatType = "dialogue" | "action" | "camera" | "sfx";

export interface Beat {
  ep: number;
  scene: number;
  id: string;
  type: BeatType;
  speaker?: string; // normalized key, e.g. ANNA
  display?: string; // as written, e.g. LADY ANNA
  emotion?: string;
  start: number; // seconds
  end: number;
  text: string;
  visual?: string; // merged overlapping CAMERA text
}

export interface Scene {
  n: number;
  heading: string;
  start: number;
  end: number;
}

export interface EpisodeMeta {
  ep: number;
  file: string;
  logline: string;
  continuity: string;
  duration: number;
}

export interface ParsedEpisode {
  meta: EpisodeMeta;
  scenes: Scene[];
  beats: Beat[];
  unparsed: string[]; // raw lines we could not place
}

export type PromoTag =
  | "slap" | "reveal" | "betrayal" | "threat" | "kiss"
  | "confession" | "humiliation" | "identity" | "rescue" | "other";

export interface BeatScore {
  id: string;
  hook: number; // 0-10
  cliff: number; // 0-10
  context_need: number; // 0-10
  tag: PromoTag;
}

export interface Segment {
  ep: number;
  start: number;
  end: number;
  beatIds: string[];
}

export interface Candidate {
  id: string;
  kind: "single" | "stitched" | "cross-episode";
  segments: Segment[];
  duration: number;
  preScore: number;
  tag: PromoTag;
  scene: number; // scene of first segment (diversity)
}

export interface JudgeResult {
  hook_text: string;
  cliffhanger_text: string;
  why: string;
  standalone: number;
  hook_3s: number;
  cliff: number;
  emotion: number;
  spoiler_risk: "low" | "med" | "high";
  title: string;
}

export interface Promo extends Candidate, JudgeResult {
  score: number;
  rank?: number;
  qc?: QCResult;
  excerpt?: string; // script text of the clip (omitted from published outputs)
}

export interface QCResult {
  pass: boolean;
  flags: string[];
  critic?: { confusing: boolean; resolved: boolean; note: string };
}

export interface EpisodeBundle {
  parsed: ParsedEpisode;
  scores: Record<string, BeatScore>;
  promos: Promo[];
}

export interface QCSummary {
  total: number;
  passed: number;
  rulePassRate: number;
  flagCounts: Record<string, number>;
  criticDisagreements: number;
}

export interface ShowResult {
  promos: Promo[];
  postFirst: (Promo & { reason: string })[];
  qc: QCSummary;
  parseReport: { ep: number; file: string; beats: number; unparsed: number; unparsedSample: string[] }[];
}
