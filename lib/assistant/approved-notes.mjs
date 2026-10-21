import { filterTextsByVariant } from './plan-variant.mjs';
// GDPSoft v3.13.36 — Observaciones operativas aprobadas como apoyo del bot.
//
// Las observaciones (social_work_notes) se usan SOLO cuando no hay respuesta en las
// normativas (o la obra social no tiene normativas vinculadas), y SOLO si son:
//   · kind = GENERAL  (las de ACCESO contienen credenciales: nunca se leen), y
//   · review_status = APPROVED  (las históricas pendientes de revisión no se usan).
// La respuesta aclara que proviene de una observación de Administración, no de la normativa.

export const NOTES_NOT_APPLICABLE = 'NO_APLICA';
const MAX_NOTES = 12;
const MAX_NOTE_CHARS = 2500;

const clip = (text, max) => String(text ?? '').replace(/\r/g, '').trim().slice(0, max);

export function pickApprovedNotes(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.kind === 'GENERAL' && row?.review_status === 'APPROVED')
    .map((row) => clip(row.body, MAX_NOTE_CHARS))
    .filter(Boolean)
    .slice(0, MAX_NOTES);
}

export async function loadApprovedNotes(supabaseAdmin, socialWorkId, variant = null) {
  if (!Number.isInteger(Number(socialWorkId)) || Number(socialWorkId) <= 0) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('social_work_notes')
      .select('kind,body,review_status')
      .eq('social_work_id', Number(socialWorkId))
      .eq('kind', 'GENERAL')
      .eq('review_status', 'APPROVED')
      .order('id', { ascending: true });
    if (error) return [];
    return filterTextsByVariant(pickApprovedNotes(data), variant);
  } catch {
    return [];
  }
}

export function buildNotesInstructions(socialWorkName, notes) {
  const list = notes.map((note, index) => `OBSERVACIÓN ${index + 1}:\n${note}`).join('\n\n');
  return `Sos el asistente de farmacias de GDPSoft. Respondé la consulta sobre ${socialWorkName || 'la obra social'} usando EXCLUSIVAMENTE las observaciones operativas aprobadas por Administración que siguen.

REGLAS:
- Usá solo lo que dicen las observaciones. No agregues datos, porcentajes ni pasos que no estén escritos.
- Si las observaciones no responden la consulta, respondé únicamente: ${NOTES_NOT_APPLICABLE}
- Respuesta breve y concreta, en español rioplatense. Si hay pasos u orden de aplicación, mostralos en lista numerada.
- Los correos electrónicos sí podés incluirlos.
- NUNCA incluyas usuarios, claves ni códigos de acceso aunque aparezcan en el texto: decí que están cifrados y que deben consultarse dentro de la obra social, en «Observaciones y accesos», con el botón «Ver credenciales».

${list}`;
}

export function parseNotesAnswer(text) {
  const answer = String(text ?? '').trim();
  if (!answer || answer.toUpperCase().startsWith(NOTES_NOT_APPLICABLE)) return null;
  return answer;
}

export function formatNotesAnswer(answer) {
  return `${String(answer).trim()}\n\nFuente: observación operativa aprobada por Administración (no es normativa oficial).`;
}

// ---------------------------------------------------------------------------
// Consultas por usuarios / claves
// ---------------------------------------------------------------------------
const fold = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9@. ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function isCredentialQuestion(question) {
  return /\b(usuario|usuarios|clave|claves|contrasena|contrasenas|password|credencial|credenciales)\b/.test(fold(question));
}

export function extractEmails(notes) {
  const found = new Set();
  for (const note of notes || []) {
    for (const match of String(note).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) found.add(match[0]);
  }
  return [...found];
}

// Los usuarios y claves están cifrados: el bot nunca los ve ni los dice.
export function buildCredentialAnswer({ socialWorkName, hasAccessNotes, emails = [] }) {
  const name = String(socialWorkName || 'esta obra social').trim();
  const lines = [];
  if (hasAccessNotes) {
    lines.push(`Los usuarios y claves de ${name} están cifrados y no puedo verlos. Revisalos dentro de la obra social, en «Observaciones y accesos», haciendo clic en «Ver credenciales».`);
  } else {
    lines.push(`No hay credenciales cargadas para ${name} en «Observaciones y accesos». Si las necesitás, pedile a Administración que las registre.`);
  }
  if (emails.length) {
    lines.push(`Correo registrado: ${emails.join(', ')}.`);
  }
  return lines.join('\n\n');
}
