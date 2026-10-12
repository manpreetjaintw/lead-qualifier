import type { ColumnMapping, Lead, NetworkCheck, RawRow, RunStats, ScoredLead } from "../types";
import { normalizeRows } from "./normalize";
import { dedupe } from "./dedupe";
import { combineChecks } from "./validate";
import { PRESETS, scoreLead, type Preset } from "./score";

export { PRESETS };

/** Offline half of the pipeline: normalize + dedupe. Cheap, runs in the browser. */
export function prepare(rows: RawRow[], mapping: ColumnMapping): Lead[] {
  return dedupe(normalizeRows(rows, mapping));
}

export function emailDomain(lead: Lead): string {
  const d = lead.email.split("@")[1] ?? "";
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : "";
}

export function scoreAll(leads: Lead[], net: Record<string, NetworkCheck>, preset: Preset, weights = preset.weights): ScoredLead[] {
  return leads.map((l) => scoreLead(l, combineChecks(l, net[l.id]), preset, weights)).sort((a, b) => b.score - a.score);
}

export function computeStats(rowsIn: number, leads: ScoredLead[]): RunStats {
  const count = (f: (l: ScoredLead) => boolean) => leads.filter(f).length;
  return {
    rowsIn,
    leadsOut: leads.length,
    duplicatesMerged: leads.reduce((s, l) => s + l.rowIds.length - 1, 0),
    invalidEmails: count((l) => l.checks.email.status === "invalid"),
    riskyEmails: count((l) => l.checks.email.status === "risky"),
    roleEmails: count((l) => l.checks.email.kind === "role"),
    deadWebsites: count((l) => l.checks.website.status === "dead"),
    invalidPhones: count((l) => l.checks.phone.status === "invalid"),
    hot: count((l) => l.tier === "hot"),
    warm: count((l) => l.tier === "warm"),
    cold: count((l) => l.tier === "cold"),
  };
}
