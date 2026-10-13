import { NextResponse } from "next/server";
import { getCompany } from "@/lib/scraper/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const company = await getCompany(params.id);
    return company ? NextResponse.json(company) : NextResponse.json({ error: "Company not found" }, { status: 404 });
  } catch (e) {
    console.error("[api/companies/:id]", e);
    return NextResponse.json({ error: "Could not load company" }, { status: 500 });
  }
}
