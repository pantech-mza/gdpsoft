import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('los avisos publicados se pueden editar sin cambiar destinatarios', () => {
  const api = fs.readFileSync('app/api/admin/noticias/route.js', 'utf8');
  assert.match(api, /\['archive','republish','edit'\]/);
  assert.match(api, /update\(\{title,body:message,severity\}\)/);
  assert.match(api, /body\.reshow === true/);
  assert.doesNotMatch(api.split("body.action === 'edit'")[1].split("if (body.action === 'republish')")[0], /branch_notice_targets/);
  const ui = fs.readFileSync('app/admin/noticias/page.jsx', 'utf8');
  assert.match(ui, /startEdit\(n\)/);
  assert.match(ui, /Guardar cambios/);
  assert.match(ui, /Volver a mostrarlo en las PCs que ya lo cerraron/);
});
