// v3.13.99 — Extracción del texto de normativas (misma lógica que el export de auditoría).
// Orden: 1) texto procesado guardado, 2) archivo original, 3) texto indexado en OpenAI.
import { spreadsheetBufferToText, isSpreadsheetFile } from '../normatives/spreadsheet-text.mjs';

const ORIGINAL_BUCKET = 'normativas-originales';
const PROCESSED_BUCKET = 'normativas-procesadas';

export function makeNormativeTextExtractor(supabase) {
  async function download(bucket, storagePath) {
    const { data, error } = await supabase.storage.from(bucket).download(storagePath);
    if (error || !data) throw new Error(`descarga ${bucket}/${storagePath}: ${error?.message || 'vacío'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  // Texto que el buscador de OpenAI tiene indexado para esa normativa (es lo que el bot realmente lee).
  async function textFromVectorStore(n) {
    const key = process.env.OPENAI_API_KEY;
    const vs = n.openai_vector_store_id;
    const ids = [n.openai_vector_store_file_id, n.openai_file_id].filter(Boolean);
    if (!key || !vs || !ids.length) throw new Error('sin datos de OpenAI para recuperar el texto indexado');
    let lastError = '';
    for (const fileId of ids) {
      const res = await fetch(`https://api.openai.com/v1/vector_stores/${vs}/files/${fileId}/content`, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) { lastError = `OpenAI ${res.status}`; continue; }
      const json = await res.json();
      const text = (json.data || []).map((c) => c.text || '').join('\n');
      if (text.trim()) return text;
    }
    throw new Error(lastError || 'OpenAI no devolvió texto');
  }

  async function extractFromOriginal(n) {
    if (!n.storage_path_original) return { text: '', extraction: 'SIN ARCHIVO' };
    const buf = await download(ORIGINAL_BUCKET, n.storage_path_original);
    const name = String(n.original_filename || '').toLowerCase();
    const ext = name.split('.').pop();
    if (['txt', 'md', 'csv'].includes(ext)) return { text: buf.toString('utf8'), extraction: 'TEXTO DIRECTO' };
    if (ext === 'pdf') {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        pages.push(content.items.map((it) => it.str).join(' '));
      }
      const text = pages.join('\n\n');
      return { text, extraction: text.trim().length < 50 ? 'PDF SIN TEXTO (escaneado: requiere OCR)' : 'PDF' };
    }
    if (ext === 'docx') {
      const mammoth = (await import('mammoth')).default;
      return { text: (await mammoth.extractRawText({ buffer: buf })).value, extraction: 'DOCX' };
    }
    if (ext === 'doc') {
      const WordExtractor = (await import('word-extractor')).default;
      return { text: (await new WordExtractor().extract(buf)).getBody(), extraction: 'DOC' };
    }
    if (isSpreadsheetFile(name)) return { text: await spreadsheetBufferToText(buf, name), extraction: 'PLANILLA' };
    return { text: '', extraction: `FORMATO NO EXTRAÍBLE (.${ext})` };
  }

  // Orden: 1) texto procesado guardado, 2) archivo original, 3) texto indexado en OpenAI.
  async function extractNormativeText(n) {
    const notes = [];
    if (n.storage_path_processed) {
      try {
        const buf = await download(PROCESSED_BUCKET, n.storage_path_processed);
        if (buf.toString('utf8').trim()) return { text: buf.toString('utf8'), extraction: 'TEXTO PROCESADO (OCR/planilla)' };
      } catch (e) { notes.push('procesado no disponible'); }
    }
    try {
      const r = await extractFromOriginal(n);
      if (String(r.text || '').trim().length >= 50) return notes.length ? { ...r, extraction: `${r.extraction} (${notes.join(', ')})` } : r;
      notes.push(r.extraction);
    } catch (e) { notes.push(`original: ${e.message}`); }
    try {
      const text = await textFromVectorStore(n);
      return { text, extraction: `TEXTO INDEXADO EN OPENAI (${notes.join('; ')})` };
    } catch (e) { notes.push(`openai: ${e.message}`); }
    throw new Error(notes.join(' | '));
  }

  return extractNormativeText;
}
