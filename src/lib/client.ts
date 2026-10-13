/** Fetch JSON from the app's own API. Rejects with the server's error message when there is one. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

/** "3 min ago", "in 12 min", "2 days ago". */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const [n, unit] = abs < 60_000 ? [0, ""] : abs < 3_600_000 ? [Math.round(abs / 60_000), "min"] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), "hr"] : [Math.round(abs / 86_400_000), "day"];
  if (!unit) return diff > 0 ? "in under a minute" : "just now";
  const label = `${n} ${unit}${unit !== "min" && n !== 1 ? "s" : ""}`;
  return diff > 0 ? `in ${label}` : `${label} ago`;
}

export interface ScraperStatus {
  running: boolean;
  scheduler: { enabled: boolean; intervalMinutes: number; nextRunAt: string | null };
  storage: "postgres" | "memory";
  totals: { companies: number; withEmail: number; hot: number };
  lastRun: import("./scraper/types").ScrapeRun | null;
  runs: import("./scraper/types").ScrapeRun[];
}

/** Turn a stored run error ("Dental in Austin, Texas: overpass-api.de responded 504") into plain language. */
export function describeRunError(error: string): string {
  const cut = error.indexOf(": ");
  const [subject, cause] = cut === -1 ? ["", error] : [error.slice(0, cut), error.slice(cut + 2)];
  const reason = /abort|did not answer|timed? ?out/i.test(cause)
    ? "the data source took too long to answer"
    : /responded (429|5\d\d)|cooling off/i.test(cause)
      ? "the data source was busy"
      : /fetch failed|network|ENOTFOUND|ECONN/i.test(cause)
        ? "the data source could not be reached"
        : /^Skipped/i.test(cause)
          ? "the run ran out of time before reaching it"
          : cause;
  const retry = reason === cause ? "" : ". It is retried first on the next run";
  return subject ? `${subject} was not updated: ${reason}${retry}.` : `${reason[0].toUpperCase()}${reason.slice(1)}${retry}.`;
}
