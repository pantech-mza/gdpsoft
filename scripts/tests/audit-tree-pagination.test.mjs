import test from 'node:test';
import assert from 'node:assert/strict';
import {nextCandidatePage} from '../qa/tree-audit-pagination.mjs';

const make=(offset,limit,pageSize=200)=>{
  const pages=[];
  let loaded=0;
  while (true) {
    const p=nextCandidatePage({offset,loaded,limit,pageSize});
    if (!p) break;
    pages.push([p.from,p.to]);
    loaded+=p.size;
  }
  return pages;
};

test('caso exacto que fallaba: offset=5 limit=25 => 5..29',()=>{
  assert.deepEqual(make(5,25),[[5,29]]);
});
test('offset=30 limit=25 => 30..54, sin PGRST103',()=>{
  assert.deepEqual(make(30,25),[[30,54]]);
});
test('offset=0 limit=5',()=>{
  assert.deepEqual(make(0,5),[[0,4]]);
});
test('offset=5 limit=25 y paginación de 10',()=>{
  assert.deepEqual(make(5,25,10),[[5,14],[15,24],[25,29]]);
});
test('limit=250 con páginas de 200',()=>{
  assert.deepEqual(make(0,250),[[0,199],[200,249]]);
});
test('limit=2000 páginas de 200',()=>{
  assert.equal(make(0,2000).length,10);
  assert.deepEqual(make(0,2000).at(-1),[1800,1999]);
});
test('lote completado => no pide más',()=>{
  assert.equal(nextCandidatePage({offset:5,loaded:25,limit:25}),null);
});
test('limit=0 => sin página',()=>{
  assert.equal(nextCandidatePage({offset:5,loaded:0,limit:0}),null);
});
test('nunca se produce rango invertido con offsets altos',()=>{
  for (const offset of [0,5,25,100,1000]) for (const limit of [1,5,25,200,201,500]) {
    for(const [from,to] of make(offset,limit)) assert.ok(from<=to,`${from}>${to}`);
  }
});
test('rechaza valores inválidos',()=>{
  for (const args of [{offset:-1,loaded:0,limit:5},{offset:0,loaded:-1,limit:5},{offset:0,loaded:0,limit:5,pageSize:0},{offset:0,loaded:0,limit:2.5}])
    assert.throws(()=>nextCandidatePage(args),RangeError);
});
