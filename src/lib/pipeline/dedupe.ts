import type { Lead } from "../types";
import { FREE_EMAIL_DOMAINS, ROLE_PREFIXES } from "./lists";

const SUFFIXES = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|llp|lp|pllc|pc|plc|gmbh|group|holdings|the|and|&)\b/g;

/** "The ACME Plumbing, Inc." -> "acme plumbing" */
export function canonicalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'’"()]/g, "")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aM = new Array(a.length).fill(false);
  const bM = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bM[j] || a[i] !== b[j]) continue;
      aM[i] = bM[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) x = this.parent[x] = this.parent[this.parent[x]];
    return x;
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}

export const NAME_SIMILARITY = 0.93;

/** Domain of the lead's website, or of its email when that is a company address. */
export function companyDomain(l: Lead): string {
  if (l.domain) return l.domain;
  const d = l.email.split("@")[1] ?? "";
  return d && !FREE_EMAIL_DOMAINS.has(d) ? d : "";
}

/**
 * Cluster leads that refer to the same company, then merge each cluster.
 * Blocking keeps it near O(n): records are only compared when they share a
 * domain, a phone number, or the first 4 letters of their canonical name.
 */
export function dedupe(leads: Lead[]): Lead[] {
  const uf = new UnionFind(leads.length);
  const names = leads.map((l) => canonicalName(l.company));
  const blocks = new Map<string, number[]>();
  const add = (key: string, i: number) => {
    const list = blocks.get(key);
    if (list) list.push(i);
    else blocks.set(key, [i]);
  };

  leads.forEach((l, i) => {
    const d = companyDomain(l);
    if (d) add(`d:${d}`, i);
    if (l.phoneE164) add(`p:${l.phoneE164}`, i);
    if (l.email) add(`e:${l.email}`, i);
    if (names[i].length >= 3) add(`n:${names[i].replace(/ /g, "").slice(0, 4)}`, i);
  });

  for (const [key, ids] of blocks) {
    if (ids.length < 2) continue;
    if (key.startsWith("n:")) {
      // Same name prefix is only a candidate; confirm with fuzzy match and no conflicting city/domain.
      for (let x = 0; x < ids.length; x++) {
        for (let y = x + 1; y < ids.length; y++) {
          const a = leads[ids[x]], b = leads[ids[y]];
          if (jaroWinkler(names[ids[x]], names[ids[y]]) < NAME_SIMILARITY) continue;
          if (a.city && b.city && a.city.toLowerCase() !== b.city.toLowerCase()) continue;
          const da = companyDomain(a), db = companyDomain(b);
          if (da && db && da !== db) continue;
          uf.union(ids[x], ids[y]);
        }
      }
    } else {
      for (let k = 1; k < ids.length; k++) uf.union(ids[0], ids[k]);
    }
  }

  const clusters = new Map<number, Lead[]>();
  leads.forEach((l, i) => {
    const root = uf.find(i);
    const c = clusters.get(root);
    if (c) c.push(l);
    else clusters.set(root, [l]);
  });
  return [...clusters.values()].map(mergeCluster);
}

const filled = (l: Lead) => Object.values(l).filter((v) => v !== "" && v !== null && !(Array.isArray(v) && !v.length)).length;

/** Keep the most complete record as the base and fill its gaps from the others. */
export function mergeCluster(cluster: Lead[]): Lead {
  if (cluster.length === 1) return cluster[0];
  const sorted = [...cluster].sort((a, b) => filled(b) - filled(a));
  const base: Lead = { ...sorted[0], sources: [], rowIds: [] };
  for (const l of sorted) {
    for (const key of Object.keys(l) as (keyof Lead)[]) {
      if (key === "sources" || key === "rowIds" || key === "id") continue;
      const cur = base[key];
      if (cur === "" || cur === null) (base as unknown as Record<string, unknown>)[key] = l[key];
    }
    // Prefer a personal email over a role inbox when records disagree.
    if (l.email && isRoleLike(base.email) && !isRoleLike(l.email)) base.email = l.email;
    base.sources.push(...l.sources);
    base.rowIds.push(...l.rowIds);
  }
  base.sources = [...new Set(base.sources)];
  base.rowIds.sort((a, b) => a - b);
  base.id = `r${base.rowIds[0]}`;
  return base;
}

function isRoleLike(email: string) {
  const local = email.split("@")[0] ?? "";
  return ROLE_PREFIXES.has(local) || ROLE_PREFIXES.has(local.split(/[+.]/)[0]);
}
