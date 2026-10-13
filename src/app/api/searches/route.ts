import { NextResponse } from "next/server";
import { addSearch, listSearches } from "@/lib/scraper/store";
import { INDUSTRIES, industryById } from "@/lib/scraper/industries";
import { geocode } from "@/lib/scraper/overpass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SEARCHES = 25;

export async function GET() {
  try {
    return NextResponse.json({ searches: await listSearches(), industries: INDUSTRIES.map(({ id, label }) => ({ id, label })) });
  } catch (e) {
    console.error("[api/searches]", e);
    return NextResponse.json({ error: "Could not load tracked searches" }, { status: 500 });
  }
}

/** POST { industry: "plumbing", location: "Austin, Texas" } -> the tracked search, picked up on the next run. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { industry?: unknown; location?: unknown } | null;
  const industry = typeof body?.industry === "string" ? body.industry : "";
  const location = typeof body?.location === "string" ? body.location.replace(/\s+/g, " ").trim() : "";
  if (!industryById(industry)) return NextResponse.json({ error: "Choose an industry from the list." }, { status: 400 });
  if (location.length < 2 || location.length > 80) return NextResponse.json({ error: "Enter a city or region, for example \"Austin, Texas\"." }, { status: 400 });

  try {
    const existing = await listSearches();
    if (existing.length >= MAX_SEARCHES) return NextResponse.json({ error: `You can track up to ${MAX_SEARCHES} searches. Remove one first.` }, { status: 409 });
    const place = await geocode(location);
    if (!place) return NextResponse.json({ error: `We couldn't find "${location}". Try adding the state or country.` }, { status: 422 });
    if (existing.some((s) => s.industry === industry && s.areaId === place.areaId)) return NextResponse.json({ error: "That search is already tracked." }, { status: 409 });
    return NextResponse.json({ search: await addSearch({ industry, location, ...place }) }, { status: 201 });
  } catch (e) {
    console.error("[api/searches]", e);
    return NextResponse.json({ error: "The location lookup is unavailable right now. Try again in a minute." }, { status: 502 });
  }
}
