"use client";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import type { Category, ColumnMapping, Lead, NetworkCheck, RawRow, ScoredLead } from "@/lib/types";
import type { RunSummary } from "@/lib/db/types";
import { guessMapping } from "@/lib/mapping";
import { prepare, scoreAll, computeStats, emailDomain } from "@/lib/pipeline";
import { PRESETS, type PresetId } from "@/lib/pipeline/score";
import { SAMPLE_CSV_URL } from "@/lib/sample";
import { AppShell } from "./AppShell";
import { Stepper } from "./Stepper";
import { UploadStep } from "./UploadStep";
import { MapStep } from "./MapStep";
import { Processing } from "./Processing";
import { ReviewStep } from "./ReviewStep";

const BATCH = 50;
const MAX_ROWS = 10_000;

type Phase = "upload" | "map" | "processing" | "review";

export function LeadQualifier() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [error, setError] = useState<string>();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [demo, setDemo] = useState(false);
  const [preset, setPresetState] = useState<PresetId>("eta");
  const [weights, setWeights] = useState(PRESETS.eta.weights);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [net, setNet] = useState<Record<string, NetworkCheck>>({});
  const [progress, setProgress] = useState({ stage: "", done: 0, total: 0 });
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [savedId, setSavedId] = useState<string>();

  useEffect(() => {
    fetch("/api/runs").then((r) => r.json()).then((d) => setRuns(d.runs ?? [])).catch(() => {});
  }, [savedId]);

  const setPreset = (p: PresetId) => {
    setPresetState(p);
    setWeights(PRESETS[p].weights);
  };

  // Scoring is pure and runs client-side, so preset and slider changes re-rank instantly.
  const scored = useMemo(
    () => scoreAll(leads, net, PRESETS[preset], weights),
    [leads, net, preset, weights],
  );

  function ingest(name: string, text: string, isDemo: boolean) {
    const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    const data = parsed.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim()));
    if (!parsed.meta.fields?.length || !data.length) return setError("That file has no rows we could read. Is it a CSV with a header row?");
    if (data.length > MAX_ROWS) return setError(`Please split files over ${MAX_ROWS.toLocaleString()} rows.`);
    setError(undefined);
    setFileName(name);
    setHeaders(parsed.meta.fields);
    setRows(data);
    setMapping(guessMapping(parsed.meta.fields));
    setDemo(isDemo);
    setSavedId(undefined);
    setPhase("map");
  }

  async function run() {
    setPhase("processing");
    setProgress({ stage: "Cleaning data and merging duplicates…", done: 0, total: 0 });
    await new Promise((r) => setTimeout(r, 30)); // let the progress UI paint
    const prepared = prepare(rows, mapping);
    setLeads(prepared);

    const results: Record<string, NetworkCheck> = {};
    setProgress({ stage: "Verifying email servers and websites…", done: 0, total: prepared.length });
    for (let i = 0; i < prepared.length; i += BATCH) {
      const batch = prepared.slice(i, i + BATCH).map((l) => ({ id: l.id, domain: l.domain, emailDomain: emailDomain(l) }));
      try {
        const res = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leads: batch, demo }) });
        if (res.ok) Object.assign(results, (await res.json()).results);
      } catch {
        // Network checks are an enhancement: on failure the leads are still scored on offline checks.
      }
      setProgress({ stage: "Verifying email servers and websites…", done: Math.min(i + BATCH, prepared.length), total: prepared.length });
    }
    setNet(results);
    setPhase("review");
  }

  async function save() {
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: fileName, preset, stats: computeStats(rows.length, scored), leads: scored }),
    });
    if (res.ok) setSavedId((await res.json()).id);
  }

  async function openRun(id: string) {
    const res = await fetch(`/api/runs/${id}`);
    if (!res.ok) return;
    const r = await res.json();
    setFileName(r.name);
    setRows(new Array(r.stats.rowsIn).fill({}));
    setPresetState(r.preset);
    // Rebuild the pipeline state from the saved checks so presets and sliders still work.
    const saved = r.leads as ScoredLead[];
    setLeads(saved);
    setNet(Object.fromEntries(saved.map((l) => [l.id, { mx: l.checks.email.mx, website: l.checks.website, simulated: l.checks.simulated }])));
    setWeights(PRESETS[r.preset as PresetId]?.weights ?? PRESETS.eta.weights);
    setSavedId(r.id);
    setDemo(r.leads.some((l: ScoredLead) => l.checks.simulated));
    setPhase("review");
  }

  const step = phase === "upload" ? 0 : phase === "map" ? 1 : 2;

  return (
    <AppShell>
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Lead Qualifier</h1>
            <p className="text-sm text-muted-foreground">Dedupe, verify and rank leads before you spend a credit.</p>
          </div>
          <Stepper current={step} />
        </div>
      </header>
      <div className="p-6">
        {phase === "upload" && (
          <UploadStep
            error={error}
            runs={runs}
            onOpenRun={openRun}
            onFile={(f) => f.text().then((t) => ingest(f.name, t, false))}
            onSample={() => fetch(SAMPLE_CSV_URL).then((r) => r.text()).then((t) => ingest("sample-leads.csv", t, true))}
          />
        )}
        {phase === "map" && (
          <MapStep
            fileName={fileName}
            headers={headers}
            rows={rows}
            mapping={mapping}
            setMapping={setMapping}
            preset={preset}
            setPreset={setPreset}
            onBack={() => setPhase("upload")}
            onRun={run}
          />
        )}
        {phase === "processing" && <Processing {...progress} />}
        {phase === "review" && (
          <ReviewStep
            leads={scored}
            rowsIn={rows.length}
            fileName={fileName}
            preset={preset}
            setPreset={setPreset}
            weights={weights}
            setWeights={setWeights}
            onRestart={() => setPhase("upload")}
            onSave={save}
            savedId={savedId}
            simulated={demo}
          />
        )}
      </div>
    </AppShell>
  );
}
