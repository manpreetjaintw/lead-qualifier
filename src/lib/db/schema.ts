import { bigint, doublePrecision, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  preset: text("preset").notNull(),
  stats: jsonb("stats").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: text("id").notNull(),
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  tier: text("tier").notNull(),
  data: jsonb("data").notNull(),
});

export const lookupCache = pgTable("lookup_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Tracked industry + location pairs the scraper refreshes on every scheduled run. */
export const searches = pgTable("searches", {
  id: text("id").primaryKey(),
  industry: text("industry").notNull(),
  location: text("location").notNull(),
  areaId: bigint("area_id", { mode: "number" }).notNull(),
  displayName: text("display_name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  country: text("country").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastCount: integer("last_count"),
  lastError: text("last_error"),
});

export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    industry: text("industry").notNull(),
    category: text("category").notNull(),
    website: text("website").notNull(),
    domain: text("domain").notNull(),
    email: text("email").notNull(),
    emailStatus: text("email_status").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postcode: text("postcode").notNull(),
    country: text("country").notNull(),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    foundedYear: integer("founded_year"),
    openingHours: text("opening_hours").notNull(),
    socials: jsonb("socials").notNull(),
    site: jsonb("site"),
    score: integer("score").notNull(),
    tier: text("tier").notNull(),
    reasons: jsonb("reasons").notNull(),
    searchId: text("search_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    scoreIdx: index("companies_score_idx").on(t.score),
    industryIdx: index("companies_industry_idx").on(t.industry, t.city),
  }),
);

export const scrapeRuns = pgTable("scrape_runs", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  searches: integer("searches").notNull().default(0),
  found: integer("found").notNull().default(0),
  added: integer("added").notNull().default(0),
  refreshed: integer("refreshed").notNull().default(0),
  errors: jsonb("errors").notNull(),
});
