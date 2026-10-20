import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";
import path from "node:path";
import crypto from "node:crypto";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

const BUCKET =
  "normativas-originales";

const OCR_VERSION =
  "gdp-ocr-v1";

if (!SUPABASE_URL) {
  throw new Error(
    "Falta SUPABASE_URL en .env.local"
  );
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error(
    "Falta SUPABASE_SECRET_KEY en .env.local"
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

const args =
  process.argv.slice(2);

function hasFlag(name) {
  return args.includes(
    `--${name}`
  );
}

function getArg(name) {
  const prefix =
    `--${name}=`;

  const value =
    args.find((arg) =>
      arg.startsWith(prefix)
    );

  return value
    ? value.slice(
        prefix.length
      )
    : null;
}

const DRY_RUN =
  hasFlag("dry-run");

const ID =
  getArg("id")
    ? Number(
        getArg("id")
      )
    : null;

const LIMIT =
  getArg("limit")
    ? Number(
        getArg("limit")
      )
    : null;

if (
  ID !== null &&
  (
    !Number.isInteger(ID) ||
    ID <= 0
  )
) {
  throw new Error(
    "--id debe ser un normative_id válido"
  );
}

if (
  LIMIT !== null &&
  (
    !Number.isInteger(LIMIT) ||
    LIMIT <= 0
  )
) {
  throw new Error(
    "--limit debe ser un entero mayor a 0"
  );
}

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function normalizeText(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /\u0000/g,
      ""
    )
    .replace(
      /\r/g,
      "\n"
    )
    .replace(
      /[ \t]+/g,
      " "
    )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

function sha256(
  buffer
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}

function sanitizeStorageSegment(
  value,
  max = 120
) {
  const cleaned =
    String(
      value ?? ""
    )
      .normalize(
        "NFD"
      )
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
        /^[.\-]+|[.\-]+$/g,
        ""
      )
      .trim();

  return (
    cleaned ||
    "sin-nombre"
  ).slice(
    0,
    max
  );
}

function buildProcessedPath(
  normative
) {
  const parentFolder =
    path.posix.dirname(
      normative
        .storage_path_original
    );

  const originalExt =
    path.extname(
      normative
        .original_filename
    );

  const originalBase =
    path.basename(
      normative
        .original_filename,
      originalExt
    );

  const safeBase =
    sanitizeStorageSegment(
      originalBase
    );

  return (
    `${parentFolder}` +
    `/processed/` +
    `${safeBase}-ocr.txt`
  );
}

// ------------------------------------------------------------
// LOAD OCR ITEMS
// ------------------------------------------------------------

async function loadPendingOcr() {
  /*
    IMPORTANTE:

    Incluimos:
    - READY_TO_PROCESS
    - PROCESSING

    Esto permite reanudar una corrida
    cancelada a mitad de camino.

    Excluimos:
    - OCR_COMPLETED

    para no reprocesar documentos ya
    terminados correctamente.
  */

  let query =
    supabase
      .from(
        "normatives"
      )
      .select(`
        id,
        title,
        original_filename,
        mime_type,
        storage_path_original,
        storage_path_processed,
        status,
        processing_recommended,
        processing_selected,
        analysis_stage,
        analysis_progress,
        analysis_details,
        error_message
      `)
      .in(
        "status",
        [
          "READY_TO_PROCESS",
          "PROCESSING",
        ]
      )
      .eq(
        "processing_selected",
        "OCR"
      )
      .neq(
        "analysis_stage",
        "OCR_COMPLETED"
      )
      .order(
        "id",
        {
          ascending: true,
        }
      );

  if (
    ID !== null
  ) {
    query =
      query.eq(
        "id",
        ID
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
    throw new Error(
      `Error leyendo normativas OCR: ${error.message}`
    );
  }

  return (
    data ?? []
  );
}

// ------------------------------------------------------------
// DOWNLOAD ORIGINAL
// ------------------------------------------------------------

async function downloadOriginal(
  normative
) {
  if (
    !normative
      .storage_path_original
  ) {
    throw new Error(
      "storage_path_original vacío"
    );
  }

  const {
    data,
    error,
  } =
    await supabase.storage
      .from(
        BUCKET
      )
      .download(
        normative
          .storage_path_original
      );

  if (error) {
    throw new Error(
      `Error descargando original: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      "Storage devolvió archivo vacío"
    );
  }

  const arrayBuffer =
    await data.arrayBuffer();

  return Buffer.from(
    arrayBuffer
  );
}

// ------------------------------------------------------------
// OCR WORKER
// ------------------------------------------------------------

let worker = null;

async function getWorker() {
  if (!worker) {
    console.log(
      "  -> Inicializando OCR español..."
    );

    worker =
      await createWorker(
        "spa"
      );
  }

  return worker;
}

// ------------------------------------------------------------
// OCR IMAGE
// ------------------------------------------------------------

async function ocrImageBuffer(
  buffer
) {
  const ocrWorker =
    await getWorker();

  const result =
    await ocrWorker
      .recognize(
        buffer
      );

  return normalizeText(
    result.data.text
  );
}

// ------------------------------------------------------------
// PDF PAGE TEXT
// ------------------------------------------------------------

async function extractPageText(
  page
) {
  const content =
    await page
      .getTextContent();

  const text =
    content.items
      .map(
        (item) =>
          item.str ||
          ""
      )
      .join(
        " "
      );

  return normalizeText(
    text
  );
}

// ------------------------------------------------------------
// RENDER PDF PAGE
// ------------------------------------------------------------

async function renderPageToPng(
  page,
  scale = 2
) {
  const viewport =
    page.getViewport({
      scale,
    });

  const canvas =
    createCanvas(
      Math.ceil(
        viewport.width
      ),
      Math.ceil(
        viewport.height
      )
    );

  const context =
    canvas.getContext(
      "2d"
    );

  await page.render({
    canvasContext:
      context,

    viewport,
  }).promise;

  return canvas.toBuffer(
    "image/png"
  );
}

// ------------------------------------------------------------
// PROCESS PDF HYBRID
// ------------------------------------------------------------

async function processPdf(
  buffer
) {
  const loadingTask =
    pdfjsLib.getDocument({
      data:
        new Uint8Array(
          buffer
        ),

      disableWorker:
        true,
    });

  const pdf =
    await loadingTask.promise;

  const sections = [];

  const details = {
    pages:
      pdf.numPages,

    native_pages:
      0,

    ocr_pages:
      0,

    page_results:
      [],
  };

  for (
    let pageNumber = 1;
    pageNumber <=
      pdf.numPages;
    pageNumber++
  ) {
    console.log(
      `    Página ${pageNumber}/${pdf.numPages}`
    );

    const page =
      await pdf.getPage(
        pageNumber
      );

    const nativeText =
      await extractPageText(
        page
      );

    let finalText = "";
    let method = "";

    /*
      Mismo criterio utilizado
      en el preanálisis:

      >= 40 caracteres:
      conservar texto nativo.

      < 40 caracteres:
      renderizar página + OCR.
    */

    if (
      nativeText.length >=
      40
    ) {
      finalText =
        nativeText;

      method =
        "DIRECT";

      details
        .native_pages++;

      console.log(
        `      DIRECT (${nativeText.length} chars)`
      );
    } else {
      console.log(
        `      OCR (texto nativo: ${nativeText.length} chars)`
      );

      const image =
        await renderPageToPng(
          page,
          2
        );

      const ocrText =
        await ocrImageBuffer(
          image
        );

      finalText =
        ocrText;

      method =
        "OCR";

      details
        .ocr_pages++;

      console.log(
        `      OCR obtenido: ${ocrText.length} chars`
      );
    }

    details
      .page_results
      .push({
        page:
          pageNumber,

        method,

        native_chars:
          nativeText.length,

        final_chars:
          finalText.length,
      });

    sections.push(
      [
        `===== PÁGINA ${pageNumber} =====`,
        "",
        finalText,
      ].join(
        "\n"
      )
    );
  }

  return {
    text:
      normalizeText(
        sections.join(
          "\n\n"
        )
      ),

    details,
  };
}

// ------------------------------------------------------------
// PROCESS IMAGE
// ------------------------------------------------------------

async function processImage(
  buffer,
  mimeType
) {
  console.log(
    "    OCR de imagen completa"
  );

  const text =
    await ocrImageBuffer(
      buffer
    );

  return {
    text,

    details: {
      mime_type:
        mimeType,

      pages:
        1,

      native_pages:
        0,

      ocr_pages:
        1,

      page_results: [
        {
          page:
            1,

          method:
            "OCR",

          native_chars:
            0,

          final_chars:
            text.length,
        },
      ],
    },
  };
}

// ------------------------------------------------------------
// PROCESS ROUTER
// ------------------------------------------------------------

async function processBuffer(
  normative,
  buffer
) {
  switch (
    normative.mime_type
  ) {
    case "application/pdf":
      return processPdf(
        buffer
      );

    case "image/jpeg":
    case "image/png":
      return processImage(
        buffer,
        normative.mime_type
      );

    default:
      throw new Error(
        `MIME OCR no soportado: ${normative.mime_type}`
      );
  }
}

// ------------------------------------------------------------
// UPLOAD PROCESSED TXT
// ------------------------------------------------------------

async function uploadProcessed({
  storagePath,
  text,
}) {
  const buffer =
    Buffer.from(
      text,
      "utf8"
    );

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
            "text/plain; charset=utf-8",

          /*
            Importante para reanudación:
            si una ejecución anterior
            alcanzó a subir el TXT antes
            de cancelarse, se reemplaza
            limpiamente.
          */
          upsert:
            true,
        }
      );

  if (error) {
    throw new Error(
      `Error subiendo procesado: ${error.message}`
    );
  }

  return {
    size:
      buffer.length,

    sha256:
      sha256(
        buffer
      ),
  };
}

// ------------------------------------------------------------
// MARK PROCESSING
// ------------------------------------------------------------

async function markProcessing(
  normative
) {
  if (DRY_RUN) {
    return;
  }

  const {
    error,
  } =
    await supabase
      .from(
        "normatives"
      )
      .update({
        status:
          "PROCESSING",

        analysis_stage:
          "OCR_PROCESSING",

        analysis_progress:
          25,

        error_message:
          null,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        normative.id
      )
      .eq(
        "processing_selected",
        "OCR"
      );

  if (error) {
    throw new Error(
      `Error marcando PROCESSING: ${error.message}`
    );
  }
}

// ------------------------------------------------------------
// SAVE OCR RESULT
// ------------------------------------------------------------

async function saveResult({
  normative,
  storagePath,
  processedMeta,
  processResult,
}) {
  if (DRY_RUN) {
    return;
  }

  /*
    Usamos los detalles que tenía
    el documento al iniciar esta
    ejecución y agregamos el bloque OCR.
  */

  const currentDetails =
    normative
      .analysis_details ??
    {};

  const completedAt =
    new Date()
      .toISOString();

  const {
    error,
  } =
    await supabase
      .from(
        "normatives"
      )
      .update({
        storage_path_processed:
          storagePath,

        /*
          OCR terminado.

          Sigue READY_TO_PROCESS
          porque el siguiente paso
          será indexación.
        */
        status:
          "READY_TO_PROCESS",

        analysis_stage:
          "OCR_COMPLETED",

        analysis_progress:
          100,

        analysis_reason:
          "OCR procesado correctamente. Documento listo para indexación.",

        error_message:
          null,

        analysis_details: {
          ...currentDetails,

          ocr: {
            version:
              OCR_VERSION,

            completed_at:
              completedAt,

            storage_path_processed:
              storagePath,

            processed_size_bytes:
              processedMeta.size,

            processed_sha256:
              processedMeta.sha256,

            extracted_chars:
              processResult
                .text
                .length,

            ...processResult
              .details,
          },
        },

        updated_at:
          completedAt,
      })
      .eq(
        "id",
        normative.id
      )
      .eq(
        "processing_selected",
        "OCR"
      );

  if (error) {
    throw new Error(
      `Error guardando resultado OCR: ${error.message}`
    );
  }
}

// ------------------------------------------------------------
// SAVE ERROR
// ------------------------------------------------------------

async function saveError(
  normative,
  message
) {
  if (DRY_RUN) {
    return;
  }

  const currentDetails =
    normative
      .analysis_details ??
    {};

  const failedAt =
    new Date()
      .toISOString();

  const {
    error,
  } =
    await supabase
      .from(
        "normatives"
      )
      .update({
        status:
          "ERROR",

        analysis_stage:
          "OCR_ERROR",

        analysis_progress:
          100,

        error_message:
          message,

        analysis_reason:
          `Error durante OCR: ${message}`,

        analysis_details: {
          ...currentDetails,

          ocr: {
            version:
              OCR_VERSION,

            failed_at:
              failedAt,

            error:
              message,
          },
        },

        updated_at:
          failedAt,
      })
      .eq(
        "id",
        normative.id
      );

  if (error) {
    console.error(
      `Error guardando fallo en normative ${normative.id}: ${error.message}`
    );
  }
}

// ------------------------------------------------------------
// PROCESS ONE
// ------------------------------------------------------------

async function processOne(
  normative
) {
  console.log(
    `[${normative.id}] ${normative.original_filename}`
  );

  console.log(
    `  Estado inicial: ${normative.status}`
  );

  console.log(
    `  Stage inicial:  ${normative.analysis_stage}`
  );

  try {
    await markProcessing(
      normative
    );

    console.log(
      "  -> Descargando original..."
    );

    const original =
      await downloadOriginal(
        normative
      );

    console.log(
      `  -> Original: ${original.length} bytes`
    );

    const processResult =
      await processBuffer(
        normative,
        original
      );

    if (
      !processResult.text ||
      processResult
        .text
        .length < 20
    ) {
      throw new Error(
        "OCR produjo texto vacío o insuficiente"
      );
    }

    const storagePath =
      buildProcessedPath(
        normative
      );

    if (DRY_RUN) {
      console.log(
        "  -> DRY RUN"
      );

      console.log(
        `  -> Chars: ${processResult.text.length}`
      );

      console.log(
        `  -> Native pages: ${processResult.details.native_pages}`
      );

      console.log(
        `  -> OCR pages: ${processResult.details.ocr_pages}`
      );

      console.log(
        `  -> Destino: ${storagePath}`
      );

      return {
        success:
          true,

        id:
          normative.id,
      };
    }

    console.log(
      "  -> Subiendo TXT procesado..."
    );

    const processedMeta =
      await uploadProcessed({
        storagePath,

        text:
          processResult.text,
      });

    console.log(
      "  -> Guardando resultado..."
    );

    await saveResult({
      normative,
      storagePath,
      processedMeta,
      processResult,
    });

    console.log(
      "  -> OK"
    );

    console.log(
      `  -> Chars: ${processResult.text.length}`
    );

    console.log(
      `  -> Native pages: ${processResult.details.native_pages}`
    );

    console.log(
      `  -> OCR pages: ${processResult.details.ocr_pages}`
    );

    console.log(
      `  -> ${storagePath}`
    );

    return {
      success:
        true,

      id:
        normative.id,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(
            error
          );

    console.error(
      `  -> ERROR: ${message}`
    );

    await saveError(
      normative,
      message
    );

    return {
      success:
        false,

      id:
        normative.id,

      error:
        message,
    };
  }
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

async function main() {
  console.log("");

  console.log(
    "========== GDP OCR PROCESSOR =========="
  );

  console.log(
    `Bucket:   ${BUCKET}`
  );

  console.log(
    `Dry run:  ${
      DRY_RUN
        ? "Sí"
        : "No"
    }`
  );

  if (
    ID !== null
  ) {
    console.log(
      `ID:       ${ID}`
    );
  }

  if (
    LIMIT !== null
  ) {
    console.log(
      `Limit:    ${LIMIT}`
    );
  }

  console.log("");

  const normatives =
    await loadPendingOcr();

  console.log(
    `Documentos OCR a procesar: ${normatives.length}`
  );

  if (
    normatives.length === 0
  ) {
    console.log(
      "No hay documentos OCR pendientes."
    );

    return;
  }

  console.log("");

  /*
    Mostrar qué vamos a procesar
    antes de empezar.
  */

  for (
    const normative
    of normatives
  ) {
    console.log(
      `  ${normative.id} | ${normative.status} | ${normative.analysis_stage} | ${normative.original_filename}`
    );
  }

  console.log("");

  let ok = 0;
  let errors = 0;

  for (
    const normative
    of normatives
  ) {
    const result =
      await processOne(
        normative
      );

    if (
      result.success
    ) {
      ok++;
    } else {
      errors++;
    }

    console.log("");
  }

  if (worker) {
    await worker
      .terminate();

    worker = null;
  }

  console.log(
    "========== RESUMEN =========="
  );

  console.log(
    `Procesados:      ${normatives.length}`
  );

  console.log(
    `Correctos:       ${ok}`
  );

  console.log(
    `Errores:         ${errors}`
  );

  console.log("");

  if (DRY_RUN) {
    console.log(
      "DRY RUN: no se modificó Storage ni la base."
    );
  } else {
    console.log(
      "No se envió ningún archivo a OpenAI."
    );
  }
}

// ------------------------------------------------------------
// CLEAN EXIT
// ------------------------------------------------------------

async function shutdown() {
  if (worker) {
    try {
      await worker
        .terminate();
    } catch {
      // Ignorar error al cerrar worker.
    }

    worker = null;
  }
}

/*
  Ctrl+C:

  Intentamos cerrar Tesseract correctamente.

  El documento que haya quedado PROCESSING
  podrá retomarse en la siguiente ejecución.
*/

process.on(
  "SIGINT",
  async () => {
    console.log("");
    console.log(
      "Proceso cancelado por usuario."
    );

    console.log(
      "Los documentos incompletos podrán reanudarse en la próxima ejecución."
    );

    await shutdown();

    process.exit(
      130
    );
  }
);

process.on(
  "SIGTERM",
  async () => {
    await shutdown();

    process.exit(
      143
    );
  }
);

// ------------------------------------------------------------
// RUN
// ------------------------------------------------------------

main().catch(
  async (error) => {
    await shutdown();

    console.error("");

    console.error(
      "ERROR FATAL:"
    );

    console.error(
      error instanceof Error
        ? error.message
        : error
    );

    process.exit(
      1
    );
  }
);
