import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  MAX_DAILY_BUCKETS,
  clampDailyBucketLimit,
  collectPagedOpenAIBuckets,
} from '../../lib/openai/daily-buckets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = relative => readFileSync(resolve(root, relative), 'utf8');

test('OpenAI: la agrupación diaria nunca supera los 31 buckets', () => {
  assert.equal(MAX_DAILY_BUCKETS, 31);
  for (const days of [1, 7, 30, 31, 60, 90, 10000]) {
    const value = clampDailyBucketLimit(days);
    assert.ok(value <= 31 && value >= 1);
  }
  assert.equal(clampDailyBucketLimit(90), 31);
  assert.equal(clampDailyBucketLimit('invalido'), 31);
});

test('OpenAI: recupera 90 días en páginas de hasta 31', async () => {
  const all = Array.from({length: 90}, (_, day) => ({start_time: day, results: [{amount: {value: 1}}]}));
  const requested = [];
  const rows = await collectPagedOpenAIBuckets(async (path, query) => {
    requested.push({path, ...query});
    const offset = query.page ? Number(query.page.slice('cursor:'.length)) : 0;
    const data = all.slice(offset, offset + query.limit);
    const next = offset + data.length;
    return {data, has_more: next < all.length, next_page: next < all.length ? `cursor:${next}` : null};
  }, '/v1/organization/costs', {bucket_width:'1d', limit: 90});
  assert.equal(rows.length, 90);
  assert.deepEqual(requested.map(x => x.limit), [31, 31, 31]);
  assert.deepEqual(requested.map(x => x.page ?? null), [null, 'cursor:31', 'cursor:62']);
});

test('OpenAI: recuento de solicitudes se mantiene íntegro con múltiples páginas', async () => {
  const rows = await collectPagedOpenAIBuckets(async (_, query) => ({
    data: [{results:[{num_model_requests: query.page ? 20 : 10}]}],
    has_more: !query.page,
    next_page: !query.page ? 'siguiente' : null,
  }), '/v1/organization/usage/completions', {bucket_width:'1d',limit:91});
  assert.equal(rows.reduce((n,x)=>n+x.results[0].num_model_requests,0),30);
});

test('OpenAI: falla explícitamente ante paginación incompleta, sin facturación parcial', async () => {
  await assert.rejects(
    collectPagedOpenAIBuckets(async () => ({data:[{start_time:10}], has_more:true, next_page:null}), 'endpoint', {bucket_width:'1d',limit:30}),
    /cursor válido/,
  );
  await assert.rejects(
    collectPagedOpenAIBuckets(async () => ({data:[{start_time:10}], has_more:true, next_page:'misma'}), 'endpoint', {bucket_width:'1d',limit:30}),
    /cursor válido/,
  );
});

test('Gastos OpenAI: ambos endpoints usan la paginación segura', () => {
  const code = source('app/api/admin/openai-usage/route.js');
  assert.match(code, /collectPagedOpenAIBuckets\(openAIGet, path, params\)/);
  assert.equal((code.match(/limit:\s*MAX_DAILY_BUCKETS/g) || []).length, 2);
  assert.doesNotMatch(code,/limit:\s*Math\.min\(days\s*\+\s*2/);
});

test('Actividad: refresca cada cinco segundos sin quitar filtros, sin solapamientos y pausa en pestañas ocultas', () => {
  const code = source('app/admin/actividad/page.jsx');
  assert.match(code,/setInterval\(\(\)=>\{if\(!document\.hidden\)void load\(\{silent:true\}\);\},5000\)/);
  assert.match(code,/clearInterval\(interval\)/);
  assert.match(code,/if\(requestRef\.current\)\{if\(silent\)return;/);
  assert.match(code,/requestRef\.current\?\.abort\(\)/);
  assert.match(code,/const \[days,setDays\]/);
  assert.match(code,/const \[days,setDays\].*\[page,setPage\]/);
  assert.match(code,/setDash\(d\);setListing\(l\)/);
  assert.match(code,/visibilitychange/);
});
