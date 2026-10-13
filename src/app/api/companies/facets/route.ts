import { NextResponse } from "next/server";
import { companyFacets } from "@/lib/scraper/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Totals plus the industries and cities present in the database, with counts. */
export async function GET() {
  try {
    return NextResponse.json(await companyFacets());
  } catch (e) {
    console.error("[api/companies/facets]", e);
    return NextResponse.json({ error: "Could not load filters" }, { status: 500 });
  }
}
