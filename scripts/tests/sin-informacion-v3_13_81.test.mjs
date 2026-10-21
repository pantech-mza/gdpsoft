import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNoInfoAnswer } from '../../lib/assistant/no-info-answer.mjs';
import { distinctiveTokens } from '../../lib/assistant/approved-notes.mjs';

test('mensaje sin información nombra las fuentes revisadas', () => {
  const t = buildNoInfoAnswer('UNIMED');
  assert.match(t, /normativas, los procedimientos internos, las observaciones y la Ficha de UNIMED/);
  assert.match(t, /no encontré información certera/);
});
test('consulta puntual (anticonceptivos) no es genérica; «como se valida» sí', () => {
  assert.ok(distinctiveTokens('en unimed solo para anticonceptivos se requiere pre autorizacion', 'UNIMED').length > 0);
  assert.equal(distinctiveTokens('como se valida osep', 'OSEP').length, 0);
});
test('route usa el mensaje en los dos finales sin respuesta', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
  assert.equal((src.match(/buildNoInfoAnswer\(await getSocialWorkName\(socialWorkId\)\)/g) || []).length, 2);
});
