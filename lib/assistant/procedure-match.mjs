// GDPSoft v3.13.42 — protocolos internos aprobados consultados por SIGNIFICADO.
//
// Los protocolos se disparaban solo con palabras clave (p. ej. «no figura», «vencida»).
// Una consulta como «receta con el nombre de la obra social en observaciones» no
// coincidía con ninguna y el protocolo nunca se consultaba. Acá el modelo solo ELIGE
// el código del protocolo aplicable; la respuesta es SIEMPRE el texto aprobado, nunca
// texto generado por el modelo.

export const PROCEDURE_NONE = 'NINGUNO';
const MAX_PROCEDURES = 40;
const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function buildProcedureSelectionInstructions(procedures) {
  const list = (procedures || []).slice(0, MAX_PROCEDURES).map((p) =>
    `[${p.code}] ${clip(p.title, 120)}\n  Consulta típica: ${clip(p.question, 220)}\n  Criterio: ${clip(p.answer, 600)}`).join('\n\n');
  return `Sos un clasificador para el asistente de farmacias de GDPSoft. Te paso la consulta de un colaborador y una lista de procedimientos internos aprobados.

TAREA: indicá cuál procedimiento responde DIRECTAMENTE lo que el colaborador pregunta.

REGLAS:
- Elegí el procedimiento cuyo criterio se aplica a la situación de la consulta, aunque use otras palabras para describir lo mismo (por ejemplo, «el nombre de la obra social en Observaciones» equivale a «la obra social está aclarada en la propia receta»).
- No elijas uno solo por compartir un tema general: tiene que contestar lo que se pregunta.
- Si ninguno la contesta con claridad, respondé únicamente: ${PROCEDURE_NONE}
- Respondé solamente con el código entre corchetes (por ejemplo GDP-XXX) o ${PROCEDURE_NONE}. Sin explicaciones.

PROCEDIMIENTOS:
${list}`;
}

export function parseProcedureSelection(text, procedures) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.toUpperCase().startsWith(PROCEDURE_NONE)) return null;
  const code = raw.replace(/[\[\]`"'*]/g, '').split(/\s+/)[0].trim();
  return (procedures || []).find((p) => String(p.code).toLowerCase() === code.toLowerCase()) || null;
}

/**
 * Si al cargar el procedimiento quedaron pegadas las preguntas guía de la reunión
 * («¿Qué datos son obligatorios…?»), no se muestran al colaborador: solo el criterio.
 */
export function cleanProcedureAnswer(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n')
    .filter((line) => !/^\s*(?:[·•\-*]\s*)?¿[^\n]*\?\s*$/.test(line));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s*Cirterio:/im, 'Criterio:').trim();
}

export function formatProcedureAnswer(procedure) {
  return `${cleanProcedureAnswer(procedure.answer)}\n\nFuente: Procedimiento interno aprobado de GDP Salud. Prevalece la normativa específica vigente de la obra social, plan y circuito. Ante contradicción, solicitar revisión al área de Obras Sociales.`;
}
