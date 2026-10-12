"use client";
import { ArrowLeft, ArrowRight, CheckCircle2, Target, TrendingUp } from "lucide-react";
import { Button, Card, Select } from "./ui";
import { FIELD_LABELS } from "@/lib/mapping";
import { FIELDS, type ColumnMapping, type Field, type RawRow } from "@/lib/types";
import { PRESETS, type PresetId } from "@/lib/pipeline/score";
import { cn } from "@/lib/utils";

const KEY_FIELDS: Field[] = ["company", "website", "email", "phone"];
const PRESET_ICON = { eta: Target, b2b: TrendingUp } as const;

export function MapStep({
  fileName,
  headers,
  rows,
  mapping,
  setMapping,
  preset,
  setPreset,
  onBack,
  onRun,
}: {
  fileName: string;
  headers: string[];
  rows: RawRow[];
  mapping: ColumnMapping;
  setMapping: (m: ColumnMapping) => void;
  preset: PresetId;
  setPreset: (p: PresetId) => void;
  onBack: () => void;
  onRun: () => void;
}) {
  const mapped = FIELDS.filter((f) => mapping[f]).length;
  const canRun = !!(mapping.company || mapping.email || mapping.website);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Check the columns, then pick your goal</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{fileName}</span> · {rows.length} rows · we matched {mapped} of {FIELDS.length} fields automatically
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Column mapping</h3>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f} className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5">
                  {mapping[f] ? <CheckCircle2 className="h-3.5 w-3.5 text-hot" /> : <span className="h-3.5 w-3.5 rounded-full border border-border" />}
                  {FIELD_LABELS[f]}
                  {KEY_FIELDS.includes(f) && <span className="text-primary">*</span>}
                </span>
                <Select value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value || undefined })}>
                  <option value="">Not in file</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">* Fields used for duplicate detection and verification.</p>

          <div className="mt-5 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  {KEY_FIELDS.map((f) => (
                    <th key={f} className="px-3 py-2 font-medium">
                      {FIELD_LABELS[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {KEY_FIELDS.map((f) => (
                      <td key={f} className="max-w-[150px] truncate px-3 py-2">
                        {mapping[f] ? r[mapping[f]!] : <span className="text-muted-foreground">n/a</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">What are these leads for?</h3>
          {Object.values(PRESETS).map((p) => {
            const Icon = PRESET_ICON[p.id];
            return (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={cn(
                  "w-full rounded-lg border-2 bg-card p-4 text-left transition-colors",
                  preset === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                )}
                aria-pressed={preset === p.id}
              >
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <Icon className="h-4 w-4 text-primary" /> {p.name}
                </div>
                <p className="text-sm text-muted-foreground">{p.blurb}</p>
              </button>
            );
          })}
          <p className="text-xs text-muted-foreground">You can switch goals and fine-tune weights on the results screen.</p>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button size="lg" onClick={onRun} disabled={!canRun}>
          Qualify {rows.length} rows <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
