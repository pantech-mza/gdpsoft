import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSocialWorkDictionary, detectSocialWorks } from '../../lib/assistant/socialWorkDetection.js';

const dictionary = buildSocialWorkDictionary({
  socialWorks: [{ id: 54, name: 'EXPERTA ART (LA CAJA)', active: true }, { id: 11, name: 'OSDE', active: true }],
  aliases: [{ social_work_id: 11, alias_name: 'OSDE DESCARTABLES - DIABETES', alias_normalized: 'osde descartables diabetes', active: true },
    { social_work_id: 54, alias_name: 'EXPERTA ART(LA CAJA) CAMARA', alias_normalized: 'experta art la caja camara', active: true }],
});
const ids = (q) => detectSocialWorks({ text: q, dictionary }).map((m) => m.id);

test('«descartables» no convierte a OSDE en candidata', () => {
  assert.deepEqual(ids('Cómo cargo descartables en Experta ART?'), [54]);
});
test('OSDE sigue reconocida por su nombre', () => {
  assert.deepEqual(ids('osde descartables diabetes cobertura'), [11]);
  assert.deepEqual(ids('osde cubre vacunas'), [11]);
});
test('una pregunta solo por descartables no identifica una obra social', () => {
  assert.deepEqual(ids('como cargo descartables'), []);
});
