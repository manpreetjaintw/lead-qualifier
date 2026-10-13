import { NextResponse } from "next/server";
import { deleteSearch } from "@/lib/scraper/store";

export const runtime = "nodejs";

/** Stop tracking a search. Companies already collected stay in the database. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    return (await deleteSearch(params.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Search not found" }, { status: 404 });
  } catch (e) {
    console.error("[api/searches/:id]", e);
    return NextResponse.json({ error: "Could not remove the search" }, { status: 500 });
  }
}
