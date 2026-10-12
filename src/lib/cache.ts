import { LRUCache } from "lru-cache";
import { dbGetCache, dbPutCache } from "./db/index";

/**
 * Two-level cache for network lookups (MX records, homepage checks).
 * L1: in-process LRU, survives across requests on a warm serverless instance.
 * L2: Postgres `lookup_cache` with a 7-day TTL, shared by every instance (when DATABASE_URL is set).
 * Concurrent requests for the same key share one in-flight promise.
 */
const l1 = new LRUCache<string, { value: unknown }>({ max: 10_000, ttl: 60 * 60 * 1000 });
const inflight = new Map<string, Promise<unknown>>();
export const L2_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheLevel = "l1" | "l2" | "miss";
export const cacheStats = { l1: 0, l2: 0, miss: 0 };

export async function cached<T>(key: string, compute: () => Promise<T>, persist: (v: T) => boolean): Promise<T> {
  const hit = l1.get(key);
  if (hit) {
    cacheStats.l1++;
    return hit.value as T;
  }
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    const fromDb = await dbGetCache<T>(key, L2_TTL_MS);
    if (fromDb !== undefined) {
      cacheStats.l2++;
      l1.set(key, { value: fromDb });
      return fromDb;
    }
    cacheStats.miss++;
    const fresh = await compute();
    l1.set(key, { value: fresh });
    if (persist(fresh)) await dbPutCache(key, fresh);
    return fresh;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
