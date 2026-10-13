import { NextResponse } from "next/server";
import { startScrape } from "@/lib/scraper/run";
import type { RunTrigger } from "@/lib/scraper/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/scraper/run            -> 202, the run continues in the background
 * POST /api/scraper/run?wait=1     -> 200 once the run has finished (for serverless cron jobs)
 * A request made while a run is in progress returns that run with started: false.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { trigger?: string } | null;
  const trigger: RunTrigger = body?.trigger === "schedule" || body?.trigger === "startup" ? body.trigger : "manual";
  try {
    const { run, started, done } = await startScrape(trigger);
    if (new URL(req.url).searchParams.get("wait") === "1") return NextResponse.json({ run: await done, started });
    done.catch((e) => console.error("[scraper] run failed:", e));
    return NextResponse.json({ run: run ?? null, started }, { status: started ? 202 : 200 });
  } catch (e) {
    console.error("[api/scraper/run]", e);
    return NextResponse.json({ error: "Could not start the scrape" }, { status: 500 });
  }
}
