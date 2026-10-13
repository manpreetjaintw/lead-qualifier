/** Scheduler settings and state, shared between the instrumentation hook and the status route. */
export const scrapeIntervalMinutes = () => {
  const n = Number(process.env.SCRAPE_INTERVAL_MINUTES);
  return Number.isFinite(n) && n >= 5 ? n : 30;
};
export const schedulerEnabled = () => process.env.SCRAPER_ENABLED !== "0";

type State = { started: boolean; nextRunAt: number | null };
const g = globalThis as typeof globalThis & { __scrapeScheduler?: State };
export const schedulerState = (): State => (g.__scrapeScheduler ??= { started: false, nextRunAt: null });
