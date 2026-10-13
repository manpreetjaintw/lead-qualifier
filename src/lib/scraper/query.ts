import type { Company, CompanyQuery } from "./types";

export const MAX_LIMIT = 100;
export const EXPORT_LIMIT = 5000;
const SORTS = ["score", "name", "recent"] as const;
const TIERS = ["hot", "warm", "cold"] as const;

const int = (v: string | null, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const flag = (v: string | null) => v === "1" || v === "true";

/** Read and clamp the /api/companies query string. Unknown or malformed values fall back to defaults. */
export function parseCompanyQuery(params: URLSearchParams): CompanyQuery {
  const tier = params.get("tier") ?? "";
  const sort = params.get("sort") ?? "";
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    industry: (params.get("industry") ?? "").trim().slice(0, 60),
    city: (params.get("city") ?? "").trim().slice(0, 80),
    tier: (TIERS as readonly string[]).includes(tier) ? (tier as CompanyQuery["tier"]) : "",
    minScore: int(params.get("minScore"), 0, 0, 100),
    hasEmail: flag(params.get("hasEmail")),
    hasWebsite: flag(params.get("hasWebsite")),
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as CompanyQuery["sort"]) : "score",
    page: int(params.get("page"), 1, 1, 100_000),
    limit: int(params.get("limit"), 25, 1, MAX_LIMIT),
  };
}

export function matchesQuery(c: Company, q: CompanyQuery): boolean {
  if (q.industry && c.industry.toLowerCase() !== q.industry.toLowerCase()) return false;
  if (q.city && c.city.toLowerCase() !== q.city.toLowerCase()) return false;
  if (q.tier && c.tier !== q.tier) return false;
  if (c.score < q.minScore) return false;
  if (q.hasEmail && !c.email) return false;
  if (q.hasWebsite && !c.domain) return false;
  if (q.q) {
    const needle = q.q.toLowerCase();
    if (![c.name, c.domain, c.email, c.address, c.city].some((v) => v.toLowerCase().includes(needle))) return false;
  }
  return true;
}

export function compareCompanies(sort: CompanyQuery["sort"]) {
  return (a: Company, b: Company) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "recent"
        ? b.firstSeen.localeCompare(a.firstSeen) || b.score - a.score
        : b.score - a.score || a.name.localeCompare(b.name);
}

/** In-memory equivalent of the SQL query, used when no database is configured. */
export function queryCompanies(all: Company[], q: CompanyQuery): { data: Company[]; total: number } {
  const hits = all.filter((c) => matchesQuery(c, q)).sort(compareCompanies(q.sort));
  return { data: hits.slice((q.page - 1) * q.limit, q.page * q.limit), total: hits.length };
}
