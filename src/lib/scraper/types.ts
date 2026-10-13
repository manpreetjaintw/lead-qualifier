import type { Reason, Tier, WebsiteCheck } from "../types";

/** A business collected by the scraper, enriched from its own website and scored. */
export interface Company {
  id: string;
  name: string;
  industry: string;
  category: string;
  website: string;
  domain: string;
  email: string;
  emailStatus: string;
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
  site: WebsiteCheck | null;
  score: number;
  tier: Tier;
  reasons: Reason[];
  searchId: string;
  sourceUrl: string;
  firstSeen: string;
  lastSeen: string;
}

/** A tracked industry + location pair that the scheduler refreshes on every run. */
export interface Search {
  id: string;
  industry: string;
  location: string;
  areaId: number;
  displayName: string;
  city: string;
  state: string;
  country: string;
  createdAt: string;
  lastRunAt: string | null;
  lastCount: number | null;
  lastError: string | null;
}

export type RunTrigger = "schedule" | "startup" | "manual";
export type RunStatus = "running" | "success" | "partial" | "failed";

export interface ScrapeRun {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  searches: number;
  found: number;
  added: number;
  refreshed: number;
  errors: string[];
}

export interface CompanyQuery {
  q: string;
  industry: string;
  city: string;
  tier: "" | Tier;
  minScore: number;
  hasEmail: boolean;
  hasWebsite: boolean;
  sort: "score" | "name" | "recent";
  page: number;
  limit: number;
}

export interface Facet {
  value: string;
  count: number;
}
