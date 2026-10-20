
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT = path.join(__dirname, "obras_sociales.json");
const ROOT = path.join(__dirname, "Normativas GDP");
const ID_MAP_FILE = path.join(ROOT, "_id_map.json");
const MANIFEST_FILE = path.join(ROOT, "_manifest.json");
const SUMMARY_FILE = path.join(ROOT, "_resumen.csv");
const ERRORS_FILE = path.join(ROOT, "_errores_descarga.txt");
const SECURITY_FILE = path.join(ROOT, "_ATENCION_SEGURIDAD.txt");

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 4;
const DOWNLOAD_TIMEOUT_MS = 60000;

function sanitizeName(value, max = 90) {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  return (cleaned || "Sin nombre").slice(0, max);
}

function padId(id) {
  return String(id).padStart(4, "0");
}

function normalizeStatus(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "activa" || s === "activo") return "Activa";
  if (s === "inactiva" || s === "inactivo") return "Inactiva";
  return String(value ?? "").trim() || null;
}

function normalizeValidatorName(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^sin\s+validador$/i.test(s)) return null;
  return s;
}

function makeDropboxDownloadUrl(rawUrl) {
  const url = new URL(rawUrl);

  if (url.hostname.toLowerCase().includes("dropbox.com")) {
    url.searchParams.set("dl", "1");
  }

  return url.toString();
}

function extensionFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const base = decodeURIComponent(path.basename(url.pathname));
    const ext = path.extname(base);
    if (ext && ext.length <= 10) return ext.toLowerCase();
  } catch {}
  return "";
}

function filenameFromUrl(rawUrl, contentType = "") {
  try {
    const url = new URL(rawUrl);
    let base = decodeURIComponent(path.basename(url.pathname));
    base = sanitizeName(base, 110);

    if (base && path.extname(base)) return base;
  } catch {}

  const ct = String(contentType).toLowerCase();
  if (ct.includes("pdf")) return "normativa.pdf";
  if (ct.includes("wordprocessingml")) return "normativa.docx";
  if (ct.includes("msword")) return "normativa.doc";
  if (ct.includes("spreadsheetml")) return "normativa.xlsx";
  if (ct.includes("excel")) return "normativa.xls";
  if (ct.includes("opendocument")) return "normativa.odt";
  if (ct.includes("png")) return "normativa.png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "normativa.jpg";

  const ext = extensionFromUrl(rawUrl);
  return ext ? `normativa${ext}` : "normativa.bin";
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatTxt(record) {
  const yesNoNorm = record.normative_url ? "Sí" : "No";
  const validator = record.validator_name ?? "Sin validador";
  const fileName = record.normative_file ?? "Sin archivo";

  return [
    `OBRA SOCIAL / ENTIDAD`,
    `${record.names ?? ""}`,
    ``,
    `ID GDP`,
    `${record.id}`,
    ``,
    `ID SOFT`,
    `${record.id_soft}`,
    ``,
    `ESTADO`,
    `${record.status ?? ""}`,
    ``,
    `PLAN / COBERTURA`,
    `${record.plan ?? ""}`,
    ``,
    `TIPO DE RECETA`,
    `${record.recipe_type ?? ""}`,
    ``,
    `VALIDEZ DE RECETA`,
    `${record.recipe_validity ?? ""}${record.recipe_validity !== null && record.recipe_validity !== undefined ? " días" : ""}`,
    ``,
    `MEMBRETE`,
    `${record.letterhead ?? ""}`,
    ``,
    `RP / CANTIDAD`,
    `${record.rp ?? ""}`,
    ``,
    `POR DÓNDE VALIDA`,
    `${validator}`,
    ``,
    `TIPO DE VALIDADOR`,
    `${record.validator_type ?? ""}`,
    ``,
    `URL EXTERNA DEL VALIDADOR`,
    `${record.validator_url ?? "Pendiente"}`,
    ``,
    `DIAGNÓSTICO`,
    `${record.diagnosis ?? ""}`,
    ``,
    `MONODROGA`,
    `${record.monodrug ?? ""}`,
    ``,
    `NOMBRE COMERCIAL`,
    `${record.commercial_name ?? ""}`,
    ``,
    `SUSTITUCIÓN`,
    `${record.substitution ?? ""}`,
    ``,
    `OBSERVACIONES`,
    `${record.observations ?? ""}`,
    ``,
    `TIENE NORMATIVA`,
    `${yesNoNorm}`,
    ``,
    `ARCHIVO DE NORMATIVA`,
    `${fileName}`,
    ``,
    `URL ORIGINAL DE NORMATIVA`,
    `${record.normative_url ?? ""}`,
    ``,
    `ÚLTIMA MODIFICACIÓN EN SOFT`,
    `${record.modified ?? ""}`,
    ``,
    `ROBINSON`,
    `${record.robinson ?? ""}`,
    ``,
  ].join("\n");
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function loadOrCreateIdMap(records) {
  let map = {};

  if (fsSync.existsSync(ID_MAP_FILE)) {
    map = await readJson(ID_MAP_FILE);
  }

  let maxId = Math.max(
    0,
    ...Object.values(map)
      .map(Number)
      .filter(Number.isFinite)
  );

  for (const record of records) {
    const softId = String(record.id);

    if (!Object.prototype.hasOwnProperty.call(map, softId)) {
      maxId += 1;
      map[softId] = maxId;
    }
  }

  await fs.writeFile(ID_MAP_FILE, JSON.stringify(map, null, 2), "utf8");
  return map;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 GDP-Normativas-Importer/1.0",
        "Accept": "*/*",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function downloadToBuffer(rawUrl) {
  const url = makeDropboxDownloadUrl(rawUrl);
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());

  // Evita guardar páginas de login/error HTML como si fueran una normativa.
  const startsLikeHtml =
    buffer.slice(0, 300).toString("utf8").toLowerCase().includes("<html") ||
    buffer.slice(0, 300).toString("utf8").toLowerCase().includes("<!doctype html");

  const expectedFileExt = extensionFromUrl(rawUrl);

  if (
    (contentType.toLowerCase().includes("text/html") || startsLikeHtml) &&
    ![".html", ".htm"].includes(expectedFileExt)
  ) {
    throw new Error(
      `El enlace devolvió HTML en lugar de un archivo (${contentType || "sin content-type"}). Puede requerir autenticación.`
    );
  }

  return {
    buffer,
    contentType,
    finalUrl: response.url,
  };
}

async function runPool(items, worker, concurrency = 4) {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = cursor++;
      if (current >= items.length) return;
      await worker(items[current], current);
    }
  });

  await Promise.all(workers);
}

