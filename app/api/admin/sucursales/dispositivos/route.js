import { supabaseAdmin } from "../../../../../lib/supabase/admin";
export const runtime = "nodejs";
export async function PATCH(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth } = token ? await supabaseAdmin.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const { data: actor } = await supabaseAdmin.from("profiles").select("active,role,is_super_admin").eq("id", auth.user.id).maybeSingle();
  if (!actor?.active || !(actor.is_super_admin || actor.role === "ADMIN")) return Response.json({ ok: false, error: "No autorizado" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.active !== "boolean" || !body.device_id) return Response.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  const { error } = await supabaseAdmin.from("branch_devices").update({ active: body.active }).eq("id", body.device_id);
  return error ? Response.json({ ok: false, error: error.message }, { status: 400 }) : Response.json({ ok: true });
}
