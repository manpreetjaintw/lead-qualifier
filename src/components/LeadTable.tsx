"use client";
import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Crown, Globe, Layers } from "lucide-react";
import type { ScoredLead } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/pipeline/score";
import { DECISION_MAKER } from "@/lib/pipeline/lists";
import { cn } from "@/lib/utils";
import { Badge } from "./ui";
import { ScoreBadge } from "./ScoreBadge";
import { StatusIcon, emailTone, phoneTone, siteTone } from "./StatusPill";

type SortKey = "score" | "company" | "employees" | "revenue";

export function LeadTable({ leads }: { leads: ScoredLead[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });

  const sorted = [...leads].sort((a, b) => {
    const va = a[sort.key] ?? -Infinity, vb = b[sort.key] ?? -Infinity;
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
  });

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={cn("px-3 py-2.5 font-medium", cls)}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "company" ? 1 : -1 }))}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  if (!leads.length) return <p className="p-10 text-center text-sm text-muted-foreground">No leads match these filters.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
          <tr>
            <th className="w-8" />
            {th("score", "Score")}
            {th("company", "Company")}
            <th className="px-3 py-2.5 font-medium">Contact</th>
            <th className="px-3 py-2.5 font-medium">Email</th>
            <th className="px-3 py-2.5 font-medium">Phone</th>
            {th("employees", "Size", "text-right")}
            {th("revenue", "Revenue", "text-right")}
            <th className="px-3 py-2.5 font-medium">Top reason</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => {
            const isOpen = open === l.id;
            const top = l.reasons.find((r) => r.points > 0);
            return (
              <Fragment key={l.id}>
                <tr
                  className={cn("cursor-pointer border-t border-border align-top hover:bg-muted/50", isOpen && "bg-muted/50")}
                  onClick={() => setOpen(isOpen ? null : l.id)}
                  aria-expanded={isOpen}
                >
                  <td className="py-3 pl-3 text-muted-foreground">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                  <td className="px-3 py-3">
                    <ScoreBadge score={l.score} tier={l.tier} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{l.company || <span className="text-muted-foreground">Unknown company</span>}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {l.domain && (
                        <span className="inline-flex items-center gap-1">
                          <StatusIcon tone={siteTone(l.checks.website.status)} label={`Website ${l.checks.website.status}`} />
                          {l.domain}
                        </span>
                      )}
                      {l.industry && <span>· {l.industry}</span>}
                      {l.rowIds.length > 1 && (
                        <Badge className="bg-primary/10 text-primary" title={`Merged from ${l.rowIds.length} rows: ${l.sources.join(", ")}`}>
                          <Layers className="h-3 w-3" /> {l.rowIds.length} merged
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      {l.contactName || <span className="text-muted-foreground">n/a</span>}
                      {DECISION_MAKER.test(l.title) && <Crown className="h-3.5 w-3.5 text-warm" aria-label="Decision maker" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{l.title}</div>
                  </td>
                  <td className="max-w-[230px] px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon tone={emailTone(l.checks.email.status)} label={`Email ${l.checks.email.status}`} />
                      <span className={cn("truncate", l.checks.email.status === "invalid" && "text-muted-foreground line-through")}>{l.email || "n/a"}</span>
                    </div>
                    {l.checks.email.notes[0] && l.checks.email.status !== "valid" && (
                      <div className="truncate pl-5 text-xs text-muted-foreground">{l.checks.email.notes[0]}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon tone={phoneTone(l.checks.phone.status)} label={`Phone ${l.checks.phone.status}`} />
                      <span className="tabular-nums">{l.checks.phone.e164 ? formatPhone(l.checks.phone.e164) : l.phone || "n/a"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{l.employees ?? "n/a"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{l.revenue != null ? money(l.revenue) : "n/a"}</td>
                  <td className="min-w-[180px] max-w-[260px] px-3 py-3 text-xs text-muted-foreground">{top?.label}</td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-border bg-muted/30">
                    <td />
                    <td colSpan={8} className="px-3 py-4">
                      <LeadDetail lead={l} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeadDetail({ lead }: { lead: ScoredLead }) {
  const cats = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];
  const w = lead.checks.website;
  return (
    <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this score</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {cats.map((c) => {
            const items = lead.reasons.filter((r) => r.category === c);
            if (!items.length) return null;
            const total = items.reduce((s, r) => s + r.points, 0);
            return (
              <div key={c} className="rounded-md border border-border bg-card p-3">
                <div className="mb-1.5 flex justify-between text-xs font-medium">
                  <span>{CATEGORY_LABELS[c]}</span>
                  <span className={total >= 0 ? "text-hot" : "text-bad"}>
                    {total > 0 ? "+" : ""}
                    {total}
                  </span>
                </div>
                <ul className="space-y-1 text-xs">
                  {items.map((r) => (
                    <li key={r.label} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className={cn("shrink-0 tabular-nums font-medium", r.points >= 0 ? "text-hot" : "text-bad")}>
                        {r.points > 0 ? "+" : ""}
                        {r.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-3 text-xs">
        <h4 className="font-semibold uppercase tracking-wide text-muted-foreground">Enrichment</h4>
        {w.title ? (
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 font-medium">
              <Globe className="h-3.5 w-3.5" /> {w.title}
            </div>
            {w.description && <p className="mt-1 text-muted-foreground">{w.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {w.copyrightYear && <Badge className="bg-muted">© {w.copyrightYear}</Badge>}
              {w.sinceYear && <Badge className="bg-muted">Since {w.sinceYear}</Badge>}
              {w.hiring && <Badge className="bg-hot-bg text-hot">Hiring</Badge>}
              {w.socials.map((s) => (
                <Badge key={s} className="bg-muted capitalize">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Website {w.status === "unknown" ? "could not be checked" : w.status}.</p>
        )}
        {lead.checks.email.suggestion && (
          <p>
            Suggested fix: <span className="font-medium">{lead.checks.email.suggestion}</span>
          </p>
        )}
        {lead.rowIds.length > 1 && (
          <p className="text-muted-foreground">
            Merged {lead.rowIds.length} records (rows {lead.rowIds.map((r) => r + 2).join(", ")}) from {lead.sources.join(", ") || "your file"}.
          </p>
        )}
        {lead.checks.simulated && <p className="italic text-muted-foreground">Network checks simulated for the demo dataset.</p>}
      </div>
    </div>
  );
}

export function money(n: number) {
  return n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
}

function formatPhone(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
