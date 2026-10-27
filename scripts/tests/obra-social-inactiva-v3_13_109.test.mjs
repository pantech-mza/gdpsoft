import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findInactiveMatch, buildInactiveAnswer, suggestWithInactive, buildSuggestionAnswerWithInactive } from '../../lib/assistant/inactive-social-work.mjs';
import { isUserSideAnswer } from '../../lib/review/conversation-groups.mjs';

const active = ['ROSFAR - DISPENSA', 'OSDE', 'OSFATLYF (LUZ Y FUERZA)', 'MEDICUS - NO FUERZA DE SEGURIDAD', 'AMPES ASISTIR'];
const inactive = [{ id: 9, name: 'IOSFA' }, { id: 10, name: 'OSPE ANTIGUA' }];

test('«OSFA» ofrece IOSFA (inactiva) en primer lugar, por encima de ROSFAR', () => {
  const s = suggestWithInactive('OSFA', active, inactive.map((w) => w.name));
  assert.equal(s.names[0], 'IOSFA');
  assert.ok(s.inactive.has('IOSFA'));
  const text = buildSuggestionAnswerWithInactive('OSFA', s);
  assert.match(text, /IOSFA \(figura inactiva en GDPSoft\)/);
  assert.match(text, /No pude identificar OSFA/);
});
test('si la sugerida es activa no se marca como inactiva', () => {
  const s = suggestWithInactive('osde x', ['OSDE', 'OSDEPYM'], []);
  assert.equal(s.inactive.size, 0);
  const t = buildSuggestionAnswerWithInactive('osde x', s);
  assert.doesNotMatch(t, /inactiva/);
});
test('si escriben IOSFA exacto se reconoce como inactiva y se explica', () => {
  assert.equal(findInactiveMatch('IOSFA', inactive)?.name, 'IOSFA');
  assert.equal(findInactiveMatch('recibimos iosfa?', inactive)?.id, 9);
  assert.equal(findInactiveMatch('ospe antigua requisitos', inactive)?.id, 10);
  assert.equal(findInactiveMatch('osfa', inactive), null); // parecida pero no exacta: se ofrece, no se asume
  assert.equal(findInactiveMatch('ospe', inactive), null);
  assert.match(buildInactiveAnswer('IOSFA'), /IOSFA figura como obra social INACTIVA/);
});
test('la ruta usa las inactivas en la consulta común y en la de estado, y la Validación no la trata como falla', () => {
  const src = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  assert.match(src, /inactive-social-work\.mjs/);
  assert.equal((src.match(/INACTIVE_SOCIAL_WORK/g) || []).length >= 3, true);
  assert.match(src, /findInactiveMatch\(name, inactiveWorks\)/);
  assert.match(src, /findInactiveMatch\(statusUnresolved, statusInactive\)/);
  assert.equal(isUserSideAnswer({ route: 'INACTIVE_SOCIAL_WORK', answer: 'x' }), true);
});

import { detectInactiveSocialWork } from '../../lib/assistant/inactive-social-work.mjs';
const INACTIVE = [{ id: 9, name: 'IOSFA', active: false }, { id: 10, name: 'OSPE ANTIGUA', active: false }];
const ALIASES = [{ social_work_id: 9, alias: 'FUERZA AEREA' }, { social_work_id: 9, alias: 'Fuerzas Armadas' }];
test('un ALIAS de una obra social inactiva la identifica («obra social de la fuerza aerea» → IOSFA)', () => {
  const r = detectInactiveSocialWork({ question: 'obra social de la fuerza aerea', inactiveWorks: INACTIVE, aliases: ALIASES });
  assert.equal(r?.name, 'IOSFA'); assert.equal(r?.source, 'ALIAS');
  assert.equal(detectInactiveSocialWork({ question: 'instituto de obras sociales milicia argentina iosfa', inactiveWorks: INACTIVE, aliases: ALIASES })?.name, 'IOSFA');
  assert.equal(detectInactiveSocialWork({ question: 'que requisitos tiene osde', inactiveWorks: INACTIVE, aliases: ALIASES }), null);
});
test('con las activas ambiguas por una palabra suelta, solo cuenta el nombre/alias completo', () => {
  const alias = [{ social_work_id: 9, alias: 'FUERZA AEREA' }];
  assert.equal(detectInactiveSocialWork({ question: 'obra social de la fuerza aerea', inactiveWorks: INACTIVE, aliases: alias, strict: true })?.name, 'IOSFA');
  // una palabra distintiva suelta de la inactiva no alcanza en modo estricto
  assert.equal(detectInactiveSocialWork({ question: 'ospe requisitos', inactiveWorks: INACTIVE, aliases: [], strict: true }), null);
  assert.equal(detectInactiveSocialWork({ question: 'algo', inactiveWorks: [], aliases: alias }), null);
});
test('la ruta busca inactivas por nombre/alias antes de pedir aclaración y responde que no está activa', () => {
  const src = fs.readFileSync('app/api/assistant/query/route.js', 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /detectInactiveSocialWork\(\{ question: cleanQuestion/);
  assert.match(src, /if \(detectedSocialWork\.inactive && !isSocialWorkStatusQuestion\(question\)\)/);
  assert.match(src, /inactive_social_work/);
});
