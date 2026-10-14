import { supabaseAdmin } from "../supabase/admin";

export async function validateReviewAccess(request, profileId) {
  if (!profileId) {
    return { ok: false, status: 401, error: "Falta profileId" };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return { ok: false, status: 401, error: "Sesión inválida" };
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);

  if (authError || !authData?.user || authData.user.id !== profileId) {
    return { ok: false, status: 401, error: "Sesión inválida" };
  }

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("profiles")
      .select("id,full_name,username,active,is_super_admin")
      .eq("id", profileId)
      .maybeSingle();

  if (profileError || !profile || profile.active === false) {
    return { ok: false, status: 403, error: "Usuario inactivo o inexistente" };
  }

  if (profile.is_super_admin === true) {
    return { ok: true, profile };
  }

  const { data: access, error: accessError } =
    await supabaseAdmin
      .from("profile_module_access")
      .select(`
        access_level,
        active,
        modules (
          code,
          active
        )
      `)
      .eq("profile_id", profileId)
      .eq("active", true);

  if (accessError) {
    return { ok: false, status: 500, error: "No se pudieron validar los permisos" };
  }

  const allowed = (access || []).some(
    (item) =>
      item?.modules?.active === true &&
      item?.modules?.code === "CLIENT_REVIEW"
  );

  if (!allowed) {
    return { ok: false, status: 403, error: "Sin permiso para validar respuestas" };
  }

  return { ok: true, profile };
}
