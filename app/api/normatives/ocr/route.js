import OpenAI from "openai";
import { requireActor } from "../../../../lib/decision-trees/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { isImageFile, ocrImageToText, ocrPdfToText } from "../../../../lib/normatives/ocr.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ORIGINAL_BUCKET = "normativas-originales";
const PROCESSED_BUCKET = "normativas-procesadas";

// POST ?normativeId=N — lee con IA un PDF sin texto y guarda la transcripción para
// indexarla (modo OCR). Solo administración.
export async function POST(request) {
  const access = await requireActor(request, true);
  if (access.error) return access.error;
  try {
    const normativeId = Number(new URL(request.url).searchParams.get("normativeId"));
    if (!Number.isInteger(normativeId) || normativeId <= 0) {
      return Response.json({ ok: false, error: "normativeId inválido" }, { status: 400 });
    }
    const { data: normative, error } = await supabaseAdmin.from("normatives")
      .select("id,original_filename,storage_path_original,mime_type,status").eq("id", normativeId).single();
    if (error || !normative) throw new Error(error?.message || "Normativa no encontrada");
    const nameLooksValid = /\.(pdf|png|jpe?g|webp)$/i.test(normative.original_filename || "");
    if (!nameLooksValid) {
      return Response.json({ ok: false, error: "El OCR automático solo funciona con archivos PDF o imágenes (PNG, JPG, WEBP)" }, { status: 400 });
    }
    if (!normative.storage_path_original) throw new Error("La normativa no tiene archivo original");

    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(ORIGINAL_BUCKET).download(normative.storage_path_original);
    if (downloadError || !blob) throw new Error(`No se pudo descargar el PDF: ${downloadError?.message || "sin datos"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ocrModel = process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    // v3.13.86 — las capturas y fotos se leen con visión; los PDF siguen igual.
    const text = isImageFile(bytes, normative.original_filename)
      ? await ocrImageToText({ openai, bytes, model: ocrModel })
      : await ocrPdfToText({ openai, bytes, filename: normative.original_filename, model: ocrModel });

    const processedPath = `${normativeId}/${Date.now()}__ocr.txt`;
    const upload = () => supabaseAdmin.storage.from(PROCESSED_BUCKET)
      .upload(processedPath, Buffer.from(text, "utf-8"), { contentType: "text/plain", upsert: true });
    let { error: uploadError } = await upload();
    if (uploadError && /bucket/i.test(uploadError.message || "")) {
      await supabaseAdmin.storage.createBucket(PROCESSED_BUCKET, { public: false });
      ({ error: uploadError } = await upload());
    }
    if (uploadError) throw new Error(`No se pudo guardar el texto leído: ${uploadError.message}`);

    const { error: updateError } = await supabaseAdmin.from("normatives")
      .update({ storage_path_processed: processedPath, error_message: null }).eq("id", normativeId);
    if (updateError) throw new Error(updateError.message);

    return Response.json({ ok: true, normative_id: normativeId, characters: text.length });
  } catch (error) {
    console.error("POST /api/normatives/ocr error:", error);
    return Response.json({ ok: false, error: error?.message || "No se pudo leer el documento con OCR" }, { status: 500 });
  }
}
