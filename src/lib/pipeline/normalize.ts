import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import type { ColumnMapping, Lead, RawRow } from "../types";

const COUNTRY_CODES: Record<string, CountryCode> = {
  us: "US", usa: "US", "united states": "US", "united states of america": "US", america: "US",
  ca: "CA", canada: "CA", uk: "GB", gb: "GB", "united kingdom": "GB", england: "GB",
  au: "AU", australia: "AU", in: "IN", india: "IN", de: "DE", germany: "DE", mx: "MX", mexico: "MX",
};

export function countryCode(country: string): CountryCode {
  return COUNTRY_CODES[country.trim().toLowerCase()] ?? "US";
}

export function clean(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

/** "https://www.Acme.com/about?x" -> "acme.com". Also accepts bare domains. */
export function extractDomain(input: string): string {
  const s = clean(input).toLowerCase();
  if (!s) return "";
  try {
    const url = new URL(/^[a-z]+:\/\//.test(s) ? s : `http://${s}`);
    const host = url.hostname.replace(/^www\./, "");
    return host.includes(".") ? host : "";
  } catch {
    return "";
  }
}

/** Parse "$2.5M", "1,200,000", "2.5 million", "10-50" (takes midpoint) into a number. */
export function parseNumber(input: string): number | null {
  const s = clean(input).toLowerCase().replace(/[$,£€\s]/g, "");
  if (!s) return null;
  const range = s.match(/^(\d+(?:\.\d+)?)[-–to]+(\d+(?:\.\d+)?)([kmb])?/);
  if (range) {
    const mult = unit(range[3]);
    return Math.round(((parseFloat(range[1]) + parseFloat(range[2])) / 2) * mult);
  }
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m|b|thousand|million|billion|mm)?\+?/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * unit(m[2]));
}

function unit(u?: string): number {
  if (!u) return 1;
  if (u === "k" || u === "thousand") return 1e3;
  if (u === "m" || u === "mm" || u === "million") return 1e6;
  if (u === "b" || u === "billion") return 1e9;
  return 1;
}

export function parseYear(input: string): number | null {
  const m = clean(input).match(/(18|19|20)\d{2}/);
  if (!m) return null;
  const y = parseInt(m[0], 10);
  return y <= new Date().getFullYear() ? y : null;
}

export function normalizePhone(phone: string, country: string): string {
  const p = clean(phone);
  if (!p) return "";
  const parsed = parsePhoneNumberFromString(p, countryCode(country));
  return parsed?.isPossible() ? parsed.number : "";
}

/** Title-case names that arrived ALL CAPS or all lower; leave mixed case alone. */
export function tidyName(s: string): string {
  const v = clean(s);
  if (!v || (v !== v.toUpperCase() && v !== v.toLowerCase())) return v;
  return v.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc|Ltd|Co|Hvac|Llp|Pc|Usa)\b/g, (w) => w.toUpperCase());
}

export function normalizeRows(rows: RawRow[], mapping: ColumnMapping): Lead[] {
  const get = (row: RawRow, f: keyof ColumnMapping) => (mapping[f] ? clean(row[mapping[f]!]) : "");
  return rows
    .map((row, i): Lead => {
      const website = get(row, "website");
      const email = get(row, "email").toLowerCase().replace(/^mailto:/, "");
      const country = get(row, "country");
      const phone = get(row, "phone");
      let domain = extractDomain(website);
      return {
        id: `r${i}`,
        company: tidyName(get(row, "company")),
        website,
        domain,
        email,
        phone,
        phoneE164: normalizePhone(phone, country),
        contactName: tidyName(get(row, "contactName")),
        title: get(row, "title"),
        industry: get(row, "industry"),
        city: tidyName(get(row, "city")),
        state: get(row, "state"),
        country,
        employees: parseNumber(get(row, "employees")),
        revenue: parseNumber(get(row, "revenue")),
        foundedYear: parseYear(get(row, "foundedYear")),
        linkedin: get(row, "linkedin"),
        sources: get(row, "source") ? [get(row, "source")] : [],
        rowIds: [i],
      };
    })
    .filter((l) => l.company || l.email || l.domain);
}
