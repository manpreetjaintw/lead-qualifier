import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { desc, eq, gt, and, sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";
import type { RunStats, ScoredLead } from "../types";

/**
 * Storage layer. With DATABASE_URL (Neon Postgres) runs and lookups persist;
 * without it everything lives in memory so the app works with zero setup.
 */
let db: PostgresJsDatabase<typeof schema> | null = null;
let ready: Promise<void> | null = null;

/** Resolves once the tables exist. Await it before the first query of a request. */
export const dbReady = () => ready ?? Promise.resolve();

export function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!db) {
    const client = postgres(process.env.DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20, onnotice: () => {} });
    db = drizzle(client, { schema });
    ready = ensureSchema(client);
  }
  return db;
}

// Idempotent bootstrap so a fresh Neon database works without running migrations by hand.
async function ensureSchema(client: postgres.Sql) {
  await client`create table if not exists runs (id text primary key, name text not null, preset text not null, stats jsonb not null, created_at timestamptz not null default now())`;
  await client`create table if not exists leads (id text not null, run_id text not null references runs(id) on delete cascade, score integer not null, tier text not null, data jsonb not null)`;
  await client`create index if not exists leads_run_idx on leads(run_id, score desc)`;
  await client`create table if not exists lookup_cache (key text primary key, value jsonb not null, checked_at timestamptz not null default now())`;
  await client`create table if not exists searches (id text primary key, industry text not null, location text not null, area_id bigint not null, display_name text not null, city text not null, state text not null, country text not null, created_at timestamptz not null default now(), last_run_at timestamptz, last_count integer, last_error text)`;
  await client`create table if not exists companies (id text primary key, name text not null, industry text not null, category text not null, website text not null, domain text not null, email text not null, email_status text not null, phone text not null, address text not null, city text not null, state text not null, postcode text not null, country text not null, lat double precision, lon double precision, founded_year integer, opening_hours text not null, socials jsonb not null, site jsonb, score integer not null, tier text not null, reasons jsonb not null, search_id text not null, source_url text not null, first_seen timestamptz not null default now(), last_seen timestamptz not null default now())`;
  await client`create index if not exists companies_score_idx on companies(score desc)`;
  await client`create index if not exists companies_industry_idx on companies(industry, city)`;
  await client`create table if not exists scrape_runs (id text primary key, trigger text not null, status text not null, started_at timestamptz not null default now(), finished_at timestamptz, searches integer not null default 0, found integer not null default 0, added integer not null default 0, refreshed integer not null default 0, errors jsonb not null)`;
}

export const storageMode = () => (process.env.DATABASE_URL ? "postgres" : "memory");

const memRuns = new Map<string, { id: string; name: string; preset: string; stats: RunStats; createdAt: string; leads: ScoredLead[] }>();
const memCache = new Map<string, { value: unknown; at: number }>();

export async function dbGetCache<T>(key: string, ttlMs: number): Promise<T | undefined> {
  const d = getDb();
  if (!d) {
    const hit = memCache.get(key);
    return hit && Date.now() - hit.at < ttlMs ? (hit.value as T) : undefined;
  }
  try {
    await ready;
    const rows = await d.select().from(schema.lookupCache)
      .where(and(eq(schema.lookupCache.key, key), gt(schema.lookupCache.checkedAt, new Date(Date.now() - ttlMs)))).limit(1);
    return rows[0]?.value as T | undefined;
  } catch {
    return undefined; // Cache is best-effort: never fail a request because the DB is unreachable.
  }
}

export async function dbPutCache(key: string, value: unknown) {
  const d = getDb();
  if (!d) {
    memCache.set(key, { value, at: Date.now() });
    return;
  }
  try {
    await ready;
    await d.insert(schema.lookupCache).values({ key, value })
      .onConflictDoUpdate({ target: schema.lookupCache.key, set: { value, checkedAt: sql`now()` } });
  } catch {
    /* best-effort */
  }
}

import type { RunSummary } from "./types";
export type { RunSummary };

export async function saveRun(run: { name: string; preset: string; stats: RunStats; leads: ScoredLead[] }): Promise<string> {
  const id = crypto.randomUUID().slice(0, 8);
  const d = getDb();
  if (!d) {
    memRuns.set(id, { id, ...run, createdAt: new Date().toISOString() });
    return id;
  }
  await ready;
  await d.transaction(async (tx) => {
    await tx.insert(schema.runs).values({ id, name: run.name, preset: run.preset, stats: run.stats });
    for (let i = 0; i < run.leads.length; i += 500) {
      await tx.insert(schema.leads).values(run.leads.slice(i, i + 500).map((l) => ({ id: l.id, runId: id, score: l.score, tier: l.tier, data: l })));
    }
  });
  return id;
}

export async function listRuns(): Promise<RunSummary[]> {
  const d = getDb();
  if (!d) return [...memRuns.values()].reverse().slice(0, 20).map(({ leads: _l, ...r }) => r);
  await ready;
  const rows = await d.select().from(schema.runs).orderBy(desc(schema.runs.createdAt)).limit(20);
  return rows.map((r) => ({ id: r.id, name: r.name, preset: r.preset, stats: r.stats as RunStats, createdAt: r.createdAt.toISOString() }));
}

export async function getRun(id: string): Promise<(RunSummary & { leads: ScoredLead[] }) | null> {
  const d = getDb();
  if (!d) return memRuns.get(id) ?? null;
  await ready;
  const [run] = await d.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
  if (!run) return null;
  const rows = await d.select().from(schema.leads).where(eq(schema.leads.runId, id)).orderBy(desc(schema.leads.score));
  return { id: run.id, name: run.name, preset: run.preset, stats: run.stats as RunStats, createdAt: run.createdAt.toISOString(), leads: rows.map((r) => r.data as ScoredLead) };
}
