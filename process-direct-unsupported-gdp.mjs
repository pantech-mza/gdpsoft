import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";
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

const CONVERTER_VERSION =
  "gdp-direct-converter-v1";

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
// MIME NO SOPORTADOS DIRECTAMENTE POR FILE SEARCH
// ------------------------------------------------------------

const UNSUPPORTED_MIMES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
];

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
    ? value.slice(prefix.length)
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
    `${safeBase}-converted.txt`
  );
}

function decodeXmlEntities(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&apos;/g,
      "'"
    );
}

function stripXml(
  value
) {
  const xml =
    String(
      value ?? ""
    );

  const prepared =
    xml
      .replace(
        /<text:tab[^>]*\/>/gi,
        "\t"
      )
      .replace(
        /<text:line-break[^>]*\/>/gi,
        "\n"
      )
      .replace(
        /<\/text:p>/gi,
        "\n"
      )
      .replace(
        /<\/table:table-row>/gi,
        "\n"
      )
      .replace(
        /<\/table:table-cell>/gi,
        "\t"
      )
      .replace(
        /<[^>]+>/g,
        " "
      );

  return normalizeText(
    decodeXmlEntities(
      prepared
    )
  );
}

// ------------------------------------------------------------
// LOAD DOCUMENTS
// ------------------------------------------------------------

