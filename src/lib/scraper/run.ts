import "server-only";
import type { Lead, NetworkCheck, RawRow, WebsiteCheck } from "../types";
import { cached } from "../cache";
import { checkMx, checkWebsite, offline } from "../network";
import { combineChecks } from "../pipeline/validate";
import { dedupe } from "../pipeline/dedupe";
import { normalizeRows } from "../pipeline/normalize";
import { LISTING_MAX, PRESETS, scoreLead } from "../pipeline/score";
import { FREE_EMAIL_DOMAINS } from "../pipeline/lists";
import { emailDomain } from "../pipeline";
import { mapLimit } from "../utils";
import { bestEmail } from "./contacts";
import { industryById, type Industry } from "./industries";
import { fetchListings, geocode, type Listing } from "./overpass";
import { addSearch, createRun, failStaleRuns, listScrapeRuns, listSearches, recordSearchResult, saveRunProgress, upsertCompanies, type CompanyInput } from "./store";
import type { RunTrigger, ScrapeRun, Search } from "./types";

const ENRICH_CONCURRENCY = 6;
const PAUSE_BETWEEN_SEARCHES_MS = 2000;
/** Longer than any real run; a "running" row older than this belongs to a process that died. */
export const STALE_RUN_MS = 25 * 60 * 1000;
/** Stop starting new searches after this long, so one slow run never overlaps the next scheduled one. */
const RUN_BUDGET_MS = 18 * 60 * 1000;

/** Searches created on first start so the database is useful before anyone configures anything. */
const DEFAULT_SEARCHES: [industry: string, location: string][] = [
  ["accounting", "Austin, Texas"],
  ["dental", "Austin, Texas"],
  ["auto-repair", "Denver, Colorado"],
  ["veterinary", "Denver, Colorado"],
  ["legal", "Columbus, Ohio"],
  ["insurance", "Nashville, Tennessee"],
];

