import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { imageMimeType, isImageFile, buildImageOcrRequest, ocrImageToText } from '../../lib/normatives/ocr.mjs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('se reconocen PNG, JPG y WEBP por su firma, no por el nombre', () => {
  assert.equal(imageMimeType([0x89, 0x50, 0x4e, 0x47, 0, 0]), 'image/png');
  assert.equal(imageMimeType([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg');
  assert.equal(imageMimeType([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), 'image/webp');
  assert.equal(imageMimeType(new TextEncoder().encode('%PDF-1.7')), null);
  assert.equal(isImageFile([0x50, 0x4b, 3, 4]), false);
});

test('el pedido de OCR de imagen manda la imagen y no el PDF', () => {
  const req = buildImageOcrRequest({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png', model: 'm' });
  assert.equal(req.input[0].content[0].type, 'input_image');
  assert.match(req.input[0].content[0].image_url, /^data:image\/png;base64,/);
});

test('ocrImageToText devuelve el texto o falla con un mensaje claro', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const ok = { responses: { create: async () => ({ output_text: 'Circular 123: las recetas de OSEP deben validarse por Farmalive.' }) } };
  assert.match(await ocrImageToText({ openai: ok, bytes: png, model: 'm' }), /Circular 123/);
  const empty = { responses: { create: async () => ({ output_text: ' ' }) } };
  await assert.rejects(() => ocrImageToText({ openai: empty, bytes: png, model: 'm' }), /no devolvió texto suficiente/);
  await assert.rejects(() => ocrImageToText({ openai: ok, bytes: new Uint8Array([1, 2, 3]), model: 'm' }), /no es una imagen/);
});

test('analizar, OCR y pantalla aceptan imágenes', () => {
  assert.match(read('app/api/normatives/analyze/route.js'), /imageMimeType\(bytes, normative\.original_filename\)\) \{/);
  assert.match(read('app/api/normatives/analyze/route.js'), /processing_recommended: "OCR"/);
  assert.match(read('app/api/normatives/ocr/route.js'), /isImageFile\(bytes, normative\.original_filename\)/);
  const page = read('app/admin/obras-sociales/[id]/page.jsx');
  assert.equal((page.match(/\(pdf\|png\|jpe\?g\|webp\)/g) || []).length, 2);
});

test('v3.13.87: más formatos de planilla y mensaje claro para formatos no soportados', async () => {
  const { isSpreadsheetFile } = await import('../../lib/normatives/spreadsheet-text.mjs');
  const zip = [0x50, 0x4b, 3, 4];
  assert.equal(isSpreadsheetFile('planilla.xlsm', zip), true);
  assert.equal(isSpreadsheetFile('planilla.ods', zip), true);
  assert.equal(isSpreadsheetFile('planilla.csv', [0x41, 0x2c, 0x42]), true);
  assert.equal(isSpreadsheetFile('planilla.exe', zip), false);
  const analyze = read('app/api/normatives/analyze/route.js');
  assert.match(analyze, /El formato «\.\$\{extension\}» no se puede analizar/);
  assert.match(analyze, /\["docx", "pptx"\]\.includes\(extension\)/);
});
