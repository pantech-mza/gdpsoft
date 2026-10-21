import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequirementsAnswer, parseRequirementsMessage, extractRequirementItems, shortenFichaLines } from '../../lib/assistant/requirements-view.mjs';

const FICHA = ['• Tipo de receta admitido: común - digital (MIS RX-RCTA)', '• Vigencia registrada (días): 10', '• Membrete: Opcional',
  '• Límite de RP por receta: 3', '• Diagnóstico: OPCIONAL', '• Monodroga: Si', '• Nombre comercial: opcional', '• Sustitución: si requiere', '• Observaciones: texto largo'];
const NORMA = `Para aceptar una receta de BERKLEY ART, se deben cumplir los siguientes requisitos:

1. **Documentación del Beneficiario:**
   - Nombre de la ART.
   - Nombre completo y apellido del paciente.
   - Número de documento o CUIL.
   - Número de siniestro (su ausencia es motivo de débito).
2. **Recetario:**
   - Medicamentos recetados y cantidad de cada uno en números y letras.
   - Firma y sello con número de matrícula del profesional y especialidad.
   - Fecha de prescripción.
3. **Validez:**
   - 10 días desde la fecha de prescripción.
4. **Cantidad de Envases:**
   - Hasta 6 envases por receta.
   - Hasta 2 envases por renglón.
5. **Adjuntar Troqueles:**
   - Según el orden de prescripción, adheridos con cinta adhesiva.
6. **Datos a completar por la farmacia:**
   - Número de orden de la receta.
   - Fecha de venta.
   - Adjuntar copia del ticket de venta.`;

test('ficha corta: sin observaciones y con días en la vigencia', () => {
  const ficha = shortenFichaLines(FICHA);
  assert.deepEqual(ficha.map((f) => f.label), ['Tipo', 'Vigencia', 'Membrete', 'RP por receta', 'Diagnóstico', 'Monodroga', 'Nombre comercial', 'Sustitución']);
  assert.equal(ficha[1].value, '10 días');
});

test('los requisitos se separan en Receta / Cantidades / Facturación sin perder ninguno', () => {
  const text = buildRequirementsAnswer({ socialWorkName: 'BERKLEY ART', circuitLabel: 'Cámara', fichaLines: FICHA, normativeAnswer: NORMA, documentNames: ['NORMAS DE ATENCION BERKLEY ART'] });
  const view = parseRequirementsMessage(text);
  assert.equal(view.title, 'BERKLEY ART');
  assert.equal(view.circuit, 'Cámara');
  const by = Object.fromEntries(view.sections.map((s) => [s.title, s.items]));
  assert.ok(by['Receta'].some((i) => /siniestro/i.test(i)) === false, 'el siniestro va como alerta');
  assert.ok(view.alerts.some((a) => /siniestro/i.test(a)));
  assert.ok(by['Receta'].some((i) => /Nombre de la ART/.test(i)));
  assert.ok(by['Receta'].some((i) => /Firma y sello/.test(i)));
  assert.ok(by['Cantidades'].some((i) => /6 envases/.test(i)));
  assert.ok(by['Facturación'].some((i) => /ticket/i.test(i)));
  assert.ok(!Object.values(by).flat().some((i) => /10 días desde/.test(i)), 'la vigencia ya está en la ficha');
  const total = Object.values(by).flat().length + view.alerts.length;
  assert.equal(total, extractRequirementItems(NORMA).length - 1); // -1: vigencia repetida en la ficha
  assert.ok(by['Facturación'].some((i) => /cinta adhesiva/.test(i)), 'los troqueles heredan el título del bloque');
  assert.ok(text.split('\n').length < 40);
});

test('si no se puede ordenar (sin requisitos) devuelve null y se mantiene el formato anterior', () => {
  assert.equal(buildRequirementsAnswer({ socialWorkName: 'X', normativeAnswer: 'No hay datos.' }), null);
  assert.equal(parseRequirementsMessage('Hola, ¿en qué te ayudo?'), null);
});

import { buildSectionedAnswer } from '../../lib/assistant/requirements-view.mjs';
const OYTE = `La normativa no especifica requisitos directamente vinculados a "OYTE". Sin embargo, se mencionan varios procesos relacionados con la dispensa al afiliado.

1. **Validación de Entrega:**
   - Validar la entrega mediante el token de OSEP en el sistema Farmalive.
   - Registrar la validación en el sistema.
2. **Impresión de Tickets:**
   - Imprimir el Ticket No Fiscal (T.N.F.) habilitado por OSEP.
   - Recabar la firma del afiliado.
3. **Troqueles:**
   - Adherir los troqueles en el T.N.F. según el orden de la receta.

Si deseas más información sobre otro aspecto específico, házmelo saber.`;

test('cualquier respuesta con bloques se segmenta por sus propios títulos (ej. OYTE)', () => {
  const text = buildSectionedAnswer({ answer: OYTE, title: 'OSEP', circuitLabel: 'Cámara' });
  const view = parseRequirementsMessage(text);
  assert.equal(view.title, 'OSEP');
  assert.equal(view.circuit, 'Cámara');
  assert.match(view.intro, /no especifica requisitos/);
  assert.deepEqual(view.sections.map((s) => s.title), ['Validación de Entrega', 'Impresión de Tickets', 'Troqueles']);
  assert.equal(view.sections[0].items.length, 2);
  assert.ok(!text.includes('Si deseas más información'));
});

test('respuestas cortas o pasos sin título quedan como estaban', () => {
  assert.equal(buildSectionedAnswer({ answer: 'Sí, acepta recetas digitales.', title: 'OSEP' }), null);
  assert.equal(buildSectionedAnswer({ answer: '1. Abrí el sistema.\n2. Validá la receta.\n3. Dispensá.', title: 'OSEP' }), null);
  assert.equal(buildSectionedAnswer({ answer: OYTE, title: '' }), null);
});

import fs from 'node:fs';
test('v3.13.71 la respuesta incluye el nombre de la obra social para el chip del chat', () => {
  const route = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
  assert.match(route, /social_work: \{ \.\.\.\(finalJson\.social_work \|\| \{\}\), id: swId, name: swName \}/);
  const widget = fs.readFileSync(new URL('../../components/FloatingAssistant.jsx', import.meta.url), 'utf8');
  assert.match(widget, /Number\(activeSocialWork\?\.id\) === socialWorkId \? activeSocialWork\?\.name : null/);
});
