import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {
  resolveDeclaredCircuitPolicy, identifyCircuitBranch, identifyCircuitWork,
  CAMARA_BRANCHES, COLEGIO_BRANCHES, formatCircuitResponse,
} from '../../lib/operations/camara-colegio-policy.mjs';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const caseOf=(branch,socialWork)=>resolveDeclaredCircuitPolicy({branchName:branch, socialWorkName:socialWork});

test('lista completa: 15 Cámara y 14 Colegio, sin sucursales duplicadas',()=>{
  assert.equal(CAMARA_BRANCHES.length,15);
  assert.equal(COLEGIO_BRANCHES.length,14);
  assert.equal(new Set([...CAMARA_BRANCHES,...COLEGIO_BRANCHES]).size,29);
  for(const branch of CAMARA_BRANCHES) assert.equal(caseOf(branch,'OSTES').group,'CAMARA');
  for(const branch of COLEGIO_BRANCHES) assert.equal(caseOf(branch,'OSTES').group,'COLEGIO');
});

test('alias de sucursales, sin falsas coincidencias',()=>{
  assert.equal(identifyCircuitBranch({branchCode:'DP1'}),'DP1');
  assert.equal(identifyCircuitBranch({branchName:'Econofarma Maipú'}),'ECONO_MAIPU');
  assert.equal(identifyCircuitBranch({branchName:'R Peña'}),'RODRIGUEZ_PENA');
  assert.equal(identifyCircuitBranch({branchName:'ECONOMAS'}),'ECONO_MAS');
  assert.equal(identifyCircuitBranch({branchName:'DEL CERRO',branchCode:'DP1'}),null);
  assert.equal(identifyCircuitBranch({branchName:'Otras sucursales'}),null);
  assert.equal(identifyCircuitWork('OSDEPYM'),null);
});

test('OSTES/OSPAV/PASTEUR/OSFYHC requieren Cámara–Colegio solo en grupo Cámara',()=>{
  for(const work of ['OSTES','OSPAV','LUIS PASTEUR','OSFYHC']) {
    for(const branch of CAMARA_BRANCHES) assert.equal(caseOf(branch,work).mode,'CAMARA_COLEGIO',`${branch}/${work}`);
    for(const branch of COLEGIO_BRANCHES) { const c=caseOf(branch,work); assert.equal(c.mode,'DIRECT',`${branch}/${work}`); assert.match(c.directLine,/TYS/); }
  }
});

test('Provincia ART en Cámara: se valida por Compañía con declaración de dispensa (planilla del cliente 30/10)',()=>{
  for(const branch of CAMARA_BRANCHES) { const c=caseOf(branch,'PROVINCIA ART'); assert.equal(c.mode,'DIRECT'); assert.match(c.directLine,/Compañía, con declaración de dispensa/); }
});

test('OSECAC: DP1 externo por San Francisco, Econo Más y San Rafael directo, resto Cámara–Colegio',()=>{
  for(const branch of [...CAMARA_BRANCHES,...COLEGIO_BRANCHES]) {
    const r=caseOf(branch,'OSECAC');
    assert.equal(r.canReceive,true);
    assert.equal(r.mode,branch==='DP1'?'EXTERNAL_VALIDATOR':
      ['ECONO_MAS','SAN_RAFAEL'].includes(branch)?'DIRECT':'CAMARA_COLEGIO');
  }
  assert.match(caseOf('DP1','OSECAC').validatorBranchName,/San Francisco/);
});

test('OSDE: únicamente Lavalle, Del Centro, Rodríguez Peña, Andina hacen Cámara–Colegio',()=>{
  const special=['LAVALLE','DEL_CENTRO','RODRIGUEZ_PENA','ANDINA'];
  for(const branch of [...CAMARA_BRANCHES,...COLEGIO_BRANCHES]) {
    assert.equal(caseOf(branch,'OSDE').mode,special.includes(branch)?'CAMARA_COLEGIO':'DIRECT');
  }
});

test('Federación Patronal ART: solo 4 reciben directo, resto Cámara–Colegio',()=>{
  const direct=['LA_JIRAFA_2','SAN_FRANCISCO','DEL_CERRO','LIBERTAD'];
  for(const branch of [...CAMARA_BRANCHES,...COLEGIO_BRANCHES]) {
    const result=caseOf(branch,'FEDERACION PATRONAL ART');
    assert.equal(result.mode,direct.includes(branch)?'DIRECT':'CAMARA_COLEGIO');
    assert.equal(result.canReceive,direct.includes(branch)?true:null);
  }
});

