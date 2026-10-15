// GDPSoft v3.12.5 — reconocer expresiones sobre circuito por sucursal.
// No determina la autorización de recepción/dispensación; solo enruta a
// resolveOperation, donde rigen las excepciones del procedimiento del cliente.
function normalized(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

export function isOperationalCircuitQuestion(question) {
  const q = normalized(question);
  if (!q) return false;
  // Preguntas informativas de validadores «¿por dónde valido ...?» pasan a
  // Recordá/Ficha, a menos que haya una indicación operativa expresa.
  if (/\bcamara colegio\b|\bcircuito\b/.test(q)) return true;
  if (/\b(?:es|va|se hace|se tramita|lo tramito|lo gestiono|gestiono|se gestiona|se recibe|recibimos|recibir)\s+(?:de forma\s+)?direct[oa]\b/.test(q)) return true;
  if (/\b(?:directamente|por camara|por colegio)\b/.test(q) &&
      /\b(?:gestionar|gestiono|gestiona|tramitar|tramito|tramita|recibir|recibe|recibimos|se gestiona|se tramita)\b/.test(q)) return true;
  // Consultas sobre "cómo se tramita/gestiona" son operativas si preguntan
  // desde qué sucursal. Evita desviar una consulta normativa genérica.
  if (/\b(?:como|donde)\s+(?:se\s+)?(?:tramita|tramitan|tramito|tramitamos|gestiona|gestiono|gestionamos)\b/.test(q) &&
      /\b(?:en|desde|para)\s+(?:(?:la|mi|nuestra)\s+)?(?:sucursal|dp\s*[1-8]|econo\s+mas|libertad|san\s+francisco)\b/.test(q)) return true;
  return false;
}
