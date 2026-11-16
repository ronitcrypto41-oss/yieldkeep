import { NextRequest, NextResponse } from "next/server";
import { getIndex } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = (req.nextUrl.searchParams.get("user") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(user)) {
    return NextResponse.json({ error: "user address required" }, { status: 400 });
  }
  try {
    const idx = await getIndex();
    return NextResponse.json(
      { lastBlock: idx.lastBlock, fees: idx.fees.filter((f) => f.user === user) },
      { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" } }
    );
  } catch (e) {
    console.error("[api/fees]", e);
    return NextResponse.json({ error: "The server could not read the chain. Try again in a minute." }, { status: 502 });
  }
}