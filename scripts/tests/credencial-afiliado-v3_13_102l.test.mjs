import test from 'node:test';
import assert from 'node:assert/strict';
import { isCredentialQuestion } from '../../lib/assistant/approved-notes.mjs';

test('"la credencial" del afiliado NO es una consulta de claves de acceso', () => {
  for (const q of ['La credencial no indica el plan', 'el paciente presenta la credencial vencida', 'la credencial del afiliado no tiene el numero', 'presentó credencial digital',
    'la credencial no dice el plan, que hago?', 'credencial de la obra social sin plan']) assert.equal(isCredentialQuestion(q), false, q);
});
test('las consultas de usuarios y claves siguen protegidas', () => {
  for (const q of ['cual es el usuario de didio', 'clave de misvalidaciones', 'contraseña de la plataforma', 'password de ospe', 'usuario y clave de ospepri',
    'cuales son las credenciales de acceso de osde', 'credenciales de ospelsym', 'la credencial de acceso a la plataforma', 'credencial de ingreso del validador']) assert.equal(isCredentialQuestion(q), true, q);
});
test('"credenciales" en plural con el afiliado como tema tampoco es de acceso', () => {
  assert.equal(isCredentialQuestion('las credenciales del afiliado no coinciden'), false);
});
