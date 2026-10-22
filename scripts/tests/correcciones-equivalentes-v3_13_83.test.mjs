import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { similarQuestions, findSimilarCorrection, answerSaysNoInfo, buildCrossCircuitAnswer } from '../../lib/assistant/admin-corrections.mjs';

const route = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');

test('preguntas reales del piloto que difieren solo en muletillas coinciden', () => {
  assert.ok(similarQuestions('como tramito osecac en mi sucursal', 'como tramito osecac', 'OSECAC'));
  assert.ok(similarQuestions('tengo una receta de osep que contiene tiras reactivas las cuales estan en falta en drogueria coope se la podemos entregar de nuestro stock',
    'receta de osep que contiene tiras reactivas las cuales estan en falta en drogueria coope se la podemos entregar de nuestro stock', 'OSEP'));
  assert.ok(similarQuestions('hola tengo una receta de damsu que tiene el nombre de la obra social en observaciones puedo recibirla',
    'tengo una receta de damsu que tiene el nombre de la obra social en observaciones puedo recibirla', 'DAMSU'));
  assert.ok(similarQuestions('provincia art necesita copia denuncia', 'provincia art necesita copia denuncia?', 'PROVINCIA ART'));
});

test('temas, negaciones o números distintos NO coinciden', () => {
  assert.equal(similarQuestions('como valido osep', 'como valido osep oyte', 'OSEP'), false);
  assert.equal(similarQuestions('osde necesita autorizacion para planes 210 en farmacia', 'osde necesita autorizacion para planes 310 en farmacia', 'OSDE'), false);
  assert.equal(similarQuestions('unimed pide autorizacion previa para este medicamento', 'unimed no pide autorizacion previa para este medicamento', 'UNIMED'), false);
  assert.equal(similarQuestions('requisitos', 'requisitos osde', 'OSDE'), false);
  assert.equal(similarQuestions('osde descuento', 'osde vigencia', 'OSDE'), false);
});

test('findSimilarCorrection prefiere la exacta y devuelve la más reciente equivalente', () => {
  const list = [
    { normalizedQuestion: 'como tramito osecac en mi sucursal', suggested: 'NUEVA' },
    { normalizedQuestion: 'como tramito osecac', suggested: 'VIEJA' },
  ];
  assert.equal(findSimilarCorrection(list, 'como tramito osecac', 'OSECAC').suggested, 'VIEJA');
  assert.equal(findSimilarCorrection(list, 'hola como tramito osecac en mi suc', 'OSECAC').suggested, 'NUEVA');
  assert.equal(findSimilarCorrection(list, 'por donde valida osecac', 'OSECAC'), null);
});

test('respuestas de normativa que dicen «no se menciona» se reconocen', () => {
  assert.ok(answerSaysNoInfo('No se menciona la necesidad de una copia de la denuncia para Provincia ART en la normativa vigente.'));
  assert.ok(answerSaysNoInfo('No encontré información suficiente en las normativas vigentes.'));
  assert.equal(answerSaysNoInfo('Sí, se requiere la denuncia de siniestro.'), false);
});

test('corrección del otro circuito sale sin avisos y solo si la normativa no tiene el dato', () => {
  assert.equal(buildCrossCircuitAnswer({ suggested: ' No necesita copia de denuncia. ' }), 'No necesita copia de denuncia.');
  assert.match(route, /crossCircuitCandidates\.length && \(isNotFoundAnswer\(result\?\.answer\) \|\| answerSaysNoInfo\(result\?\.answer\)\)/);
  assert.match(route, /findSimilarCorrection\(adminCorrections,/);
});
