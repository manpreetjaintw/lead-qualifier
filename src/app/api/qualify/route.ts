import { NextResponse } from "next/server";
import { guessMapping } from "@/lib/mapping";
import { prepare, scoreAll, computeStats, emailDomain, PRESETS } from "@/lib/pipeline";
import { checkLead } from "@/lib/network";
import { mapLimit } from "@/lib/utils";
import type { ColumnMapping, NetworkCheck, RawRow } from "@/lib/types";
import type { PresetId } from "@/lib/pipeline/score";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_ROWS = 500;

/**
 * One-shot API for integrations (CRMs, notebooks, Zapier):
 * POST { rows: [{...csv columns}], preset?: "eta" | "b2b", mapping?: {...}, network?: boolean }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { rows?: RawRow[]; preset?: PresetId; mapping?: ColumnMapping; network?: boolean; demo?: boolean } | null;
  if (!body?.rows?.length) return NextResponse.json({ error: "Expected { rows: [...] }" }, { status: 400 });
  if (body.rows.length > MAX_ROWS) return NextResponse.json({ error: `Max ${MAX_ROWS} rows per request; batch larger files` }, { status: 413 });

  const t0 = Date.now();
  const mapping = body.mapping ?? guessMapping(Object.keys(body.rows[0]));
  const preset = PRESETS[body.preset ?? "eta"] ?? PRESETS.eta;
  const leads = prepare(body.rows, mapping);

  const net: Record<string, NetworkCheck> = {};
  if (body.network !== false) {
    await mapLimit(leads, 8, async (l) => {
      net[l.id] = await checkLead({ id: l.id, domain: l.domain, emailDomain: emailDomain(l) }, !!body.demo);
    });
  }
  const scored = scoreAll(leads, net, preset);
  return NextResponse.json({ mapping, preset: preset.id, stats: computeStats(body.rows.length, scored), leads: scored, ms: Date.now() - t0 });
}
