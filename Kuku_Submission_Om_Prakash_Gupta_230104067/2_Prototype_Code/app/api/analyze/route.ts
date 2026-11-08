import { NextResponse } from "next/server";
import { analyzeEpisode } from "@/lib/pipeline";
import { checkAccess, llmFor, type Overrides } from "@/lib/server-llm";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 400_000;

/** One episode per request (client orchestrates) so each call fits serverless time limits. */
export async function POST(req: Request) {
  const denied = checkAccess(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  try {
    const body = (await req.json()) as { file?: string; text?: string; critic?: boolean; maxPerEp?: number; llm?: Overrides };
    if (typeof body.text !== "string" || !body.text.includes("--- SCRIPT START ---")) {
      return NextResponse.json({ error: "Not a screenplay file (missing '--- SCRIPT START ---')." }, { status: 400 });
    }
    if (body.text.length > MAX_BYTES) return NextResponse.json({ error: "File too large." }, { status: 413 });
    const bundle = await analyzeEpisode(llmFor(body.llm), body.text, String(body.file ?? "episode.txt"), {
      critic: body.critic ?? true,
      maxPerEp: Math.min(Math.max(Number(body.maxPerEp) || 8, 1), 12),
    });
    return NextResponse.json(bundle);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
