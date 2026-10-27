// GDPSoft v3.13.108 — Gasto OpenAI por sucursal.
// OpenAI factura por organización/proyecto: no sabe de sucursales. Lo que SÍ registra GDPSoft son los tokens de cada
// consulta (assistant_query_log para el bot clásico y assistant_shadow_results para el motor de contexto). Con eso se
// reparte el gasto real del período: cada sucursal recibe la parte que le corresponde de los tokens consumidos.
import { isInternalTest } from '../review/review-noise.mjs';

export const OUTPUT_TOKEN_WEIGHT = 4; // los tokens de salida cuestan varias veces más que los de entrada
export const INTERNAL_KEY = 'internal';

/**
 * logs: [{id, branch_id, device_id, device_name, conversation_id, traffic_type, created_at, input_tokens, output_tokens}]
 * shadow: [{branch_id, conversation_id, created_at, tokens_in, tokens_out}]
 * branchNames: Map(String(id) → nombre)
 */
export function buildBranchUsage({ logs = [], shadow = [], branchNames = new Map(), day = null, weight = OUTPUT_TOKEN_WEIGHT }) {
  const inDay = (iso) => !day || String(iso || '').slice(0, 10) === day;
  const convInfo = new Map();
  for (const l of logs) if (l.conversation_id) convInfo.set(String(l.conversation_id), { internal: isInternalTest(l), branch_id: l.branch_id, device_id: l.device_id ?? null, device_name: l.device_name || '' });
  const buckets = new Map();
  const add = (key, name, branchId, tin, tout) => {
    if (!(tin > 0 || tout > 0)) return;
    const cur = buckets.get(key) || { key, branch_id: branchId, name, requests: 0, input_tokens: 0, output_tokens: 0, internal: key === INTERNAL_KEY };
    cur.requests += 1; cur.input_tokens += tin; cur.output_tokens += tout;
    buckets.set(key, cur);
  };
  // v3.13.110 — también por DISPOSITIVO (sucursal · dispositivo); las pruebas internas (Nico, Mica…) quedan como filas propias marcadas.
  const devBuckets = new Map();
  const addDevice = (branchId, deviceId, deviceName, internal, tin, tout) => {
    if (!(tin > 0 || tout > 0)) return;
    const bName = branchId == null ? (internal ? 'Administración' : 'Sin sucursal') : (branchNames.get(String(branchId)) || `Sucursal ${branchId}`);
    const dName = String(deviceName || '').trim() || (deviceId != null ? `Dispositivo ${deviceId}` : 'Sin identificar');
    const key = `${branchId ?? 'x'}:${deviceId ?? 'x'}`;
    const cur = devBuckets.get(key) || { key, branch_id: branchId ?? null, device_id: deviceId ?? null, name: `${bName} · ${dName}`, requests: 0, input_tokens: 0, output_tokens: 0, internal: !!internal };
    cur.requests += 1; cur.input_tokens += tin; cur.output_tokens += tout; cur.internal = cur.internal || !!internal;
    devBuckets.set(key, cur);
  };
  const place = (branchId, internal) => internal
    ? [INTERNAL_KEY, 'Pruebas internas (Nico / Mica / Admin)', null]
    : (branchId == null ? ['none', 'Sin sucursal', null] : [String(branchId), branchNames.get(String(branchId)) || `Sucursal ${branchId}`, branchId]);
  for (const l of logs) {
    if (!inDay(l.created_at)) continue;
    const [k, n, b] = place(l.branch_id, isInternalTest(l));
    add(k, n, b, Number(l.input_tokens || 0), Number(l.output_tokens || 0));
    addDevice(l.branch_id ?? null, l.device_id ?? null, l.device_name, isInternalTest(l), Number(l.input_tokens || 0), Number(l.output_tokens || 0));
  }
  for (const r of shadow) {
    if (!inDay(r.created_at)) continue;
    const info = r.conversation_id ? convInfo.get(String(r.conversation_id)) : null;
    const [k, n, b] = place(r.branch_id ?? info?.branch_id ?? null, !!info?.internal);
    add(k, n, b, Number(r.tokens_in || 0), Number(r.tokens_out || 0));
    addDevice(r.branch_id ?? info?.branch_id ?? null, info?.device_id ?? null, info?.device_name, !!info?.internal, Number(r.tokens_in || 0), Number(r.tokens_out || 0));
  }
  const rows = [...buckets.values()].map((x) => ({ ...x, total_tokens: x.input_tokens + x.output_tokens, weight: x.input_tokens + weight * x.output_tokens }));
  const totalWeight = rows.reduce((n, x) => n + x.weight, 0);
  for (const x of rows) x.share = totalWeight > 0 ? x.weight / totalWeight : 0;
  rows.sort((a, b) => (a.internal - b.internal) || (b.share - a.share));
  const deviceRows = [...devBuckets.values()].map((x) => ({ ...x, total_tokens: x.input_tokens + x.output_tokens, weight: x.input_tokens + weight * x.output_tokens }));
  for (const x of deviceRows) x.share = totalWeight > 0 ? x.weight / totalWeight : 0;
  deviceRows.sort((a, b) => (a.internal - b.internal) || (b.share - a.share));
  return { rows, device_rows: deviceRows, total_weight: totalWeight, output_weight: weight };
}

// Reparte un gasto real (US$) entre las filas según su participación.
export function allocateCost(rows, totalCostUsd) {
  return rows.map((x) => ({ ...x, cost_usd: Number((x.share * Number(totalCostUsd || 0)).toFixed(6)) }));
}
