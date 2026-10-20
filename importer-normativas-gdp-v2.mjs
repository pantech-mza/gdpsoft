import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const BUCKET =
  process.env.SUPABASE_NORMATIVES_BUCKET ||
  "normativas-originales";

const BATCH_ID = Number(
  process.env.GDP_LEGACY_BATCH_ID || 1
);

const DOWNLOAD_TIMEOUT_MS = Number(
  process.env.GDP_DOWNLOAD_TIMEOUT_MS || 90_000
);

const CONCURRENCY = Math.max(
  1,
  Number(
    process.env.GDP_IMPORT_CONCURRENCY || 4
  )
);

const DRY_RUN =
  process.argv.includes("--dry-run");

const FORCE =
  process.argv.includes("--force");

const LIMIT =
  readNumericArg("--limit");

const ONLY_ID_SOFT =
  readNumericArg("--id-soft");

const RUN_DIR = path.join(
  process.cwd(),
  "data",
  "import",
  "normatives-run"
);

const RUN_STAMP = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const MANIFEST_FILE = path.join(
  RUN_DIR,
  `manifest-${RUN_STAMP}.json`
);

const ERRORS_FILE = path.join(
  RUN_DIR,
  `errors-${RUN_STAMP}.json`
);

if (
  !SUPABASE_URL ||
  !SUPABASE_SECRET_KEY
) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_SECRET_KEY. Verificá .env.local antes de ejecutar el importador."
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);


/* =========================================================
   ARGUMENTOS
   ========================================================= */

function readNumericArg(name) {
  const prefix = `${name}=`;

  const raw = process.argv.find(
    (arg) =>
      arg.startsWith(prefix)
  );

  if (!raw) {
    return null;
  }

  const value = Number(
    raw.slice(prefix.length)
  );

  return Number.isFinite(value)
    ? value
    : null;
}


/* =========================================================
   NOMBRES / STORAGE
   ========================================================= */

function sanitizeName(
  value,
  max = 120
) {
  const cleaned =
    String(value ?? "")
      .normalize("NFKC")
      .replace(
        /[<>:"/\\|?*\x00-\x1F]/g,
        "-"
      )
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();

  return (
    cleaned || "Sin nombre"
  ).slice(0, max);
}


/*
 * IMPORTANTE:
 * Esta función se utiliza únicamente para
 * segmentos internos de Supabase Storage.
 *
 * El nombre original del documento sigue
 * guardándose sin esta sanitización en:
 *
 * normatives.original_filename
 */
function sanitizeStorageSegment(
  value,
  max = 100
) {
  const cleaned =
    String(value ?? "")
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^A-Za-z0-9._-]+/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^[.\-_]+|[.\-_]+$/g,
        ""
      )
      .trim();

  return (
    cleaned || "sin-nombre"
  ).slice(0, max);
}


function sanitizeStorageFilename(
  filename
) {
  const original = String(
    filename ??
      "normativa.bin"
  );

  const originalExt =
    path.extname(original);

  const ext =
    originalExt
      .toLowerCase()
      .replace(
        /[^a-z0-9.]/g,
        ""
      );

  const base =
    path.basename(
      original,
      originalExt
    );

  const safeBase =
    sanitizeStorageSegment(
      base,
      120
    );

  return `${safeBase}${
    ext || ".bin"
  }`;
}


function stripExtension(
  filename
) {
  const ext =
    path.extname(filename);

  return ext
    ? filename.slice(
        0,
        -ext.length
      )
    : filename;
}


function normalizeText(value) {
  return String(
    value ?? ""
  ).trim();
}


/* =========================================================
   URL
   ========================================================= */

function normalizeSourceUrl(
  rawUrl
) {
  let value =
    normalizeText(rawUrl);

  if (!value) {
    return null;
  }

  /*
   * Corrige casos copiados desde Dropbox /home
   * cuando contienen el enlace real dentro de:
   *
   * #:~:text=https%3A//...
   */

  const textFragmentMarker =
    "#:~:text=";

  const fragmentIndex =
    value.indexOf(
      textFragmentMarker
    );

  if (
    fragmentIndex >= 0
  ) {
    const encoded =
      value.slice(
        fragmentIndex +
          textFragmentMarker.length
      );

    try {
      const decoded =
        decodeURIComponent(
          encoded
        );

      if (
        /^https?:\/\//i.test(
          decoded
        )
      ) {
        value = decoded;
      }
    } catch {
      // Conservamos el valor original.
    }
  }

  const url =
    new URL(value);

  /*
   * Si todavía sigue siendo /home,
   * no es un enlace directo al archivo.
   */
  if (
    url.hostname
      .toLowerCase()
      .includes(
        "dropbox.com"
      ) &&
    url.pathname
      .toLowerCase()
      .startsWith(
        "/home"
      )
  ) {
    throw new Error(
      "Enlace Dropbox de navegación (/home) sin archivo directo. Requiere corrección manual."
    );
  }

  /*
   * Convierte enlaces compartidos Dropbox
   * a descarga.
   */
  if (
    url.hostname
      .toLowerCase()
      .includes(
        "dropbox.com"
      )
  ) {
    url.searchParams.set(
      "dl",
      "1"
    );
  }

  return url.toString();
}