await fs.mkdir(ROOT, { recursive: true });

const input = await readJson(INPUT);
if (!Array.isArray(input)) {
  throw new Error("obras_sociales.json debe contener un array.");
}

const idMap = await loadOrCreateIdMap(input);
const manifest = [];
const errors = [];

// Cache por URL: una misma normativa se descarga una sola vez.
// Después se copia en cada carpeta que la necesite.
const downloadCache = new Map();

const prepared = [];

for (const source of input) {
  const ownId = Number(idMap[String(source.id)]);
  const folderName = `${padId(ownId)} - ${sanitizeName(source.names)}`;
  const folderPath = path.join(ROOT, folderName);

  await fs.mkdir(folderPath, { recursive: true });

  const normalizedValidator = normalizeValidatorName(source.validator_name);

  const record = {
    id: ownId,
    id_soft: source.id,
    names: source.names ?? null,
    plan: source.plan ?? null,
    status: normalizeStatus(source.status),
    recipe_type: source.recipe_type ?? null,
    recipe_validity: source.recipe_validity ?? null,
    letterhead: source.letterhead ?? null,
    rp: source.rp ?? null,

    validator_name: normalizedValidator,
    validator_type: source.validator_type ?? null,

    // Queda preparado para completar cuando GDP entregue la URL real.
    validator_url: null,

    diagnosis: source.diagnosis ?? null,
    monodrug: source.monodrug ?? null,
    commercial_name: source.commercial_name ?? null,
    substitution: source.substitution ?? null,
    observations: source.observations ?? null,

    normative_url: source.normative ?? null,
    normative_file: null,
    normative_downloaded: false,
    normative_download_error: null,

    modified: source.modified ?? null,
    robinson: source.robinson ?? null,

    // Conservamos literalmente los valores originales que puedan ser útiles
    // para auditoría/sincronización con GDP Soft.
    source_soft: {
      validator_name_original: source.validator_name ?? null,
      normative_original: source.normative ?? null,
    },
  };

  prepared.push({ source, record, folderName, folderPath });
}

let processed = 0;

