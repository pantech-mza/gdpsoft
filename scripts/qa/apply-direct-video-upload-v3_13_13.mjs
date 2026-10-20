import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = process.cwd();
const assets = join(dirname(fileURLToPath(import.meta.url)), "billing-video-patch-assets");
const action = process.argv.includes("--apply") ? "apply" : "check";
const routes = [
  { path: "app/api/social-works/[id]/resources/upload/route.js", asset: "upload-route.js.txt" },
  { path: "components/social-works/ResourcesPanel.jsx", asset: "upload-client-helper.jsx.txt" },
];
try {
  const plan = routes.map(({ path, asset }) => {
    const file = resolve(root, path);
    if (!existsSync(file)) throw new Error(`No existe ${path}`);
    const source = readFileSync(file, "utf8");
    let next = source;
    if (asset === "upload-route.js.txt") {
      if (source.includes('body.action === "prepare"') && source.includes('body.action === "finalize"')) return { file, path, state: "aplicado", source, next };
      if (!source.includes('const form = await request.formData().catch(() => null);') ||
          !source.includes('export async function POST(request, { params })')) throw new Error(`${path}: código diferente al esperado, no se modifica`);
      next = readFileSync(join(assets, asset), "utf8");
    } else {
      if (source.includes("async function uploadBillingMaterial()") && source.includes("await uploadBillingMaterial();")) return { file, path, state: "aplicado", source, next };
      const insertion = "  async function load() {";
      const original = `            const form = new FormData();\n            form.set("title", fileData.title);\n            form.set("description", fileData.description);\n            form.set("file", fileData.file);\n            await api(\`\${endpoint}/upload\`, { method: "POST", body: form });\n            setFileData({ title: "", description: "", file: null });`;
      if (!source.includes(insertion) || !source.includes(original)) throw new Error(`${path}: puntos de inserción cambiaron, no se modifica`);
      next = source.replace(insertion, readFileSync(join(assets, asset), "utf8") + "\n" + insertion).replace(original, '            await uploadBillingMaterial();');
    }
    return { file, path, state: "pendiente", source, next };
  });
  plan.forEach(p => console.log(`${p.state === "aplicado" ? "OK" : "CAMBIO"} ${p.path}`));
  if (action === "check") console.log("Solo verificación. Ejecutá --apply para instalar.");
  else {
    for (const p of plan) if (p.state === "pendiente") {
      writeFileSync(`${p.file}.backup-video-v3_13_13`, p.source);
      writeFileSync(p.file, p.next);
      console.log(`Actualizado: ${p.path} (con respaldo)`);
    }
  }
} catch (e) { console.error(`ABORTADO: ${e.message}`); process.exitCode = 1; }
