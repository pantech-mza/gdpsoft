import { supabaseAdmin } from "../supabase/admin";

export async function actorFromRequest(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (!match) return null;
  const { data: auth, error } = await supabaseAdmin.auth.getUser(match[1]);
  if (error || !auth?.user) return null;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id,role,active,is_super_admin,branch_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || !profile?.active) return null;
  const role = String(profile.role || "").toUpperCase();
  const admin = Boolean(profile.is_super_admin || role === "ADMIN");
  if (!admin && role !== "SUCURSAL") return null;
  return { ...profile, admin, role };
}

export function failure(message, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function requireActor(request, adminOnly = false) {
  const actor = await actorFromRequest(request);
  if (!actor) return { error: failure("Sesión inválida o sin acceso", 401) };
  if (adminOnly && !actor.admin) return { error: failure("Acceso reservado a administración", 403) };
  return { actor };
}
