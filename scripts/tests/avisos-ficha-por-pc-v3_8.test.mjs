import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  noticeStorageKey,
  closeNoticeLocally,
  readClosedNotices,
  filterClosedNotices,
} from '../../lib/client/branch-notice-storage.mjs';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, val) => { data.set(key, val); },
  };
}

const pc1 = 'af0639d9-aedf-43cc-b859-8006fbbcd3ce';
const pc2 = 'cb19aa9d-a4e0-482d-bd6e-11d49193b89b';
const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('El aviso cerrado no vuelve en esta sucursal y esta PC tras recargar', () => {
  const storage = fakeStorage();
  assert.equal(closeNoticeLocally(storage, 7, pc1, 100), true);
  const list = [{ id: 100 }, { id: 101 }];
  assert.deepEqual(filterClosedNotices(list, storage, 7, pc1), [{ id: 101 }]);
  assert.deepEqual([...readClosedNotices(storage, 7, pc1)], ['100']);
  // Simula otro montaje de la pantalla con el mismo almacenamiento persistente.
  assert.deepEqual(filterClosedNotices(list, storage, 7, pc1), [{ id: 101 }]);
});

test('El cierre no oculta el aviso en otra PC ni otra sucursal', () => {
  const storage = fakeStorage();
  closeNoticeLocally(storage, 7, pc1, 100);
  const notices = [{ id: 100 }];
  assert.deepEqual(filterClosedNotices(notices, storage, 7, pc2), notices);
  assert.deepEqual(filterClosedNotices(notices, storage, 8, pc1), notices);
});

test('Una nueva publicación del Admin con otro ID se muestra', () => {
  const storage = fakeStorage();
  closeNoticeLocally(storage, 7, pc1, 100);
  assert.deepEqual(filterClosedNotices([{ id: 100 }, { id: 102 }], storage, 7, pc1), [{ id: 102 }]);
});

test('Un cierre repetido es idempotente y el almacenamiento corrupto no interrumpe el módulo', () => {
  const storage = fakeStorage();
  storage.setItem(noticeStorageKey(7, pc1), 'datos inválidos');
  assert.equal(readClosedNotices(storage, 7, pc1).size, 0);
  closeNoticeLocally(storage, 7, pc1, '100');
  closeNoticeLocally(storage, 7, pc1, 100);
  assert.deepEqual([...readClosedNotices(storage, 7, pc1)], ['100']);
});

test('Si localStorage está deshabilitado, el código reporta error de persistencia', () => {
  const storage = { getItem: () => { throw Error('Bloqueado'); }, setItem: () => { throw Error('Bloqueado'); } };
  assert.equal(closeNoticeLocally(storage, 7, pc1, 100), false);
  assert.equal(readClosedNotices(storage, 7, pc1).size, 0);
});

test('El componente oculta antes del ACK y reintenta cierres no sincronizados', () => {
  const file = read('components/sucursal/BranchNotices.jsx');
  assert.match(file, /closeNoticeLocally\(localStorage/);
  assert.match(file, /filterClosedNotices\(rows, localStorage/);
  assert.match(file, /acknowledgeOnServer\(n\.id, context\)/);
  assert.match(file, /setInterval\(\(\) => \{ if \(!document\.hidden\) reload\(\); \}, 20000\)/);
});

test('El login conserva el UUID de la PC si falla la validación', () => {
  const login = read('app/page.js');
  const check = login.split('async function continueAfterLogin(data)')[1].split('async function handleSubmit')[0];
  assert.match(check, /setError\('No se pudo verificar el dispositivo registrado/);
  assert.doesNotMatch(check, /localStorage\.removeItem\('gdpsoft_device_uuid'\)/);
});

test('Recordá/Ficha aparece primero y por defecto en ambas vistas', () => {
  for (const [path, tab] of [
    ['app/sucursal/obras-sociales/[id]/page.jsx', 'remember'],
    ['app/admin/obras-sociales/[id]/page.jsx', 'REMEMBER'],
  ]) {
    const src = read(path);
    const first = src.split('const TABS = [')[1].split('];')[0];
    assert.match(first, new RegExp(`^\\s*\\{\\s*(id|key): "${tab}"`));
    assert.match(src, new RegExp(`useState\\("${tab}"\\)`));
  }
});