/* =========================================================
   EXTENSIONES / MIME
   ========================================================= */

function extensionFromUrl(
  rawUrl
) {
  try {
    const url =
      new URL(rawUrl);

    const base =
      decodeURIComponent(
        path.basename(
          url.pathname
        )
      );

    const ext =
      path.extname(base);

    if (
      ext &&
      ext.length <= 10
    ) {
      return ext.toLowerCase();
    }
  } catch {}

  return "";
}


function filenameFromContentDisposition(
  contentDisposition
) {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match =
    contentDisposition.match(
      /filename\*=UTF-8''([^;]+)/i
    );

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(
        utf8Match[1]
          .trim()
          .replace(
            /^"|"$/g,
            ""
          )
      );
    } catch {}
  }

  const normalMatch =
    contentDisposition.match(
      /filename\s*=\s*"?([^";]+)"?/i
    );

  return (
    normalMatch?.[1]?.trim() ||
    null
  );
}


function extensionFromMime(
  contentType
) {
  const ct =
    String(
      contentType || ""
    )
      .toLowerCase()
      .split(";")[0]
      .trim();

  const map = new Map([
    [
      "application/pdf",
      ".pdf",
    ],

    [
      "application/msword",
      ".doc",
    ],

    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".docx",
    ],

    [
      "application/vnd.ms-excel",
      ".xls",
    ],

    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xlsx",
    ],

    [
      "application/vnd.oasis.opendocument.text",
      ".odt",
    ],

    [
      "application/vnd.oasis.opendocument.spreadsheet",
      ".ods",
    ],

    [
      "image/png",
      ".png",
    ],

    [
      "image/jpeg",
      ".jpg",
    ],

    [
      "text/plain",
      ".txt",
    ],
  ]);

  return (
    map.get(ct) || ""
  );
}


