import { supabaseAdmin } from "../../../../../../lib/supabase/admin";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
export const runtime = "nodejs";
const BUCKET = "gdp-billing-files";
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = { ".pdf": "application/pdf", ".mp4": "video/mp4", ".webm": "video/webm" };
const reply = (error, status = 400) => Response.json({ ok: false, error }, { status });
const sign = value => createHmac("sha256", process.env.SUPABASE_SECRET_KEY).update(value).digest("base64url");
function ticketFor(claim) {
  const data = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${data}.${sign(data)}`;
}
function readTicket(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  const [data, mac, extra] = value.split(".");
  if (!data || !mac || extra) return null;
  const expected = sign(data);
  const received = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  if (received.length !== wanted.length || !timingSafeEqual(received, wanted)) return null;
  try {
    const claim = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (claim.v !== 1 || !Number.isFinite(claim.exp) || Date.now() > claim.exp) return null;
    return claim;
  } catch { return null; }
}
async function authorize(request, params) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth, error } = token ? await supabaseAdmin.auth.getUser(token) : { data: null, error: true };
  if (error || !auth?.user) return { error: reply("No autorizado", 403) };
  const { data: profile } = await supabaseAdmin.from("profiles")
    .select("active,role,is_super_admin").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active || !(profile.is_super_admin || profile.role === "ADMIN")) return { error: reply("Sin permisos", 403) };
  const { id } = await params;
  const swId = Number(id);
  if (!Number.isSafeInteger(swId) || swId < 1) return { error: reply("Obra social inválida") };
  const { data: socialWork } = await supabaseAdmin.from("social_works").select("id").eq("id", swId).maybeSingle();
  if (!socialWork) return { error: reply("Obra social inexistente", 404) };
  return { swId, actorId: auth.user.id };
}
export async function POST(request, { params }) {
  const ctx = await authorize(request, params);
  if (ctx.error) return ctx.error;
  if (!(request.headers.get("content-type") || "").includes("application/json"))
    return reply("Actualizá GDPSoft para subir archivos directamente a Supabase Storage", 415);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return reply("Solicitud inválida");

  if (body.action === "prepare") {
    const title = String(body.title || "").trim().slice(0, 200);
    const description = String(body.description || "").trim().slice(0, 1000);
    const fileName = String(body.fileName || "").trim().slice(0, 300);
    const bytes = Number(body.bytes);
    const extension = /\.(pdf|mp4|webm)$/i.exec(fileName)?.[0]?.toLowerCase();
    const mimeType = ALLOWED[extension];
    const incomingType = String(body.mimeType || "").trim();
    if (!title || !fileName || !mimeType || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_BYTES ||
        (incomingType && incomingType !== "application/octet-stream" && incomingType !== mimeType)) {
      return reply("Adjuntá un PDF o video MP4/WebM de hasta 100 MB y un título");
    }
    const path = `${ctx.swId}/${randomUUID()}${extension}`;
    const { data: signed, error: signError } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (signError || !signed?.signedUrl) return reply(`No se pudo autorizar la carga: ${signError?.message || "sin URL"}`, 500);
    const claim = {
      v: 1, swId: ctx.swId, actorId: ctx.actorId, path, fileName, mimeType, bytes,
      title, description, exp: Date.now() + 2 * 60 * 60 * 1000,
    };
    return Response.json({ ok: true, signedUrl: signed.signedUrl, ticket: ticketFor(claim) });
  }

  if (body.action === "finalize") {
    const claim = readTicket(body.ticket);
    if (!claim || claim.swId !== ctx.swId || claim.actorId !== ctx.actorId ||
      !Number.isSafeInteger(claim.bytes) || claim.bytes < 1 || claim.bytes > MAX_BYTES ||
      !Object.values(ALLOWED).includes(claim.mimeType) ||
      !new RegExp(`^${ctx.swId}/[0-9a-f-]{36}\\.(pdf|mp4|webm)$`, "i").test(claim.path)) {
      return reply("Autorización de carga inválida o vencida", 403);
    }
    const folder = String(ctx.swId);
    const objectName = claim.path.slice(folder.length + 1);
    const { data: objects, error: listError } = await supabaseAdmin.storage.from(BUCKET)
      .list(folder, { search: objectName, limit: 100 });
    if (listError) return reply(`Error verificando el archivo: ${listError.message}`, 500);
    const object = (objects || []).find(item => item.name === objectName);
    if (!object) return reply("El archivo no llegó a Supabase Storage", 409);
    if (Number(object.metadata?.size) !== claim.bytes ||
        (object.metadata?.mimetype && object.metadata.mimetype !== claim.mimeType)) {
      return reply("El archivo recibido no coincide con el autorizado", 409);
    }
    const { data: previous, error: previousError } = await supabaseAdmin.from("social_work_billing_files")
      .select("id").eq("storage_path", claim.path).maybeSingle();
    if (previousError) return reply(previousError.message, 500);
    if (previous) return Response.json({ ok: true, id: previous.id });
    const { data: saved, error: saveError } = await supabaseAdmin.from("social_work_billing_files").insert({
      social_work_id: claim.swId, title: claim.title, description: claim.description,
      file_name: claim.fileName, storage_path: claim.path, mime_type: claim.mimeType, bytes: claim.bytes,
    }).select("id").single();
    if (saveError) return reply(`El video se subió, pero no se pudo publicar: ${saveError.message}`, 500);
    return Response.json({ ok: true, id: saved.id });
  }
  return reply("Acción inválida");
}
