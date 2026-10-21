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