function inferMimeType(
  contentType,
  filename
) {
  const cleanContentType =
    String(
      contentType || ""
    )
      .split(";")[0]
      .trim();

  /*
   * Dropbox y otros servidores muchas
   * veces devuelven MIME genérico.
   *
   * En esos casos NO debemos guardar
   * application/binary, sino inferir
   * el tipo real por extensión.
   */
  const genericMimeTypes =
    new Set([
      "",
      "application/octet-stream",
      "application/binary",
      "binary/octet-stream",
      "application/download",
      "application/x-download",
    ]);

  if (
    cleanContentType &&
    !genericMimeTypes.has(
      cleanContentType
        .toLowerCase()
    )
  ) {
    return cleanContentType;
  }

  const ext =
    path.extname(
      filename
    ).toLowerCase();

  const map = new Map([
    [
      ".pdf",
      "application/pdf",
    ],

    [
      ".doc",
      "application/msword",
    ],

    [
      ".docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],

    [
      ".xls",
      "application/vnd.ms-excel",
    ],

    [
      ".xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],

    [
      ".odt",
      "application/vnd.oasis.opendocument.text",
    ],

    [
      ".ods",
      "application/vnd.oasis.opendocument.spreadsheet",
    ],

    [
      ".png",
      "image/png",
    ],

    [
      ".jpg",
      "image/jpeg",
    ],

    [
      ".jpeg",
      "image/jpeg",
    ],

    [
      ".txt",
      "text/plain",
    ],
  ]);

  return (
    map.get(ext) ||
    "application/octet-stream"
  );
}


/* =========================================================
   NOMBRE DEL ARCHIVO
   ========================================================= */

function chooseFilename(
  rows,
  rawUrl,
  finalUrl,
  contentType,
  contentDisposition
) {
  /*
   * 1. Content-Disposition
   */
  const fromHeader =
    filenameFromContentDisposition(
      contentDisposition
    );

  if (fromHeader) {
    return sanitizeName(
      fromHeader,
      140
    );
  }

  /*
   * 2. Nombre existente en staging
   */
  const fromStaging =
    rows.find(
      (row) =>
        normalizeText(
          row.normative_filename
        )
    )?.normative_filename;

  if (fromStaging) {
    return sanitizeName(
      fromStaging,
      140
    );
  }

  /*
   * 3. URL final / original
   */
  for (
    const candidate of [
      finalUrl,
      rawUrl,
    ]
  ) {
    try {
      const url =
        new URL(candidate);

      const base =
        decodeURIComponent(
          path.basename(
            url.pathname
          )
        );

      if (
        base &&
        base !== "/"
      ) {
        const safe =
          sanitizeName(
            base,
            140
          );

        if (
          path.extname(safe)
        ) {
          return safe;
        }
      }
    } catch {}
  }

  /*
   * 4. MIME / extensión
   */
  const ext =
    extensionFromMime(
      contentType
    ) ||
    extensionFromUrl(
      finalUrl
    ) ||
    extensionFromUrl(
      rawUrl
    ) ||
    ".bin";

  return `normativa${ext}`;
}


/* =========================================================
   SHA-256
   ========================================================= */

function sha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}


/* =========================================================
   HELPERS
   ========================================================= */

function unique(values) {
  return [
    ...new Set(
      values.filter(
        (value) =>
          value !== null &&
          value !== undefined
      )
    ),
  ];
}


function latestTimestamp(
  values
) {
  const valid =
    values
      .map(
        (value) =>
          value
            ? new Date(value)
            : null
      )
      .filter(
        (value) =>
          value &&
          !Number.isNaN(
            value.getTime()
          )
      );

  if (!valid.length) {
    return null;
  }

  valid.sort(
    (a, b) =>
      b.getTime() -
      a.getTime()
  );

  return valid[0]
    .toISOString();
}


/* =========================================================
   TÍTULO NORMATIVA
   ========================================================= */

function buildTitle(
  rows,
  filename
) {
  const canonicalNames =
    unique(
      rows.map(
        (row) =>
          row.canonical_name
      )
    );

  const extraNames =
    unique(
      rows
        .filter(
          (row) =>
            row.document_role ===
            "EXTRA"
        )
        .map(
          (row) =>
            row.extra_name
        )
    );

  /*
   * Documento de una única OOSS
   */
  if (
    canonicalNames.length ===
    1
  ) {
    const canonical =
      canonicalNames[0];

    /*
     * EXTRA específico
     */
    if (
      extraNames.length ===
        1 &&
      rows.every(
        (row) =>
          row.document_role ===
          "EXTRA"
      )
    ) {
      return (
        `${canonical} - ` +
        `${extraNames[0]}`
      );
    }

    return (
      `${canonical} - ` +
      `Norma de atención`
    );
  }

  /*
   * Documento físico compartido
   * entre distintas OOSS.
   */
  return (
    `${stripExtension(
      filename
    )} - Documento compartido`
  );
}


/* =========================================================
   STORAGE PATH
   ========================================================= */

function buildStoragePath(
  rows,
  hash,
  filename,
  socialWorkById
) {
  const socialWorkIds =
    unique(
      rows.map(
        (row) =>
          row.imported_social_work_id
      )
    );

  /*
   * original_filename conserva el nombre humano.
   * Storage usa una versión segura.
   */
  const storageFilename =
    sanitizeStorageFilename(
      filename
    );

  /*
   * Documento perteneciente a una sola OOSS
   */
  if (
    socialWorkIds.length ===
    1
  ) {
    const socialWork =
      socialWorkById.get(
        Number(
          socialWorkIds[0]
        )
      );

    const idSoft =
      sanitizeStorageSegment(
        socialWork?.id_soft ??
          `sw-${socialWorkIds[0]}`
      );

    const name =
      sanitizeStorageSegment(
        socialWork?.name ||
          rows[0]
            ?.canonical_name ||
          "OOSS",
        90
      );

    return (
      `obras-sociales/` +
      `${idSoft}/` +
      `${name}/` +
      `${hash}/` +
      `${storageFilename}`
    );
  }

  /*
   * Documento compartido entre
   * más de una OOSS.
   */
  return (
    `obras-sociales/` +
    `_compartidas/` +
    `${hash}/` +
    `${storageFilename}`
  );
}


/* =========================================================
   DESCARGA HTTP
   ========================================================= */

async function fetchWithTimeout(
  url
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      DOWNLOAD_TIMEOUT_MS
    );

  try {
    return await fetch(
      url,
      {
        redirect:
          "follow",

        signal:
          controller.signal,

        headers: {
          "User-Agent":
            "Mozilla/5.0 GDP-Normativas-Importer/2.0",

          Accept:
            "*/*",
        },
      }
    );
  } finally {
    clearTimeout(timer);
  }
}


