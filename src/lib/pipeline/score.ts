import type { Category, Checks, Lead, Reason, ScoredLead, Tier } from "../types";
import { DECISION_MAKER, SENIOR } from "./lists";

export type PresetId = "eta" | "b2b";

export interface Preset {
  id: PresetId;
  name: string;
  blurb: string;
  industries: string[];
  weights: Record<Category, number>;
}

export const PRESETS: Record<PresetId, Preset> = {
  eta: {
    id: "eta",
    name: "ETA Searcher",
    blurb: "Find owner-operated, established small businesses worth acquiring.",
    industries: [
      "hvac", "plumbing", "electrical", "roofing", "landscaping", "pest control", "accounting", "bookkeeping",
      "insurance", "manufacturing", "distribution", "logistics", "trucking", "home health", "dental", "veterinary",
      "it services", "managed services", "staffing", "construction", "janitorial", "engineering", "laboratory",
    ],
    weights: { contact: 1, fit: 1.3, signals: 1, quality: 0.7 },
  },
  b2b: {
    id: "b2b",
    name: "B2B Sales",
    blurb: "Prioritise reachable decision makers at growing companies.",
    industries: ["software", "saas", "technology", "it services", "marketing", "financial services", "healthcare", "e-commerce", "consulting"],
    weights: { contact: 1.3, fit: 1, signals: 1, quality: 0.7 },
  },
};

export const CATEGORY_LABELS: Record<Category, string> = {
  contact: "Reachability",
  fit: "Business fit",
  signals: "Website signals",
  quality: "Data quality",
};

/**
 * Best achievable raw points per category, per preset. Scores are expressed as a share of the
 * best possible lead, so 100 means "everything we look for" and points in "Why this score" add up.
 */
const CATEGORY_MAX: Record<PresetId, Record<Category, number>> = {
  eta: { contact: 38, fit: 50, signals: 16, quality: 12 },
  b2b: { contact: 35, fit: 33, signals: 20, quality: 12 },
};

/** Raw, unweighted signals. Pure: runs on the server and in the browser for instant re-scoring. */
export function signals(lead: Lead, c: Checks, preset: Preset): Reason[] {
  const r: Reason[] = [];
  const add = (category: Category, label: string, points: number) => r.push({ category, label, points });
  const year = new Date().getFullYear();
  const eta = preset.id === "eta";

  // Reachability
  if (c.email.status === "valid" && (c.email.kind === "personal" || c.email.kind === "free")) add("contact", "Direct email verified", 15);
  else if (c.email.status === "risky" && c.email.kind === "role") add("contact", "Only a generic inbox", 3);
  else if (c.email.status === "risky") add("contact", "Email looks risky", 2);
  else if (c.email.status === "invalid") add("contact", c.email.notes[0] ?? "Invalid email", -15);
  else if (c.email.status === "missing") add("contact", "No email", -5);
  if (c.phone.status === "valid") add("contact", "Valid phone", 8);
  else if (c.phone.status === "invalid") add("contact", "Invalid phone", -5);
  if (DECISION_MAKER.test(lead.title)) add("contact", `Decision maker (${lead.title})`, eta ? 15 : 12);
  else if (SENIOR.test(lead.title)) add("contact", `Senior contact (${lead.title})`, eta ? 6 : 10);

  // Business fit
  const founded = lead.foundedYear ?? c.website.sinceYear ?? null;
  if (founded) {
    const age = year - founded;
    if (eta) {
      if (age >= 15) add("fit", `Established ${age} yrs (succession window)`, 15);
      else if (age >= 8) add("fit", `In business ${age} yrs`, 8);
      else if (age < 3) add("fit", `Young business (${age} yrs)`, -8);
    } else if (age <= 10) add("fit", `Growing company (${age} yrs)`, 5);
  }
  if (lead.employees != null) {
    const e = lead.employees;
    if (eta) {
      if (e >= 5 && e <= 100) add("fit", `${e} employees (SMB sweet spot)`, 10);
      else if (e > 500) add("fit", `${e} employees (too large to acquire)`, -10);
      else if (e < 3) add("fit", "Very small team", -4);
    } else if (e >= 20 && e <= 1000) add("fit", `${e} employees (mid-market)`, 10);
    else if (e < 10) add("fit", "Very small team", -5);
  }
  if (lead.revenue != null) {
    const m = lead.revenue / 1e6;
    const label = m >= 1 ? `$${m.toFixed(m < 10 ? 1 : 0)}M revenue` : `$${Math.round(lead.revenue / 1e3)}K revenue`;
    if (eta) {
      if (m >= 1 && m <= 20) add("fit", `${label} (search-fund range)`, 15);
      else if (m < 0.5) add("fit", `${label} (below search range)`, -6);
      else if (m > 50) add("fit", `${label} (above search range)`, -6);
    } else if (m >= 2) add("fit", label, 8);
  }
  const industry = lead.industry.toLowerCase();
  if (industry && preset.industries.some((i) => industry.includes(i))) add("fit", `Target industry (${lead.industry})`, 10);

  // Website signals
  const w = c.website;
  if (w.status === "live") add("signals", "Website is live", 5);
  else if (w.status === "dead") add("signals", "Website is down", -10);
  if (w.copyrightYear) {
    const stale = year - w.copyrightYear >= 3;
    if (eta && stale) add("signals", `Site not updated since ${w.copyrightYear} (owner may be ready to exit)`, 6);
    else if (!eta && !stale) add("signals", "Recently updated website", 4);
  }
  if (w.hiring) add("signals", "Hiring now", eta ? 2 : 8);
  if (w.socials.includes("linkedin") || lead.linkedin) add("signals", "Has LinkedIn presence", 3);

  // Data quality
  const keys = [lead.company, lead.email, lead.phone, lead.contactName, lead.title, lead.industry, lead.city, lead.domain];
  const pct = keys.filter(Boolean).length / keys.length;
  if (pct >= 0.85) add("quality", "Complete record", 8);
  else if (pct < 0.5) add("quality", "Sparse record", -6);
  if (lead.rowIds.length > 1) add("quality", `Confirmed by ${lead.rowIds.length} records`, 4);
  return r;
}

export function tierFor(score: number): Tier {
  return score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
}

export function scoreLead(lead: Lead, checks: Checks, preset: Preset, weights = preset.weights): ScoredLead {
  const max = (Object.keys(weights) as Category[]).reduce((s, c) => s + CATEGORY_MAX[preset.id][c] * weights[c], 0);
  const scale = max > 0 ? 100 / max : 0;
  const reasons = signals(lead, checks, preset)
    .map((x) => ({ ...x, points: Math.round(x.points * weights[x.category] * scale) }))
    .filter((x) => x.points !== 0);
  const score = Math.max(0, Math.min(100, reasons.reduce((s, x) => s + x.points, 0)));
  return { ...lead, checks, reasons: reasons.sort((a, b) => b.points - a.points), score, tier: tierFor(score) };
}
