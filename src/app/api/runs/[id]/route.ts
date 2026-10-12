import { NextResponse } from "next/server";
import { getRun } from "@/lib/db/index";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const run = await getRun(params.id);
  return run ? NextResponse.json(run) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