await runPool(
  prepared,
  async ({ record, folderName, folderPath }) => {
    const url = record.normative_url;

    if (url && !DRY_RUN) {
      try {
        let downloadPromise = downloadCache.get(url);

        if (!downloadPromise) {
          downloadPromise = downloadToBuffer(url);
          downloadCache.set(url, downloadPromise);
        }

        const result = await downloadPromise;
        let fileName = filenameFromUrl(url, result.contentType);

        // Si la URL no tenía extensión útil, intenta inferirla del destino final.
        if (fileName === "normativa.bin" && result.finalUrl) {
          fileName = filenameFromUrl(result.finalUrl, result.contentType);
        }

        fileName = sanitizeName(fileName, 120);

        // Si sanitizar quitó la extensión por alguna rareza, recuperarla.
        if (!path.extname(fileName)) {
          const ext = extensionFromUrl(url);
          if (ext) fileName += ext;
        }

        await fs.writeFile(path.join(folderPath, fileName), result.buffer);

        record.normative_file = fileName;
        record.normative_downloaded = true;
      } catch (error) {
        record.normative_download_error =
          error instanceof Error ? error.message : String(error);

        errors.push({
          id: record.id,
          id_soft: record.id_soft,
          names: record.names,
          url,
          error: record.normative_download_error,
        });
      }
    }

    await fs.writeFile(
      path.join(folderPath, "datos.json"),
      JSON.stringify(record, null, 2),
      "utf8"
    );

    await fs.writeFile(
      path.join(folderPath, "datos.txt"),
      formatTxt(record),
      "utf8"
    );

    manifest.push({
      id: record.id,
      id_soft: record.id_soft,
      names: record.names,
      status: record.status,
      validator_name: record.validator_name,
      validator_url: record.validator_url,
      folder: folderName,
      has_normative_url: Boolean(record.normative_url),
      normative_downloaded: record.normative_downloaded,
      normative_file: record.normative_file,
      normative_download_error: record.normative_download_error,
      modified: record.modified,
    });

    processed += 1;
    process.stdout.write(
      `\rProcesadas ${processed}/${prepared.length} obras sociales...`
    );
  },
  CONCURRENCY
);

console.log("");

manifest.sort((a, b) => a.id - b.id);

await fs.writeFile(
  MANIFEST_FILE,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      dry_run: DRY_RUN,
      total: manifest.length,
      records: manifest,
    },
    null,
    2
  ),
  "utf8"
);

const csvHeaders = [
  "id",
  "id_soft",
  "obra_social",
  "estado",
  "validador",
  "tiene_url_normativa",
  "normativa_descargada",
  "archivo",
  "error_descarga",
  "modificado_soft",
];

const csvRows = manifest.map((r) =>
  [
    r.id,
    r.id_soft,
    r.names,
    r.status,
    r.validator_name ?? "Sin validador",
    r.has_normative_url ? "Sí" : "No",
    r.normative_downloaded ? "Sí" : "No",
    r.normative_file ?? "",
    r.normative_download_error ?? "",
    r.modified ?? "",
  ]
    .map(csvCell)
    .join(";")
);

await fs.writeFile(
  SUMMARY_FILE,
  [csvHeaders.join(";"), ...csvRows].join("\n"),
  "utf8"
);

const errorText = errors.length
  ? errors
      .sort((a, b) => a.id - b.id)
      .map(
        (e) =>
          `[${padId(e.id)}] ${e.names}\n` +
          `ID Soft: ${e.id_soft}\n` +
          `URL: ${e.url}\n` +
          `Error: ${e.error}\n`
      )
      .join("\n----------------------------------------\n\n")
  : "No se registraron errores de descarga.\n";

await fs.writeFile(ERRORS_FILE, errorText, "utf8");

await fs.writeFile(
  SECURITY_FILE,
  [
    "ATENCIÓN",
    "",
    "Este paquete puede contener información interna de GDP dentro de datos.json y datos.txt,",
    "incluyendo observaciones provenientes del sistema original.",
    "",
    "No subir la carpeta completa a un repositorio público.",
    "No publicar credenciales, contraseñas, tokens ni accesos internos.",
    "",
    "Antes de indexar datos.txt en un Vector Store de producción, revisar/sanitizar",
    "los campos de observaciones que puedan contener datos de acceso.",
    "",
  ].join("\n"),
  "utf8"
);

const active = manifest.filter((x) => String(x.status).toLowerCase() === "activa");
const inactive = manifest.filter((x) => String(x.status).toLowerCase() === "inactiva");
const withUrl = manifest.filter((x) => x.has_normative_url);
const withoutUrl = manifest.filter((x) => !x.has_normative_url);
const withValidator = manifest.filter((x) => x.validator_name);
const withoutValidator = manifest.filter((x) => !x.validator_name);
const downloaded = manifest.filter((x) => x.normative_downloaded);

console.log("");
console.log("========== RESUMEN ==========");
console.log(`Total:                    ${manifest.length}`);
console.log(`Activas:                  ${active.length}`);
console.log(`Inactivas:                ${inactive.length}`);
console.log(`Con URL normativa:        ${withUrl.length}`);
console.log(`Sin URL normativa:        ${withoutUrl.length}`);
console.log(`Con validador:            ${withValidator.length}`);
console.log(`Sin validador:            ${withoutValidator.length}`);

if (!DRY_RUN) {
  console.log(`Normativas descargadas:   ${downloaded.length}`);
  console.log(`Errores de descarga:      ${errors.length}`);
} else {
  console.log("Modo DRY RUN: no se descargaron archivos.");
}

console.log("");
console.log(`Carpeta creada: ${ROOT}`);
