import { NextResponse } from "next/server";
import { storageMode } from "@/lib/db/index";
import { companyFacets, listScrapeRuns } from "@/lib/scraper/store";
import { scrapeInFlight } from "@/lib/scraper/run";
import { schedulerEnabled, schedulerState, scrapeIntervalMinutes } from "@/lib/scraper/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether a scrape is running, when the next one is due, database totals and recent run history. */
export async function GET() {
  try {
    const [runs, facets] = await Promise.all([listScrapeRuns(20), companyFacets()]);
    const { started, nextRunAt } = schedulerState();
    return NextResponse.json({
      running: scrapeInFlight(),
      scheduler: { enabled: schedulerEnabled() && started, intervalMinutes: scrapeIntervalMinutes(), nextRunAt: started && nextRunAt ? new Date(nextRunAt).toISOString() : null },
      storage: storageMode(),
      totals: { companies: facets.total, withEmail: facets.withEmail, hot: facets.hot },
      lastRun: runs.find((r) => r.status !== "running") ?? null,
      runs,
    });
  } catch (e) {
    console.error("[api/scraper/status]", e);
    return NextResponse.json({ error: "Could not load scraper status" }, { status: 500 });
  }
}
