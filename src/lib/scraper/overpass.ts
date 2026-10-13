import type { Industry } from "./industries";
import { parseYear } from "../pipeline/normalize";

/**
 * Data source: OpenStreetMap, via the public Nominatim (geocoding) and Overpass (query) APIs.
 * Both are open data under the ODbL and permit automated use within their usage policies:
 * identify yourself, one request at a time, and keep the volume low. This module does all three.
 */
export const USER_AGENT = "LeadQualifierBot/1.0 (+https://github.com/manpreetjaintw/lead-qualifier)";
const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const MAX_RESULTS = 500;

export interface Place {
  areaId: number;
  displayName: string;
  city: string;
  state: string;
  country: string;
}

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Fields read straight from the listing, before enrichment and scoring. */
export interface Listing {
  id: string;
  name: string;
  category: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  lat: number | null;
  lon: number | null;
  foundedYear: number | null;
  openingHours: string;
  socials: string[];
  sourceUrl: string;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers: { "user-agent": USER_AGENT, accept: "application/json", ...init.headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Overpass areas only exist for relations and closed ways, so a bare point cannot be searched.
const areaId = (type: string, id: number) => (/^r/i.test(type) ? 3_600_000_000 : 2_400_000_000) + id;
const isArea = (type: string | undefined) => /^[rw]/i.test(type ?? "");

async function nominatim(location: string): Promise<Place | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(location)}`;
  const results = (await fetchJson(url, {}, 15_000)) as { osm_type: string; osm_id: number; name?: string; display_name: string; address?: Record<string, string> }[];
  const hit = results.find((r) => r.osm_type === "relation") ?? results.find((r) => r.osm_type === "way");
  if (!hit) return null;
  const a = hit.address ?? {};
  return {
    areaId: areaId(hit.osm_type, hit.osm_id),
    displayName: hit.display_name,
    city: hit.name ?? a.city ?? a.town ?? a.village ?? location,
    state: a.state ?? "",
    country: (a.country_code ?? "").toUpperCase(),
  };
}

async function photon(location: string): Promise<Place | null> {
  const url = `https://photon.komoot.io/api/?limit=10&layer=city&layer=county&layer=state&q=${encodeURIComponent(location)}`;
  const json = (await fetchJson(url, {}, 15_000)) as { features?: { properties: Record<string, string | number | undefined> }[] };
  const hit = (json.features ?? []).map((f) => f.properties).find((p) => isArea(String(p.osm_type ?? "")) && typeof p.osm_id === "number");
  if (!hit) return null;
  const name = String(hit.name ?? location);
  return {
    areaId: areaId(String(hit.osm_type), hit.osm_id as number),
    displayName: [name, hit.state, hit.country].filter(Boolean).join(", "),
    city: name,
    state: String(hit.state ?? ""),
    country: String(hit.countrycode ?? "").toUpperCase(),
  };
}

/**
 * Resolve "Austin, Texas" to an OpenStreetMap area. Returns null when the place is unknown.
 * Nominatim is asked first; it turns away some hosting providers' addresses, so Photon (another
 * public geocoder over the same data) is the fallback. Throws only when neither can be reached.
 */
export async function geocode(location: string): Promise<Place | null> {
  let failure: unknown;
  for (const lookup of [nominatim, photon]) {
    try {
      const place = await lookup(location);
      if (place) return place;
    } catch (e) {
      failure = e;
    }
  }
  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  return null;
}

const esc = (s: string) => s.replace(/[\\"]/g, "\\$&");

export function buildQuery(areaId: number, industry: Industry): string {
  const filters = industry.tags.map(([k, v]) => `  nwr["name"]["${esc(k)}"="${esc(v)}"](area.a);`).join("\n");
  return `[out:json][timeout:60];\narea(${areaId})->.a;\n(\n${filters}\n);\nout tags center ${MAX_RESULTS};`;
}

const first = (v: string | undefined) => (v ?? "").split(";")[0].trim();
const SOCIAL_TAGS = ["linkedin", "facebook", "instagram", "twitter", "youtube"];

/** Turn one OpenStreetMap element into a listing. Returns null for unnamed elements and chain branches. */
export function parseElement(el: OsmElement, industry: Industry, place: Pick<Place, "city" | "state" | "country">): Listing | null {
  const t = el.tags ?? {};
  const name = (t.name ?? "").trim();
  if (!name) return null;
  // Branches of national chains are tagged with the brand's Wikidata id. They are not independent
  // businesses, so they are left out rather than ranked alongside owner-operated companies.
  if (t["brand:wikidata"]) return null;
  const match = industry.tags.find(([k, v]) => t[k] === v);
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  return {
    id: `${el.type[0]}${el.id}`,
    name,
    category: match ? `${match[0]}=${match[1]}` : "",
    website: first(t.website ?? t["contact:website"] ?? t.url),
    email: first(t.email ?? t["contact:email"]).toLowerCase(),
    phone: first(t.phone ?? t["contact:phone"]),
    address: [street, t["addr:unit"] && `Unit ${t["addr:unit"]}`].filter(Boolean).join(", "),
    city: t["addr:city"] ?? place.city,
    state: t["addr:state"] ?? place.state,
    postcode: t["addr:postcode"] ?? "",
    country: (t["addr:country"] ?? place.country).toUpperCase(),
    lat: el.lat ?? el.center?.lat ?? null,
    lon: el.lon ?? el.center?.lon ?? null,
    foundedYear: parseYear(t.start_date ?? ""),
    openingHours: t.opening_hours ?? "",
    socials: SOCIAL_TAGS.filter((s) => t[`contact:${s}`] || t[s]).map((s) => (s === "twitter" ? "x" : s)),
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ATTEMPT_TIMEOUT_MS = 70_000;
const ROUNDS = 3;
const COOL_OFF_MS = 10 * 60_000;
/** Endpoints that just timed out are skipped for a while instead of stalling every remaining search. */
const coolingOff = new Map<string, number>();

/**
 * Run one Overpass query. The public instances are shared and often busy (HTTP 429/504), so each
 * endpoint is tried in turn, with a pause before a second round, before the search is reported as failed.
 * A failed search is simply retried on the next scheduled run.
 */
export async function fetchListings(place: Place, industry: Industry): Promise<Listing[]> {
  const body = `data=${encodeURIComponent(buildQuery(place.areaId, industry))}`;
  let lastError: unknown = new Error("All Overpass endpoints are cooling off after timeouts");
  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) await sleep(20_000);
    for (const endpoint of OVERPASS_ENDPOINTS) {
      if ((coolingOff.get(endpoint) ?? 0) > Date.now()) continue;
      try {
        const json = (await fetchJson(endpoint, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }, ATTEMPT_TIMEOUT_MS)) as {
          elements?: OsmElement[];
          remark?: string;
        };
        if (json.remark && !json.elements?.length) throw new Error(`Overpass: ${json.remark}`);
        return (json.elements ?? []).map((el) => parseElement(el, industry, place)).filter((l): l is Listing => l !== null);
      } catch (e) {
        const timedOut = e instanceof Error && e.name === "AbortError";
        if (timedOut) coolingOff.set(endpoint, Date.now() + COOL_OFF_MS);
        lastError = timedOut ? new Error(`${new URL(endpoint).host} did not answer within ${ATTEMPT_TIMEOUT_MS / 1000}s`) : e;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
