import test from 'node:test';
import assert from 'node:assert/strict';
import {batchSearchQueries,interleaveSearchResults,MAX_OPENAI_SEARCH_QUERIES} from '../qa/tree-evidence-utils.mjs';

test('límite de OpenAI es 5', () => assert.equal(MAX_OPENAI_SEARCH_QUERIES,5));
for (const [n,sizes] of [[0,[]],[1,[1]],[5,[5]],[6,[5,1]],[7,[5,2]],[14,[5,5,4]],[30,[5,5,5,5,5,5]]]) {
 test(`${n} consultas -> ${JSON.stringify(sizes)}`, () => {
  const input=Array.from({length:n},(_,i)=>`nodo-${i}`);
  const chunks=batchSearchQueries(input);
  assert.deepEqual(chunks.map(x=>x.length),sizes);
  assert.deepEqual(chunks.flat(),input);
  assert.ok(chunks.every(x=>x.length<=5));
 });
}
test('rechaza tamaños fuera del límite', () => {
 for(const max of [0,-1,6,100,1.2]) assert.throws(()=>batchSearchQueries(['x'],max));
});
test('conserva la evidencia de cada lote sin consumirla toda en el primero',()=>{
 const results=interleaveSearchResults([[{file_id:'a',rank:1},{file_id:'a',rank:2},{file_id:'a',rank:3}],[{file_id:'b',rank:1}],[{file_id:'c',rank:1},{file_id:'c',rank:2}]]);
 assert.deepEqual(results.map(x=>x.file_id),['a','b','c','a','c','a']);
});
test('maneja resultados vacíos o nulos',()=>{
 assert.deepEqual(interleaveSearchResults([[],null,[{file_id:'ok'}]]),[{file_id:'ok'}]);
});
