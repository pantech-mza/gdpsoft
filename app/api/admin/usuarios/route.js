import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actor(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { error: "Sesión requerida", status: 401 };
  const { data: auth, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !auth?.user) return { error: "Sesión vencida", status: 401 };
  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
    .select("id,role,active,is_super_admin")
    .eq("id", auth.user.id).maybeSingle();
  if (profileError || !profile || profile.active !== true || !(profile.is_super_admin || profile.role === "ADMIN")) {
    return { error: "No autorizado", status: 403 };
  }
  return { profile };
}

const respond = (error, status) => Response.json({ ok: false, error }, { status });

export async function GET(request) {
  const ctx = await actor(request);
  if (ctx.error) return respond(ctx.error, ctx.status);
  const { data, error } = await supabaseAdmin.from("profiles")
    .select("id,username,full_name,role,branch_id,active,is_super_admin")
    .order("username", { ascending: true });
  if (error) return respond("Error obteniendo usuarios", 500);
  const users = data || [];
  const enriched = await Promise.all(users.map(async (u) => {
    const { data: auth } = await supabaseAdmin.auth.admin.getUserById(u.id);
    return { ...u, email: auth?.user?.email || null };
  }));
  return Response.json({ ok: true, users: enriched });
}

export async function POST(request) {
  const ctx = await actor(request);
  if (ctx.error) return respond(ctx.error, ctx.status);
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const full_name = String(body.full_name || "").trim();
  const password = String(body.password || "");
  const branch_id = body.branch_id || null;
  const role = "SUCURSAL";
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username) || !email.includes("@") || password.length < 12 || !full_name) {
    return respond("Completá nombre, usuario válido, correo y contraseña temporal de al menos 12 caracteres", 400);
  }
  if (role === "SUCURSAL" && !branch_id) return respond("Seleccioná una sucursal", 400);
  if (branch_id) {
    const { data: branch } = await supabaseAdmin.from("branches").select("id,active").eq("id", branch_id).maybeSingle();
    if (!branch || branch.active === false) return respond("Sucursal inválida", 400);
  }
  const { data: duplicate } = await supabaseAdmin.from("profiles").select("id").ilike("username", username).maybeSingle();
  if (duplicate) return respond("El nombre de usuario ya existe", 409);
  const { data: auth, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (authError || !auth?.user) return respond(authError?.message || "No se pudo crear el usuario", 400);
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: auth.user.id, username, full_name, role, branch_id: role === "SUCURSAL" ? branch_id : null,
    active: true, is_super_admin: false,
  });
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(auth.user.id);
    return respond("No se pudo crear el perfil: " + profileError.message, 400);
  }
  return Response.json({ ok: true, id: auth.user.id }, { status: 201 });
}

export async function PATCH(request) {
  const ctx = await actor(request);
  if (ctx.error) return respond(ctx.error, ctx.status);
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return respond("Seleccioná un usuario", 400);
  const { data: target } = await supabaseAdmin.from("profiles")
    .select("id,role,active,is_super_admin")
    .eq("id", id).maybeSingle();
  if (!target) return respond("Usuario inexistente", 404);
  if (target.is_super_admin || (!ctx.profile.is_super_admin && target.role !== "SUCURSAL")) {
    return respond("No tenés permiso para modificar este usuario", 403);
  }
  if (body.action === "set_active") {
    if (typeof body.active !== "boolean") return respond("Estado inválido", 400);
    const { error } = await supabaseAdmin.from("profiles").update({ active: body.active }).eq("id", id);
    return error ? respond(error.message, 400) : Response.json({ ok: true });
  }
  if (body.action === "reset_password") {
    const password = String(body.password || "");
    if (password.length < 6 || password.length > 12) return respond("La contraseña temporal debe tener entre 6 y 12 caracteres", 400);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
    return error ? respond(error.message, 400) : Response.json({ ok: true });
  }
  return respond("Acción no permitida", 400);
}