test('OSSEG: San Francisco directo, todas las otras Cámara–Colegio',()=>{
  for(const branch of [...CAMARA_BRANCHES,...COLEGIO_BRANCHES])
    assert.equal(caseOf(branch,'OSSEG').mode,branch==='SAN_FRANCISCO'?'DIRECT':'CAMARA_COLEGIO');
});

test('AMPES: Maipú, San Martín, Más y La Jirafa 1 hasta las 20; el resto después de las 20 (Administración 30/10)',()=>{
  const until20=['ECONO_MAIPU','ECONO_SAN_MARTIN','ECONO_MAS','LA_JIRAFA_1'];
  for(const branch of [...CAMARA_BRANCHES,...COLEGIO_BRANCHES]) {
    const r=caseOf(branch,'AMPES ASISTIR');
    assert.equal(r.canReceive,true);
    assert.equal(r.allDay,false);
    assert.equal(r.until,until20.includes(branch)?'20:00':null);
    assert.equal(r.after,until20.includes(branch)?null:'20:00');
    assert.equal(r.mode,'UNSPECIFIED');
    assert.match(r.notes, until20.includes(branch)?/hasta las 20 h/:/después de las 20 h/);
    assert.match(r.notes, /Sábados, domingos y feriados se recibe todo el día/);
    assert.doesNotMatch(r.notes, /Cámara–Colegio/);
  }
});

test('Provincia ART: Colegio por Cámara–Colegio; Cámara directa (activa en Cámara, inactiva en Colegio)',()=>{
  // Aclaración confirmada el 16/10/2026: SOLO para sucursales de Colegio.
  // No modifica las excepciones previas ni autoriza por sí sola una receta.
  for(const branch of COLEGIO_BRANCHES) {
    const r=caseOf(branch,'PROVINCIA ART');
    assert.equal(r.group,'COLEGIO',branch);
    assert.equal(r.status,'DEFINED',branch);
    assert.equal(r.mode,'CAMARA_COLEGIO',branch);
    assert.equal(r.canReceive,null,branch);
  }
  for(const branch of CAMARA_BRANCHES) {
    const r=caseOf(branch,'PROVINCIA ART');
    assert.equal(r.group,'CAMARA',branch);
    assert.equal(r.status,'DEFINED',branch);
    assert.equal(r.mode,'DIRECT',branch);
    assert.equal(r.canReceive,true,branch);
  }
});

test('otras OOSS: no se afirma habilitación ni validador exacto',()=>{
  for(const branch of [...CAMARA_BRANCHES,...COLEGIO_BRANCHES]) {
    const r=caseOf(branch,'GALENO');
    assert.equal(r.mode,'REGULAR_VALIDATOR');
    assert.equal(r.canReceive,null);
  }
  assert.equal(caseOf('SUCURSAL NO CLASIFICADA','OSECAC'),null);
});

test('respuesta distingue recepción de circuito y receta válida',()=>{
  const example={resolved:true, branch:{name:'DP1'}, socialWork:{name:'OSECAC'},
    operation:{mode:'EXTERNAL_VALIDATOR',canReceive:true,
      validation:{validatorBranch:{name:'Econo Más'}},reception:{allDay:null,until:null}}};
  const text=formatCircuitResponse(example,'RECEPTION');
  assert.match(text,/habilitada para recibir/);
  assert.match(text,/Econo Más/);
  assert.match(text,/no confirma que la receta sea válida/i);
  const unknown=structuredClone(example);
  unknown.operation.canReceive=null;
  assert.match(formatCircuitResponse(unknown,'RECEPTION'),/No puedo confirmar/);
});

test('rutas de bot conectan mismo resolver operativo a texto y PDF',()=>{
  const query=readFileSync(resolve(repo,'app/api/assistant/query/route.js'),'utf8');
  const visual=readFileSync(resolve(repo,'app/api/assistant/analyze-image/route.js'),'utf8');
  const resolver=readFileSync(resolve(repo,'lib/operations/resolve-operation.js'),'utf8');
  assert.match(query,/formatCircuitResponse\(result, operationType\)/);
  assert.match(visual,/withCircuitAdvice\(verification\.answer\)/);
  assert.match(visual,/withCircuitAdvice\(buildUncertainPrescriptionReply\(/);
  assert.match(visual,/resolveOperation\(\{/);
  assert.match(resolver,/resolveDeclaredCircuitPolicy\(\{/);
  assert.match(resolver,/POLICY_REVIEW_REQUIRED/);
});
