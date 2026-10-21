import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyCircuitProfile, normalizeCircuitGroup, EMPTY_MARK } from "../../lib/social-works/circuit-profile.mjs";

const base = { id: 63, name: "RECETARIO SOLIDARIO", letterhead: "No Requiere", validator_name: "MIS VALIDACIONES", validator_type: "TYS", rp: "3", diagnosis: "No Requiere" };

test("normaliza el circuito", () => {
  assert.equal(normalizeCircuitGroup("COLEGIO"), "COLEGIO");
  assert.equal(normalizeCircuitGroup("Cámara"), "CAMARA");
  assert.equal(normalizeCircuitGroup("otro"), null);
});

test("Colegio pisa solo lo que cambia y hereda el resto", () => {
  const { data, applied } = applyCircuitProfile(base, { letterhead: "si", validator_name: "COFA", validator_type: EMPTY_MARK, rp: null });
  assert.equal(data.letterhead, "si");
  assert.equal(data.validator_name, "COFA");
  assert.equal(data.validator_type, null);
  assert.equal(data.rp, "3");
  assert.equal(data.diagnosis, "No Requiere");
  assert.deepEqual(applied.sort(), ["letterhead", "validator_name", "validator_type"]);
  assert.equal(base.letterhead, "No Requiere"); // no muta
});

test("sin override o sin tabla devuelve la base", () => {
  assert.deepEqual(applyCircuitProfile(base, null).data, base);
});

test("la Ficha de sucursal y el asistente usan el circuito", () => {
  const api = fs.readFileSync("app/api/social-works/[id]/route.js", "utf8");
  assert.match(api, /withCircuitProfile\(supabaseAdmin, data, circuitParam\)/);
  const page = fs.readFileSync("app/sucursal/obras-sociales/[id]/page.jsx", "utf8");
  assert.match(page, /\?circuit=/);
  const q = fs.readFileSync("app/api/assistant/query/route.js", "utf8");
  assert.equal((q.match(/circuitGroup: \(await getBranchCircuit\(\)\)\.group/g) || []).length, 3);
  assert.match(q, /withCircuitProfile\(supabaseAdmin, fichaBase/);
});

test("validador sin «por dónde valida»: responde con la Ficha, no con la normativa", () => {
  const q = fs.readFileSync("app/api/assistant/query/route.js", "utf8");
  assert.match(q, /hasValidator && !hasMethod && typeof data\.observations === "string"/);
  assert.match(q, /!hasMethod && !hasValidator\)/);
});
