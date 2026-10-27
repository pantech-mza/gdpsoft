// GDPSoft v3.13.104 — Validación: quita el «ruido» de la cola para que la revisora vea lo que importa.
//  1) Pruebas internas: dispositivos cuyo nombre contiene «Nico», «Mica» o «Admin», o tráfico ADMIN.
//  2) Repeticiones: la misma pregunta, desde el mismo dispositivo, dentro de las 24 h → solo queda la ÚLTIMA
//     (las anteriores son intentos hasta que la respuesta quedó bien).
import { isFollowUpQuestion, classifyRow } from './conversation-groups.mjs';

// Equipo interno que prueba el bot (Nico, Mica, Admin). Para sumar otro nombre, agregarlo a esta lista.
export const INTERNAL_DEVICE_PATTERN = /\b(?:nico|nicolas|mica|admin|administrador|administracion)\b/;
export const REPEAT_WINDOW_HOURS = 24;
// v3.13.105 — Triage: una sola persona no puede validar todo. Solo hace falta revisar lo dudoso;
// lo que el motor respondió y verificó (route CONTEXT_ENGINE, found) o una corrección ya cargada por el admin se da por bueno.
export const TRUSTED_ROUTES = /^(?:CONTEXT_ENGINE|ADMIN_CORRECTION)/;
export const SPOT_CHECK_EVERY = 10; // 1 de cada 10 respuestas «buenas» igual se muestra, para controlar al motor

export function triageRow(row, { spotEvery = SPOT_CHECK_EVERY } = {}) {
  const reasons = [];
  if (row?.review) return { needs_review: true, review_reasons: ['Ya revisada'], spot_check: false };
  const { followUp, alerts } = classifyRow(row || {});
  if (followUp) return { needs_review: false, review_reasons: [], spot_check: false };
  reasons.push(...alerts);
  if (row?.found === false && !alerts.length) reasons.push('Sin información');
  const route = String(row?.route || row?.source || '');
  if (!TRUSTED_ROUTES.test(route)) reasons.push('No la respondió el motor');
  if ((row?.repeat_count || 1) > 1) reasons.push('Repitieron la pregunta');
  if (reasons.length) return { needs_review: true, review_reasons: [...new Set(reasons)], spot_check: false };
  if (spotEvery > 0 && Number(row?.id) % spotEvery === 0) return { needs_review: true, review_reasons: ['Muestreo de control'], spot_check: true };
  return { needs_review: false, review_reasons: [], spot_check: false };
}

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();

export function isInternalTest(row, pattern = INTERNAL_DEVICE_PATTERN) {
  if (row?.traffic_type === 'ADMIN') return true;
  return pattern.test(fold(row?.device_name));
}

export function markReviewNoise(rows = [], { pattern = INTERNAL_DEVICE_PATTERN, windowHours = REPEAT_WINDOW_HOURS, spotEvery = SPOT_CHECK_EVERY } = {}) {
  const marked = rows.map((row) => ({ ...row, is_internal: isInternalTest(row, pattern), superseded: false, repeat_count: 1 }));
  const groups = new Map();
  for (const row of marked) {
    if (isFollowUpQuestion(row.question)) continue; // «sí», «gracias»…: no se validan, no se agrupan
    const q = fold(row.normalized_question || row.question);
    if (!q) continue;
    const key = `${row.branch_id ?? 'x'}:${row.device_id ?? 'x'}:${row.social_work_id ?? 'x'}:${q}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const windowMs = windowHours * 3600 * 1000;
  for (const list of groups.values()) {
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || Number(a.id) - Number(b.id));
    for (let i = 0; i < list.length - 1; i += 1) {
      if (Date.parse(list[i + 1].created_at) - Date.parse(list[i].created_at) <= windowMs) list[i].superseded = true;
    }
    // La última de cada cadena recuerda cuántos intentos hubo.
    let run = 1;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].superseded) run += 1; else { list[i].repeat_count = run; run = 1; }
    }
  }
  return marked.map((row) => ({ ...row, ...triageRow(row, { spotEvery }) }));
}

export function applyNoiseFilter(rows = [], { hideInternal = true, hideRepeats = true } = {}) {
  return rows.filter((row) => !(hideInternal && row.is_internal) && !(hideRepeats && row.superseded));
}

export function noiseCounts(rows = []) {
  const live = rows.filter((r) => !r.is_internal && !r.superseded);
  return {
    internal: rows.filter((r) => r.is_internal).length,
    repeats: rows.filter((r) => r.superseded && !r.is_internal).length,
    // respuestas que el sistema da por buenas (sin seguimientos «sí/gracias»)
    auto: live.filter((r) => r.needs_review === false && !isFollowUpQuestion(r.question)).length,
  };
}
