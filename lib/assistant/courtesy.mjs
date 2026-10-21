// GDPSoft v3.13.52 — mensajes de cortesía (gracias, saludos, despedidas).
// Si el mensaje es SOLO cortesía no se consulta ni normativa ni contexto previo.

function normalize(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[¡!¿?.,;:()"'`~*_\-–—…]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const FILLER = '(?:(?:muy|muchisimas|muchisimo|mil|de|nuevo|igual|gdpsoft|gdp|soft|bot|asistente|che|amigo|crack|genio|capo|todo|por|todo|eso|la|el|ayuda|respuesta|info|informacion|aclaracion|rapida|rapido|ok|okey|oka|dale|listo|perfecto|genial|excelente|bueno|buenisimo|barbaro|joya|entendido|claro|vale|bien|super)\\s*)*';
const THANKS = new RegExp(`^${FILLER}(?:muchas |mil |muchisimas )?(?:gracias|gracia|graciass+|thanks|thx|agradezco|agradecido|agradecida)\\s*${FILLER}$`);
const GREETING = new RegExp('^(?:(?:hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|como estas|como va|hey|holi|gdpsoft|gdp|soft|bot|asistente|todos|a todos|y|che)\\s*)+$');
const FAREWELL = new RegExp('^(?:(?:chau|chao|adios|hasta luego|hasta pronto|nos vemos|saludos|un saludo|que andes bien|buen turno|buena tarde|buen fin de semana|gracias|muchas|ok|dale|listo|perfecto|genial)\\s*)+$');
const ACK = /^(?:ok|okey|oka|dale|listo|perfecto|genial|excelente|entendido|claro|barbaro|joya|buenisimo|de acuerdo|ya esta|ya fue)(?: gracias)?$/;

export function classifyCourtesy(question) {
  const text = normalize(question);
  if (!text || text.length > 60) return null;
  if (THANKS.test(text) && /(gracia|thanks|thx|agradec)/.test(text)) return 'THANKS';
  if (GREETING.test(text)) return 'GREETING';
  if (FAREWELL.test(text) && /(chau|chao|adios|hasta|nos vemos|saludos|buen)/.test(text)) return 'FAREWELL';
  if (ACK.test(text)) return 'ACK';
  return null;
}

export function buildCourtesyAnswer(kind) {
  switch (kind) {
    case 'THANKS': return '¡De nada! Cualquier otra consulta sobre una obra social, acá estoy.';
    case 'GREETING': return '¡Hola! Contame qué obra social y qué necesitás consultar.';
    case 'FAREWELL': return '¡Hasta luego! Cualquier consulta, acá estoy.';
    case 'ACK': return '¡Perfecto! Si surge otra consulta, avisame.';
    default: return '';
  }
}
