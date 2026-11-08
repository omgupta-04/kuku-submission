import fs from "node:fs";
import path from "node:path";

/** Prompts live in /prompts/*.md (versioned, shown on the Methodology page). */
export function loadPrompt(name: string, vars: Record<string, string | number> = {}): string {
  const raw = fs.readFileSync(path.join(process.cwd(), "prompts", `${name}.md`), "utf8");
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}
