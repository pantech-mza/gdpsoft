import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { actorFromRequest, adminActor } from "../../../../../lib/server/gdp-actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache" };
const json = (data, status = 200) => Response.json(data, { status, headers });

async function context(request, params, writer = false) {
  const actor = await actorFromRequest(request);
  if (!actor) return { error: json({ ok: false, error: "Sesión requerida" }, 401) };
  if (!adminActor(actor) && actor.role !== "SUCURSAL") return { error: json({ ok:false, error:"Sin acceso a fichas" },403) };
  if (writer && !adminActor(actor)) return { error: json({ ok:false,error:"Solo Administración puede editar observaciones" }, 403) };
  const { id } = await params;
  const socialWorkId = Number(id);
  if (!Number.isSafeInteger(socialWorkId) || socialWorkId < 1) return { error: json({ok:false,error:"ID inválido"},400) };
  const { data, error } = await supabaseAdmin.from("social_works").select("id").eq("id",socialWorkId).maybeSingle();
  if (error) return { error:json({ok:false,error:"No se pudo comprobar la obra social"},500) };
  if (!data) return { error:json({ok:false,error:"Obra social inexistente"},404) };
  return { actor, socialWorkId };
}
const cleanBody = input => typeof input === "string" ? input.trim() : "";
const validKind = kind => kind === "GENERAL" || kind === "ACCESS";
const pickId = id => Number.isSafeInteger(Number(id)) && Number(id)>0 ? Number(id) : null;
const publicNote = (row) => ({
  id:row.id, kind:row.kind, source:row.source, review_status:row.review_status,
  legacy_id:row.legacy_id, source_modified_at:row.source_modified_at,
  created_at:row.created_at, updated_at:row.updated_at,
  // Nunca entregar el contenido de una nota de acceso en un listado general.
  body:row.kind === "ACCESS" ? null : row.body,
  protected:row.kind === "ACCESS",
});

export async function GET(request, { params }) {
  const ctx = await context(request,params);
  if (ctx.error) return ctx.error;
  const reveal = new URL(request.url).searchParams.get("reveal");
  if (reveal !== null) {
    const noteId = pickId(reveal);
    if (!noteId) return json({ok:false,error:"ID de observación inválido"},400);
    const { data,error } = await supabaseAdmin.from("social_work_notes")
      .select("id,kind,body").eq("social_work_id",ctx.socialWorkId).eq("id",noteId).maybeSingle();
    if (error) return json({ok:false,error:"Error consultando el acceso"},500);
    if (!data || data.kind !== "ACCESS") return json({ok:false,error:"Acceso no encontrado"},404);
    return json({ok:true, id:data.id, body:data.body});
  }
  const { data, error } = await supabaseAdmin.from("social_work_notes")
    .select("id,kind,body,source,review_status,legacy_id,source_modified_at,created_at,updated_at")
    .eq("social_work_id",ctx.socialWorkId).order("id",{ascending:true});
  if (error) return json({ok:false,error:"Error leyendo observaciones; verificar migración"},500);
  return json({ok:true,notes:(data||[]).map(publicNote)});
}
export async function POST(request,{params}) {
  const ctx = await context(request,params,true);
  if (ctx.error) return ctx.error;
  const payload = await request.json().catch(()=>null);
  const body = cleanBody(payload?.body), kind = payload?.kind;
  if (!validKind(kind) || !body || body.length>10000) return json({ok:false,error:"Indicá un tipo y texto válido (máximo 10000 caracteres)"},400);
  const {error} = await supabaseAdmin.from("social_work_notes").insert({
    social_work_id:ctx.socialWorkId,kind,body,source:"MANUAL",review_status:"APPROVED",
    created_by:ctx.actor.id,updated_by:ctx.actor.id,
  });
  return error ? json({ok:false,error:"No se pudo guardar la observación"},500) : json({ok:true},201);
}
export async function PATCH(request,{params}) {
  const ctx = await context(request,params,true);
  if (ctx.error) return ctx.error;
  const payload = await request.json().catch(()=>null);
  const id=pickId(payload?.id),kind=payload?.kind,body=cleanBody(payload?.body);
  if (!id || !validKind(kind) || !body || body.length>10000) return json({ok:false,error:"Observación inválida"},400);
  const {data,error} = await supabaseAdmin.from("social_work_notes").update({
    kind,body,source:"MANUAL",review_status:"APPROVED",updated_at:new Date().toISOString(),updated_by:ctx.actor.id,
  }).eq("id",id).eq("social_work_id",ctx.socialWorkId).select("id").maybeSingle();
  if (error) return json({ok:false,error:"Error actualizando observación"},500);
  return data ? json({ok:true}) : json({ok:false,error:"Observación no encontrada"},404);
}
export async function DELETE(request,{params}) {
  const ctx = await context(request,params,true);
  if (ctx.error) return ctx.error;
  const payload = await request.json().catch(()=>null),id=pickId(payload?.id);
  if (!id) return json({ok:false,error:"Observación inválida"},400);
  const {data,error} = await supabaseAdmin.from("social_work_notes").delete()
    .eq("id",id).eq("social_work_id",ctx.socialWorkId).select("id").maybeSingle();
  if (error) return json({ok:false,error:"Error eliminando observación"},500);
  return data ? json({ok:true}) : json({ok:false,error:"Observación no encontrada"},404);
}
