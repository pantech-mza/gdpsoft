// GDPSoft v3.13.90 — evita respuestas de relleno.
// Una respuesta que solo manda a «consultar con la obra social» o a «cumplir los requisitos»
// sin ningún dato concreto (número, plazo, sistema, URL, paso) no responde nada: se trata como
// «sin información certera» y sigue el camino normal (observaciones, protocolos, aviso de que falta el dato).

const fold = (value) => String(value || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const DEFERRAL_PHRASES = [
  /(?:consult|contact|comunic|verific|averigu|pregunt)\w*\s+(?:directamente\s+)?(?:con|a|en)\s+(?:la\s+)?(?:obra social|prepaga|entidad|financiador)/,
  /se recomienda (?:consultar|verificar|contactar)/,
  /(?:debe|deberia|tiene que) (?:cumplir|contar) con (?:los|las|todos los|la)\s+(?:requisitos|documentacion|datos)\s+(?:establecid|requerid|necesari|correspondient)/,
  /(?:segun|de acuerdo con) (?:los )?(?:requisitos|criterios|lineamientos) (?:de la obra social|vigentes|establecidos)/,
  /es importante (?:que|verificar|revisar|asegurarse)/,
];

const CONCRETE_SIGNALS = [
  /\d/,
  /https?:\/\//,
  /www\./,
  /\b(?:sisao|sisad|extranet|app|portal|sistema|plataforma|web|mail|correo|whatsapp|telefono)\b/,
  /\b(?:paso|primero|luego|despues|ingres|cargar|escane|adjunt|firma|sello|membrete|diagnostico|afiliado|dni)\w*/,
];

export function isGenericFillerAnswer(answer) {
  const text = fold(answer);
  if (!text) return false;
  // Una respuesta larga y detallada no es relleno aunque mencione «consultar».
  if (text.length > 600) return false;
  if (!DEFERRAL_PHRASES.some((re) => re.test(text))) return false;
  return !CONCRETE_SIGNALS.some((re) => re.test(text));
}

// Pedidos de «ejemplo / modelo / cómo se ve»: el bot solo puede describirlo con lo que dice el texto.
export function asksForExample(question) {
  return /\b(ejemplo|modelo|formato|como se ve|como es el formulario|como es la orden|tenes alguno|tenes algun)\b/.test(fold(question));
}
