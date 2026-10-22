"use client";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) =>
    text.includes(normalizeText(pattern))
  );
}

/**
 * Decide si la pregunta realmente necesita la imagen activa.
 *
 * Tener una imagen cargada NO fuerza todas las consultas a visión.
 * Las preguntas normativas normales continúan por /api/assistant/chat.
 */
export function shouldUseActiveImage({
  activeImage,
  question,
  topic = null,
}) {
  if (!activeImage?.id || topic) {
    return false;
  }

  const text = normalizeText(question);

  if (!text) {
    return false;
  }

  const explicitImageReferences = [
    "esta receta",
    "esa receta",
    "receta adjunta",
    "receta de la foto",
    "receta de la imagen",
    "esta imagen",
    "esa imagen",
    "imagen adjunta",
    "esta foto",
    "esa foto",
    "foto adjunta",
    "en esta receta",
    "de esta receta",
    "en la imagen",
    "en la foto",
    "lo que ves",
    "lo que se ve",
    // v3.13.89 — documentos señalados con deíctico ("esa orden", "ese formulario").
    "esta orden",
    "esa orden",
    "esta autorizacion",
    "esa autorizacion",
    "este documento",
    "ese documento",
    "este formulario",
    "ese formulario",
    "esta planilla",
    "esa planilla",
    "este pedido",
    "ese pedido",
    "esta prescripcion",
    "esa prescripcion",
    "este certificado",
    "ese certificado",
    "esta nota medica",
    "esa nota medica",
    "lo que adjunte",
    "lo que subi",
    "lo que te mande",
    "el archivo adjunto",
    "el documento adjunto",
    "la orden adjunta",
    "el formulario adjunto",
  ];

  if (
    includesAny(
      text,
      explicitImageReferences
    )
  ) {
    return true;
  }

  const visualReadingPatterns = [
    "que datos podes identificar",
    "que datos puedes identificar",
    "que informacion podes identificar",
    "que informacion puedes identificar",
    "que informacion muestra",
    "que muestra la imagen",
    "que muestra la foto",
    "que dice la imagen",
    "que dice la foto",
    "podes identificar obra social",
    "puedes identificar obra social",
    "podes identificar la obra social",
    "puedes identificar la obra social",
    "podes identificar el numero",
    "puedes identificar el numero",
    "podes leer",
    "puedes leer",
    "alcanzas a leer",
    "se alcanza a leer",
    "se puede leer",
    "que obra social aparece",
    "cual obra social aparece",
  ];

  if (
    includesAny(
      text,
      visualReadingPatterns
    )
  ) {
    return true;
  }

  const visibleFieldPatterns = [
    "esta fecha",
    "la fecha esta bien",
    "la fecha esta ok",
    "tiene fecha",
    "se ve la fecha",

    "el membrete esta bien",
    "el membrete esta ok",
    "tiene membrete",
    "se ve el membrete",

    "la firma esta bien",
    "la firma esta ok",
    "tiene firma",
    "se ve la firma",
    "esta firmada",
    "esta firmado",

    "el sello esta bien",
    "el sello esta ok",
    "tiene sello",
    "se ve el sello",

    "el diagnostico se lee",
    "se ve el diagnostico",

    "la droga se lee",
    "se ve la droga",
    "que droga dice",

    "el medicamento se lee",
    "se ve el medicamento",

    "el numero de afiliado",
    "el numero de socio",
    "numero de afiliado se lee",
    "numero de socio se lee",

    "la autorizacion aparece",
    "se ve la autorizacion",
    "tiene autorizacion",
  ];

  if (
    includesAny(
      text,
      visibleFieldPatterns
    )
  ) {
    return true;
  }

  const prescriptionCheckPatterns = [
    "puedo recibir esta receta",
    "puedo aceptar esta receta",
    "puedo dispensar esta receta",
    "se puede recibir esta receta",
    "se puede aceptar esta receta",
    "se puede dispensar esta receta",
    "esta receta sirve",
    "esta receta esta bien",
    "esta receta es valida",
    "cumple esta receta",
    "cumple los requisitos visibles",
    "le falta algo a esta receta",
    "revisar esta receta",
    "verificar esta receta",
    "controlar esta receta",
  ];

  if (
    includesAny(
      text,
      prescriptionCheckPatterns
    )
  ) {
    return true;
  }

  // Estas preguntas NO deben ir a visión:
  //
  // vigencia receta osde
  // avalian vigencia
  // rp osde
  // osde nombre comercial
  // osde requiere diagnostico
  // por donde valido avalian

  return false;
}