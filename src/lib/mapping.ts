import { FIELDS, type ColumnMapping, type Field } from "./types";

/** Header synonyms seen in SaaSquatch, Apollo, Google Maps and Crunchbase exports. */
const SYNONYMS: Record<Field, string[]> = {
  company: ["company", "company name", "business", "business name", "organization", "organisation", "account", "account name", "name of business"],
  website: ["website", "url", "domain", "company website", "web", "site", "homepage", "company domain"],
  email: ["email", "e-mail", "email address", "work email", "contact email", "owner email"],
  phone: ["phone", "phone number", "telephone", "tel", "mobile", "company phone", "contact phone", "owner phone"],
  contactName: ["contact", "contact name", "name", "full name", "owner", "owner name", "person", "first name"],
  title: ["title", "job title", "position", "role", "designation"],
  industry: ["industry", "category", "sector", "vertical", "business type", "type"],
  city: ["city", "town", "locality"],
  state: ["state", "region", "province", "state/region"],
  country: ["country", "country code", "nation"],
  employees: ["employees", "employee count", "headcount", "# employees", "company size", "size", "staff"],
  revenue: ["revenue", "annual revenue", "estimated revenue", "est. revenue", "sales", "revenue (usd)"],
  foundedYear: ["founded", "founded year", "year founded", "established", "since", "year established"],
  linkedin: ["linkedin", "linkedin url", "company linkedin", "linkedin profile"],
  source: ["source", "lead source", "data source", "origin"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

/** Guess which CSV header maps to each canonical field. Exact synonym wins, then "contains". */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => [h, norm(h)] as const);

  for (const field of FIELDS) {
    const exact = normalized.find(([h, n]) => !used.has(h) && SYNONYMS[field].includes(n));
    if (exact) {
      mapping[field] = exact[0];
      used.add(exact[0]);
    }
  }
  for (const field of FIELDS) {
    if (mapping[field]) continue;
    const partial = normalized.find(([h, n]) => !used.has(h) && SYNONYMS[field].some((s) => s.length > 3 && n.includes(s)));
    if (partial) {
      mapping[field] = partial[0];
      used.add(partial[0]);
    }
  }
  return mapping;
}

export const FIELD_LABELS: Record<Field, string> = {
  company: "Company",
  website: "Website",
  email: "Email",
  phone: "Phone",
  contactName: "Contact name",
  title: "Job title",
  industry: "Industry",
  city: "City",
  state: "State",
  country: "Country",
  employees: "Employees",
  revenue: "Revenue",
  foundedYear: "Founded year",
  linkedin: "LinkedIn",
  source: "Source",
};