function seedList(): [string, string][] {
  const raw = process.env.SCRAPER_SEARCHES;
  if (raw === undefined) return DEFAULT_SEARCHES;
  // Format: "plumbing@Austin, Texas; dental@Denver, Colorado". Empty disables seeding.
  return raw.split(";").map((p) => p.split("@").map((s) => s.trim()) as [string, string]).filter(([i, l]) => industryById(i) && l);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const g = globalThis as typeof globalThis & { __scrapeInFlight?: Promise<ScrapeRun> | null };

async function ensureSeeded(): Promise<Search[]> {
  const existing = await listSearches();
  if (existing.length) return existing;
  for (const [industry, location] of seedList()) {
    try {
      const place = await geocode(location);
      if (place) await addSearch({ industry, location, ...place });
    } catch {
      /* geocoder unreachable: try again on the next run */
    }
    await sleep(1100); // Nominatim allows one request per second
  }
  return listSearches();
}

/** Homepage check and MX lookup for one lead; contact details found on the site fill gaps in the listing. */
async function enrich(lead: Lead): Promise<{ lead: Lead; net: NetworkCheck }> {
  let website: WebsiteCheck = { status: lead.domain ? "unknown" : "missing", socials: [] };
  if (lead.domain && !offline()) website = await cached(`web:${lead.domain}`, () => checkWebsite(lead.domain), (v) => v.status !== "unknown");

  const filled = { ...lead };
  if (!filled.email && website.emails?.length) filled.email = bestEmail(website.emails, lead.domain);
  if (!filled.phone && website.phones?.length) filled.phone = website.phones[0];

  const domain = emailDomain(filled);
  const mx = !domain ? null : FREE_EMAIL_DOMAINS.has(domain) ? true : offline() ? null : await cached(`mx:${domain}`, () => checkMx(domain), (v) => v !== null);
  return { lead: filled, net: { mx, website } };
}

const IDENTITY = { company: "company", website: "website", email: "email", phone: "phone", industry: "industry", city: "city", state: "state", country: "country", foundedYear: "foundedYear", source: "source" };

/** Listings -> deduplicated, enriched, scored companies, using the same pipeline as uploaded lead lists. */
export async function buildCompanies(listings: Listing[], industry: Industry, searchId: string): Promise<CompanyInput[]> {
  // Sorting first makes the surviving id of a merged cluster stable from one run to the next.
  const sorted = [...listings].sort((a, b) => a.id.localeCompare(b.id));
  const rows: RawRow[] = sorted.map((l) => ({
    company: l.name,
    website: l.website,
    email: l.email,
    phone: l.phone,
    industry: industry.label,
    city: l.city,
    state: l.state,
    country: l.country,
    foundedYear: l.foundedYear ? String(l.foundedYear) : "",
    source: "OpenStreetMap",
  }));
  const leads = dedupe(normalizeRows(rows, IDENTITY));

  return mapLimit(leads, ENRICH_CONCURRENCY, async (raw) => {
    const { lead, net } = await enrich(raw);
    const scored = scoreLead(lead, combineChecks(lead, net), PRESETS.eta, PRESETS.eta.weights, LISTING_MAX);
    const merged = lead.rowIds.map((i) => sorted[i]);
    const base = merged[0];
    const pick = <K extends keyof Listing>(k: K) => merged.map((m) => m[k]).find((v) => v !== "" && v !== null) ?? base[k];
    return {
      id: base.id,
      name: scored.company,
      industry: industry.label,
      category: base.category,
      website: scored.website,
      domain: scored.domain,
      email: scored.checks.email.suggestion ?? scored.email,
      emailStatus: scored.checks.email.status,
      phone: scored.checks.phone.e164 || scored.phone,
      address: pick("address"),
      city: scored.city,
      state: scored.state,
      postcode: pick("postcode"),
      country: scored.country,
      lat: pick("lat"),
      lon: pick("lon"),
      foundedYear: scored.foundedYear ?? net.website.sinceYear ?? null,
      openingHours: pick("openingHours"),
      socials: [...new Set([...merged.flatMap((m) => m.socials), ...net.website.socials])],
      site: lead.domain ? net.website : null,
      score: scored.score,
      tier: scored.tier,
      reasons: scored.reasons,
      searchId,
      sourceUrl: base.sourceUrl,
    } satisfies CompanyInput;
  });
}

/** Searches that failed last time go first, then the ones collected longest ago. */
const byPriority = (a: Search, b: Search) => Number(!a.lastError) - Number(!b.lastError) || (a.lastRunAt ?? "").localeCompare(b.lastRunAt ?? "");

async function execute(run: ScrapeRun, all: Search[]): Promise<ScrapeRun> {
  let failed = 0;
  const searches = [...all].sort(byPriority);
  const deadline = Date.now() + RUN_BUDGET_MS;
  for (const [i, search] of searches.entries()) {
    const industry = industryById(search.industry);
    try {
      if (!industry) throw new Error(`Unknown industry "${search.industry}"`);
      if (Date.now() > deadline) throw new Error("Skipped: the run reached its time budget. It will be collected on the next run.");
      const listings = await fetchListings(search, industry);
      const companies = await buildCompanies(listings, industry, search.id);
      const { added, refreshed } = await upsertCompanies(companies);
      run.found += companies.length;
      run.added += added;
      run.refreshed += refreshed;
      await recordSearchResult(search.id, { lastCount: companies.length, lastError: null });
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      run.errors.push(`${industry?.label ?? search.industry} in ${search.location}: ${message}`);
      await recordSearchResult(search.id, { lastCount: null, lastError: message }).catch(() => {});
    }
    await saveRunProgress(run).catch(() => {});
    if (i < searches.length - 1) await sleep(PAUSE_BETWEEN_SEARCHES_MS);
  }
  run.status = failed === 0 ? "success" : failed < searches.length ? "partial" : "failed";
  run.finishedAt = new Date().toISOString();
  await saveRunProgress(run);
  return run;
}

/**
 * Start a scrape of every tracked search. Only one runs at a time: a second call while one is in
 * flight returns the run already in progress instead of starting another.
 */
export async function startScrape(trigger: RunTrigger): Promise<{ run: ScrapeRun; started: boolean; done: Promise<ScrapeRun> }> {
  if (g.__scrapeInFlight) {
    const [current] = await listScrapeRuns(1);
    return { run: current, started: false, done: g.__scrapeInFlight };
  }
  let resolveRun!: (r: ScrapeRun) => void;
  const created = new Promise<ScrapeRun>((r) => (resolveRun = r));
  const done = (async () => {
    await failStaleRuns(STALE_RUN_MS);
    const searches = await ensureSeeded();
    const run = await createRun(trigger, searches.length);
    resolveRun(run);
    return execute(run, searches);
  })();
  g.__scrapeInFlight = done;
  done.catch(() => {}).finally(() => (g.__scrapeInFlight = null));
  // Surface setup failures (database down) to the caller instead of leaving `created` pending.
  const run = await Promise.race([created, done]);
  return { run, started: true, done };
}

export const scrapeInFlight = () => Boolean(g.__scrapeInFlight);
