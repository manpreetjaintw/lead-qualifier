"use client";
import { useMemo, useState } from "react";
import { Copy, Download, MailX, RotateCcw, Save, Search, SlidersHorizontal, Flame, Users, Wallet, Check } from "lucide-react";
import type { Category, ScoredLead, Tier } from "@/lib/types";
import { CATEGORY_LABELS, PRESETS, type PresetId } from "@/lib/pipeline/score";
import { computeStats } from "@/lib/pipeline";
import { download, toCleanCsv, toHubspotCsv } from "@/lib/export";
import { cn } from "@/lib/utils";
import { Button, Card, Input } from "./ui";
import { LeadTable } from "./LeadTable";
import { TIER_META } from "./ScoreBadge";

export function ReviewStep({
  leads,
  rowsIn,
  fileName,
  preset,
  setPreset,
  weights,
  setWeights,
  onRestart,
  onSave,
  savedId,
  simulated,
}: {
  leads: ScoredLead[];
  rowsIn: number;
  fileName: string;
  preset: PresetId;
  setPreset: (p: PresetId) => void;
  weights: Record<Category, number>;
  setWeights: (w: Record<Category, number>) => void;
  onRestart: () => void;
  onSave: () => Promise<void>;
  savedId?: string;
  simulated: boolean;
}) {
  const [tier, setTier] = useState<Tier | "all">("all");
  const [q, setQ] = useState("");
  const [reachable, setReachable] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => computeStats(rowsIn, leads), [rowsIn, leads]);
  const creditsSaved = stats.duplicatesMerged + leads.filter((l) => l.tier === "cold").length;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter(
      (l) =>
        (tier === "all" || l.tier === tier) &&
        (!reachable || l.checks.email.status === "valid" || l.checks.phone.status === "valid") &&
        (!needle || [l.company, l.contactName, l.email, l.industry, l.city, l.domain].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [leads, tier, q, reachable]);

  const base = fileName.replace(/\.csv$/i, "");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Users} label="Unique leads" value={stats.leadsOut} sub={`from ${stats.rowsIn} rows · ${stats.duplicatesMerged} duplicates merged`} />
        <Stat icon={Flame} label="Hot leads" value={stats.hot} sub={`${stats.warm} warm · ${stats.cold} cold`} tone="hot" />
        <Stat icon={MailX} label="Bad contact data caught" value={stats.invalidEmails + stats.invalidPhones} sub={`${plural(stats.invalidEmails, "email")} · ${plural(stats.invalidPhones, "phone")} · ${plural(stats.roleEmails, "generic inbox", "generic inboxes")}`} tone="bad" />
        <Stat icon={Wallet} label="Credits you can skip" value={creditsSaved} sub="duplicates + cold leads not worth enriching" tone="primary" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Filter by tier">
            {(["all", "hot", "warm", "cold"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tier === t}
                onClick={() => setTier(t)}
                className={cn("rounded px-3 py-1 text-xs font-medium capitalize", tier === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                {t === "all" ? `All ${stats.leadsOut}` : `${TIER_META[t].label} ${stats[t]}`}
              </button>
            ))}
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, contact, industry, city" className="pl-8" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={reachable} onChange={(e) => setReachable(e.target.checked)} className="accent-primary" />
            Reachable only
          </label>
          <Button variant={tuning ? "primary" : "outline"} size="sm" onClick={() => setTuning(!tuning)}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Tune scoring
          </Button>
        </div>

        {tuning && (
          <div className="grid gap-5 border-b border-border bg-muted/30 p-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goal</div>
              {Object.values(PRESETS).map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="preset" checked={preset === p.id} onChange={() => setPreset(p.id)} className="accent-primary" />
                  {p.name}
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                <label key={c} className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span>{CATEGORY_LABELS[c]}</span>
                    <span className="tabular-nums text-muted-foreground">{weights[c].toFixed(1)}×</span>
                  </div>
                  <input type="range" min={0} max={2} step={0.1} value={weights[c]} onChange={(e) => setWeights({ ...weights, [c]: +e.target.value })} />
                </label>
              ))}
              <button className="justify-self-start text-xs text-primary hover:underline" onClick={() => setWeights(PRESETS[preset].weights)}>
                Reset to {PRESETS[preset].name} defaults
              </button>
            </div>
          </div>
        )}

        <LeadTable leads={visible} />
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <span className="font-medium">Export {visible.length} leads</span>
          <span className="text-muted-foreground"> · current filters apply · sorted by score</span>
          {simulated && <span className="ml-2 text-xs italic text-muted-foreground">(demo data: network checks simulated)</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onRestart}>
            <RotateCcw className="h-3.5 w-3.5" /> New list
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={saving || !!savedId}
            onClick={async () => {
              setSaving(true);
              await onSave().finally(() => setSaving(false));
            }}
          >
            {savedId ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />} {savedId ? "Saved" : saving ? "Saving…" : "Save list"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(visible.map((l) => l.email).filter(Boolean).join(", "))}>
            <Copy className="h-3.5 w-3.5" /> Copy emails
          </Button>
          <Button variant="outline" size="sm" onClick={() => download(`${base}-qualified.csv`, toCleanCsv(visible))}>
            <Download className="h-3.5 w-3.5" /> Clean CSV
          </Button>
          <Button size="sm" onClick={() => download(`${base}-hubspot.csv`, toHubspotCsv(visible))}>
            <Download className="h-3.5 w-3.5" /> HubSpot import
          </Button>
        </div>
      </Card>
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: typeof Users; label: string; value: number; sub: string; tone?: "hot" | "bad" | "primary" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn("h-4 w-4", tone === "hot" && "text-hot", tone === "bad" && "text-bad", tone === "primary" && "text-primary")} />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}
