// GDPSoft v3.13.70 — Validación de respuestas por conversación.
// Agrupa las consultas del registro en «tramos»: misma sucursal y dispositivo, misma obra social,
// sin pausas largas. Si cambia la obra social (o pasan más de `gapMinutes`), empieza otro tramo.

export const SEGMENT_GAP_MINUTES = 30;

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// «Sí», «gracias», «ok», «1»…: acompañan el hilo pero no hace falta validarlos.
const FOLLOW_UP = /^(?:si|sii+|no|ok|okey|dale|bueno|listo|perfecto|genial|claro|gracias|muchas gracias|mil gracias|\d{1})(?:\s+(?:gracias|por favor))?[.!?\s]*$/;
const ERROR_ANSWER = /(no se pudo procesar|indicame la obra social|no pude identificar|necesito confirmar el circuito|error)/;

export function isFollowUpQuestion(question) {
  const q = fold(question).replace(/[¿?¡!.,]/g, '').trim();
  return q.length > 0 && q.split(/\s+/).length <= 3 && FOLLOW_UP.test(q);
}

// v3.13.106 — Respuestas que NO son un fallo del bot: el usuario escribió solo el nombre de la obra social,
// el bot repregunta, ambigüedad de nombre, cortesía. Es educación del usuario, no hay nada que corregir ni validar.
export const USER_SIDE_ROUTES = /^(?:CLARIFICATION_NEEDED|AMBIGUOUS_SOCIAL_WORK|COURTESY|INACTIVE_SOCIAL_WORK)$/;
const USER_SIDE_ANSWER = /(?:¿que necesitas saber sobre|¿en que puedo ayudarte|¿sobre que obra social)/;
export function isUserSideAnswer(row) {
  return USER_SIDE_ROUTES.test(String(row?.route || row?.source || '')) || USER_SIDE_ANSWER.test(fold(row?.answer));
}

export function classifyRow(row) {
  const answer = fold(row.answer);
  const followUp = isFollowUpQuestion(row.question);
  const alerts = [];
  if (!followUp && answer && isUserSideAnswer(row)) return { followUp, alerts, isError: false, userSide: true };
  if (!answer) alerts.push('Sin respuesta');
  else if (/no se pudo procesar/.test(answer)) alerts.push('Error del sistema');
  else if (/indicame la obra social|no pude identificar/.test(answer)) alerts.push('Obra social no reconocida');
  else if (/necesito confirmar el circuito/.test(answer)) alerts.push('Pidió circuito');
  else if (row.found === false && !followUp) alerts.push('Sin información');
  return { followUp, alerts, isError: ERROR_ANSWER.test(answer) || !answer };
}

/** rows: filas de la cola (cualquier orden). Devuelve tramos del más reciente al más antiguo. */
export function groupIntoSegments(rows = [], { gapMinutes = SEGMENT_GAP_MINUTES } = {}) {
  const ordered = [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || Number(a.id) - Number(b.id));
  const open = new Map(); // sucursal+dispositivo → tramo abierto
  const segments = [];
  for (const row of ordered) {
    const key = `${row.branch_id ?? 'x'}:${row.device_id ?? 'x'}`;
    const at = Date.parse(row.created_at);
    let seg = open.get(key);
    const workChanged = seg && seg.social_work_id != null && row.social_work_id != null &&
      Number(seg.social_work_id) !== Number(row.social_work_id);
    const gap = seg ? (at - Date.parse(seg.end)) / 60000 : 0;
    if (!seg || workChanged || gap > gapMinutes) {
      seg = {
        id: `${key}:${row.id}`, branch_id: row.branch_id, device_id: row.device_id ?? null,
        branch_name: row.branch_name, device_name: row.device_name || null,
        social_work_id: row.social_work_id ?? null, social_work_name: row.social_work_name,
        start: row.created_at, end: row.created_at, items: [],
      };
      open.set(key, seg);
      segments.push(seg);
    }
    if (seg.social_work_id == null && row.social_work_id != null) {
      seg.social_work_id = row.social_work_id;
      seg.social_work_name = row.social_work_name;
    }
    seg.end = row.created_at;
    seg.items.push({ ...row, ...classifyRow(row), needsReview: row.needs_review !== false });
  }
  for (const seg of segments) {
    const answers = seg.items.filter((item) => !item.followUp && item.needsReview);
    seg.autoCount = seg.items.filter((item) => !item.followUp && !item.needsReview).length;
    seg.answerCount = answers.length;
    seg.followUpCount = seg.items.filter((item) => item.followUp).length;
    seg.reviewed = answers.filter((item) => item.review).length;
    seg.alerts = seg.items.filter((item) => item.alerts.length && !item.review).length;
    seg.pending = seg.reviewed < seg.answerCount;
  }
  return segments.sort((a, b) => Date.parse(b.end) - Date.parse(a.end));
}

export function filterSegments(segments, { status = 'PENDING', onlyReviewable = false, branchId = '', deviceId = '', socialWorkId = '', text = '', from = null } = {}) {
  const needle = fold(text);
  return segments.filter((seg) => {
    if (onlyReviewable && !seg.answerCount) return false;
    if (status === 'PENDING' && !seg.pending) return false;
    if (status === 'ALERTS' && !seg.alerts) return false;
    if (status === 'REVIEWED' && seg.pending) return false;
    if (branchId && String(seg.branch_id) !== String(branchId)) return false;
    if (deviceId && String(seg.device_id) !== String(deviceId)) return false;
    if (socialWorkId && String(seg.social_work_id) !== String(socialWorkId)) return false;
    if (from && Date.parse(seg.end) < from) return false;
    if (needle && !fold(seg.items.map((i) => `${i.question} ${i.answer}`).join(' ')).includes(needle)) return false;
    return true;
  });
}

export function summarize(segments) {
  const items = segments.flatMap((seg) => seg.items).filter((item) => !item.followUp && item.needsReview);
  const reviewed = items.filter((item) => item.review);
  const correct = reviewed.filter((item) => item.review.verdict === 'CORRECT').length;
  return {
    pending: segments.filter((seg) => seg.pending).length,
    alerts: segments.filter((seg) => seg.alerts > 0).length,
    reviewed: reviewed.length,
    correctPct: reviewed.length ? Math.round((correct / reviewed.length) * 100) : null,
  };
}
