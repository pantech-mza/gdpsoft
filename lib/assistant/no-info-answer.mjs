// v3.13.81 — cuando ninguna fuente responde: se dice qué se revisó y que no hay información certera.
export function buildNoInfoAnswer(socialWorkName = '') {
  const name = String(socialWorkName || '').trim();
  return `Revisé tu consulta en las normativas, los procedimientos internos, las observaciones y la Ficha${name ? ` de ${name}` : ' de la obra social'}, pero no encontré información certera para darte una respuesta. Consultá con el área de Obras Sociales.`;
}
