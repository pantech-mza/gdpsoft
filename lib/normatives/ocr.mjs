// GDPSoft v3.13.61 — OCR con visión para PDF sin texto (presentaciones exportadas
// como imágenes, escaneos). OpenAI recibe el PDF completo y devuelve el texto.

export const OCR_MAX_BYTES = 30 * 1024 * 1024;

export const OCR_INSTRUCTIONS = `Sos un transcriptor de documentos. Recibís un PDF cuyas páginas son imágenes (diapositivas, escaneos o capturas).
Tu tarea es transcribir TODO el contenido visible de CADA página, en orden, de forma fiel y completa:
- Copiá los textos tal cual: títulos, párrafos, viñetas, notas, advertencias, tablas (una fila por línea, columnas separadas con " | ") y textos de cuadros o recuadros destacados.
- Si hay esquemas, flechas, pasos numerados o relaciones entre cuadros, expresalo en texto claro (por ejemplo "Paso 1 → Paso 2") usando solo lo que se ve.
- Conservá nombres propios, sistemas, siglas, números, plazos, importes y porcentajes exactamente como aparecen.
- No resumas, no interpretes, no agregues información que no esté en la imagen y no omitas páginas. Ignorá marcas de agua o logos sin contenido.
- Empezá cada página con una línea "--- Página N ---".
Respondé solo con la transcripción, en español.`;

export function cleanOcrText(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildOcrRequest({ bytes, filename, model }) {
  const base64 = Buffer.from(bytes).toString('base64');
  return {
    model,
    store: false,
    max_output_tokens: 30000,
    instructions: OCR_INSTRUCTIONS,
    input: [{
      role: 'user',
      content: [
        { type: 'input_file', filename: filename || 'documento.pdf', file_data: `data:application/pdf;base64,${base64}` },
        { type: 'input_text', text: 'Transcribí todo el contenido de este PDF, página por página.' },
      ],
    }],
  };
}

/** Devuelve el texto transcripto. Lanza un error claro si no se puede completar. */
export async function ocrPdfToText({ openai, bytes, filename, model }) {
  if (!bytes?.length) throw new Error('El PDF está vacío');
  if (bytes.length > OCR_MAX_BYTES) throw new Error('El PDF supera los 30 MB: dividilo para poder leerlo con OCR');
  const response = await openai.responses.create(buildOcrRequest({ bytes, filename, model }));
  if (response?.status === 'incomplete') {
    throw new Error('El documento es demasiado largo para leerlo de una sola vez. Dividilo en partes más cortas e indexá cada una.');
  }
  const text = cleanOcrText(response?.output_text);
  if (text.length < 80) throw new Error('La lectura con OCR no devolvió texto suficiente. Revisá que el PDF sea legible.');
  return text;
}

// v3.13.86 — normativas cargadas como imagen (captura de WhatsApp, foto): PNG, JPG/JPEG o WEBP.
export function imageMimeType(bytes, filename = '') {
  const b = bytes || [];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export const isImageFile = (bytes, filename = '') => Boolean(imageMimeType(bytes, filename));

export const OCR_IMAGE_INSTRUCTIONS = `Sos un transcriptor de documentos. Recibís una imagen (captura de pantalla, foto o escaneo) de una normativa, comunicado, formulario u orden.
Transcribí TODO el texto visible, en orden, de forma fiel y completa: títulos, párrafos, viñetas, tablas (una fila por línea, columnas separadas con " | "), notas, advertencias y textos de recuadros.
Conservá nombres propios de instituciones, siglas, números normativos, plazos, importes y porcentajes exactamente como aparecen. No resumas, no interpretes y no agregues nada que no esté en la imagen.
Si hay mensajes de chat, copiá quién escribe y la fecha si se ven.

PRIVACIDAD (obligatorio): nunca copies datos personales de un paciente o afiliado (nombre y apellido, DNI, número de afiliado o credencial, fecha de nacimiento, domicilio, teléfono, correo, diagnóstico o medicamentos indicados a esa persona), ni usuarios, contraseñas o claves. Conservá la etiqueta del campo y reemplazá el valor por [DATO DEL PACIENTE] (o [CREDENCIAL] si es un usuario o clave). Ejemplo: "Afiliado N°: [DATO DEL PACIENTE]".

Si la imagen es un formulario, orden, receta o autorización llenados, agregá al final una sección «ESTRUCTURA DEL DOCUMENTO» con:
1) el tipo de documento y la obra social o entidad que lo emite;
2) la lista numerada de TODOS los campos, en el orden en que aparecen, indicando para cada uno si está completo, vacío o tiene firma/sello (sin copiar el valor si es un dato personal);
3) los sellos, firmas, logos, códigos de barras y leyendas obligatorias que se ven.
Respondé solo con la transcripción y esa sección, en español.`;

export function buildImageOcrRequest({ bytes, mime, model }) {
  const base64 = Buffer.from(bytes).toString('base64');
  return {
    model,
    store: false,
    max_output_tokens: 8000,
    instructions: OCR_IMAGE_INSTRUCTIONS,
    input: [{
      role: 'user',
      content: [
        { type: 'input_image', image_url: `data:${mime};base64,${base64}` },
        { type: 'input_text', text: 'Transcribí el texto de esta imagen sin copiar datos personales del paciente y describí la estructura si es un formulario.' },
      ],
    }],
  };
}

export async function ocrImageToText({ openai, bytes, model }) {
  const mime = imageMimeType(bytes);
  if (!mime) throw new Error('El archivo no es una imagen PNG, JPG o WEBP válida');
  if (bytes.length > 20 * 1024 * 1024) throw new Error('La imagen supera los 20 MB');
  const response = await openai.responses.create(buildImageOcrRequest({ bytes, mime, model }));
  const text = cleanOcrText(response?.output_text);
  if (text.length < 20) throw new Error('La lectura de la imagen no devolvió texto suficiente. Revisá que sea legible.');
  return text;
}
