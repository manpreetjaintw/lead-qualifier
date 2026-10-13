"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Globe, Loader2, Mail, MapPin, Phone, RefreshCw, Search, SearchX } from "lucide-react";
import type { Company, Facet } from "@/lib/scraper/types";
import { CATEGORY_LABELS } from "@/lib/pipeline/score";
import { api, relativeTime, type ScraperStatus } from "@/lib/client";
import { cn } from "@/lib/utils";
import { PageHeader } from "./AppShell";
import { ScoreBadge } from "./ScoreBadge";
import { StatusIcon, emailTone, siteTone } from "./StatusPill";
import { Button, Card, Input, Select } from "./ui";

interface Filters {
  q: string;
  industry: string;
  city: string;
  tier: string;
  hasEmail: boolean;
  hasWebsite: boolean;
  sort: string;
}
const EMPTY: Filters = { q: "", industry: "", city: "", tier: "", hasEmail: false, hasWebsite: false, sort: "score" };
const PAGE_SIZE = 25;

interface Page {
  data: Company[];
  total: number;
  page: number;
  pages: number;
}
interface Facets {
  total: number;
  industries: Facet[];
  cities: Facet[];
}

function toParams(f: Filters, page: number) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.industry) p.set("industry", f.industry);
  if (f.city) p.set("city", f.city);
  if (f.tier) p.set("tier", f.tier);
  if (f.hasEmail) p.set("hasEmail", "1");
  if (f.hasWebsite) p.set("hasWebsite", "1");
  if (f.sort !== "score") p.set("sort", f.sort);
  p.set("page", String(page));
  p.set("limit", String(PAGE_SIZE));
  return p;
}

