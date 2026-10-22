// GDPSoft v3.13.94 — Exportación de auditoría (SOLO LECTURA).
//
// Uso (desde la carpeta del proyecto):
//   node scripts/exportar-auditoria.mjs --circuito=COLEGIO
//   node scripts/exportar-auditoria.mjs --circuito=CAMARA --desde=2026-10-19T00:00:00-03:00
//
// Lee de Supabase (no escribe nada) y genera un ZIP con las consultas/respuestas y la base de
// conocimiento por obra social, con datos personales y credenciales enmascarados.
import fs from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';
import { collectAudit, toCsv, QUERY_COLUMNS, safeFileName } from '../lib/audit/export-audit.mjs';
import { spreadsheetBufferToText, isSpreadsheetFile } from '../lib/normatives/spreadsheet-text.mjs';

nextEnv.loadEnvConfig(process.cwd());

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const circuit = String(arg('circuito', 'TODOS')).toUpperCase().replace('Á', 'A');
if (!['COLEGIO', 'CAMARA', 'TODOS'].includes(circuit)) {
  console.error('Usá --circuito=COLEGIO, --circuito=CAMARA o --circuito=TODOS (por defecto)');
  process.exit(1);
}
// --desde=INICIO exporta todo el historial.
const sinceArg = arg('desde', '2026-10-19T00:00:00-03:00');
const since = String(sinceArg).toUpperCase() === 'INICIO' ? '1970-01-01T00:00:00Z' : sinceArg;
if (Number.isNaN(Date.parse(since))) { console.error(`Fecha inválida en --desde: ${since}`); process.exit(1); }

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

const ORIGINAL_BUCKET = 'normativas-originales';
const PROCESSED_BUCKET = 'normativas-procesadas';

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

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const outDir = path.resolve(process.cwd(), `auditoria-${circuit}-${stamp}`);
fs.mkdirSync(path.join(outDir, 'conocimiento'), { recursive: true });

console.log(`Exportando circuito ${circuit} desde ${since} (solo lectura)…`);
const result = await collectAudit({
  supabase, circuit, since, includeAllWorks: flag('todas-las-obras-sociales'),
  extractNormativeText, log: (m) => console.log(m),
});

fs.writeFileSync(path.join(outDir, 'consultas.csv'), toCsv(result.queryRows, QUERY_COLUMNS), 'utf8');
// Listas pedidas por separado: consultas aprobadas por el admin y consultas corregidas.
fs.writeFileSync(path.join(outDir, 'aprobadas.csv'), toCsv(result.queryRows.filter((r) => r.veredicto_admin === 'CORRECT'), QUERY_COLUMNS), 'utf8');
fs.writeFileSync(path.join(outDir, 'corregidas.csv'), toCsv(result.queryRows.filter((r) => ['INCORRECT', 'PARTIAL'].includes(r.veredicto_admin)), QUERY_COLUMNS), 'utf8');
fs.writeFileSync(path.join(outDir, 'consultas.jsonl'), result.queryRows.map((r) => JSON.stringify(r)).join('\n'), 'utf8');
for (const k of result.knowledge) {
  fs.writeFileSync(path.join(outDir, 'conocimiento', `${String(k.work.id).padStart(4, '0')}-${safeFileName(k.work.name)}.md`), k.markdown, 'utf8');
}
if (result.general.length) {
  fs.writeFileSync(path.join(outDir, 'conocimiento', '0000-PROTOCOLOS-GENERALES.md'),
    result.general.map((p) => `### ${p.code || ''} ${p.title || ''} (ID ${p.id})\n**Pregunta:** ${p.question || ''}\n\n${p.answer || ''}\n`).join('\n'), 'utf8');
}
const resumen = {
  circuito: circuit, desde: since, generado: new Date().toISOString(),
  sucursales: result.branches.map((b) => b.name), consultas: result.queryRows.length,
  obras_sociales: result.knowledge.map((k) => ({ id: k.work.id, nombre: k.work.name, ...k.stats })),
  errores: result.errors,
};
fs.writeFileSync(path.join(outDir, 'resumen.json'), JSON.stringify(resumen, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'LEEME.txt'),
`Auditoría GDPSoft — circuito ${circuit}
Consultas desde: ${since}
Generado: ${resumen.generado}

aprobadas.csv / corregidas.csv    -> las consultas que el admin marcó correctas, y las que corrigió (con su corrección).
consultas.csv / consultas.jsonl  -> todas las consultas con la respuesta del bot, la ruta, y la corrección/veredicto del admin si existe.
conocimiento/*.md                -> por obra social: Ficha, observaciones aprobadas, protocolos, FAQs, reglas, correcciones y normativas.
resumen.json                     -> conteos y errores de la exportación.

Los datos personales (DNI, afiliado, etc.) y las credenciales están enmascarados. Las observaciones de acceso (usuarios y claves) NO se exportan.
`, 'utf8');

const zip = new AdmZip();
zip.addLocalFolder(outDir);
const zipPath = `${outDir}.zip`;
zip.writeZip(zipPath);

console.log('\nListo.');
console.log(`Consultas: ${resumen.consultas} · Obras sociales: ${resumen.obras_sociales.length} · Errores: ${resumen.errores.length}`);
if (resumen.errores.length) console.log('Revisá resumen.json: hubo errores no fatales.');
console.log(`Archivo para enviar: ${zipPath}`);