async function downloadToBuffer(
  rawUrl
) {
  const normalizedUrl =
    normalizeSourceUrl(
      rawUrl
    );

  const response =
    await fetchWithTimeout(
      normalizedUrl
    );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText}`
    );
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  const contentDisposition =
    response.headers.get(
      "content-disposition"
    ) || "";

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  if (!buffer.length) {
    throw new Error(
      "El enlace devolvió un archivo vacío."
    );
  }

  /*
   * Detectamos páginas HTML que fueron
   * devueltas en lugar del archivo.
   */
  const head =
    buffer
      .slice(0, 500)
      .toString("utf8")
      .toLowerCase();

  const startsLikeHtml =
    head.includes(
      "<html"
    ) ||
    head.includes(
      "<!doctype html"
    );

  const expectedFileExt =
    extensionFromUrl(
      normalizedUrl
    );

  if (
    (
      contentType
        .toLowerCase()
        .includes(
          "text/html"
        ) ||
      startsLikeHtml
    ) &&
    ![
      ".html",
      ".htm",
    ].includes(
      expectedFileExt
    )
  ) {
    throw new Error(
      `El enlace devolvió HTML en lugar de un archivo (${contentType || "sin content-type"}). Puede requerir autenticación o ser un enlace de navegación.`
    );
  }

  return {
    buffer,
    contentType,
    contentDisposition,

    finalUrl:
      response.url,

    normalizedUrl,
  };
}


/* =========================================================
   POOL
   ========================================================= */

async function runPool(
  items,
  worker,
  concurrency = 4
) {
  let cursor = 0;

  const workers =
    Array.from(
      {
        length:
          concurrency,
      },
      async () => {
        while (true) {
          const current =
            cursor++;

          if (
            current >=
            items.length
          ) {
            return;
          }

          await worker(
            items[current],
            current
          );
        }
      }
    );

  await Promise.all(
    workers
  );
}


/* =========================================================
   CANAL
   ========================================================= */

function channelCode(row) {
  const code =
    String(
      row.detected_billing_channel ||
        "UNKNOWN"
    ).toUpperCase();

  return (
    code === "CAMARA" ||
    code === "COLEGIO"
  )
    ? code
    : null;
}


/* =========================================================
   AGRUPAMIENTO POR URL
   ========================================================= */

function makeGroupKey(row) {
  try {
    return normalizeSourceUrl(
      row.normative_url
    );
  } catch {
    return String(
      row.normative_url || ""
    ).trim();
  }
}


/* =========================================================
   STAGING
   ========================================================= */

async function loadStagingRows() {
  let query =
    supabase
      .from(
        "legacy_social_works_staging"
      )
      .select(`
        id,
        batch_id,
        id_soft,
        legacy_name,
        canonical_name,
        migration_action,
        document_role,
        extra_name,
        extra_code,
        detected_billing_channel,
        normative_url,
        normative_filename,
        normative_sha256,
        normative_size_bytes,
        source_modified_at,
        imported_social_work_id,
        imported_scope_id,
        imported_normative_id,
        import_error,
        status
      `)
      .eq(
        "batch_id",
        BATCH_ID
      )
      .in(
        "migration_action",
        [
          "CREATE",
          "MERGE",
          "EXTRA",
        ]
      )
      .not(
        "normative_url",
        "is",
        null
      )
      .not(
        "imported_social_work_id",
        "is",
        null
      )
      .order(
        "id_soft",
        {
          ascending: true,
        }
      );

  if (
    ONLY_ID_SOFT !==
    null
  ) {
    query =
      query.eq(
        "id_soft",
        ONLY_ID_SOFT
      );
  }

  if (
    LIMIT !== null
  ) {
    query =
      query.limit(
        LIMIT
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   DATOS DE REFERENCIA
   ========================================================= */

async function loadReferenceData() {
  const [
    channelsResult,
    socialWorksResult,
  ] =
    await Promise.all([
      supabase
        .from(
          "billing_channels"
        )
        .select(
          "id, code, name, active"
        ),

      supabase
        .from(
          "social_works"
        )
        .select(
          "id, id_soft, name, active"
        ),
    ]);

  if (
    channelsResult.error
  ) {
    throw channelsResult.error;
  }

  if (
    socialWorksResult.error
  ) {
    throw socialWorksResult.error;
  }

  const billingChannelByCode =
    new Map(
      (
        channelsResult.data ||
        []
      ).map(
        (row) => [
          String(
            row.code
          ).toUpperCase(),

          row,
        ]
      )
    );

  for (
    const required of [
      "CAMARA",
      "COLEGIO",
    ]
  ) {
    if (
      !billingChannelByCode.has(
        required
      )
    ) {
      throw new Error(
        `Falta billing_channels.code = ${required}`
      );
    }
  }

  const socialWorkById =
    new Map(
      (
        socialWorksResult.data ||
        []
      ).map(
        (row) => [
          Number(row.id),
          row,
        ]
      )
    );

  return {
    billingChannelByCode,
    socialWorkById,
  };
}


/* =========================================================
   BUSCAR NORMATIVA POR SHA
   ========================================================= */

async function findExistingNormativeBySha(
  hash
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "normatives"
      )
      .select(`
        id,
        title,
        original_filename,
        mime_type,
        file_size_bytes,
        storage_path_original,
        sha256,
        source_url,
        source_modified_at,
        openai_file_id,
        openai_vector_store_id,
        openai_status
      `)
      .eq(
        "sha256",
        hash
      )
      .order(
        "id",
        {
          ascending: true,
        }
      )
      .limit(1);

  if (error) {
    throw error;
  }

  return (
    data?.[0] ||
    null
  );
}


/* =========================================================
   STORAGE
   ========================================================= */

async function uploadOriginal(
  storagePath,
  buffer,
  mimeType
) {
  const {
    error,
  } =
    await supabase.storage
      .from(
        BUCKET
      )
      .upload(
        storagePath,
        buffer,
        {
          contentType:
            mimeType,

          cacheControl:
            "3600",

          upsert:
            false,
        }
      );

  if (!error) {
    return;
  }

  const message =
    String(
      error.message ||
        error
    );

  /*
   * Si la carga física ya existe,
   * podemos continuar.
   */
  if (
    /already exists|duplicate/i.test(
      message
    )
  ) {
    return;
  }

  throw error;
}


/* =========================================================
   CREAR NORMATIVA
   ========================================================= */

async function createNormative({
  rows,
  download,
  hash,
  filename,
  mimeType,
  storagePath,
}) {
  const sourceUrls =
    unique(
      rows.map(
        (row) =>
          row.normative_url
      )
    );

  const sourceModifiedAt =
    latestTimestamp(
      rows.map(
        (row) =>
          row.source_modified_at
      )
    );

  const payload = {
    title:
      buildTitle(
        rows,
        filename
      ),

    /*
     * Este nombre conserva acentos,
     * espacios y el nombre humano.
     */
    original_filename:
      filename,

    mime_type:
      mimeType,

    file_size_bytes:
      download.buffer.length,

    /*
     * Esta ruta ya utiliza únicamente
     * segmentos seguros.
     */
    storage_path_original:
      storagePath,

    sha256:
      hash,

    status:
      "PENDING_ANALYSIS",

    version:
      1,

    is_current:
      true,

    source_url:
      sourceUrls[0] ||
      download.normalizedUrl,

    source_system:
      "GDP_SOFT",

    source_modified_at:
      sourceModifiedAt,

    /*
     * Metadata sanitizada.
     * NO guardamos observations ni source_raw
     * del legacy.
     */
    source_metadata: {
      importer:
        "importer-normativas-gdp-v2",

      batch_id:
        BATCH_ID,

      id_soft:
        unique(
          rows.map(
            (row) =>
              row.id_soft
          )
        ),

      legacy_names:
        unique(
          rows.map(
            (row) =>
              row.legacy_name
          )
        ),

      canonical_names:
        unique(
          rows.map(
            (row) =>
              row.canonical_name
          )
        ),

      source_urls:
        sourceUrls,

      document_roles:
        unique(
          rows.map(
            (row) =>
              row.document_role
          )
        ),

      billing_channels:
        unique(
          rows.map(
            (row) =>
              row.detected_billing_channel
          )
        ),

      scopes:
        unique(
          rows.map(
            (row) =>
              row.extra_code
          )
        ),
    },

    analysis_stage:
      "PENDING",

    analysis_progress:
      0,

    openai_status:
      null,

    updated_at:
      new Date()
        .toISOString(),
  };

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "normatives"
      )
      .insert(
        payload
      )
      .select(`
        id,
        title,
        original_filename,
        storage_path_original,
        sha256
      `)
      .single();

  if (error) {
    throw error;
  }

  return data;
}


/* =========================================================
   LOCK POR SHA
   ========================================================= */

const shaLocks =
  new Map();


async function ensureNormativeForDownload({
  rows,
  download,
  hash,
  filename,
  mimeType,
  socialWorkById,
}) {
  /*
   * Si otro worker ya está creando
   * exactamente el mismo documento,
   * esperamos ese resultado.
   */
  if (
    shaLocks.has(hash)
  ) {
    const lockedResult =
      await shaLocks.get(
        hash
      );

    return {
      ...lockedResult,

      /*
       * Para este segundo worker
       * cuenta como reutilización.
       */
      reused:
        true,

      uploaded:
        false,
    };
  }

  const promise =
    (async () => {
      /*
       * Primero DB:
       * evita duplicar SHA ya existente.
       */
      const existing =
        await findExistingNormativeBySha(
          hash
        );

      if (existing) {
        return {
          normative:
            existing,

          reused:
            true,

          uploaded:
            false,
        };
      }

      const storagePath =
        buildStoragePath(
          rows,
          hash,
          filename,
          socialWorkById
        );

      await uploadOriginal(
        storagePath,
        download.buffer,
        mimeType
      );

      const normative =
        await createNormative({
          rows,
          download,
          hash,
          filename,
          mimeType,
          storagePath,
        });

      return {
        normative,

        reused:
          false,

        uploaded:
          true,
      };
    })();

  shaLocks.set(
    hash,
    promise
  );

  try {
    return await promise;
  } finally {
    shaLocks.delete(
      hash
    );
  }
}


/* =========================================================
   RELACIÓN NORMATIVE ↔ OOSS
   ========================================================= */

async function upsertNormativeLink(
  row,
  normativeId,
  billingChannelByCode
) {
  const code =
    channelCode(row);

  const billingChannelId =
    code
      ? billingChannelByCode.get(
          code
        )?.id ?? null
      : null;

  const scopeId =
    row.document_role ===
    "EXTRA"
      ? row.imported_scope_id
      : null;

  if (
    row.document_role ===
      "EXTRA" &&
    !scopeId
  ) {
    throw new Error(
      `EXTRA id_soft ${row.id_soft} sin imported_scope_id.`
    );
  }

  /*
   * Coincide exactamente con la nueva
   * constraint:
   *
   * normative_id
   * social_work_id
   * billing_channel_id
   * scope_id
   * document_role
   */

  let query =
    supabase
      .from(
        "normative_social_works"
      )
      .select(
        "id"
      )
      .eq(
        "normative_id",
        normativeId
      )
      .eq(
        "social_work_id",
        row.imported_social_work_id
      )
      .eq(
        "document_role",
        row.document_role
      );

  query =
    billingChannelId ===
    null
      ? query.is(
          "billing_channel_id",
          null
        )
      : query.eq(
          "billing_channel_id",
          billingChannelId
        );

  query =
    scopeId ===
    null
      ? query.is(
          "scope_id",
          null
        )
      : query.eq(
          "scope_id",
          scopeId
        );

  const {
    data:
      existing,

    error:
      selectError,
  } =
    await query.limit(
      1
    );

  if (selectError) {
    throw selectError;
  }

  const payload = {
    normative_id:
      normativeId,

    social_work_id:
      row.imported_social_work_id,

    is_primary:
      row.document_role ===
      "PRIMARY",

    notes:
      `Migrado desde PlataSoft · ID Soft ${row.id_soft} · ${row.legacy_name}`,

    billing_channel_id:
      billingChannelId,

    document_role:
      row.document_role,

    scope_id:
      scopeId,
  };

  /*
   * Relación existente:
   * solamente actualizamos metadata.
   */
  if (
    existing?.[0]?.id
  ) {
    const {
      error,
    } =
      await supabase
        .from(
          "normative_social_works"
        )
        .update(
          payload
        )
        .eq(
          "id",
          existing[0].id
        );

    if (error) {
      throw error;
    }

    return existing[0].id;
  }

  /*
   * Nueva relación.
   */
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "normative_social_works"
      )
      .insert(
        payload
      )
      .select(
        "id"
      )
      .single();

  if (error) {
    throw error;
  }

  return data.id;
}


/* =========================================================
   STAGING: ÉXITO
   ========================================================= */

async function updateStagingSuccess(
  row,
  normativeId,
  hash,
  filename,
  fileSize
) {
  const {
    error,
  } =
    await supabase
      .from(
        "legacy_social_works_staging"
      )
      .update({
        imported_normative_id:
          normativeId,

        normative_sha256:
          hash,

        normative_filename:
          filename,

        normative_size_bytes:
          fileSize,

        import_error:
          null,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        row.id
      );

  if (error) {
    throw error;
  }
}


/* =========================================================
   STAGING: ERROR
   ========================================================= */

async function updateStagingError(
  rows,
  message
) {
  const ids =
    rows.map(
      (row) =>
        row.id
    );

  if (!ids.length) {
    return;
  }

  const {
    error,
  } =
    await supabase
      .from(
        "legacy_social_works_staging"
      )
      .update({
        import_error:
          String(
            message
          ).slice(
            0,
            1500
          ),

        updated_at:
          new Date()
            .toISOString(),
      })
      .in(
        "id",
        ids
      );

  if (error) {
    throw error;
  }
}


/* =========================================================
   INICIO
   ========================================================= */

await fs.mkdir(
  RUN_DIR,
  {
    recursive:
      true,
  }
);


const rows =
  await loadStagingRows();


const {
  billingChannelByCode,
  socialWorkById,
} =
  await loadReferenceData();


/* =========================================================
   AGRUPAR POR URL
   ========================================================= */

const groupsMap =
  new Map();


for (
  const row of rows
) {
  const key =
    makeGroupKey(row);

  if (
    !groupsMap.has(key)
  ) {
    groupsMap.set(
      key,
      []
    );
  }

  groupsMap
    .get(key)
    .push(row);
}


const groups =
  [
    ...groupsMap.entries(),
  ].map(
    ([
      url,
      groupRows,
    ]) => ({
      url,

      rows:
        groupRows,
    })
  );


/* =========================================================
   ESTADÍSTICAS
   ========================================================= */

const manifest =
  [];

const errors =
  [];

let processed =
  0;

let createdNormatives =
  0;

let reusedNormatives =
  0;

let skippedCompleteGroups =
  0;


/* =========================================================
   CABECERA
   ========================================================= */

console.log(
  "\n========== GDP NORMATIVAS IMPORTER V2 =========="
);

console.log(
  `Batch:                  ${BATCH_ID}`
);

console.log(
  `Registros con URL:      ${rows.length}`
);

console.log(
  `URLs/grupos a procesar: ${groups.length}`
);

console.log(
  `Concurrencia:           ${CONCURRENCY}`
);

console.log(
  `Bucket:                  ${BUCKET}`
);

console.log(
  `Dry run:                 ${
    DRY_RUN
      ? "Sí"
      : "No"
  }`
);

console.log(
  `Force:                   ${
    FORCE
      ? "Sí"
      : "No"
  }`
);


if (
  LIMIT !==
  null
) {
  console.log(
    `Limit:                   ${LIMIT}`
  );
}


if (
  ONLY_ID_SOFT !==
  null
) {
  console.log(
    `ID Soft único:           ${ONLY_ID_SOFT}`
  );
}


console.log("");


/* =========================================================
   DRY RUN
   ========================================================= */

if (DRY_RUN) {
  const preview =
    groups.map(
      (group) => ({
        source_url:
          group.url,

        rows:
          group.rows.map(
            (row) => ({
              id_soft:
                row.id_soft,

              legacy_name:
                row.legacy_name,

              canonical_name:
                row.canonical_name,

              document_role:
                row.document_role,

              billing_channel:
                row.detected_billing_channel,

              scope_id:
                row.imported_scope_id,

              imported_normative_id:
                row.imported_normative_id,
            })
          ),
      })
    );

  await fs.writeFile(
    MANIFEST_FILE,

    JSON.stringify(
      {
        generated_at:
          new Date()
            .toISOString(),

        dry_run:
          true,

        batch_id:
          BATCH_ID,

        groups:
          preview,
      },

      null,
      2
    ),

    "utf8"
  );

  console.log(
    `DRY RUN finalizado. Manifiesto: ${MANIFEST_FILE}`
  );

  process.exit(0);
}


/* =========================================================
   IMPORTACIÓN
   ========================================================= */

await runPool(
  groups,

  async (group) => {
    const groupRows =
      group.rows;

    try {
      /*
       * Si todos los registros de este
       * grupo ya fueron importados,
       * no hacemos nada.
       */
      const alreadyComplete =
        !FORCE &&
        groupRows.every(
          (row) =>
            row.imported_normative_id &&
            row.normative_sha256 &&
            !row.import_error
        );

      if (
        alreadyComplete
      ) {
        skippedCompleteGroups +=
          1;

        manifest.push({
          source_url:
            group.url,

          status:
            "SKIPPED_ALREADY_IMPORTED",

          id_soft:
            groupRows.map(
              (row) =>
                row.id_soft
            ),

          imported_normative_ids:
            unique(
              groupRows.map(
                (row) =>
                  row.imported_normative_id
              )
            ),
        });

        return;
      }


      /* -----------------------------------------
         DESCARGA
         ----------------------------------------- */

      const download =
        await downloadToBuffer(
          group.url
        );


      /* -----------------------------------------
         SHA
         ----------------------------------------- */

      const hash =
        sha256(
          download.buffer
        );


      /* -----------------------------------------
         NOMBRE
         ----------------------------------------- */

      const filename =
        chooseFilename(
          groupRows,
          group.url,
          download.finalUrl,
          download.contentType,
          download.contentDisposition
        );


      /* -----------------------------------------
         MIME
         ----------------------------------------- */

      const mimeType =
        inferMimeType(
          download.contentType,
          filename
        );


      /* -----------------------------------------
         NORMATIVE
         ----------------------------------------- */

      const {
        normative,
        reused,
      } =
        await ensureNormativeForDownload({
          rows:
            groupRows,

          download,

          hash,

          filename,

          mimeType,

          socialWorkById,
        });


      if (reused) {
        reusedNormatives +=
          1;
      } else {
        createdNormatives +=
          1;
      }


      /* -----------------------------------------
         RELACIONES
         ----------------------------------------- */

      const links =
        [];


      for (
        const row of groupRows
      ) {
        const linkId =
          await upsertNormativeLink(
            row,
            normative.id,
            billingChannelByCode
          );


        await updateStagingSuccess(
          row,
          normative.id,
          hash,
          filename,
          download.buffer.length
        );


        links.push({
          id_soft:
            row.id_soft,

          social_work_id:
            row.imported_social_work_id,

          scope_id:
            row.document_role ===
            "EXTRA"
              ? row.imported_scope_id
              : null,

          billing_channel:
            channelCode(row),

          document_role:
            row.document_role,

          normative_social_work_id:
            linkId,
        });
      }


      /* -----------------------------------------
         MANIFEST OK
         ----------------------------------------- */

      manifest.push({
        source_url:
          group.url,

        final_url:
          download.finalUrl,

        status:
          reused
            ? "REUSED_SHA"
            : "IMPORTED",

        normative_id:
          normative.id,

        sha256:
          hash,

        filename,

        mime_type:
          mimeType,

        size_bytes:
          download.buffer.length,

        links,
      });

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);


      /*
       * Registramos el error en staging.
       */
      try {
        await updateStagingError(
          groupRows,
          message
        );
      } catch (
        stagingError
      ) {
        console.error(
          "No se pudo guardar import_error en staging:",
          stagingError
        );
      }


      const entry = {
        source_url:
          group.url,

        id_soft:
          groupRows.map(
            (row) =>
              row.id_soft
          ),

        legacy_names:
          groupRows.map(
            (row) =>
              row.legacy_name
          ),

        error:
          message,
      };


      errors.push(
        entry
      );


      manifest.push({
        ...entry,

        status:
          "ERROR",
      });

    } finally {
      processed +=
        1;

      process.stdout.write(
        `\rProcesados ${processed}/${groups.length} grupos...`
      );
    }
  },

  CONCURRENCY
);


console.log("\n");


/* =========================================================
   MANIFEST
   ========================================================= */

manifest.sort(
  (a, b) =>
    String(
      a.source_url
    ).localeCompare(
      String(
        b.source_url
      )
    )
);


await fs.writeFile(
  MANIFEST_FILE,

  JSON.stringify(
    {
      generated_at:
        new Date()
          .toISOString(),

      dry_run:
        false,

      batch_id:
        BATCH_ID,

      stats: {
        staging_rows_with_url:
          rows.length,

        url_groups:
          groups.length,

        created_normatives:
          createdNormatives,

        reused_normatives:
          reusedNormatives,

        skipped_complete_groups:
          skippedCompleteGroups,

        errors:
          errors.length,
      },

      records:
        manifest,
    },

    null,
    2
  ),

  "utf8"
);


/* =========================================================
   ERRORES
   ========================================================= */

await fs.writeFile(
  ERRORS_FILE,

  JSON.stringify(
    errors,
    null,
    2
  ),

  "utf8"
);


/* =========================================================
   CONTEOS FINALES
   ========================================================= */

const {
  count:
    importedRows,

  error:
    importedCountError,
} =
  await supabase
    .from(
      "legacy_social_works_staging"
    )
    .select(
      "id",
      {
        count:
          "exact",

        head:
          true,
      }
    )
    .eq(
      "batch_id",
      BATCH_ID
    )
    .in(
      "migration_action",
      [
        "CREATE",
        "MERGE",
        "EXTRA",
      ]
    )
    .not(
      "imported_normative_id",
      "is",
      null
    );


if (
  importedCountError
) {
  throw importedCountError;
}


const {
  count:
    errorRows,

  error:
    errorCountError,
} =
  await supabase
    .from(
      "legacy_social_works_staging"
    )
    .select(
      "id",
      {
        count:
          "exact",

        head:
          true,
      }
    )
    .eq(
      "batch_id",
      BATCH_ID
    )
    .in(
      "migration_action",
      [
        "CREATE",
        "MERGE",
        "EXTRA",
      ]
    )
    .not(
      "import_error",
      "is",
      null
    );


if (
  errorCountError
) {
  throw errorCountError;
}


/* =========================================================
   RESUMEN
   ========================================================= */

console.log(
  "========== RESUMEN =========="
);

console.log(
  `Grupos URL procesados:       ${groups.length}`
);

console.log(
  `Normativas nuevas:           ${createdNormatives}`
);

console.log(
  `Normativas reutilizadas SHA: ${reusedNormatives}`
);

console.log(
  `Grupos ya completos:         ${skippedCompleteGroups}`
);

console.log(
  `Errores de esta ejecución:   ${errors.length}`
);

console.log(
  `Staging con normativa:       ${
    importedRows ?? 0
  }`
);

console.log(
  `Staging con import_error:    ${
    errorRows ?? 0
  }`
);

console.log("");

console.log(
  `Manifest: ${MANIFEST_FILE}`
);

console.log(
  `Errores:  ${ERRORS_FILE}`
);

console.log("");

console.log(
  "El importador NO envía archivos a OpenAI."
);

console.log(
  "El siguiente paso es preanalizar DIRECTA/OCR y luego indexar sólo documentación aprobada."
);