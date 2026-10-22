import test from 'node:test';
import assert from 'node:assert/strict';
import { OCR_IMAGE_INSTRUCTIONS, buildImageOcrRequest } from '../../lib/normatives/ocr.mjs';

test('el OCR de imágenes no copia datos de pacientes y describe la estructura del formulario', () => {
  assert.match(OCR_IMAGE_INSTRUCTIONS, /nunca copies datos personales/);
  assert.match(OCR_IMAGE_INSTRUCTIONS, /\[DATO DEL PACIENTE\]/);
  assert.match(OCR_IMAGE_INSTRUCTIONS, /\[CREDENCIAL\]/);
  assert.match(OCR_IMAGE_INSTRUCTIONS, /ESTRUCTURA DEL DOCUMENTO/);
  assert.match(OCR_IMAGE_INSTRUCTIONS, /lista numerada de TODOS los campos/);
  const req = buildImageOcrRequest({ bytes: Buffer.from('x'), mime: 'image/png', model: 'm' });
  assert.equal(req.instructions, OCR_IMAGE_INSTRUCTIONS);
});
