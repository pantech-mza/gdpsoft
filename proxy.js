// Next.js 16: seguridad real ANTES de servir páginas protegidas o APIs.
// La UI mantiene su diseño y los endpoints existentes mantienen sus tokens Bearer.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./lib/supabase/admin";
import { GDP_ACCESS_COOKIE, GDP_REFRESH_COOKIE } from "./lib/server/gdp-session-cookies.mjs";
import { canAccessGDPPage } from "./lib/server/gdp-page-roles.mjs";
import { gdpApiIsPublic, canAccessGDPApi } from "./lib/server/gdp-api-access-policy.mjs";

export const config = { matcher: ["/admin/:path*", "/sucursal/:path*", "/api/:path*"] };

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const isAPI = pathname.startsWith("/api/");
  if (isAPI && gdpApiIsPublic(pathname)) return NextResponse.next();

  const area = pathname.startsWith("/admin") ? "admin" : pathname.startsWith("/sucursal") ? "sucursal" : null;
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  const token = match?.[1] || request.cookies.get(GDP_ACCESS_COOKIE)?.value;
  const hasRefreshCookie = !!request.cookies.get(GDP_REFRESH_COOKIE)?.value;
  const loginRedirect = () => NextResponse.redirect(new URL("/", request.url));
  const renewRedirect = () => NextResponse.redirect(new URL(`/api/auth/restore?area=${area}`, request.url));
  const unauthorized = () => isAPI
    ? NextResponse.json({ ok: false, error: "Sesión requerida" }, { status: 401 })
    : (hasRefreshCookie ? renewRedirect() : loginRedirect());

  if (!token) return unauthorized();

  try {
    const { data: auth, error: tokenError } = await supabaseAdmin.auth.getUser(token);
    if (tokenError || !auth?.user?.id) return unauthorized();

    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
      .select("id,role,active,is_super_admin,branch_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profileError) return isAPI
      ? NextResponse.json({ ok: false, error: "No se pudieron verificar permisos" }, { status: 503 })
      : loginRedirect();
    if (!profile?.active) return isAPI
      ? NextResponse.json({ ok: false, error: "Cuenta sin acceso" }, { status: 403 })
      : loginRedirect();

    const allowed = isAPI
      ? canAccessGDPApi(profile, pathname, request.method)
      : canAccessGDPPage(profile, area);
    if (!allowed) return isAPI
      ? NextResponse.json({ ok: false, error: "Permisos insuficientes" }, { status: 403 })
      : loginRedirect();

    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("GDPSoft proxy: no se pudo verificar sesión", error);
    return isAPI
      ? NextResponse.json({ ok: false, error: "No se pudo verificar la sesión" }, { status: 503 })
      : loginRedirect();
  }
}
