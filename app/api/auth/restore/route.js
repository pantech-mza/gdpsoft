import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import {
  GDP_REFRESH_COOKIE,
  setGDPPageCookies,
  clearGDPPageCookies,
} from "../../../../lib/server/gdp-session-cookies.mjs";
import { canAccessGDPPage } from "../../../../lib/server/gdp-page-roles.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const area = request.nextUrl.searchParams.get("area");
  const allowedArea = area === "admin" || area === "sucursal";
  const fallback = () => clearGDPPageCookies(NextResponse.redirect(new URL("/", request.url)));
  if (!allowedArea) return fallback();
  const refreshToken = request.cookies.get(GDP_REFRESH_COOKIE)?.value;
  if (!refreshToken) return fallback();

  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return fallback();
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session?.access_token || !data?.user?.id) return fallback();
    // El token recién renovado se verifica una vez más antes de volver al panel.
    const { data: validated, error: validateError } = await supabaseAdmin.auth.getUser(data.session.access_token);
    if (validateError || validated?.user?.id !== data.user.id) return fallback();
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
      .select("id,role,active,is_super_admin,branch_id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError || !canAccessGDPPage(profile, area)) return fallback();

    const destination = area === "admin" ? "/admin" : "/sucursal";
    return setGDPPageCookies(
      NextResponse.redirect(new URL(destination, request.url)),
      data.session
    );
  } catch (error) {
    console.error("GDPSoft: fallo renovando sesión de página", error);
    return fallback();
  }
}
