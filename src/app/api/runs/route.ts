import { NextResponse } from "next/server";
import { listRuns, saveRun, storageMode } from "@/lib/db/index";
import type { RunStats, ScoredLead } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ storage: storageMode(), runs: await listRuns() });
  } catch (e) {
    return NextResponse.json({ storage: storageMode(), runs: [], error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: string; preset?: string; stats?: RunStats; leads?: ScoredLead[] } | null;
  if (!body?.leads || !body.stats) return NextResponse.json({ error: "Expected { name, preset, stats, leads }" }, { status: 400 });
  if (body.leads.length > 10_000) return NextResponse.json({ error: "Too many leads" }, { status: 413 });
  const id = await saveRun({ name: (body.name || "Untitled list").slice(0, 120), preset: body.preset ?? "eta", stats: body.stats, leads: body.leads });
  return NextResponse.json({ id, storage: storageMode() });
}
