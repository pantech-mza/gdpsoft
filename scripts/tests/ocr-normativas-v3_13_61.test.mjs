import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOcrRequest, cleanOcrText, ocrPdfToText, OCR_INSTRUCTIONS } from '../../lib/normatives/ocr.mjs';
import { canAccessGDPApi } from '../../lib/server/gdp-api-access-policy.mjs';

const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 1, 2, 3]);

test('OCR: el PDF viaja como archivo de entrada y se pide transcripción completa por página', () => {
  const req = buildOcrRequest({ bytes: pdf, filename: 'osep oyte dispensa.pdf', model: 'gpt-4.1-mini' });
  const file = req.input[0].content[0];
  assert.equal(file.type, 'input_file');
  assert.match(file.file_data, /^data:application\/pdf;base64,/);
  assert.equal(file.filename, 'osep oyte dispensa.pdf');
  assert.match(OCR_INSTRUCTIONS, /--- Página N ---/);
  assert.match(OCR_INSTRUCTIONS, /No resumas/);
  assert.equal(req.store, false);
});

test('OCR: devuelve el texto limpio; falla con mensajes claros si no hay texto o se corta', async () => {
  const long = `--- Página 1 ---\n${'Convenio de Dispensa OYTE. '.repeat(10)}\n\n\n\n--- Página 2 ---\nSISAO y Farmalive`;
  const ok = await ocrPdfToText({ openai: { responses: { create: async () => ({ status: 'completed', output_text: long }) } }, bytes: pdf, filename: 'a.pdf', model: 'm' });
  assert.ok(ok.includes('--- Página 2 ---') && !/\n{3,}/.test(ok));
  await assert.rejects(ocrPdfToText({ openai: { responses: { create: async () => ({ status: 'completed', output_text: 'corto' }) } }, bytes: pdf, model: 'm' }), /texto suficiente/);
  await assert.rejects(ocrPdfToText({ openai: { responses: { create: async () => ({ status: 'incomplete', output_text: long }) } }, bytes: pdf, model: 'm' }), /demasiado largo/);
  await assert.rejects(ocrPdfToText({ openai: {}, bytes: new Uint8Array(0), model: 'm' }), /vacío/);
  assert.equal(cleanOcrText('a\r\n\r\n\r\nb'), 'a\n\nb');
});

test('OCR: ruta solo para administración y flujo cliente conectado', () => {
  const sucursal = { active: true, role: 'SUCURSAL', branch_id: 1 };
  const admin = { active: true, role: 'ADMIN', is_super_admin: false };
  assert.equal(canAccessGDPApi(sucursal, '/api/normatives/ocr', 'POST'), false);
  assert.equal(canAccessGDPApi(admin, '/api/normatives/ocr', 'POST'), true);
  const page = fs.readFileSync('app/admin/obras-sociales/[id]/page.jsx', 'utf8');
  assert.match(page, /async function ocrAndIndex\(call, id, onProgress\)/);
  assert.match(page, /analysis\.recommendation === "OCR" && \/\\\.pdf\$\/i\.test\(analysis\.filename/);
  assert.match(page, /mode: "OCR"/);
  const route = fs.readFileSync('app/api/normatives/ocr/route.js', 'utf8');
  assert.match(route, /requireActor\(request, true\)/);
  assert.match(route, /storage_path_processed: processedPath/);
});
