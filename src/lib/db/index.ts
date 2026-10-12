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

function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!db) {
    const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, idle_timeout: 20 });
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
