import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (error, status = 400) => Response.json({ ok: false, error }, { status });

async function authorize(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: p } = await supabaseAdmin.from("profiles").select("id,active,role,is_super_admin").eq("id", data.user.id).maybeSingle();
  return p?.active && (p.is_super_admin || p.role === "ADMIN") ? p : null;
}
const validCode = v => /^[A-Z0-9_]{2,50}$/.test(v);
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export async function GET(request) {
  if (!await authorize(request)) return fail("No autorizado", 403);
  const [bs, ps, ds] = await Promise.all([
    supabaseAdmin.from("branches").select("id,code,name,branch_type,active").order("name"),
    supabaseAdmin.from("profiles").select("id,username,full_name,role,branch_id,active,is_super_admin").eq("role", "SUCURSAL"),
    supabaseAdmin.from("branch_devices").select("id,branch_id,device_name,device_type,active,last_seen_at").is("removed_at",null).order("device_name"),
  ]);
  if (bs.error || ps.error || ds.error) return fail("No se pudo consultar la información: " + (bs.error || ps.error || ds.error).message, 500);
  const profiles = ps.data || [];
  const accounts = await Promise.all(profiles.map(async p => {
    const { data } = await supabaseAdmin.auth.admin.getUserById(p.id);
    return { ...p, email: data?.user?.email || "" };
  }));
  return Response.json({ ok: true, branches: bs.data || [], accounts, devices: ds.data || [] });
}

export async function POST(request) {
  if (!await authorize(request)) return fail("No autorizado", 403);
  const b = await request.json().catch(() => ({}));
  const code = String(b.code || "").trim().toUpperCase().replace(/\s+/g, "_");
  const name = String(b.name || "").trim();
  const branch_type = String(b.branch_type || "").trim();
  const username = String(b.username || code).trim();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!validCode(code) || !name || !username || !validEmail(email) || password.length < 6 || password.length > 12) return fail("Completá código, nombre, usuario, correo y contraseña (6 a 12 caracteres)");
  const [existingBranch, existingUser] = await Promise.all([
    supabaseAdmin.from("branches").select("id").eq("code", code).maybeSingle(),
    supabaseAdmin.from("profiles").select("id").ilike("username", username).maybeSingle(),
  ]);
  if (existingBranch.error || existingUser.error) return fail("No se pudieron verificar duplicados", 500);
  if (existingBranch.data || existingUser.data) return fail("Ya existe la sucursal o el usuario", 409);
  const { data: created, error: createError } = await supabaseAdmin.from("branches").insert({ code, name, branch_type: branch_type || null, active: true }).select("id").single();
  if (createError || !created) return fail(createError?.message || "Error creando sucursal");
  const { data: auth, error: authError } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !auth?.user) {
    await supabaseAdmin.from("branches").delete().eq("id", created.id);
    return fail(authError?.message || "No se pudo crear la cuenta");
  }
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({ id: auth.user.id, username, full_name: name, branch_id: created.id, role: "SUCURSAL", active: true, is_super_admin: false }, { onConflict: "id" });
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(auth.user.id);
    await supabaseAdmin.from("branches").delete().eq("id", created.id);
    return fail(profileError.message);
  }
  return Response.json({ ok: true, branch_id: created.id }, { status: 201 });
}

export async function PATCH(request) {
  if (!await authorize(request)) return fail("No autorizado", 403);
  const b = await request.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return fail("Sucursal inválida");
  const { data: branch } = await supabaseAdmin.from("branches").select("id,code,name").eq("id", id).maybeSingle();
  if (!branch) return fail("Sucursal inexistente", 404);
  if (b.action === "edit") {
    const name = String(b.name || "").trim();
    if (!name) return fail("El nombre no puede estar vacío");
    const { error } = await supabaseAdmin.from("branches").update({ name, branch_type: String(b.branch_type || "").trim() || null }).eq("id", id);
    return error ? fail(error.message) : Response.json({ ok: true });
  }
  if (b.action === "set_active") {
    if (typeof b.active !== "boolean") return fail("Estado inválido");
    const { error } = await supabaseAdmin.from("branches").update({ active: b.active }).eq("id", id);
    if (error) return fail(error.message);
    const { error: profileError } = await supabaseAdmin.from("profiles").update({ active: b.active }).eq("branch_id", id).eq("role", "SUCURSAL");
    return profileError ? fail("Sucursal actualizada, pero no se pudo actualizar la cuenta: " + profileError.message, 500) : Response.json({ ok: true });
  }
  return fail("Acción inválida");
}