async function loadDocuments() {
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
        processing_recommended,
        processing_selected,
        status,
        analysis_stage,
        analysis_progress,
        analysis_details,
        openai_file_id,
        openai_vector_store_file_id,
        openai_vector_store_id,
        openai_status,
        error_message
      `)
      .eq(
        "status",
        "READY_TO_PROCESS"
      )
      .eq(
        "processing_selected",
        "DIRECT"
      )
      .in(
        "mime_type",
        UNSUPPORTED_MIMES
      )
      .neq(
        "analysis_stage",
        "CONVERTED"
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
      `Error leyendo normativas: ${error.message}`
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

  return Buffer.from(
    await data.arrayBuffer()
  );
}

// ------------------------------------------------------------
// DOCX
// ------------------------------------------------------------

async function convertDocx(
  buffer
) {
  const result =
    await mammoth
      .extractRawText({
        buffer,
      });

  const text =
    normalizeText(
      result.value
    );

  return {
    text,

    details: {
      format:
        "DOCX",

      extracted_chars:
        text.length,

      extraction_messages:
        result.messages
          ?.length ?? 0,
    },
  };
}

// ------------------------------------------------------------
// XLSX
// ------------------------------------------------------------

async function convertXlsx(
  buffer
) {
  const workbook =
    XLSX.read(
      buffer,
      {
        type:
          "buffer",
      }
    );

  const sections = [];

  const sheets = [];

  for (
    const sheetName
    of workbook.SheetNames
  ) {
    const sheet =
      workbook.Sheets[
        sheetName
      ];

    /*
      CSV es útil porque mantiene
      filas y columnas de forma simple
      para File Search.
    */

    const csv =
      XLSX.utils
        .sheet_to_csv(
          sheet,
          {
            blankrows:
              false,
          }
        );

    const text =
      normalizeText(
        csv
      );

    sheets.push({
      name:
        sheetName,

      extracted_chars:
        text.length,
    });

    sections.push(
      [
        `===== HOJA: ${sheetName} =====`,
        "",
        text,
      ].join(
        "\n"
      )
    );
  }

  const finalText =
    normalizeText(
      sections.join(
        "\n\n"
      )
    );

  return {
    text:
      finalText,

    details: {
      format:
        "XLSX",

      sheet_count:
        workbook
          .SheetNames
          .length,

      extracted_chars:
        finalText.length,

      sheets,
    },
  };
}

// ------------------------------------------------------------
// ODT
// ------------------------------------------------------------

async function convertOdt(
  buffer
) {
  const zip =
    new AdmZip(
      buffer
    );

  const entry =
    zip.getEntry(
      "content.xml"
    );

  if (!entry) {
    throw new Error(
      "ODT sin content.xml"
    );
  }

  const xml =
    entry
      .getData()
      .toString(
        "utf8"
      );

  const text =
    stripXml(
      xml
    );

  return {
    text,

    details: {
      format:
        "ODT",

      extracted_chars:
        text.length,
    },
  };
}

// ------------------------------------------------------------
// ROUTER
// ------------------------------------------------------------

async function convertBuffer(
  normative,
  buffer
) {
  switch (
    normative.mime_type
  ) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return convertDocx(
        buffer
      );

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return convertXlsx(
        buffer
      );

    case "application/vnd.oasis.opendocument.text":
      return convertOdt(
        buffer
      );

    default:
      throw new Error(
        `MIME no soportado por convertidor: ${normative.mime_type}`
      );
  }
}

// ------------------------------------------------------------
// UPLOAD TXT
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
            Permite reanudar si una
            ejecución fue cancelada
            después de subir el TXT.
          */
          upsert:
            true,
        }
      );

  if (error) {
    throw new Error(
      `Error subiendo convertido: ${error.message}`
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
// SAVE RESULT
// ------------------------------------------------------------

async function saveResult({
  normative,
  storagePath,
  processedMeta,
  conversion,
}) {
  if (DRY_RUN) {
    return;
  }

  const now =
    new Date()
      .toISOString();

  const currentDetails =
    normative
      .analysis_details ??
    {};

  /*
    Conservamos referencia al archivo
    OpenAI fallido para auditoría.

    No lo borramos automáticamente de
    OpenAI porque preferimos no hacer
    eliminaciones externas silenciosas.
  */

  const previousOpenAI = {
    file_id:
      normative
        .openai_file_id ??
      null,

    vector_store_file_id:
      normative
        .openai_vector_store_file_id ??
      null,

    vector_store_id:
      normative
        .openai_vector_store_id ??
      null,

    status:
      normative
        .openai_status ??
      null,

    error:
      normative
        .error_message ??
      null,
  };

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
          Sigue siendo DIRECT desde
          el punto de vista del origen:
          no necesitó OCR.

          Sólo convertimos el formato
          para hacerlo compatible con
          File Search.
        */
        processing_selected:
          "DIRECT",

        status:
          "READY_TO_PROCESS",

        analysis_stage:
          "CONVERTED",

        analysis_progress:
          100,

        analysis_reason:
          "Documento convertido a TXT para compatibilidad con OpenAI File Search.",

        /*
          IMPORTANTE:
          los IDs anteriores corresponden
          al archivo original rechazado.

          Los limpiamos para que el
          indexador cree un nuevo OpenAI
          File usando el TXT convertido.
        */
        openai_file_id:
          null,

        openai_vector_store_file_id:
          null,

        openai_status:
          null,

        error_message:
          null,

        analysis_details: {
          ...currentDetails,

          conversion: {
            version:
              CONVERTER_VERSION,

            completed_at:
              now,

            reason:
              "Formato original no soportado directamente por OpenAI File Search.",

            original_mime_type:
              normative
                .mime_type,

            original_filename:
              normative
                .original_filename,

            storage_path_processed:
              storagePath,

            processed_size_bytes:
              processedMeta
                .size,

            processed_sha256:
              processedMeta
                .sha256,

            extracted_chars:
              conversion
                .text
                .length,

            conversion_details:
              conversion
                .details,

            previous_openai:
              previousOpenAI,
          },
        },

        updated_at:
          now,
      })
      .eq(
        "id",
        normative.id
      );

  if (error) {
    throw new Error(
      `Error guardando conversión: ${error.message}`
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

  const now =
    new Date()
      .toISOString();

  const currentDetails =
    normative
      .analysis_details ??
    {};

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
          "CONVERSION_ERROR",

        analysis_progress:
          100,

        error_message:
          message,

        analysis_reason:
          `Error convirtiendo documento: ${message}`,

        analysis_details: {
          ...currentDetails,

          conversion_error: {
            version:
              CONVERTER_VERSION,

            failed_at:
              now,

            error:
              message,
          },
        },

        updated_at:
          now,
      })
      .eq(
        "id",
        normative.id
      );

  if (error) {
    console.error(
      `Error guardando fallo ${normative.id}: ${error.message}`
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
    `[${normative.id}] ${normative.title}`
  );

  console.log(
    `  Archivo: ${normative.original_filename}`
  );

  console.log(
    `  MIME:    ${normative.mime_type}`
  );

  try {
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

    const conversion =
      await convertBuffer(
        normative,
        original
      );

    if (
      !conversion.text ||
      conversion
        .text
        .length < 20
    ) {
      throw new Error(
        "La conversión produjo texto vacío o insuficiente"
      );
    }

    const storagePath =
      buildProcessedPath(
        normative
      );

    console.log(
      `  -> Texto extraído: ${conversion.text.length} caracteres`
    );

    console.log(
      `  -> Destino: ${storagePath}`
    );

    if (DRY_RUN) {
      console.log(
        "  -> DRY RUN: no se modifica Storage ni Supabase"
      );

      return {
        success:
          true,
      };
    }

    console.log(
      "  -> Subiendo TXT..."
    );

    const processedMeta =
      await uploadProcessed({
        storagePath,

        text:
          conversion.text,
      });

    console.log(
      "  -> Actualizando Supabase..."
    );

    await saveResult({
      normative,
      storagePath,
      processedMeta,
      conversion,
    });

    console.log(
      "  -> CONVERTED"
    );

    return {
      success:
        true,
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
    "========== GDP DIRECT FORMAT CONVERTER =========="
  );

  console.log(
    `Bucket:  ${BUCKET}`
  );

  console.log(
    `Dry run: ${
      DRY_RUN
        ? "Sí"
        : "No"
    }`
  );

  if (
    ID !== null
  ) {
    console.log(
      `ID:      ${ID}`
    );
  }

  if (
    LIMIT !== null
  ) {
    console.log(
      `Limit:   ${LIMIT}`
    );
  }

  console.log("");

  const documents =
    await loadDocuments();

  console.log(
    `Documentos a convertir: ${documents.length}`
  );

  if (
    documents.length === 0
  ) {
    console.log(
      "No hay documentos pendientes de conversión."
    );

    return;
  }

  console.log("");

  let ok = 0;
  let errors = 0;

  for (
    const normative
    of documents
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

  console.log(
    "========== RESUMEN =========="
  );

  console.log(
    `Procesados: ${documents.length}`
  );

  console.log(
    `Correctos:  ${ok}`
  );

  console.log(
    `Errores:    ${errors}`
  );

  console.log("");

  if (DRY_RUN) {
    console.log(
      "DRY RUN: no se modificó Storage ni Supabase."
    );
  } else {
    console.log(
      "No se envió ningún archivo a OpenAI."
    );
  }
}

main().catch(
  (error) => {
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