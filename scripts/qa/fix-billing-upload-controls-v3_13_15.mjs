import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const file = resolve(process.cwd(), "components/social-works/ResourcesPanel.jsx");
const apiFile = resolve(process.cwd(), "app/api/social-works/[id]/resources/route.js");
const apply = process.argv.includes("--apply");
const marker = 'data-gdp-billing-upload-v31315="true"';
const assert = (cond, message) => { if (!cond) throw new Error(message); };
const replaceOnce = (s, oldText, newText, description) => {
  assert(s.includes(oldText), `No se reconoció ${description}; no se modificó el proyecto.`);
  return s.replace(oldText, newText);
};
try {
  assert(existsSync(file), "No existe ResourcesPanel.jsx");
  assert(existsSync(apiFile), "No existe la API de materiales");
  const server = readFileSync(apiFile, "utf8");
  assert(server.includes('b.kind === "billing"') && server.includes('storage.from(BUCKET).remove([row.storage_path])') && server.includes('context(request, params, true)'),
    "Esta versión de la API no confirma borrado físico protegido por Admin. Revisarla antes de cambiar el formulario.");
  const before = readFileSync(file, "utf8");
  if (before.includes(marker)) {
    console.log("OK: el parche v3.13.15 ya está instalado; no hay cambios que aplicar.");
    process.exit(0);
  }
  assert(before.includes("async function uploadBillingMaterial()"),
    "Falta la subida directa. Instalá primero v3.13.13 y v3.13.14, luego repetí.");
  assert(before.includes("file.size > 100 * 1024 * 1024"), "Falta el límite de 100 MB (v3.13.14).");
  let after=before;
  after=replaceOnce(after, 'import { useEffect, useState } from "react";', 'import { useEffect, useRef, useState } from "react";', 'imports React');
  after=replaceOnce(after, '  const [fileData, setFileData] = useState({ title: "", description: "", file: null });',
`  const [fileData, setFileData] = useState({ title: "", description: "", file: null });
  const fileInputRef = useRef(null);
  const uploadFormRef = useRef(null);`, 'estado y referencias');
  // Old v3.13.14.1 only changed text in the UI and may have left this error message stale.
  after=after.replace('"El archivo supera el límite de 50 MB"', '"El archivo supera el límite de 100 MB"');
  after=replaceOnce(after,
`    </div>

    {error &&`,
`      {editable && kind === "billing" && (
        <button type="button" className={primary}
          onClick={() => uploadFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          <Icon icon="fluent:arrow-upload-20-regular" width="18" className="mr-2" />
          Subir archivo
        </button>
      )}
    </div>

    {error &&`, 'botón superior de subida');
  const listedStart=after.indexOf('        {data.billing.map((f) => (');
  const editStart=after.indexOf('    {editable && kind === "billing" && (',listedStart);
  assert(listedStart>=0 && editStart>listedStart, 'No encontramos el listado de archivos');
  let listed=after.slice(listedStart,editStart);
  listed=replaceOnce(listed, 'className={secondary}\n                  disabled={busy}\n                  onClick={() => {\n                    if (window.confirm(`¿Eliminar ${f.title}?`)) {',
`type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(\`¿Eliminar definitivamente «\${f.title}»? Se quitará de GDPSoft y de Supabase Storage. Esta acción no se puede deshacer.\`)) {`, 'botón Eliminar');
  listed=replaceOnce(listed,'                  Eliminar\n','                  Eliminar archivo\n','etiqueta de eliminar');
  after=after.slice(0,listedStart)+listed+after.slice(editStart);
  const start=after.indexOf('    {editable && kind === "billing" && (',listedStart);
  const end=after.indexOf('    {editable && kind === "contact" && editing && (',start);
  assert(start>=0 && end>start, 'No se pudo aislar el formulario de subida');
  const newForm = `    {editable && kind === "billing" && (
      <form ref={uploadFormRef} ${marker}
        className="rounded-[17px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const formElement = e.currentTarget;
          act(async () => {
            await uploadBillingMaterial();
            formElement.reset();
          }, "Archivo publicado correctamente");
        }}
      >
        <h3 className="text-[16px] font-bold text-zinc-900">Subir archivo de facturación</h3>
        <p className="mt-1 text-sm text-zinc-500">PDF o video MP4/WebM, hasta 100 MB.</p>
        <div className="mt-4 space-y-3">
          <input className={inputStyle} required maxLength={200} placeholder="Título del material" value={fileData.title} onChange={(e) => setFileData((v) => ({ ...v, title: e.target.value }))} />
          <textarea className={inputStyle} rows={2} maxLength={1000} placeholder="Descripción opcional" value={fileData.description} onChange={(e) => setFileData((v) => ({ ...v, description: e.target.value }))} />
          <input ref={fileInputRef} className="sr-only" required type="file"
            accept=".pdf,.mp4,.webm,application/pdf,video/mp4,video/webm"
            onChange={(e) => setFileData((v) => ({ ...v, file: e.target.files?.[0] || null }))} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={secondary} disabled={busy}
              onClick={() => fileInputRef.current?.click()}>
              <Icon icon="fluent:folder-open-20-regular" width="18" className="mr-2" />
              Seleccionar archivo
            </button>
            <span className="min-w-0 break-all text-sm text-zinc-600" aria-live="polite">
              {fileData.file ? \`\${fileData.file.name} (\${(fileData.file.size / 1024 / 1024).toFixed(1)} MB)\` : "Ningún archivo seleccionado"}
            </span>
          </div>
          <button type="submit" className={primary} disabled={busy || !fileData.file || !fileData.title.trim()}>
            <Icon icon="fluent:arrow-upload-20-regular" width="18" className="mr-2" />
            {busy ? "Subiendo archivo…" : "Subir archivo"}
          </button>
        </div>
      </form>
    )}

`;
  after=after.slice(0,start)+newForm+after.slice(end);
  // Confirm old multipart path has been removed from the visible form.
  assert(!after.includes('form.set("file", fileData.file)'), 'El formulario aún contiene la subida antigua.');
  assert(after.includes('await uploadBillingMaterial();'), 'El formulario no usa la subida directa.');
  console.log('CAMBIO: botón Subir archivo visible, selector explícito y borrado permanente confirmado.');
  if (!apply) console.log('Previsualización sin modificar archivos. Ejecutá --apply para instalar.');
  else {
    writeFileSync(file+'.backup-v3_13_15',before);
    writeFileSync(file,after);
    console.log('Actualizado: components/social-works/ResourcesPanel.jsx');
    console.log('Respaldo: '+file+'.backup-v3_13_15');
  }
} catch(error) { console.error('ABORTADO:',error.message); process.exitCode=1; }
