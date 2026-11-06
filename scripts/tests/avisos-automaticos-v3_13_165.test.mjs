import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectWorkFromTitle } from '../../lib/server/notice-work-detect.mjs';
import { ENGINE_SYSTEM_PROMPT } from '../../lib/assistant/context-engine/core.mjs';

const works = [{ id: 1, name: 'OSEP', active: true }, { id: 2, name: 'OSEP OYTE', active: true }, { id: 3, name: 'OSDE', active: true }, { id: 4, name: 'OSA', active: false }, { id: 5, name: 'JERARQUICOS SALUD', active: true }];
const client = { from: () => ({ select: async () => ({ data: works }) }) };

test('detecta la obra social por el título (la coincidencia más larga y solo palabras completas)', async () => {
  assert.equal(await detectWorkFromTitle(client, 'OSEP - CONVENIO NOVO NORDISK'), 1);
  assert.equal(await detectWorkFromTitle(client, 'OSEP OYTE: cambio de procedimiento'), 2);
  assert.equal(await detectWorkFromTitle(client, 'Jerárquicos Salud — nueva validación'), 5);
  assert.equal(await detectWorkFromTitle(client, 'Aviso general para todas'), null);
  assert.equal(await detectWorkFromTitle(client, 'OSA nueva'), null);
});

test('el aviso nuevo lo usa el asistente por defecto y la regla 2c da prioridad al más reciente', () => {
  const page = fs.readFileSync(new URL('../../app/admin/noticias/page.jsx', import.meta.url), 'utf8');
  assert.match(page, /\[botUse,setBotUse\]=useState\(true\)/);
  assert.match(ENGINE_SYSTEM_PROMPT, /vale el M[AÁ]S RECIENTE/);
});

test('cada aviso tiene su interruptor para el bot y la API lo acepta', () => {
  const page = fs.readFileSync(new URL('../../app/admin/noticias/page.jsx', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../../app/api/admin/noticias/route.js', import.meta.url), 'utf8');
  assert.match(page, /El asistente \(bot\) usa este aviso/);
  assert.match(page, /action:'bot'/);
  assert.match(api, /\['archive','republish','edit','bot'\]/);
  assert.match(api, /body\.action === 'bot'/);
});
