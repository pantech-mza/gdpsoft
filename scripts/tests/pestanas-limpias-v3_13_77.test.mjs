import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildRequirementsAnswer, parseRequirementsMessage } from "../../lib/assistant/requirements-view.mjs";
import { restrictCorrectionsToCircuit } from "../../lib/assistant/admin-corrections.mjs";

const normative = `### Requisitos Generales de la Receta
- Nombre y apellido del paciente.
- DNI del paciente y/o Nro. de Siniestro.
- Fecha de prescripción.
### Observaciones
- Sello de la farmacia y firma del farmacéutico.
Estos son los requisitos específicos para aceptar recetas de PROVINCIA ART según la normativa vigente.`;

test("los títulos ### y la frase de cierre no aparecen como requisitos", () => {
  const text = buildRequirementsAnswer({ socialWorkName: "PROVINCIA ART", fichaLines: ["Vigencia: 30"], normativeAnswer: normative, documentNames: ["Anexo"] });
  assert.ok(text);
  assert.doesNotMatch(text, /###/);
  assert.doesNotMatch(text, /Estos son los requisitos/);
  assert.match(text, /Aviso: Este resumen/);
  assert.ok(parseRequirementsMessage(text));
});

test("se arma el formato corto aunque la sección Receta tenga pocos ítems", () => {
  const text = buildRequirementsAnswer({
    socialWorkName: "BERKLEY ART",
    normativeAnswer: "- Fecha de prescripción.\n- Máximo de 3 renglones por receta.\n- Hasta 6 envases en total.\n- Fecha de venta.",
  });
  assert.ok(text);
  assert.ok(parseRequirementsMessage(text).sections.length >= 2);
});

function fakeDb({ channels = [1, 2], branches = [{ id: 10, branch_type: "CAMARA" }, { id: 20, branch_type: "COLEGIO" }] } = {}) {
  return { from(table) {
    const rows = table === "normative_social_works" ? channels.map((id) => ({ billing_channel_id: id }))
      : table === "branches" ? branches : [];
    const q = { select() { return q; }, eq() { return q; }, not() { return q; }, in() { return q; }, limit() { return q; },
      then(resolve) { resolve({ data: rows, error: null }); } };
    return q;
  } };
}

test("una corrección de una sucursal de Cámara no se aplica a Colegio (dos circuitos)", async () => {
  const list = [{ branchId: 10, suggested: "x" }, { branchId: 20, suggested: "y" }, { branchId: null, suggested: "z" }];
  const forColegio = await restrictCorrectionsToCircuit(fakeDb(), list, 130, "COLEGIO");
  assert.deepEqual(forColegio.map((c) => c.suggested), ["y", "z"]);
  const single = await restrictCorrectionsToCircuit(fakeDb({ channels: [1] }), list, 130, "COLEGIO");
  assert.equal(single.length, 3);
  assert.equal((await restrictCorrectionsToCircuit(fakeDb(), list, 130, null)).length, 3);
});

test("el servidor aplica el filtro de circuito a las correcciones", () => {
  const q = fs.readFileSync("app/api/assistant/query/route.js", "utf8");
  assert.match(q, /restrictCorrectionsToCircuit\(supabaseAdmin, allCorrections, socialWorkId/);
});

import { resolveDeclaredCircuitPolicy, formatCircuitLine, applyCircuitLine, CIRCUIT_LEGEND } from "../../lib/operations/camara-colegio-policy.mjs";

test("la respuesta de validación dice el circuito de la sucursal en vez de la leyenda genérica", () => {
  const base = `Por dónde valida: TYS.\nValidador: GMS.\n${CIRCUIT_LEGEND}\n\nFuente: Recordá/Ficha de OSECAC.`;
  const policy = resolveDeclaredCircuitPolicy({ branchName: "Libertad", branchCode: "LIBERTAD", socialWorkName: "OSECAC" });
  const line = formatCircuitLine(policy, { branchLabel: "Libertad", workName: "OSECAC" });
  assert.match(line, /Libertad, OSECAC se tramita por el circuito Cámara–Colegio/);
  const out = applyCircuitLine(base, line);
  assert.doesNotMatch(out, /Corroborá el plan y el circuito/);
  assert.match(out, /circuito Cámara–Colegio\. La ficha no autoriza/);
  const sf = resolveDeclaredCircuitPolicy({ branchName: "San Francisco", branchCode: "SAN_FRANCISCO", socialWorkName: "OSSEG" });
  assert.match(formatCircuitLine(sf, { branchLabel: "San Francisco", workName: "OSSEG" }), /se tramita directo/);
  // sin regla específica queda la leyenda
  const none = resolveDeclaredCircuitPolicy({ branchName: "Libertad", branchCode: "LIBERTAD", socialWorkName: "OSEP" });
  assert.equal(applyCircuitLine(base, formatCircuitLine(none)), base);
});
