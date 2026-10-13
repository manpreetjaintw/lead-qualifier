# Lead Qualifier: design and architecture

**One line:** SaaSquatch finds leads. Lead Qualifier decides which ones deserve a credit and a call.

## 1. Why this feature

SaaSquatch charges per enriched lead ($19 buys 50, $49 buys 125), and it merges data from Apollo, LinkedIn, Crunchbase, Google Maps and Growjo. That creates two problems the product doesn't solve today:

1. **Dirty lists.** When five sources are merged, the same company shows up as "Acme Plumbing LLC", "acme plumbing" and "ACME Plumbing, Inc." with different phone formats. Emails bounce, domains are dead, and info@ inboxes never reply.
2. **No explainable prioritization.** A raw "AI score" doesn't tell a searcher *why* a business fits their acquisition thesis.

Lead Qualifier takes a CSV in the SaaSquatch export format (or any CSV), then returns a deduplicated, validated, lightly enriched list ranked 0–100, with plain-English reasons and a one-click export in HubSpot format.

## 2. UX design choices

| Choice | Reason |
|---|---|
| **3-step flow: Upload → Review → Export** shown as a stepper | Mirrors how a rep works, and one primary action per screen keeps the learning curve near zero. |
| **"Try with sample data" button** | Reviewers and new users see value in one click, without hunting for a CSV. |
| **Automatic column mapping** with a manual override | Exports from Apollo, SaaSquatch and Google Maps name columns differently. Guessing the mapping removes the most tedious step. |
| **Data-quality summary cards** (duplicates merged, invalid emails, dead domains, generic inboxes) | Makes the cleanup visible, so the user trusts the list and sees how many credits were saved. |
| **Score badges in three tiers**: green Hot ≥ 70, amber Warm 40–69, grey Cold < 40 | Color plus a text label, so the tiers stay readable for color-blind users. Users scan the colors before reading numbers. |
| **"Why this score" row expansion** | Each lead shows the signals that added or removed points. That's explainable and coachable, unlike a black-box AI score. |
| **Scoring presets** (ETA Searcher, B2B Sales) with weight sliders | Caprae's core persona is the acquisition searcher, whose fit criteria differ from a SaaS SDR's. Presets give good defaults, and sliders give control. |
| **Filters** (tier, valid email only, hide duplicates, search) and sortable columns | Covers the filter → verify → export path the brief calls out. |
| **Exports**: clean CSV, HubSpot import CSV, and "Hot leads only" | Plugs straight into existing CRM workflows. HubSpot's free CRM is the most common tool for small teams and searchers. |
| **Visual language matches SaaSquatch**: Next.js, Tailwind and shadcn/ui, with the same dark navy theme and top navigation | The site and app are built with v0.dev, which uses this stack, so the module looks native rather than bolted on. |

## 3. System architecture

```
Browser (Next.js React client)
  │  CSV parsed client-side (PapaParse), so the raw file never leaves the browser until the user clicks Qualify
  │  Rows sent in batches of 50 → progress bar, no function timeouts
  ▼
Next.js Route Handlers on the Render web service (Node.js 20, Docker)
  POST /api/qualify   normalize → dedupe → validate → enrich → score
  GET  /api/runs/:id  reload a saved run
  │
  ├─ lib/pipeline/normalize.ts   trim, case, domain extraction, phone → E.164 (libphonenumber-js)
  ├─ lib/pipeline/dedupe.ts      blocking keys (domain, phone, name) + Jaro-Winkler fuzzy name match → union-find merge
  ├─ lib/pipeline/validate.ts    email syntax, role/disposable lists, MX lookup (node:dns), phone validity
  ├─ lib/pipeline/enrich.ts      homepage fetch (robots.txt-aware, 4s timeout): title, description, socials, copyright year
  ├─ lib/pipeline/score.ts       weighted rule engine with presets → 0–100 + reasons[]
  └─ lib/cache.ts                two-level cache for MX and website lookups
  │
  ▼
PostgreSQL 16 (Render Postgres) via Drizzle ORM
  runs(id, created_at, preset, stats jsonb)
  leads(id, run_id, data jsonb, score int, tier, reasons jsonb)
  domain_cache(domain pk, mx bool, site jsonb, checked_at)   ← 7-day TTL
```

### Company Finder: scraper, schedule and API

```
instrumentation.ts (runs once at server boot)
  │  timer: first run after 10s, then every SCRAPE_INTERVAL_MINUTES (30)
  ▼
POST /api/scraper/run ──► lib/scraper/run.ts  (one run at a time; a second request joins the run in flight)
  for each tracked search (failed-last-time first, then oldest):
  ├─ lib/scraper/overpass.ts   Nominatim geocode → Overpass query → listings (chains and unnamed elements dropped)
  ├─ lib/pipeline/*            the same normalize → dedupe → validate → score code that uploaded lists use
  ├─ lib/network.ts            homepage + contact page (robots.txt-aware), MX lookup, both through lib/cache.ts
  └─ lib/scraper/store.ts      upsert into `companies`, progress into `scrape_runs`, result into `searches`
  ▼
GET /api/companies, /api/companies/:id, /api/companies/facets, /api/searches, /api/scraper/status
  ▼
Company Finder (/) and Scraper (/scraper) pages, which poll status and refresh when a run finishes
```

