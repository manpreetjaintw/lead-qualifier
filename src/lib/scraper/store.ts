import "server-only";
import { and, asc, count, desc, eq, gte, ilike, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { dbReady, getDb } from "../db/index";
import * as schema from "../db/schema";
import type { Reason, Tier, WebsiteCheck } from "../types";
import type { Company, CompanyQuery, Facet, RunStatus, ScrapeRun, Search } from "./types";
import { queryCompanies } from "./query";

/**
 * Storage for scraped companies, tracked searches and run history.
 * Postgres when DATABASE_URL is set; otherwise process memory, so the app still works with zero setup.
 */
type Memory = { companies: Map<string, Company>; searches: Map<string, Search>; runs: ScrapeRun[] };
const g = globalThis as typeof globalThis & { __scraperMemory?: Memory };
const mem: Memory = (g.__scraperMemory ??= { companies: new Map(), searches: new Map(), runs: [] });

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const newId = () => crypto.randomUUID().slice(0, 8);

const toSearch = (r: typeof schema.searches.$inferSelect): Search => ({ ...r, createdAt: r.createdAt.toISOString(), lastRunAt: iso(r.lastRunAt) });
const toRun = (r: typeof schema.scrapeRuns.$inferSelect): ScrapeRun => ({
  ...r,
  trigger: r.trigger as ScrapeRun["trigger"],
  status: r.status as RunStatus,
  startedAt: r.startedAt.toISOString(),
  finishedAt: iso(r.finishedAt),
  errors: r.errors as string[],
});
const toCompany = (r: typeof schema.companies.$inferSelect): Company => ({
  ...r,
  tier: r.tier as Tier,
  socials: r.socials as string[],
  site: r.site as WebsiteCheck | null,
  reasons: r.reasons as Reason[],
  firstSeen: r.firstSeen.toISOString(),
  lastSeen: r.lastSeen.toISOString(),
});

async function pg() {
  const d = getDb();
  if (d) await dbReady();
  return d;
}

// ---- tracked searches ----

export async function listSearches(): Promise<Search[]> {
  const d = await pg();
  if (!d) return [...mem.searches.values()];
  return (await d.select().from(schema.searches).orderBy(asc(schema.searches.createdAt))).map(toSearch);
}

export async function addSearch(s: Omit<Search, "id" | "createdAt" | "lastRunAt" | "lastCount" | "lastError">): Promise<Search> {
  const d = await pg();
  const id = newId();
  if (!d) {
    const search: Search = { ...s, id, createdAt: new Date().toISOString(), lastRunAt: null, lastCount: null, lastError: null };
    mem.searches.set(id, search);
    return search;
  }
  const [row] = await d.insert(schema.searches).values({ ...s, id }).returning();
  return toSearch(row);
}

export async function deleteSearch(id: string): Promise<boolean> {
  const d = await pg();
  if (!d) return mem.searches.delete(id);
  return (await d.delete(schema.searches).where(eq(schema.searches.id, id)).returning({ id: schema.searches.id })).length > 0;
}

export async function recordSearchResult(id: string, result: { lastCount: number | null; lastError: string | null }) {
  const d = await pg();
  if (!d) {
    const s = mem.searches.get(id);
    if (s) Object.assign(s, result, { lastRunAt: new Date().toISOString() });
    return;
  }
  // A failed attempt keeps the previous count: the companies collected earlier are still there.
  await d
    .update(schema.searches)
    .set({ lastRunAt: new Date(), lastError: result.lastError, ...(result.lastCount !== null ? { lastCount: result.lastCount } : {}) })
    .where(eq(schema.searches.id, id));
}

// ---- companies ----

export type CompanyInput = Omit<Company, "firstSeen" | "lastSeen">;

/** Insert new companies and refresh existing ones. `firstSeen` is preserved across refreshes. */
export async function upsertCompanies(list: CompanyInput[]): Promise<{ added: number; refreshed: number }> {
  if (!list.length) return { added: 0, refreshed: 0 };
  const d = await pg();
  const now = new Date();
  if (!d) {
    let added = 0;
    for (const c of list) {
      const prev = mem.companies.get(c.id);
      if (!prev) added++;
      mem.companies.set(c.id, { ...c, firstSeen: prev?.firstSeen ?? now.toISOString(), lastSeen: now.toISOString() });
    }
    return { added, refreshed: list.length - added };
  }
  let added = 0;
  const cols = schema.companies;
  for (let i = 0; i < list.length; i += 200) {
    const rows = await d
      .insert(cols)
      .values(list.slice(i, i + 200).map((c) => ({ ...c, firstSeen: now, lastSeen: now })))
      .onConflictDoUpdate({
        target: cols.id,
        set: Object.fromEntries(
          Object.entries(cols)
            .filter(([k, col]) => k !== "id" && k !== "firstSeen" && typeof (col as { name?: unknown }).name === "string")
            .map(([k, col]) => [k, sql.raw(`excluded."${(col as { name: string }).name}"`)]),
        ),
      })
      // xmax is 0 only for rows this statement inserted, which separates new companies from refreshed ones.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    added += rows.filter((r) => r.inserted).length;
  }
  return { added, refreshed: list.length - added };
}

function conditions(q: CompanyQuery): SQL | undefined {
  const c = schema.companies;
  const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
  return and(
    q.industry ? sql`lower(${c.industry}) = ${q.industry.toLowerCase()}` : undefined,
    q.city ? sql`lower(${c.city}) = ${q.city.toLowerCase()}` : undefined,
    q.tier ? eq(c.tier, q.tier) : undefined,
    q.minScore > 0 ? gte(c.score, q.minScore) : undefined,
    q.hasEmail ? ne(c.email, "") : undefined,
    q.hasWebsite ? ne(c.domain, "") : undefined,
    q.q ? or(ilike(c.name, like), ilike(c.domain, like), ilike(c.email, like), ilike(c.address, like), ilike(c.city, like)) : undefined,
  );
}

export async function listCompanies(q: CompanyQuery): Promise<{ data: Company[]; total: number }> {
  const d = await pg();
  if (!d) return queryCompanies([...mem.companies.values()], q);
  const c = schema.companies;
  const where = conditions(q);
  const order = q.sort === "name" ? [asc(c.name)] : q.sort === "recent" ? [desc(c.firstSeen), desc(c.score)] : [desc(c.score), asc(c.name)];
  const [rows, [{ total }]] = await Promise.all([
    d.select().from(c).where(where).orderBy(...order, asc(c.id)).limit(q.limit).offset((q.page - 1) * q.limit),
    d.select({ total: count() }).from(c).where(where),
  ]);
  return { data: rows.map(toCompany), total };
}

export async function getCompany(id: string): Promise<Company | null> {
  const d = await pg();
  if (!d) return mem.companies.get(id) ?? null;
  const [row] = await d.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  return row ? toCompany(row) : null;
}

/** Values available to filter on, with counts, so the UI never offers a filter that returns nothing. */
export async function companyFacets(): Promise<{ total: number; withEmail: number; hot: number; industries: Facet[]; cities: Facet[] }> {
  const d = await pg();
  if (!d) {
    const all = [...mem.companies.values()];
    const tally = (key: "industry" | "city") => {
      const m = new Map<string, number>();
      for (const c of all) if (c[key]) m.set(c[key], (m.get(c[key]) ?? 0) + 1);
      return [...m].map(([value, n]) => ({ value, count: n })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    };
    return { total: all.length, withEmail: all.filter((c) => c.email).length, hot: all.filter((c) => c.tier === "hot").length, industries: tally("industry"), cities: tally("city").slice(0, 200) };
  }
  const c = schema.companies;
  const facet = (col: typeof c.industry | typeof c.city) =>
    d.select({ value: col, count: count() }).from(c).where(ne(col, "")).groupBy(col).orderBy(desc(count()), asc(col)).limit(200);
  const [[totals], industries, cities] = await Promise.all([
    d.select({ total: count(), withEmail: sql<number>`count(*) filter (where ${c.email} <> '')::int`, hot: sql<number>`count(*) filter (where ${c.tier} = 'hot')::int` }).from(c),
    facet(c.industry),
    facet(c.city),
  ]);
  return { ...totals, industries, cities };
}

// ---- run history ----

export async function createRun(trigger: ScrapeRun["trigger"], searches: number): Promise<ScrapeRun> {
  const run: ScrapeRun = { id: newId(), trigger, status: "running", startedAt: new Date().toISOString(), finishedAt: null, searches, found: 0, added: 0, refreshed: 0, errors: [] };
  const d = await pg();
  if (!d) mem.runs.unshift(run);
  else await d.insert(schema.scrapeRuns).values({ id: run.id, trigger, status: run.status, searches, errors: [] });
  return run;
}

export async function saveRunProgress(run: ScrapeRun) {
  const d = await pg();
  if (!d) return; // the in-memory run object is updated in place by the caller
  await d
    .update(schema.scrapeRuns)
    .set({ status: run.status, finishedAt: run.finishedAt ? new Date(run.finishedAt) : null, found: run.found, added: run.added, refreshed: run.refreshed, errors: run.errors })
    .where(eq(schema.scrapeRuns.id, run.id));
}

export async function listScrapeRuns(limit = 20): Promise<ScrapeRun[]> {
  const d = await pg();
  if (!d) return mem.runs.slice(0, limit);
  return (await d.select().from(schema.scrapeRuns).orderBy(desc(schema.scrapeRuns.startedAt)).limit(limit)).map(toRun);
}

/** A run still marked "running" long after it started was cut off by a restart. Close it out. */
export async function failStaleRuns(olderThanMs: number) {
  const d = await pg();
  const cutoff = new Date(Date.now() - olderThanMs);
  if (!d) {
    for (const r of mem.runs) if (r.status === "running" && new Date(r.startedAt) < cutoff) Object.assign(r, { status: "failed", finishedAt: new Date().toISOString(), errors: [...r.errors, "Interrupted by a restart"] });
    return;
  }
  await d
    .update(schema.scrapeRuns)
    .set({ status: "failed", finishedAt: new Date(), errors: ["Interrupted by a restart"] })
    .where(and(eq(schema.scrapeRuns.status, "running"), lt(schema.scrapeRuns.startedAt, cutoff)));
}
