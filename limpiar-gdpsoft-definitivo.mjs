
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

const ALLOWED_ARGS = new Set(["--apply", "--help"]);

for (const arg of process.argv.slice(2)) {
  if (!ALLOWED_ARGS.has(arg)) {
    console.error(`Argumento desconocido: ${arg}`);
    process.exit(1);
  }
}

if (process.argv.includes("--help")) {
  console.log("Uso:");
  console.log("  node limpiar-gdpsoft-definitivo.mjs");
  console.log("  node limpiar-gdpsoft-definitivo.mjs --apply");
  process.exit(0);
}

// ==========================================
// 1. VALIDAR QUE ESTAMOS EN GDPSoft
// ==========================================

const REQUIRED = [
  "package.json",
  "app",
  "components",
  "scripts",
];

const missing = REQUIRED.filter(
  (name) => !fs.existsSync(path.join(ROOT, name))
);

if (missing.length > 0) {
  console.error("ERROR: No parece ser la raíz de GDPSoft.");
  console.error("Faltan:", missing.join(", "));
  process.exit(1);
}

// ==========================================
// 2. LISTADO EXPLÍCITO DE ELIMINACIÓN
// ==========================================

const TARGETS = [
  // Cachés y archivos temporales
  ".next",
  "output",
  "node",
  "npm",
  "gdp-ai-lab@0.7.0",
  "gdpSoft.zip",

  // Documentación y datos históricos
  "Documentacion",
  "documentos",
  "Normativas GDP",
  "docs",
  "data",
  "correos sucursales.docx",
  "spa.traineddata",

  // Resultados QA anteriores
  "qa-audit-output",
  "qa/results",

  // Scripts antiguos de la raíz
  "check-vector-attributes.mjs",
  "expand-normative-zip.mjs",
  "importar-normativas-gdp.mjs",
  "importer-normativas-gdp-v2.mjs",
  "index-openai-normativas-gdp.mjs",
  "inspect-normative-zip.mjs",
  "preanalyze-normativas-gdp.mjs",
  "process-direct-unsupported-gdp.mjs",
  "process-ocr-normativas-gdp.mjs",
  "sync-vector-attributes-gdp.mjs",
  "test-normalize-question.mjs",

  // Scripts de importación ya ejecutados
  "scripts/create-branch-users.mjs",
  "scripts/import-legacy-staging.mjs",
  "scripts/import-gdp-internal-procedures.mjs",

  // Ejecutor QA antiguo (NO el de scripts/qa)
  "qa/run-battery.mjs",

  // Interfaz de laboratorio
  "app/lab",

  // APIs antiguas de laboratorio
  "app/api/reset",
  "app/api/upload",
  "app/api/ocr",
  "app/api/chat",
  "app/api/status",
  "app/api/config",
  "app/api/openai/setup-vector-store",
  "app/api/openai/test-file-search",
  "app/api/operations/test",
  "app/api/test-galeno",
  "app/api/test-galeno-normative",
  "app/api/test-galeno-validator",
  "app/api/test-openai",
  "app/api/test-supabase",
];

// ==========================================
// 3. PROTECCIONES
// ==========================================

const PROTECTED = [
  ".env.local",
  ".git",
  ".gitignore",
  ".vercel",
  "app/admin",
  "app/sucursal",
  "components",
  "lib",
  "public",
  "scripts/qa",
  "scripts/tests",
  "sql",
  "supabase",
  "node_modules",
  "package.json",
  "package-lock.json",
];

function normalize(relativePath) {
  return relativePath.replaceAll("\\", "/").replace(/\/+$/, "");
}

function overlapsProtected(relativePath) {
  const target = normalize(relativePath);

  return PROTECTED.some((item) => {
    const protectedPath = normalize(item);

    return (
      target === protectedPath ||
      target.startsWith(protectedPath + "/") ||
      protectedPath.startsWith(target + "/")
    );
  });
}

function resolveSafely(relativePath) {
  const fullPath = path.resolve(ROOT, relativePath);
  const rootPrefix = ROOT + path.sep;

  if (!fullPath.startsWith(rootPrefix)) {
    throw new Error(`Ruta fuera del proyecto: ${relativePath}`);
  }

  if (overlapsProtected(relativePath)) {
    throw new Error(`Ruta protegida: ${relativePath}`);
  }

  // Evitar atravesar enlaces simbólicos en directorios padres.
  const parts = normalize(relativePath).split("/");
  let current = ROOT;

  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);

    if (
      fs.existsSync(current) &&
      fs.lstatSync(current).isSymbolicLink()
    ) {
      throw new Error(
        `Directorio padre es un enlace simbólico: ${current}`
      );
    }
  }

  return fullPath;
}

// Validamos todas las rutas ANTES de borrar.
const entries = TARGETS.map((relativePath) => ({
  relativePath,
  fullPath: resolveSafely(relativePath),
}));

// ==========================================
// 4. DETECTAR ARCHIVOS EXISTENTES
// ==========================================

console.log("\n========================================");
console.log("       LIMPIEZA DEFINITIVA GDPSoft");
console.log("========================================\n");
console.log("Proyecto:", ROOT);
console.log("Modo:", APPLY ? "BORRADO DEFINITIVO" : "SIMULACIÓN");
console.log("");

let found = 0;
let absent = 0;
let deleted = 0;
let errors = 0;

for (const entry of entries) {
  const { relativePath, fullPath } = entry;

  if (!fs.existsSync(fullPath)) {
    console.log(`[NO EXISTE] ${relativePath}`);
    absent++;
    continue;
  }

  found++;

  let type;

  try {
    const stat = fs.lstatSync(fullPath);
    type = stat.isDirectory() ? "CARPETA" : "ARCHIVO";
  } catch (error) {
    console.error(`[ERROR] ${relativePath}: ${error.message}`);
    errors++;
    continue;
  }

  if (!APPLY) {
    console.log(`[ELIMINAR ${type}] ${relativePath}`);
    continue;
  }

  try {
    fs.rmSync(fullPath, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200,
    });

    console.log(`[ELIMINADO] ${relativePath}`);
    deleted++;
  } catch (error) {
    console.error(`[ERROR] ${relativePath}: ${error.message}`);
    errors++;
  }
}

// ==========================================
// 5. RESUMEN
// ==========================================

console.log("\n========================================");
console.log("              RESUMEN");
console.log("========================================");

console.log("Objetivos identificados:", found);
console.log("Objetivos ausentes:", absent);
console.log("Eliminados:", deleted);
console.log("Errores:", errors);

if (!APPLY) {
  console.log("\nNo se eliminó ningún archivo.");
  console.log("Para ejecutar el borrado definitivo:");
  console.log(
    "node limpiar-gdpsoft-definitivo.mjs --apply"
  );
} else {
  console.log("\nLimpieza finalizada.");
  console.log("El borrado no tiene recuperación automática.");
}

console.log("\nConservados:");
console.log("- .env.local y .git");
console.log("- Sucursal / Admin / Superadmin");
console.log("- APIs operativas no incluidas en la lista");
console.log("- Componentes, librerías e imágenes");
console.log("- scripts/qa y scripts/tests");
console.log("- SQL y migraciones Supabase");

if (errors > 0) {
  process.exitCode = 1;
}
