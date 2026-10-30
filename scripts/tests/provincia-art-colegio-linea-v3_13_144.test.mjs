import test from 'node:test';
import assert from 'node:assert/strict';
import { withProvinciaArtColegio } from '../../lib/assistant/branch-restriction.mjs';
import { formatSocialWorkStatus } from '../../lib/assistant/social-work-status.mjs';
const motor = 'En Libertad (COLEGIO), Provincia ART se tramita por circuito Cámara–Colegio: debés validar por [COFA](https://principal.cofa.org.ar/), no por Colegio. Presentá receta común (no digital), con los datos obligatorios y respetando los topes: por producto hasta $20.000 y por receta hasta $80.000, si se supera alguno, requiere autorización. Recordá que la receta tiene 30 días de validez.';
test('Provincia ART en Colegio: se reemplaza el validador del motor por la línea oficial y se conservan los requisitos', () => {
  const r = withProvinciaArtColegio({ answer: motor, route: 'CONTEXT_ENGINE', circuit: 'COLEGIO', workName: 'PROVINCIA ART', branchLabel: 'Libertad' });
  assert.match(r, /^En Libertad, Provincia ART figura inactiva en Colegio, pero podés realizarla por el circuito Cámara–Colegio\./);
  assert.doesNotMatch(r, /COFA|FACAF/);
  assert.match(r, /topes/);
  assert.match(r, /30 días/);
});
test('no toca Cámara, otras obras sociales ni respuestas sin validador/circuito', () => {
  assert.equal(withProvinciaArtColegio({ answer: motor, route: 'CONTEXT_ENGINE', circuit: 'CAMARA', workName: 'PROVINCIA ART' }), null);
  assert.equal(withProvinciaArtColegio({ answer: motor, route: 'CONTEXT_ENGINE', circuit: 'COLEGIO', workName: 'OSDE' }), null);
  assert.equal(withProvinciaArtColegio({ answer: 'El tope por receta es $80.000.', route: 'CONTEXT_ENGINE', circuit: 'COLEGIO', workName: 'PROVINCIA ART' }), null);
});
test('«recibimos ampes?»: el estado suma el horario de la sucursal', () => {
  const r = formatSocialWorkStatus({ name: 'AMPES ASISTIR', active: true }, 'AMPES Asistir se recibe después de las 20 h. Sábados, domingos y feriados se recibe todo el día.');
  assert.match(r, /está activa en GDPSoft\./);
  assert.match(r, /después de las 20 h/);
});
