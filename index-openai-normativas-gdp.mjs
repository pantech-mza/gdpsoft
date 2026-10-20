import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import path from "node:path";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY;

const VECTOR_STORE_ID =
  "vs_6aac0d4a273881919e002d606e691d01";

const BUCKET =
  "normativas-originales";

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

if (!OPENAI_API_KEY) {
  throw new Error(
    "Falta OPENAI_API_KEY en .env.local"
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

const openai =
  new OpenAI({
    apiKey:
      OPENAI_API_KEY,
  });

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
    "--id debe ser válido"
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
    "--limit debe ser mayor a 0"
  );
}

// ------------------------------------------------------------
// LOAD DOCUMENTS
// ------------------------------------------------------------

async function loadDocuments() {
  let query =
    supabase
      .from("normatives")
      .select(`
        id,
        title,
        original_filename,
        mime_type,
        storage_path_original,
        storage_path_processed,
        processing_selected,
        status,
        analysis_stage,
        openai_file_id,
        openai_vector_store_file_id,
        openai_vector_store_id,
        openai_status,
        error_message
      `)
      .in(
        "status",
        [
          "READY_TO_PROCESS",
          "PROCESSING",
        ]
      )
      .in(
        "processing_selected",
        [
          "DIRECT",
          "OCR",
        ]
      )
      .order(
        "id",
        {
          ascending: true,
        }
      );

  if (ID !== null) {
    query =
      query.eq(
        "id",
        ID
      );
  }

  if (LIMIT !== null) {
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

  return data ?? [];
}

// ------------------------------------------------------------
// SELECT SOURCE FILE
// ------------------------------------------------------------

function getSourcePath(
  normative
) {
  // ----------------------------------------------------------
  // OCR
  // ----------------------------------------------------------

  if (
    normative.processing_selected ===
    "OCR"
  ) {
    if (
      normative.analysis_stage !==
      "OCR_COMPLETED"
    ) {
      throw new Error(
        "Documento OCR aún no está OCR_COMPLETED"
      );
    }

    if (
      !normative.storage_path_processed
    ) {
      throw new Error(
        "OCR sin storage_path_processed"
      );
    }

    const base =
      path.basename(
        normative.original_filename,
        path.extname(
          normative.original_filename
        )
      );

    return {
      storagePath:
        normative.storage_path_processed,

      filename:
        `${base}-ocr.txt`,

      mimeType:
        "text/plain",
    };
  }

  // ----------------------------------------------------------
  // DIRECT CONVERTIDO
  // XLSX / DOCX / ODT -> TXT
  // ----------------------------------------------------------

  if (
    normative.processing_selected ===
      "DIRECT" &&
    normative.storage_path_processed
  ) {
    const originalExtension =
      path.extname(
        normative.original_filename
      )
        .toLowerCase();

    const requiresConvertedFile =
      [
        ".xlsx",
        ".docx",
        ".odt",
      ].includes(
        originalExtension
      );

    if (
      requiresConvertedFile
    ) {
      const base =
        path.basename(
          normative.original_filename,
          path.extname(
            normative.original_filename
          )
        );

      return {
        storagePath:
          normative.storage_path_processed,

        filename:
          `${base}-converted.txt`,

        mimeType:
          "text/plain",
      };
    }
  }

  // ----------------------------------------------------------
  // DIRECT NORMAL
  // ----------------------------------------------------------

  if (
    !normative.storage_path_original
  ) {
    throw new Error(
      "DIRECT sin storage_path_original"
    );
  }

  return {
    storagePath:
      normative.storage_path_original,

    filename:
      normative.original_filename,

    mimeType:
      normative.mime_type ||
      "application/octet-stream",
  };
}

// ------------------------------------------------------------
// DOWNLOAD FROM SUPABASE
// ------------------------------------------------------------

async function downloadFile(
  storagePath
) {
  const {
    data,
    error,
  } =
    await supabase.storage
      .from(BUCKET)
      .download(
        storagePath
      );

  if (error) {
    throw new Error(
      `Storage download: ${error.message}`
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
// DB HELPERS
// ------------------------------------------------------------

async function updateNormative(
  id,
  values
) {
  if (DRY_RUN) {
    return;
  }

  const {
    error,
  } =
    await supabase
      .from("normatives")
      .update({
        ...values,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        id
      );

  if (error) {
    throw new Error(
      `DB update: ${error.message}`
    );
  }
}

// ------------------------------------------------------------
// CHECK EXISTING VECTOR STORE ATTACHMENT
// ------------------------------------------------------------

async function getExistingVectorFile(
  openaiFileId
) {
  if (!openaiFileId) {
    return null;
  }

  try {
    return await openai
      .vectorStores
      .files
      .retrieve(
        openaiFileId,
        {
          vector_store_id:
            VECTOR_STORE_ID,
        }
      );
  } catch (error) {
    if (
      error?.status === 404
    ) {
      return null;
    }

    throw error;
  }
}

// ------------------------------------------------------------
// UPLOAD OPENAI FILE
// ------------------------------------------------------------

async function ensureOpenAIFile(
  normative,
  source,
  buffer
) {
  /*
    Si ya guardamos openai_file_id,
    reutilizamos ese archivo.
  */

  if (
    normative
      .openai_file_id
  ) {
    console.log(
      `  -> OpenAI file existente: ${normative.openai_file_id}`
    );

    return normative
      .openai_file_id;
  }

  const file =
    await toFile(
      buffer,
      source.filename,
      {
        type:
          source.mimeType,
      }
    );

  const uploaded =
    await openai.files.create({
      file,
      purpose:
        "assistants",
    });

  /*
    Guardamos inmediatamente el file_id.
    Así, si la corrida se corta después,
    no volvemos a subir el archivo.
  */

  await updateNormative(
    normative.id,
    {
      openai_file_id:
        uploaded.id,

      openai_vector_store_id:
        VECTOR_STORE_ID,

      openai_status:
        "uploaded",

      status:
        "PROCESSING",

      analysis_stage:
        "OPENAI_UPLOADED",

      analysis_progress:
        50,

      error_message:
        null,
    }
  );

  normative.openai_file_id =
    uploaded.id;

  console.log(
    `  -> OpenAI file creado: ${uploaded.id}`
  );

  return uploaded.id;
}

// ------------------------------------------------------------
// ATTACH TO VECTOR STORE
// ------------------------------------------------------------

async function ensureVectorStoreFile(
  normative,
  openaiFileId
) {
  /*
    Primero verificamos si el archivo
    ya está anexado al Vector Store.
  */

  const existing =
    await getExistingVectorFile(
      openaiFileId
    );

  if (existing) {
    console.log(
      `  -> Ya existe en Vector Store: ${existing.status}`
    );

    if (
      existing.status ===
      "completed"
    ) {
      return existing;
    }

    if (
      existing.status ===
      "in_progress"
    ) {
      return await openai
        .vectorStores
        .files
        .poll(
          VECTOR_STORE_ID,
          openaiFileId,
          {
            pollIntervalMs:
              1000,
          }
        );
    }

    if (
      existing.status ===
        "failed" ||
      existing.status ===
        "cancelled"
    ) {
      throw new Error(
        existing.last_error
          ?.message ||
        `Vector Store status: ${existing.status}`
      );
    }
  }

  /*
    No estaba anexado:
    anexar y esperar.
  */

  console.log(
    "  -> Adjuntando al Vector Store..."
  );

  const vectorFile =
    await openai
      .vectorStores
      .files
      .createAndPoll(
        VECTOR_STORE_ID,
        {
          file_id:
            openaiFileId,
        },
        {
          pollIntervalMs:
            1000,
        }
      );

  return vectorFile;
}

// ------------------------------------------------------------
// COMPLETE
// ------------------------------------------------------------

async function markCompleted(
  normative,
  vectorFile
) {
  if (
    vectorFile.status !==
    "completed"
  ) {
    throw new Error(
      vectorFile.last_error
        ?.message ||
      `OpenAI terminó con status ${vectorFile.status}`
    );
  }

  await updateNormative(
    normative.id,
    {
      openai_file_id:
        vectorFile.id,

      openai_vector_store_file_id:
        vectorFile.id,

      openai_vector_store_id:
        VECTOR_STORE_ID,

      openai_status:
        "completed",

      status:
        "INDEXED",

      analysis_stage:
        "COMPLETED",

      analysis_progress:
        100,

      error_message:
        null,
    }
  );
}

// ------------------------------------------------------------
// ERROR
// ------------------------------------------------------------

async function markError(
  normative,
  message
) {
  if (DRY_RUN) {
    return;
  }

  await updateNormative(
    normative.id,
    {
      /*
        Lo dejamos recuperable.
        No borramos ningún file_id ya obtenido.
      */

      status:
        "READY_TO_PROCESS",

    analysis_stage:
  normative.processing_selected ===
  "OCR"
    ? "OCR_COMPLETED"
    : normative.storage_path_processed
      ? "CONVERTED"
      : "APPROVED",

      analysis_progress:
        100,

      openai_status:
        "failed",

      error_message:
        message,
    }
  );
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

  try {
    const source =
      getSourcePath(
        normative
      );

    console.log(
      `  Método: ${normative.processing_selected}`
    );

    console.log(
      `  Storage: ${source.storagePath}`
    );

    /*
      Si ya figura completamente indexado,
      no debería haber entrado por status,
      pero agregamos protección.
    */

    if (
      normative.openai_status ===
        "completed" &&
      normative.openai_file_id
    ) {
      console.log(
        "  -> Ya completado. Saltando."
      );

      return {
        success: true,
        skipped: true,
      };
    }

    if (DRY_RUN) {
      console.log(
        "  -> DRY RUN: sería indexado"
      );

      return {
        success: true,
        skipped: false,
      };
    }

    /*
      Sólo descargamos bytes si todavía
      necesitamos crear el OpenAI File.
    */

    let buffer = null;

    if (
      !normative
        .openai_file_id
    ) {
      console.log(
        "  -> Descargando desde Supabase..."
      );

      buffer =
        await downloadFile(
          source.storagePath
        );

      console.log(
        `  -> ${buffer.length} bytes`
      );
    }

    const openaiFileId =
      await ensureOpenAIFile(
        normative,
        source,
        buffer
      );

    const vectorFile =
      await ensureVectorStoreFile(
        normative,
        openaiFileId
      );

    if (
      vectorFile.status !==
      "completed"
    ) {
      throw new Error(
        vectorFile.last_error
          ?.message ||
        `Vector Store terminó: ${vectorFile.status}`
      );
    }

    await markCompleted(
      normative,
      vectorFile
    );

    console.log(
      `  -> INDEXED`
    );

    console.log(
      `  -> file_id: ${vectorFile.id}`
    );

    return {
      success: true,
      skipped: false,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `  -> ERROR: ${message}`
    );

    await markError(
      normative,
      message
    );

    return {
      success: false,
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
    "========== GDP OPENAI INDEXER =========="
  );

  console.log(
    `Vector Store: ${VECTOR_STORE_ID}`
  );

  console.log(
    `Dry run:      ${
      DRY_RUN
        ? "Sí"
        : "No"
    }`
  );

  if (ID !== null) {
    console.log(
      `ID:           ${ID}`
    );
  }

  if (LIMIT !== null) {
    console.log(
      `Limit:        ${LIMIT}`
    );
  }

  console.log("");

  const documents =
    await loadDocuments();

  console.log(
    `Documentos a indexar: ${documents.length}`
  );

  if (
    documents.length === 0
  ) {
    console.log(
      "No hay documentos pendientes."
    );

    return;
  }

  console.log("");

  let ok = 0;
  let errors = 0;
  let skipped = 0;

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

      if (
        result.skipped
      ) {
        skipped++;
      }
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
    `Saltados:   ${skipped}`
  );

  console.log(
    `Errores:    ${errors}`
  );

  console.log("");

  if (DRY_RUN) {
    console.log(
      "DRY RUN: no se modificó OpenAI ni Supabase."
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

    process.exit(1);
  }
);