export function CompanyFinder() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string | null>(null);
  const wasRunning = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<Page>(`/api/companies?${toParams(applied, page)}`)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setError(undefined);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [applied, page, refreshKey]);

  useEffect(() => {
    api<Facets>("/api/companies/facets").then(setFacets).catch(() => {});
  }, [refreshKey]);

  // Poll the scraper so new companies appear as soon as a run finishes, without a manual reload.
  const pollStatus = useCallback(() => {
    api<ScraperStatus>("/api/scraper/status")
      .then((s) => {
        setStatus(s);
        if (s.running || wasRunning.current) setRefreshKey((k) => k + 1);
        wasRunning.current = s.running;
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    pollStatus();
    const t = setInterval(pollStatus, 15_000);
    return () => clearInterval(t);
  }, [pollStatus]);

  const apply = (next: Filters) => {
    setDraft(next);
    setApplied(next);
    setPage(1);
    setOpen(null);
  };
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const filtered = JSON.stringify(applied) !== JSON.stringify(EMPTY);
  const empty = !loading && !error && result?.total === 0;

  return (
    <>
      <PageHeader title="Company Finder" subtitle="Find companies by industry and location, verified and ranked.">
        <Link href="/scraper" className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <RefreshCw className={cn("h-4 w-4", status?.running && "animate-spin")} aria-hidden />
          {status?.running
            ? "Collecting companies now…"
            : status?.lastRun
              ? `Updated ${relativeTime(status.lastRun.finishedAt)}${status.scheduler.nextRunAt ? ` · next run ${relativeTime(status.scheduler.nextRunAt)}` : ""}`
              : "Scraper status"}
        </Link>
      </PageHeader>

      <Card className="mb-6 p-5 sm:p-7">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
          }}
        >
          <h2 className="text-xl font-bold tracking-tight">Search Criteria</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            {facets ? `${facets.total.toLocaleString()} companies in the database` : "Filter the company database"}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-medium">
              Industry
              <Select className="mt-1.5" value={draft.industry} onChange={(e) => set("industry", e.target.value)}>
                <option value="">All industries</option>
                {facets?.industries.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value} ({f.count})
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm font-medium">
              Company or keyword
              <Input className="mt-1.5" placeholder="Name, website, email or street" value={draft.q} onChange={(e) => set("q", e.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Location
              <Select className="mt-1.5" value={draft.city} onChange={(e) => set("city", e.target.value)}>
                <option value="">All locations</option>
                {facets?.cities.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value} ({f.count})
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Tier</span>
              <Select className="h-9 w-32" value={draft.tier} onChange={(e) => set("tier", e.target.value)}>
                <option value="">Any</option>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </Select>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.hasEmail} onChange={(e) => set("hasEmail", e.target.checked)} />
              Has email
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.hasWebsite} onChange={(e) => set("hasWebsite", e.target.checked)} />
              Has website
            </label>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => apply(EMPTY)} disabled={!filtered && JSON.stringify(draft) === JSON.stringify(EMPTY)}>
              Clear
            </Button>
            <Button type="submit">
              <Search className="h-4 w-4" aria-hidden /> Find Companies
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {result ? (
              <>
                <span className="font-semibold text-foreground">{result.total.toLocaleString()}</span> {result.total === 1 ? "company" : "companies"}
                {filtered && " match your filters"}
              </>
            ) : (
              "Loading companies…"
            )}
            {loading && result && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" aria-label="Updating" />}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Sort
              <Select className="h-9 w-40" value={applied.sort} onChange={(e) => apply({ ...applied, sort: e.target.value })}>
                <option value="score">Highest score</option>
                <option value="recent">Newest first</option>
                <option value="name">Name A–Z</option>
              </Select>
            </label>
            <a
              href={`/api/companies?${toParams(applied, 1)}&format=csv`}
              aria-disabled={!result?.total}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-muted px-3 text-xs font-medium hover:brightness-125",
                !result?.total && "pointer-events-none opacity-50",
              )}
            >
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </a>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-bad" aria-hidden />
            <p className="font-medium">Companies couldn&apos;t be loaded</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        ) : !result ? (
          <div className="space-y-px" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-[62px] animate-pulse border-b border-border bg-muted/40" />
            ))}
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            {filtered ? (
              <>
                <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="font-medium">No companies match these filters</p>
                <p className="text-sm text-muted-foreground">Try a broader industry or location, or clear the filters.</p>
                <Button variant="outline" onClick={() => apply(EMPTY)}>
                  Clear filters
                </Button>
              </>
            ) : status?.running ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
                <p className="font-medium">Collecting the first companies…</p>
                <p className="text-sm text-muted-foreground">This page fills in automatically. The first run usually takes a few minutes.</p>
              </>
            ) : (
              <>
                <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="font-medium">No companies collected yet</p>
                <p className="text-sm text-muted-foreground">Add an industry and location to track, and the scraper will fill this page.</p>
                <Link href="/scraper" className="bg-brand inline-flex h-11 items-center rounded-md px-5 text-sm font-medium">
                  Set up the scraper
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8" />
                  <th className="px-3 py-2.5 font-medium">Score</th>
                  <th className="px-3 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Location</th>
                  <th className="px-3 py-2.5 font-medium">Top reason</th>
                  <th className="px-3 py-2.5 font-medium">Checked</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((c) => {
                  const isOpen = open === c.id;
                  const top = c.reasons.find((r) => r.points > 0);
                  return (
                    <Fragment key={c.id}>
                      <tr className={cn("cursor-pointer border-t border-border align-top hover:bg-muted/40", isOpen && "bg-muted/40")} onClick={() => setOpen(isOpen ? null : c.id)}>
                        <td className="py-3.5 pl-3">
                          <button aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} details for ${c.name}`} className="rounded text-muted-foreground hover:text-foreground">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <ScoreBadge score={c.score} tier={c.tier} />
                        </td>
                        <td className="max-w-[280px] px-3 py-3">
                          <div className="truncate font-medium">{c.name}</div>
                          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            {c.domain && <StatusIcon tone={siteTone(c.site?.status ?? "unknown")} label={`Website ${c.site?.status ?? "not checked"}`} />}
                            <span className="truncate">{[c.domain, c.industry].filter(Boolean).join(" · ")}</span>
                          </div>
                        </td>
                        <td className="max-w-[240px] px-3 py-3">
                          {c.email ? (
                            <span className="flex items-center gap-1.5">
                              <StatusIcon tone={emailTone(c.emailStatus)} label={`Email ${c.emailStatus}`} />
                              <span className="truncate">{c.email}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums">{c.phone || <span className="text-muted-foreground">—</span>}</td>
                        <td className="whitespace-nowrap px-3 py-3">{[c.city, c.state].filter(Boolean).join(", ")}</td>
                        <td className="max-w-[260px] truncate px-3 py-3 text-muted-foreground">{top?.label ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground" title={new Date(c.lastSeen).toLocaleString()}>
                          {relativeTime(c.lastSeen)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-border bg-background/60">
                          <td colSpan={8} className="px-5 py-5 sm:px-11">
                            <CompanyDetail company={c} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {result && result.pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm">
            <span className="text-muted-foreground">
              Page {result.page} of {result.pages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= result.pages || loading} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Listings © OpenStreetMap contributors (ODbL). Contact details come from the listing or the company&apos;s own public website.
      </p>
    </>
  );
}

function CompanyDetail({ company: c }: { company: Company }) {
  const address = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.postcode].filter(Boolean).join(" · ");
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this score</h3>
        {c.reasons.length ? (
          <ul className="space-y-1.5 text-sm">
            {c.reasons.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className={cn("w-9 shrink-0 text-right font-semibold tabular-nums", r.points > 0 ? "text-hot" : "text-bad")}>
                  {r.points > 0 ? "+" : ""}
                  {r.points}
                </span>
                <span>
                  {r.label} <span className="text-xs text-muted-foreground">· {CATEGORY_LABELS[r.category]}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not enough public data to score this company yet.</p>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</h3>
        {c.website && (
          <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
            <Globe className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{c.domain}</span>
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-primary hover:underline">
            <Mail className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{c.email}</span>
          </a>
        )}
        {c.phone && (
          <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-primary hover:underline">
            <Phone className="h-4 w-4 shrink-0" aria-hidden /> {c.phone}
          </a>
        )}
        {address && (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> {address}
          </p>
        )}
        {!c.website && !c.email && !c.phone && !address && <p className="text-muted-foreground">No contact details published.</p>}
      </div>
      <div className="space-y-2 text-sm">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</h3>
        {c.site?.description && <p className="text-muted-foreground">{c.site.description}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {c.foundedYear && (
            <>
              <dt className="text-muted-foreground">Founded</dt>
              <dd>{c.foundedYear}</dd>
            </>
          )}
          {c.openingHours && (
            <>
              <dt className="text-muted-foreground">Hours</dt>
              <dd className="break-words">{c.openingHours}</dd>
            </>
          )}
          {c.socials.length > 0 && (
            <>
              <dt className="text-muted-foreground">Social</dt>
              <dd className="capitalize">{c.socials.join(", ")}</dd>
            </>
          )}
          <dt className="text-muted-foreground">First seen</dt>
          <dd>{new Date(c.firstSeen).toLocaleDateString()}</dd>
        </dl>
        <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          View source listing <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
