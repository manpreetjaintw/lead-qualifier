/**
 * Runs once when the Node server boots. Starts the scrape schedule: one run shortly after start,
 * then one every SCRAPE_INTERVAL_MINUTES (default 30).
 *
 * The timer only pings the app's own /api/scraper/run route, so the scrape itself runs in the normal
 * request pipeline. On serverless hosts, where a process does not stay alive between requests, point
 * an external cron at that route instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { schedulerEnabled, schedulerState, scrapeIntervalMinutes } = await import("./lib/scraper/schedule");
  const state = schedulerState();
  // A UI-only deployment (BACKEND_URL set) or a serverless host has no long-lived process to keep a timer in.
  if (process.env.BACKEND_URL || process.env.VERCEL) return;
  if (!schedulerEnabled() || state.started) return;
  state.started = true;

  const intervalMs = scrapeIntervalMinutes() * 60_000;
  const url = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/scraper/run`;
  const tick = async (trigger: "startup" | "schedule") => {
    state.nextRunAt = Date.now() + intervalMs;
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trigger }) });
      console.log(`[scraper] ${trigger} run requested: HTTP ${res.status}. Next run at ${new Date(state.nextRunAt).toISOString()}`);
    } catch (e) {
      console.error(`[scraper] could not start ${trigger} run:`, e instanceof Error ? e.message : e);
    }
  };

  const STARTUP_DELAY_MS = 10_000; // let the server finish binding its port
  state.nextRunAt = Date.now() + STARTUP_DELAY_MS;
  setTimeout(() => {
    void tick("startup");
    setInterval(() => void tick("schedule"), intervalMs);
  }, STARTUP_DELAY_MS);
  console.log(`[scraper] scheduler started: every ${scrapeIntervalMinutes()} minutes`);
}
