import { NextResponse } from "next/server";
import { analyzeCross } from "@/lib/pipeline";
import { checkAccess, llmFor, type Overrides } from "@/lib/server-llm";
import type { EpisodeBundle } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Cross-episode promos for one consecutive pair (cliffhanger of A + opening hook of B). */
export async function POST(req: Request) {
  const denied = checkAccess(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  try {
    const body = (await req.json()) as { a?: EpisodeBundle; b?: EpisodeBundle; critic?: boolean; llm?: Overrides };
    if (!body.a?.parsed || !body.b?.parsed) return NextResponse.json({ error: "Need two episode bundles." }, { status: 400 });
    const promos = await analyzeCross(llmFor(body.llm), body.a, body.b, { critic: body.critic ?? true });
    return NextResponse.json({ promos });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
