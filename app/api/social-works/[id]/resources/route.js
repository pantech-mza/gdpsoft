import { supabaseAdmin } from "../../../../../lib/supabase/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "gdp-billing-files";
const respond = (error, status = 400) => Response.json({ ok: false, error }, { status });
async function auth(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: p } = await supabaseAdmin.from("profiles").select("id,role,active,is_super_admin,branch_id").eq("id", data.user.id).maybeSingle();
  if (!p?.active || !["ADMIN","SUCURSAL"].includes(p.role) && !p.is_super_admin) return null;
  return { ...p, writer: Boolean(p.is_super_admin || p.role === "ADMIN") };
}
async function context(request, params, write = false) {
  const actor = await auth(request);
  if (!actor || (write && !actor.writer)) return { error: respond("No autorizado", 403) };
  const { id } = await params;
  const swId = Number(id);
  if (!Number.isSafeInteger(swId) || swId < 1) return { error: respond("Obra social inválida") };
  const { data } = await supabaseAdmin.from("social_works").select("id").eq("id", swId).maybeSingle();
  if (!data) return { error: respond("Obra social inexistente", 404) };
  return { swId, actor };
}
export async function GET(request, { params }) {
  const c = await context(request, params);
  if (c.error) return c.error;
  const [contacts, files] = await Promise.all([
    supabaseAdmin.from("social_work_contacts").select("*").eq("social_work_id", c.swId).order("id"),
    supabaseAdmin.from("social_work_billing_files").select("*").eq("social_work_id", c.swId).order("created_at", { ascending: false }),
  ]);
  if (contacts.error || files.error) return respond((contacts.error || files.error).message, 500);
  // Los archivos quedan privados; la URL expira en diez minutos.
  const billing = await Promise.all((files.data || []).map(async (f) => {
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(f.storage_path, 600);
    return { ...f, url: data?.signedUrl || null };
  }));
  return Response.json({ ok: true, contacts: (contacts.data || []).map(row => ({ ...row, name: row.label, email: row.email || "" })), billing });
}
export async function POST(request, { params }) {
  const c = await context(request, params, true);
  if (c.error) return c.error;
  const body = await request.json().catch(() => ({}));
  if (body.kind !== "contact") return respond("Tipo inválido");
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  if (!name || name.length > 150) return respond("Nombre / referencia obligatorio (máx. 150 caracteres)");
  if (!phone || phone.length > 100) return respond("Teléfono obligatorio (máx. 100 caracteres)");
  const email = String(body.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond("Correo electrónico inválido");
  const payload = {
    social_work_id: c.swId,
    contact_code: `MANUAL_${crypto.randomUUID()}`,
    contact_type: "OTHER",
    label: name,
    phone,
    purpose: "Contacto general",
    department: String(body.department || "").trim().slice(0, 200) || null,
    email: email || null,
    notes: String(body.notes || "").trim().slice(0, 1500) || null,
  };
  const { error } = await supabaseAdmin.from("social_work_contacts").insert(payload);
  return error ? respond(error.message, 500) : Response.json({ ok: true });
}
export async function PATCH(request, { params }) {
  const c = await context(request, params, true);
  if (c.error) return c.error;
  const b = await request.json().catch(() => ({}));
  if (b.kind !== "contact") return respond("Tipo inválido");
  const id = Number(b.id);
  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !name || name.length > 150) return respond("Nombre / referencia inválido");
  if (!phone || phone.length > 100) return respond("Teléfono obligatorio (máx. 100 caracteres)");
  const email = String(b.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond("Correo electrónico inválido");
  const { data, error } = await supabaseAdmin.from("social_work_contacts").update({
    label: name,
    department: String(b.department || "").trim().slice(0, 200) || null,
    phone,
    email: email || null,
    notes: String(b.notes || "").trim().slice(0, 1500) || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("social_work_id", c.swId).select("id").maybeSingle();
  return error ? respond(error.message, 500) : !data ? respond("Contacto no encontrado", 404) : Response.json({ ok: true });
}
export async function DELETE(request, { params }) {
  const c = await context(request, params, true);
  if (c.error) return c.error;
  const b = await request.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isSafeInteger(id) || id < 1) return respond("ID inválido");
  if (b.kind === "contact") {
    const { error } = await supabaseAdmin.from("social_work_contacts").delete().eq("id", id).eq("social_work_id", c.swId);
    return error ? respond(error.message, 500) : Response.json({ ok: true });
  }
  if (b.kind === "billing") {
    const { data: row, error } = await supabaseAdmin.from("social_work_billing_files").select("storage_path").eq("id", id).eq("social_work_id", c.swId).maybeSingle();
    if (error) return respond(error.message, 500);
    if (!row) return respond("Archivo no encontrado", 404);
    const removed = await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path]);
    if (removed.error) return respond(removed.error.message, 500);
    const deleted = await supabaseAdmin.from("social_work_billing_files").delete().eq("id", id).eq("social_work_id", c.swId);
    return deleted.error ? respond(deleted.error.message, 500) : Response.json({ ok: true });
  }
  return respond("Tipo inválido");
}
