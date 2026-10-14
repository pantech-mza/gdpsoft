import { supabaseAdmin } from "../supabase/admin";

export async function logQualityEvent({
  assistantQueryLogId = null,
  conversationId = null,
  branchId = null,
  socialWorkId = null,
  eventType,
  severity = "INFO",
  message = null,
  metadata = {},
}) {
  try {
    if (!eventType) return;
    const { error } = await supabaseAdmin.from("assistant_quality_event").insert({
      assistant_query_log_id: assistantQueryLogId,
      conversation_id: conversationId,
      branch_id: branchId,
      social_work_id: socialWorkId,
      event_type: eventType,
      severity,
      message,
      metadata: metadata || {},
    });
    if (error) console.error("assistant_quality_event error:", error.message);
  } catch (error) {
    console.error("assistant_quality_event exception:", error);
  }
}

export function detectAutomaticQualityEvents({
  route = null,
  question = "",
  answer = "",
  elapsedMs = null,
  hasImage = false,
  detectedSocialWorkId = null,
  socialWorkId = null,
}) {
  const events = [];
  const q = String(question || "").toLowerCase();
  const a = String(answer || "").toLowerCase();

  if (elapsedMs != null && elapsedMs > 6000) {
    events.push({
      eventType: "SLOW_RESPONSE",
      severity: elapsedMs > 10000 ? "CRITICAL" : "WARNING",
      message: `Respuesta lenta: ${elapsedMs} ms`,
      metadata: { elapsed_ms: elapsedMs },
    });
  }

  const visualQuestion = hasImage &&
    /(receta|imagen|foto|firma|sello|membrete|afiliad|paciente|fecha|medicamento|dosis|obra social|cobertura)/i.test(q);

  if (visualQuestion &&
      /normativa vigente|documentos proporcionados|la receta debe contar|es obligatorio incluir/i.test(a)) {
    events.push({
      eventType: "POSSIBLE_IMAGE_ROUTING_ERROR",
      severity: "HIGH",
      message: "Una consulta visual parece haber sido respondida desde normativa general.",
      metadata: { route, question: q.slice(0, 300) },
    });
  }

  if (hasImage && !detectedSocialWorkId &&
      /(sirve esta receta|puedo recibir|puedo dispensar|validar esta receta)/i.test(q)) {
    events.push({
      eventType: "IMAGE_SOCIAL_WORK_NOT_DETECTED",
      severity: "HIGH",
      message: "No se detectó obra social automáticamente desde la imagen.",
      metadata: {},
    });
  }

  if (socialWorkId && detectedSocialWorkId &&
      Number(socialWorkId) !== Number(detectedSocialWorkId)) {
    events.push({
      eventType: "SOCIAL_WORK_MISMATCH",
      severity: "HIGH",
      message: "La obra social detectada no coincide con la utilizada para responder.",
      metadata: { social_work_id: socialWorkId, detected_social_work_id: detectedSocialWorkId },
    });
  }

  return events;
}