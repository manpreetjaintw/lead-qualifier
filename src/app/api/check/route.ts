import { NextResponse } from "next/server";
import { checkLead, type CheckRequest } from "@/lib/network";
import { mapLimit } from "@/lib/utils";
import { cacheStats } from "@/lib/cache";
import type { NetworkCheck } from "@/lib/types";

export const runtime = "nodejs"; // node:dns is not available on the Edge runtime
export const maxDuration = 30;

const MAX_BATCH = 100;
const CONCURRENCY = 8;

/** POST { leads: [{id, domain, emailDomain}], demo?: boolean } -> { results: {id: NetworkCheck} } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { leads?: CheckRequest[]; demo?: boolean } | null;
  if (!body?.leads || !Array.isArray(body.leads)) return NextResponse.json({ error: "Expected { leads: [...] }" }, { status: 400 });
  if (body.leads.length > MAX_BATCH) return NextResponse.json({ error: `Max ${MAX_BATCH} leads per batch` }, { status: 413 });

  const t0 = Date.now();
  const before = { ...cacheStats };
  const results: Record<string, NetworkCheck> = {};
  await mapLimit(body.leads, CONCURRENCY, async (l) => {
    results[l.id] = await checkLead({ id: String(l.id), domain: String(l.domain ?? ""), emailDomain: String(l.emailDomain ?? "") }, !!body.demo);
  });
  return NextResponse.json({
    results,
    meta: {
      ms: Date.now() - t0,
      cache: { l1: cacheStats.l1 - before.l1, l2: cacheStats.l2 - before.l2, miss: cacheStats.miss - before.miss },
    },
  });
}
