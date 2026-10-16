import { NextResponse } from "next/server";
import { clearGDPPageCookies } from "../../../../lib/server/gdp-session-cookies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return clearGDPPageCookies(NextResponse.json({ ok: true }));
}
