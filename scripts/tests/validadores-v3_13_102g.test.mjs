import test from 'node:test';
import assert from 'node:assert/strict';
import { splitWithValidators, VALIDATORS } from '../../lib/assistant/validator-links.mjs';

const links = (t) => splitWithValidators(t).filter((p) => p.type === 'link');

test('cada validador nombrado en una respuesta se vuelve enlace a su sitio', () => {
  const cases = [['Por dónde valida: Admifarm.', 'admifarmgroup.com'], ['Validador: DIDIO.', 'didiosistemas.com.ar'], ['validador MIS VALIDACIONES', 'misvalidaciones.com.ar'],
    ['Validador: GMS', 'gmssa.com.ar'], ['validator_name: FACAF', 'ddaval.com.ar'], ['validada por COFA', 'cofa.org.ar'], ['Validar online por IMED/TYS', 'imed.com.ar/autorizadorweb'], ['Validador: COMPAÑIA.', 'plataformacsf.com/login.xhtml'], ['validator_name: COMPAÑIA (TYS)', 'plataformacsf.com']];
  for (const [text, host] of cases) { const l = links(text); assert.equal(l.length, 1, text); assert.ok(l[0].href.includes(host), text); }
});
test('acepta variantes de escritura y conserva el texto que escribió el bot', () => {
  assert.equal(links('validá por adminifarm')[0].label, 'adminifarm');
  assert.equal(links('Mis Validaciones')[0].label, 'Mis Validaciones');
  const parts = splitWithValidators('Validador: DIDIO. Corroborá el plan.');
  assert.equal(parts.map((p) => p.value).join(''), 'Validador: DIDIO. Corroborá el plan.');
});
test('no enlaza palabras que solo contienen el nombre ni textos sin validadores', () => {
  assert.equal(links('El agms y la cofactura no cuentan').length, 0);
  assert.equal(links('Receta válida por 30 días').length, 0);
});
test('una dirección escrita sigue funcionando y no se duplica con el validador', () => {
  const l = links('Entrá a https://www.misvalidaciones.com.ar/ para validar');
  assert.equal(l.length, 1); assert.equal(l[0].href, 'https://www.misvalidaciones.com.ar/');
});
test('la tabla de validadores usa solo http/https', () => { for (const v of VALIDATORS) assert.match(v.url, /^https?:\/\//); });

test('la palabra compañía en una frase común no se convierte en enlace', () => {
  assert.equal(links('La compañía de seguros no cubre eso').length, 0);
});

test('una dirección completa de un validador se muestra con su nombre corto y conserva el destino', () => {
  const l = links('Ingresá a http://didiosistemas.com.ar:18084/andessalud/ con tu usuario')[0];
  assert.equal(l.label, 'DIDIO'); assert.equal(l.href, 'http://didiosistemas.com.ar:18084/andessalud/');
  assert.equal(links('https://www.misvalidaciones.com.ar/')[0].label, 'Mis Validaciones');
  assert.equal(links('https://gdr.admifarmgroup.com/Login.aspx?ReturnUrl=%2f')[0].label, 'Admifarm');
  assert.equal(links('http://farmaciasnet.gmssa.com.ar/User/Login?ReturnUrl=%2f')[0].label, 'GMS');
  assert.equal(links('https://principal.cofa.org.ar/')[0].label, 'COFA');
  assert.equal(links('https://sinvaladmin.ddaval.com.ar/?cod_farma=F001883')[0].label, 'FACAF');
  assert.equal(links('https://www.imed.com.ar/autorizadorweb')[0].label, 'IMED');
  assert.equal(links('https://www.plataformacsf.com/login.xhtml')[0].label, 'Compañia');
  assert.equal(links('https://www.farmalive.com.ar/index.asp')[0].label, 'Abrir vademécum de Farmalive');
});
