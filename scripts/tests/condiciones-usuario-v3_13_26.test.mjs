import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildConstraintsPrompt, splitUserConstraints, stripOfferLine } from '../../lib/assistant/user-constraints.mjs';

const Q = 'Detallame únicamente cómo se realiza la validación. No agregues presentación, auditoría, facturación ni requisitos generales salvo que sean indispensables para realizar la validación.';

test('caso del piloto: se busca solo el tema y se fijan las condiciones', () => {
  const s = splitUserConstraints(Q);
  assert.equal(s.hasConstraints, true);
  assert.equal(s.topic, 'Detallame cómo se realiza la validación.');
  assert.equal(s.constraints.length, 2);
  assert.ok(!/auditor|factur|presentaci/i.test(s.topic));
  const prompt = buildConstraintsPrompt(s);
  assert.match(prompt, /CONDICIONES EXPRESAS DEL USUARIO/);
  assert.match(prompt, /No agregues presentación/);
  assert.match(prompt, /No termines ofreciendo/);
});

test('consultas normales no cambian', () => {
  for (const q of ['Como valido osecac?', 'Requisitos de receta OSDE', 'La receta sin firma se acepta?', 'Y si está vencido?']) {
    const s = splitUserConstraints(q);
    assert.equal(s.hasConstraints, false, q);
    assert.equal(s.topic, q);
  }
  assert.equal(buildConstraintsPrompt(splitUserConstraints('Como valido osecac?')), '');
});

test('otras formas de condición', () => {
  assert.equal(splitUserConstraints('Explicame la presentación. No incluyas facturación.').hasConstraints, true);
  assert.equal(splitUserConstraints('Solamente decime los topes de OSDE').hasConstraints, true);
  assert.equal(splitUserConstraints('Decime los topes sin agregar la cobertura').hasConstraints, true);
  // si el mensaje es solo una condición, se busca con la consulta completa
  assert.equal(splitUserConstraints('No agregues auditoría').topic, 'No agregues auditoría');
});

test('stripOfferLine quita solo la oferta final', () => {
  assert.equal(stripOfferLine('Paso 1\nPaso 2\n\n¿Querés que te muestre también los requisitos para la presentación de las recetas?'), 'Paso 1\nPaso 2');
  assert.equal(stripOfferLine('Paso 1\n¿Querés confirmar el convenio?'), 'Paso 1\n¿Querés confirmar el convenio?');
});

test('route.js aplica las condiciones del usuario en la búsqueda y la respuesta', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /splitUserConstraints\(question\)/);
  assert.match(src, /userConstraints: buildConstraintsPrompt\(userConstraintSplit\)/);
  assert.match(src, /stripOfferLine\(/);
});