| Decision | Reason |
|---|---|
| **OpenStreetMap as the source** | Open data with APIs that allow automated use. Scraping Google Maps, LinkedIn or a competitor's app would break their terms and need CAPTCHA or IP evasion, which this project does not do. |
| **Scheduler in the app process, calling its own HTTP route** | One container to run and monitor. The route is also what a manual "Run now" and an external cron call, so there is a single code path for every trigger. |
| **Upsert keyed by the OpenStreetMap element id** | Re-running a search refreshes rows instead of duplicating them. `first_seen` is kept, `last_seen` moves, and Postgres `xmax = 0` tells new rows from refreshed ones for the run counters. |
| **Each search commits on its own** | A busy upstream fails one search, not the run. The run is recorded as `partial` with the error text, and the failed search goes first next time. |
| **Retries, endpoint cool-off and an 18-minute run budget** | Public Overpass servers time out under load. Three endpoints are tried up to three times; one that timed out is skipped for 10 minutes; and a slow run stops starting new searches before the next scheduled run is due. |
| **Listing-specific score ceiling** (`LISTING_MAX`) | A public listing never has a contact's title, headcount or revenue. Scoring against the full ceiling made every scraped company "cold", so listings are ranked against the best a listing can be. |
| **Filters are parsed and clamped in one pure function** (`lib/scraper/query.ts`) | The same rules back the SQL query and the in-memory fallback, and they are unit-tested without a database. |

New tables: `searches` (tracked industry + place, last result), `companies` (one row per business with contact data, website check, score, tier and reasons), `scrape_runs` (trigger, status, found / new / refreshed counts, errors).

### Data storage
- **Database:** PostgreSQL 16 (**Render Postgres** in production, a Docker container locally), with **Drizzle ORM** for typed schema and migrations. Postgres `jsonb` stores the variable lead columns from different CSV sources without schema churn.
- **Optional by design:** if `DATABASE_URL` is unset, the app runs fully in memory. Anyone can `npm run dev` without setting up a database, and the demo never breaks because of an external service.
- **Privacy:** files are parsed in the browser, and only the mapped columns are sent to the API. No third-party enrichment API receives the user's contacts.

### Caching and performance
1. **Batch-level dedupe of lookups.** 500 leads often share about 150 domains, so each unique domain is checked once per run.
2. **L1 in-process LRU** (`lru-cache`, 5,000 entries, 1-hour TTL), shared by every request in the server process.
3. **L2 Postgres `domain_cache`** (7-day TTL), shared across instances and users, so repeat lists are close to instant.
4. **Bounded concurrency** (8 parallel network checks) and **hard timeouts** (DNS 2.5s, HTTP 4s). One slow site can't stall a batch.
5. **Graceful degradation.** If DNS or the network is unavailable, the check is marked `unknown` and gets no penalty. Scoring never crashes on a network failure.
6. **Client batching** (50 rows per request) keeps each function call well under Vercel's time limit and powers a live progress bar.
7. **Dedupe is O(n) blocking, not O(n²).** Records are only compared within shared blocking keys, so it scales to tens of thousands of rows.
8. **Static assets and the app shell** are prerendered and served from Vercel's edge CDN.

### Hosting: static frontend + always-on backend
- **UI:** the Next.js pages are deployed to **Vercel** and served from its CDN. A build-time rewrite (`BACKEND_URL` in `next.config.mjs`) forwards every `/api` request to the backend, so the Vercel deployment holds no database credentials.
- **API, scraper and scheduler:** the same codebase runs as a **Docker web service on Render**. It is a long-lived Node.js process, which the 30-minute scrape timer and background runs need; serverless functions stop between requests and cannot hold a timer. MX lookups also need the Node runtime (`node:dns`).
- **Database:** **Render Postgres 16**, in the same region as the web service, connected through `DATABASE_URL`.
- **Cloud provider:** Render and Vercel both run on **AWS**.
- **Free-plan caveat:** Render's free web service sleeps when idle. A scheduled GitHub Actions workflow calls `POST /api/scraper/run` every 30 minutes to wake it and start a run.

### Deployment process
1. Push to GitHub. **GitHub Actions** runs typecheck, tests (Vitest) and a production build.
2. **Render** builds the `Dockerfile` (which runs the tests again) and deploys the backend described in `render.yaml`. Tables are created automatically on first start.
3. **Vercel** builds the frontend, giving every pull request a preview URL and deploying `main` to production.
4. Secrets (`DATABASE_URL`) live only in Render's environment, never in the repo or on Vercel.

## 4. Exact stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 |
| Framework | Next.js 14 (App Router), React 18 |
| Styling / UI | Tailwind CSS 3, shadcn/ui-style components (Radix primitives), lucide-react icons |
| CSV | PapaParse (client-side parse and unparse) |
| Validation | libphonenumber-js, `node:dns/promises` (MX), curated role-based and disposable-domain lists |
| Fuzzy matching | Jaro-Winkler (own implementation), union-find clustering |
| Enrichment | `fetch` + cheerio (HTML parsing), robots.txt check |
| Caching | lru-cache (L1), Postgres table (L2) |
| Database | PostgreSQL 16 (Render Postgres in production, Docker locally), Drizzle ORM |
| Testing | Vitest |
| Data source | OpenStreetMap: Nominatim (geocoding) and Overpass (listings) |
| Scheduling | In-process timer (Next.js instrumentation hook), plus a scheduled GitHub Actions workflow as a wake-up |
| CI/CD | GitHub Actions, Render Blueprint (`render.yaml`), Vercel Git integration |
| Hosting | Render (Docker web service + Postgres) for API and scraper; Vercel (CDN) for the UI |

## 5. Ethical data practices
- Only public business-level signals are fetched, and only from the company's own homepage.
- `robots.txt` is respected, with an honest `User-Agent` and a single request per domain.
- No personal social profiles are scraped. The tool only notes whether a company links its own LinkedIn or Facebook page.
- Uploaded files are processed in the browser and are only persisted if the user saves the run.
