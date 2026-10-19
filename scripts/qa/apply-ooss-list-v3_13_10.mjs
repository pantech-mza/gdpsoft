#!/usr/bin/env node
/** GDPSoft - UI OOSS (13.10): vista de activas/inactivas en Sucursal.
 * Solo modifica dos vistas; no toca Supabase, permisos ni circuitos.
 */
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const PATCHES = {
  "app/sucursal/obras-sociales/page.jsx":[
    [
      "  const [search, setSearch] =\n    useState(\"\");\n\n  const [page, setPage] =\n    useState(1);",
      "  const [search, setSearch] =\n    useState(\"\");\n\n  const [statusFilter, setStatusFilter] =\n    useState(\"ALL\");\n\n  const [page, setPage] =\n    useState(1);"
    ],
    [
      "        setSocialWorks(\n          (\n            result.social_works ||\n            []\n          ).filter(\n            (item) =>\n              item.active === true\n          )\n        );",
      "        // La API devuelve activas e inactivas. La selección es visual.\n        setSocialWorks(result.social_works || []);"
    ],
    [
      "  const filtered =\n    useMemo(() => {\n      const q =\n        search\n          .trim()\n          .toLowerCase();\n\n      if (!q) {\n        return socialWorks;\n      }\n\n      return socialWorks.filter(\n        (item) =>\n          [\n            item.name,\n            item.plan,\n            item.recipe_type,\n            item.tys_code,\n          ]\n            .filter(Boolean)\n            .join(\" \")\n            .toLowerCase()\n            .includes(q)\n      );\n    }, [\n      socialWorks,\n      search,\n    ]);\n\n  useEffect(() => {\n    setPage(1);\n  }, [search]);",
      "  const activeCount = useMemo(\n    () => socialWorks.filter((item) => item.active === true).length,\n    [socialWorks]\n  );\n  const inactiveCount = useMemo(\n    () => socialWorks.filter((item) => item.active === false).length,\n    [socialWorks]\n  );\n\n  const filtered = useMemo(() => {\n    const q = search.trim().toLowerCase();\n\n    return socialWorks.filter((item) => {\n      if (statusFilter === \"ACTIVE\" && item.active !== true) return false;\n      if (statusFilter === \"INACTIVE\" && item.active !== false) return false;\n      if (!q) return true;\n\n      return [item.name, item.plan, item.recipe_type, item.tys_code]\n        .filter(Boolean)\n        .join(\" \")\n        .toLowerCase()\n        .includes(q);\n    });\n  }, [socialWorks, search, statusFilter]);\n\n  useEffect(() => {\n    setPage(1);\n  }, [search, statusFilter]);"
    ],
    [
      "      <div className=\"mb-5 w-full rounded-[15px] border border-zinc-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-4\">\n\n        <div className=\"relative min-w-0\">",
      "      <div className=\"mb-5 w-full rounded-[15px] border border-zinc-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-4\">\n\n        <div className=\"flex flex-col gap-3 sm:flex-row sm:items-center\">\n          <div className=\"relative min-w-0 flex-1\">"
    ],
    [
      "          />\n\n        </div>\n\n      </div>\n\n      {!loading &&\n        !error && (",
      "          />\n\n          </div>\n\n          <div className=\"w-full shrink-0 sm:w-52\">\n            <label htmlFor=\"sw-status-filter\" className=\"sr-only\">\n              Filtrar obras sociales por estado\n            </label>\n            <select\n              id=\"sw-status-filter\"\n              value={statusFilter}\n              onChange={(e) => setStatusFilter(e.target.value)}\n              className=\"h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[13px] text-zinc-700 outline-none focus:border-[#8f2a85] sm:h-12 sm:text-sm\"\n            >\n              <option value=\"ALL\">Todas ({socialWorks.length})</option>\n              <option value=\"ACTIVE\">Activas ({activeCount})</option>\n              <option value=\"INACTIVE\">Inactivas ({inactiveCount})</option>\n            </select>\n          </div>\n\n        </div>\n\n      </div>\n\n      {!loading &&\n        !error && ("
    ],
    [
      "            obras sociales disponibles",
      "            obras sociales encontradas"
    ],
    [
      "                    <h2 className=\"break-words text-[15px] font-bold leading-5 text-[#21142b]\">\n                      {item.name}\n                    </h2>\n\n                    <p className=\"mt-1 break-words text-[12px] leading-4 text-zinc-400\">",
      "                    <div className=\"flex min-w-0 flex-wrap items-center gap-2\">\n                      <h2 className=\"break-words text-[15px] font-bold leading-5 text-[#21142b]\">\n                        {item.name}\n                      </h2>\n                      <span\n                        className={item.active === true\n                          ? \"inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700\"\n                          : \"inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700\"}\n                      >\n                        <span className={item.active === true\n                          ? \"h-1.5 w-1.5 rounded-full bg-emerald-500\"\n                          : \"h-1.5 w-1.5 rounded-full bg-rose-500\"} />\n                        {item.active === true ? \"Activa\" : \"Inactiva\"}\n                      </span>\n                    </div>\n\n                    <p className=\"mt-1 break-words text-[12px] leading-4 text-zinc-400\">"
    ],
    [
      "      {/* PAGINATION */}\n\n      {!loading &&",
      "      {!loading && !error && filtered.length === 0 && (\n        <div className=\"rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500\">\n          No se encontraron obras sociales con estos filtros.\n        </div>\n      )}\n\n      {/* PAGINATION */}\n\n      {!loading &&"
    ]
  ],
  "app/sucursal/obras-sociales/[id]/page.jsx":[
    [
      "                {socialWork.active && (\n\n                  <span className=\"inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700\">\n\n                    <span className=\"h-1.5 w-1.5 rounded-full bg-emerald-500\" />\n\n                    Activa\n\n                  </span>\n\n                )}",
      "                <span className={socialWork.active === true\n                  ? \"inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700\"\n                  : \"inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700\"}>\n                  <span className={socialWork.active === true\n                    ? \"h-1.5 w-1.5 rounded-full bg-emerald-500\"\n                    : \"h-1.5 w-1.5 rounded-full bg-rose-500\"} />\n                  {socialWork.active === true ? \"Activa\" : \"Inactiva\"}\n                </span>"
    ],
    [
      "                Información operativa de solo lectura\n\n              </p>",
      "                Información operativa de solo lectura\n\n              </p>\n\n              {socialWork.active !== true && (\n                <p role=\"status\" className=\"mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] text-rose-800\">\n                  Obra social inactiva en GDPSoft. La información es de consulta y no autoriza recepción ni dispensación.\n                </p>\n              )}"
    ]
  ]
};
const plans = [];
let count = 0;
try {
  for (const [relative, changes] of Object.entries(PATCHES)) {
    const absolute = path.resolve(ROOT, relative);
    if (!absolute.startsWith(ROOT + path.sep)) throw Error(`Ruta fuera del proyecto: ${relative}`);
    if (!fs.existsSync(absolute)) throw Error(`Falta archivo: ${relative}`);
    const original = fs.readFileSync(absolute, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    let updated = original.replace(/\r\n/g, '\n');
    let changesApplied = 0;
    for (const [oldText,newText] of changes) {
      if (updated.includes(newText)) continue; // installer idempotente
      const matchCount = updated.split(oldText).length - 1;
      if (matchCount !== 1) throw Error(`${relative}: no coincide el fragmento esperado (hallados ${matchCount}). Se detiene sin escribir.`);
      updated = updated.replace(oldText,newText);
      changesApplied++;
    }
    plans.push({relative,absolute,original,updated:updated.replace(/\n/g,eol),changesApplied});
    count+=changesApplied;
  }
  if (!APPLY) {
    console.log(`Modo verificación: ${count} cambios previstos. Ejecutá con --apply para aplicar.`);
    process.exit(0);
  }
  for (const p of plans) {
    if (p.changesApplied === 0) {console.log(`Sin cambios (ya aplicado): ${p.relative}`);continue;}
    const backup = `${p.absolute}.backup-v3_13_10`;
    if (fs.existsSync(backup)) throw Error(`Ya existe respaldo: ${backup}. No sobrescribo.`);
  }
  for (const p of plans) {
    if (!p.changesApplied) continue;
    const backup = `${p.absolute}.backup-v3_13_10`;
    fs.writeFileSync(backup, p.original, 'utf8');
    fs.writeFileSync(p.absolute, p.updated, 'utf8');
    console.log(`Actualizado: ${p.relative} (${p.changesApplied} ajustes). Respaldo creado.`);
  }
  console.log('Terminado. No se modificaron datos de Supabase.');
} catch (err) { console.error(`ERROR: ${err.message}`); process.exitCode=1; }
