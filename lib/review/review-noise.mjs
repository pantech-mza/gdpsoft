// GDPSoft v3.13.104 — Validación: quita el «ruido» de la cola para que la revisora vea lo que importa.
//  1) Pruebas internas: dispositivos cuyo nombre contiene «Nico», «Mica» o «Admin», o tráfico ADMIN.
//  2) Repeticiones: la misma pregunta, desde el mismo dispositivo, dentro de las 24 h → solo queda la ÚLTIMA
//     (las anteriores son intentos hasta que la respuesta quedó bien).
import { isFollowUpQuestion } from './conversation-groups.mjs';

// Equipo interno que prueba el bot (Nico, Mica, Admin). Para sumar otro nombre, agregarlo a esta lista.
export const INTERNAL_DEVICE_PATTERN = /\b(?:nico|nicolas|mica|admin|administrador|administracion)\b/;
export const REPEAT_WINDOW_HOURS = 24;

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();

export function isInternalTest(row, pattern = INTERNAL_DEVICE_PATTERN) {
  if (row?.traffic_type === 'ADMIN') return true;
  return pattern.test(fold(row?.device_name));
}

export function markReviewNoise(rows = [], { pattern = INTERNAL_DEVICE_PATTERN, windowHours = REPEAT_WINDOW_HOURS } = {}) {
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
  return marked;
}

export function applyNoiseFilter(rows = [], { hideInternal = true, hideRepeats = true } = {}) {
  return rows.filter((row) => !(hideInternal && row.is_internal) && !(hideRepeats && row.superseded));
}

export function noiseCounts(rows = []) {
  return { internal: rows.filter((r) => r.is_internal).length, repeats: rows.filter((r) => r.superseded && !r.is_internal).length };
}
