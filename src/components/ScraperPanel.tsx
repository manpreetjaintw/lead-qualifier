"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Play, Plus, Trash2, XCircle } from "lucide-react";
import type { ScrapeRun, Search } from "@/lib/scraper/types";
import { api, describeRunError, relativeTime, type ScraperStatus } from "@/lib/client";
import { cn } from "@/lib/utils";
import { PageHeader } from "./AppShell";
import { Button, Card, Input, Select } from "./ui";

interface SearchList {
  searches: Search[];
  industries: { id: string; label: string }[];
}

const RUN_STYLE: Record<ScrapeRun["status"], { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  running: { label: "Running", cls: "text-primary", icon: Loader2 },
  success: { label: "Completed", cls: "text-hot", icon: CheckCircle2 },
  partial: { label: "Partly completed", cls: "text-warm", icon: AlertCircle },
  failed: { label: "Failed", cls: "text-bad", icon: XCircle },
};

const duration = (r: ScrapeRun) => {
  if (!r.finishedAt) return "—";
  const s = Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export function ScraperPanel() {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [list, setList] = useState<SearchList | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState<"add" | "run" | string | null>(null);
  const [, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api<ScraperStatus>("/api/scraper/status"), api<SearchList>("/api/searches")]);
      setStatus(s);
      setList(l);
      setLoadError(undefined);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  // Poll faster while a run is in progress so counts tick up live.
  const running = status?.running ?? false;
  useEffect(() => {
    load();
    const t = setInterval(() => {
      load();
      setNow(Date.now());
    }, running ? 4000 : 15_000);
    return () => clearInterval(t);
  }, [load, running]);

  async function runNow() {
    setBusy("run");
    try {
      await api("/api/scraper/run", { method: "POST" });
      await load();
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setBusy("add");
    try {
      await api("/api/searches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ industry, location }) });
      setLocation("");
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: Search) {
    setBusy(s.id);
    try {
      await api(`/api/searches/${s.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const label = (id: string) => list?.industries.find((i) => i.id === id)?.label ?? id;
  const last = status?.lastRun;

  return (
    <>
      <PageHeader title="Scraper" subtitle="Choose what to collect. Every tracked search is refreshed automatically.">
        <Button onClick={runNow} disabled={running || busy === "run" || !list?.searches.length}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {running ? "Running…" : "Run now"}
        </Button>
      </PageHeader>

      {loadError && (
        <Card className="mb-6 flex items-center gap-3 border-bad/40 p-4 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-bad" aria-hidden />
          <span className="flex-1">{loadError}</span>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Status" value={!status ? "…" : running ? "Running" : status.scheduler.enabled ? "Scheduled" : "Manual only"} hint={status ? (status.scheduler.enabled ? `Every ${status.scheduler.intervalMinutes} minutes` : "Automatic runs are switched off") : ""} tone={running ? "text-primary" : undefined} />
        <Stat label="Next run" value={!status ? "…" : running ? "In progress" : status.scheduler.nextRunAt ? relativeTime(status.scheduler.nextRunAt) : "Not scheduled"} hint={status?.scheduler.nextRunAt ? new Date(status.scheduler.nextRunAt).toLocaleTimeString() : ""} />
        <Stat label="Last run" value={!status ? "…" : last ? relativeTime(last.finishedAt) : "Never"} hint={last ? `${last.found.toLocaleString()} found · ${last.added.toLocaleString()} new` : "No completed runs yet"} />
        <Stat label="Companies" value={status ? status.totals.companies.toLocaleString() : "…"} hint={status ? `${status.totals.withEmail.toLocaleString()} with email · ${status.totals.hot.toLocaleString()} hot` : ""} />
      </div>

      <Card className="mb-6 p-5 sm:p-7">
        <h2 className="text-xl font-bold tracking-tight">Tracked searches</h2>
        <p className="mb-5 text-sm text-muted-foreground">Each search collects every listed business in that industry and place, then verifies and scores it.</p>
        <form onSubmit={add} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block text-sm font-medium">
            Industry
            <Select className="mt-1.5" value={industry} onChange={(e) => setIndustry(e.target.value)} required>
              <option value="" disabled>
                Select an industry
              </option>
              {list?.industries.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium">
            Location
            <Input className="mt-1.5" placeholder="City and state, e.g. Austin, Texas" value={location} onChange={(e) => setLocation(e.target.value)} required minLength={2} maxLength={80} />
          </label>
          <Button type="submit" disabled={busy === "add"}>
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Track search
          </Button>
        </form>
        {formError && (
          <p className="mt-3 text-sm text-bad" role="alert">
            {formError}
          </p>
        )}

        <div className="mt-6 overflow-x-auto rounded-md border border-border">
          {!list ? (
            <div className="h-24 animate-pulse bg-muted/40" aria-hidden />
          ) : !list.searches.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing is tracked yet. Add an industry and location above to start collecting companies.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Industry</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 text-right font-medium">Companies</th>
                  <th className="px-4 py-2.5 font-medium">Last collected</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {list.searches.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{label(s.industry)}</td>
                    <td className="px-4 py-3" title={s.displayName}>
                      {[s.city, s.state].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.lastCount?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-3">
                      {s.lastError ? (
                        <span className="flex items-center gap-1.5 text-warm" title={describeRunError(s.lastError)}>
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Not updated {relativeTime(s.lastRunAt)} · retrying next run
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{s.lastRunAt ? relativeTime(s.lastRunAt) : "Waiting for next run"}</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button onClick={() => remove(s)} disabled={busy === s.id} aria-label={`Stop tracking ${label(s.industry)} in ${s.city}`} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-bad disabled:opacity-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Removing a search stops future updates. Companies already collected stay in the database.</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4 sm:px-7">
          <h2 className="text-xl font-bold tracking-tight">Run history</h2>
        </div>
        {!status ? (
          <div className="h-32 animate-pulse bg-muted/40" aria-hidden />
        ) : !status.runs.length ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No runs yet. The first one starts shortly after the app does.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium sm:pl-7">Started</th>
                  <th className="px-4 py-2.5 font-medium">Result</th>
                  <th className="px-4 py-2.5 font-medium">Trigger</th>
                  <th className="px-4 py-2.5 text-right font-medium">Found</th>
                  <th className="px-4 py-2.5 text-right font-medium">New</th>
                  <th className="px-4 py-2.5 text-right font-medium">Refreshed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {status.runs.map((r) => {
                  const style = RUN_STYLE[r.status];
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-5 py-3 sm:pl-7" title={new Date(r.startedAt).toLocaleString()}>
                        {relativeTime(r.startedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("flex items-center gap-1.5 font-medium", style.cls)}>
                          <style.icon className={cn("h-4 w-4 shrink-0", r.status === "running" && "animate-spin")} aria-hidden /> {style.label}
                        </span>
                        {r.errors.map((e, i) => (
                          <p key={i} className="mt-1 max-w-xl text-xs text-muted-foreground" title={e}>
                            {describeRunError(e)}
                          </p>
                        ))}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{r.trigger}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.found.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.added.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.refreshed.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">{duration(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", tone)}>{value}</p>
      <p className="mt-0.5 min-h-[1.25rem] text-sm text-muted-foreground">{hint}</p>
    </Card>
  );
}
