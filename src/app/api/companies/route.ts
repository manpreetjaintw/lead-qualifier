import { NextResponse } from "next/server";
import Papa from "papaparse";
import { listCompanies } from "@/lib/scraper/store";
import { EXPORT_LIMIT, parseCompanyQuery } from "@/lib/scraper/query";
import type { Company } from "@/lib/scraper/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reasonsText = (c: Company) => c.reasons.map((r) => `${r.points > 0 ? "+" : ""}${r.points} ${r.label}`).join("; ");

function toCsv(companies: Company[]): string {
  return Papa.unparse(
    companies.map((c) => ({
      Score: c.score,
      Tier: c.tier,
      Company: c.name,
      Industry: c.industry,
      Website: c.website || c.domain,
      Email: c.email,
      "Email Status": c.emailStatus,
      Phone: c.phone,
      Address: c.address,
      City: c.city,
      State: c.state,
      Postcode: c.postcode,
      Country: c.country,
      Founded: c.foundedYear ?? "",
      "Website Status": c.site?.status ?? "",
      "Why This Score": reasonsText(c),
      Source: c.sourceUrl,
      "First Seen": c.firstSeen,
      "Last Checked": c.lastSeen,
    })),
  );
}

/**
 * GET /api/companies?q=&industry=&city=&tier=&minScore=&hasEmail=1&hasWebsite=1&sort=score|name|recent&page=1&limit=25
 * Add format=csv to download every match (up to 5,000 rows) instead of one JSON page.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const query = parseCompanyQuery(params);
  try {
    if (params.get("format") === "csv") {
      const { data } = await listCompanies({ ...query, page: 1, limit: EXPORT_LIMIT });
      return new Response(toCsv(data), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="companies-${new Date().toISOString().slice(0, 10)}.csv"` },
      });
    }
    const { data, total } = await listCompanies(query);
    return NextResponse.json({ data, total, page: query.page, limit: query.limit, pages: Math.max(1, Math.ceil(total / query.limit)) });
  } catch (e) {
    console.error("[api/companies]", e);
    return NextResponse.json({ error: "Could not load companies" }, { status: 500 });
  }
}
