import { NextRequest, NextResponse } from "next/server";
import { chain, getAdminStats } from "@/lib/server/admin-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOGIN_MAX_AGE = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  const admin = (process.env.ADMIN_WALLET || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(admin)) {
    return NextResponse.json({ error: "ADMIN_WALLET is not set on the server" }, { status: 500 });
  }
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";

  const m = /^YieldKeep admin login\nIssued: (\d+)$/.exec(message);
  if (!m || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: "Bad login" }, { status: 400 });
  }
  const age = Date.now() - Number(m[1]);
  if (age < -60_000 || age > LOGIN_MAX_AGE) {
    return NextResponse.json({ error: "Login expired. Sign in again." }, { status: 401 });
  }

  let ok = false;
  try {
    ok = await chain.verifyMessage({ address: admin as `0x${string}`, message, signature: signature as `0x${string}` });
  } catch {
    ok = false;
  }
  if (!ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  try {
    const stats = await getAdminStats();
    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/admin/stats]", e);
    return NextResponse.json({ error: "The server could not read the chain. Try again in a minute." }, { status: 502 });
  }
}