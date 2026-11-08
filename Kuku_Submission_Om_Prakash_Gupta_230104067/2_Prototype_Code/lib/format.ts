import type { Promo } from "./types";

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export const segLabel = (p: Pick<Promo, "segments">) => p.segments.map((s) => `Ep ${s.ep} ${mmss(s.start)}–${mmss(s.end)}`).join("  +  ");

export const FLAG_TEXT: Record<string, string> = {
  duration_out_of_range: "Total length is outside 20–60 s.",
  no_content_in_first_3s: "First 3 s have only camera description, no dialogue/action/sound to hook on.",
  weak_cliffhanger: "Last beat scored below 6 as a cliffhanger, so the clip may end on a resolution.",
  cuts_mid_line: "A dialogue line is cut in half at a boundary.",
  outside_episode: "A timestamp falls outside the episode.",
  critic_confusing: "Second-pass critic: a first-time viewer would be confused.",
  critic_resolved: "Second-pass critic: the ending resolves the tension.",
  judge_critic_disagree: "Judge praised the cliffhanger but the critic says it is resolved.",
};

export function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
