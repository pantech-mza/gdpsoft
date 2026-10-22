// GDPSoft v3.13.97 — «¿Cómo llegó el bot a esta respuesta?»
// Registro liviano de los pasos que recorre una consulta (qué fuentes probó, cuáles descartó y de cuál salió la respuesta).
// Se guarda en assistant_query_log.trace (jsonb) y se muestra en Validación. Nunca debe romper una consulta.

const MAX_STEPS = 40;
const clip = (v, n = 240) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export const ROUTE_LABELS = Object.freeze({
  ADMIN_CORRECTION: 'Corrección aprobada por el administrador',
  STRUCTURED_PROFILE: 'Ficha de la obra social (dato puntual)',
  STRUCTURED_OPERATION: 'Regla de operación / circuito Cámara-Colegio',
  PRESCRIPTION_CHECKLIST_FICHA_NORMATIVE: 'Lista de requisitos armada con la Ficha y la normativa',
  APPROVED_INTERNAL_PROCEDURE: 'Protocolo interno aprobado',
  INTERNAL_PROCEDURE_FALLBACK: 'Protocolo interno (último recurso, sin respuesta de la normativa)',
  INTERNAL_PROCEDURE_BY_MEANING: 'Protocolo interno elegido por significado',
  APPROVED_NOTES_FALLBACK: 'Observaciones aprobadas (la normativa no respondió)',
  SEMANTIC: 'Buscador de normativas (File Search)',
  CACHE: 'Respuesta guardada de una consulta anterior',
  NORMATIVE_SCOPE_UNVERIFIED: 'Alcance de normativa sin confirmar (circuito o plan)',
  OPERATION_NOT_CONFIRMED: 'Sin regla operativa confirmada',
  UNKNOWN_EXPLICIT_SOCIAL_WORK: 'Obra social mencionada que no existe en GDPSoft',
  AMBIGUOUS_SOCIAL_WORK: 'Más de una obra social coincide: repregunta',
  CLARIFICATION_NEEDED: 'Mención sin pregunta: repregunta',
  GENERAL_BRANCH_CIRCUIT: 'Circuito general de la sucursal',
  COMMON_AUTHORIZATION_LIMITS: 'Topes de autorización (regla común)',
  CREDENTIALS_PROTECTED: 'Consulta de credenciales (protegida)',
});

export function createTrace() {
  const steps = [];
  return {
    add(stage, detail = {}) {
      try {
        if (steps.length >= MAX_STEPS) return;
        const safe = {};
        for (const [k, v] of Object.entries(detail || {})) {
          safe[k] = Array.isArray(v) ? v.slice(0, 8).map((x) => (typeof x === 'object' ? x : clip(x))) : (typeof v === 'string' ? clip(v) : v);
        }
        steps.push({ n: steps.length + 1, stage, ...safe });
      } catch { /* el rastro nunca rompe una consulta */ }
    },
    snapshot() { return steps.slice(); },
  };
}

export function describeSearchResults(results = [], limit = 5) {
  return (Array.isArray(results) ? results : []).slice(0, limit).map((r) => ({
    normativa_id: r?.attributes?.normative_id ?? null,
    archivo: clip(r?.filename, 120),
    puntaje: typeof r?.score === 'number' ? Math.round(r.score * 1000) / 1000 : null,
    extracto: clip(r?.text, 220),
  }));
}

export function finalStep({ route, source, found }) {
  return { stage: 'respuesta_final', ruta: route || '', fuente: source || '', descripcion: ROUTE_LABELS[route] || route || '', encontro_info: found ?? null };
}
