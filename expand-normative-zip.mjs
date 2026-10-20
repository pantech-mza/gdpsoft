import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import AdmZip from "adm-zip";
import crypto from "node:crypto";
import path from "node:path";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const BUCKET = "normativas-originales";

if (!SUPABASE_URL) {
  throw new Error("Falta SUPABASE_URL en .env.local");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("Falta SUPABASE_SECRET_KEY en .env.local");
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

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function getArg(name) {
  const prefix = `--${name}=`;

  const value = args.find((arg) =>
    arg.startsWith(prefix)
  );

  return value
    ? value.slice(prefix.length)
    : null;
}

const DRY_RUN = hasFlag("dry-run");

const ID = getArg("id")
  ? Number(getArg("id"))
  : null;

if (!ID || !Number.isInteger(ID)) {
  throw new Error(
    "Debés indicar --id=<normative_id>"
  );
}

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function sha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function sanitizeStorageSegment(
  value,
  max = 120
) {
  const cleaned = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "")
    .trim();

  return (
    cleaned || "sin-nombre"
  ).slice(0, max);
}

function sanitizeStorageFilename(filename) {
  const original = String(
    filename ?? "documento.bin"
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

  return `${safeBase}${ext || ".bin"}`;
}

function inferMime(filename) {
  const ext =
    path.extname(filename)
      .toLowerCase();

  switch (ext) {
    case ".doc":
      return "application/msword";

    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    case ".pdf":
      return "application/pdf";

    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    case ".xls":
      return "application/vnd.ms-excel";

    case ".odt":
      return "application/vnd.oasis.opendocument.text";

    case ".jpg":
    case ".jpeg":
      return "image/jpeg";

    case ".png":
      return "image/png";

    default:
      return "application/octet-stream";
  }
}

function titleFromFilename(filename) {
  const ext =
    path.extname(filename);

  return path
    .basename(
      filename,
      ext
    )
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------
// LOAD PARENT
// ------------------------------------------------------------

async function loadParent() {
  const {
    data,
    error,
  } = await supabase
    .from("normatives")
    .select(`
      id,
      title,
      original_filename,
      mime_type,
      storage_path_original,
      source_url,
      source_system,
      source_modified_at,
      source_metadata,
      version,
      effective_from,
      effective_to,
      is_current,
      document_kind,
      status,
      analysis_stage,
      analysis_details
    `)
    .eq("id", ID)
    .single();

  if (error) {
    throw new Error(
      `No se pudo cargar normative ${ID}: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `No existe normative ${ID}`
    );
  }

  if (
    data.mime_type !==
    "application/zip"
  ) {
    throw new Error(
      `La normativa ${ID} no es ZIP`
    );
  }

  return data;
}

// ------------------------------------------------------------
// LOAD RELATIONS
// ------------------------------------------------------------

async function loadRelations() {
  const {
    data,
    error,
  } = await supabase
    .from(
      "normative_social_works"
    )
    .select(`
      id,
      social_work_id,
      billing_channel_id,
      document_role,
      scope_id,
      is_primary,
      notes
    `)
    .eq(
      "normative_id",
      ID
    )
    .order(
      "id",
      {
        ascending: true,
      }
    );

  if (error) {
    throw new Error(
      `No se pudieron cargar relaciones: ${error.message}`
    );
  }

  return data ?? [];
}

// ------------------------------------------------------------
// DOWNLOAD ZIP
// ------------------------------------------------------------

async function downloadParentZip(parent) {
  const {
    data,
    error,
  } = await supabase.storage
    .from(BUCKET)
    .download(
      parent.storage_path_original
    );

  if (error) {
    throw new Error(
      `Error descargando ZIP: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      "Storage devolvió ZIP vacío"
    );
  }

  return Buffer.from(
    await data.arrayBuffer()
  );
}

// ------------------------------------------------------------
// FIND BY SHA
// ------------------------------------------------------------

async function findNormativeBySha(hash) {
  const {
    data,
    error,
  } = await supabase
    .from("normatives")
    .select(`
      id,
      title,
      original_filename,
      sha256,
      storage_path_original
    `)
    .eq(
      "sha256",
      hash
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Error buscando SHA ${hash}: ${error.message}`
    );
  }

  return data;
}

// ------------------------------------------------------------
// BUILD CHILD STORAGE PATH
// ------------------------------------------------------------

function buildChildStoragePath({
  parent,
  filename,
  hash,
}) {
  const parentFolder =
    path.posix.dirname(
      parent.storage_path_original
    );

  const safeFilename =
    sanitizeStorageFilename(
      filename
    );

  return `${parentFolder}/expanded/${hash}/${safeFilename}`;
}

// ------------------------------------------------------------
// CREATE CHILD
// ------------------------------------------------------------

async function createChild({
  parent,
  filename,
  buffer,
  hash,
  storagePath,
}) {
  const mimeType =
    inferMime(filename);

  const parentBaseTitle =
    parent.title.replace(
      /\s*-\s*Norma de atención$/i,
      ""
    );

  const title =
    `${parentBaseTitle} - ${titleFromFilename(
      filename
    )}`;

  const insertData = {
    title,

    original_filename:
      filename,

    mime_type:
      mimeType,

    file_size_bytes:
      buffer.length,

    storage_path_original:
      storagePath,

    storage_path_processed:
      null,

    sha256:
      hash,

    processing_recommended:
      null,

    processing_selected:
      null,

    analysis_confidence:
      null,

    analysis_reason:
      null,

    analyzed_at:
      null,

    status:
      "PENDING_ANALYSIS",

    version:
      1,

    effective_from:
      null,

    effective_to:
      null,

    is_current:
      true,

    openai_file_id:
      null,

    openai_vector_store_file_id:
      null,

    openai_vector_store_id:
      null,

    openai_status:
      null,

    error_message:
      null,

    source_url:
      parent.source_url,

    source_system:
      parent.source_system,

    source_modified_at:
      parent.source_modified_at,

    source_metadata: {
      ...(parent.source_metadata ?? {}),

      expanded_from_zip:
        true,

      parent_normative_id:
        parent.id,

      parent_filename:
        parent.original_filename,

      zip_entry:
        filename,
    },

    document_kind:
      parent.document_kind,

    supersedes_normative_id:
      null,

    change_summary:
      null,

    approved_by:
      null,

    approved_at:
      null,

    analysis_stage:
      "PENDING",

    analysis_progress:
      0,

    analysis_details: {
      expanded_from_zip:
        true,

      parent_normative_id:
        parent.id,

      parent_filename:
        parent.original_filename,

      zip_entry:
        filename,
    },
  };

  const {
    data,
    error,
  } = await supabase
    .from("normatives")
    .insert(insertData)
    .select(`
      id,
      title,
      original_filename
    `)
    .single();

  if (error) {
    throw new Error(
      `Error creando normativa hija ${filename}: ${error.message}`
    );
  }

  return data;
}

// ------------------------------------------------------------
// UPLOAD CHILD
// ------------------------------------------------------------

async function uploadChild({
  storagePath,
  buffer,
  mimeType,
}) {
  const {
    error,
  } = await supabase.storage
    .from(BUCKET)
    .upload(
      storagePath,
      buffer,
      {
        contentType:
          mimeType,

        upsert:
          false,
      }
    );

  if (error) {
    throw new Error(
      `Error subiendo ${storagePath}: ${error.message}`
    );
  }
}

// ------------------------------------------------------------
// ENSURE RELATION
// ------------------------------------------------------------

async function ensureRelation({
  normativeId,
  relation,
}) {
  let query =
    supabase
      .from(
        "normative_social_works"
      )
      .select("id")
      .eq(
        "normative_id",
        normativeId
      )
      .eq(
        "social_work_id",
        relation.social_work_id
      )
      .eq(
        "document_role",
        relation.document_role
      );

  if (
    relation.billing_channel_id ===
    null
  ) {
    query =
      query.is(
        "billing_channel_id",
        null
      );
  } else {
    query =
      query.eq(
        "billing_channel_id",
        relation.billing_channel_id
      );
  }

  if (
    relation.scope_id ===
    null
  ) {
    query =
      query.is(
        "scope_id",
        null
      );
  } else {
    query =
      query.eq(
        "scope_id",
        relation.scope_id
      );
  }

  const {
    data: existing,
    error: existingError,
  } = await query.maybeSingle();

  if (existingError) {
    throw new Error(
      `Error verificando relación: ${existingError.message}`
    );
  }

  if (existing) {
    return {
      created: false,
      id:
        existing.id,
    };
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "normative_social_works"
    )
    .insert({
      normative_id:
        normativeId,

      social_work_id:
        relation.social_work_id,

      billing_channel_id:
        relation.billing_channel_id,

      document_role:
        relation.document_role,

      scope_id:
        relation.scope_id,

      is_primary:
        relation.is_primary,

      notes:
        relation.notes,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `Error creando relación: ${error.message}`
    );
  }

  return {
    created: true,
    id:
      data.id,
  };
}

// ------------------------------------------------------------
// UPDATE PARENT METADATA
// ------------------------------------------------------------

async function updateParent({
  entries,
  childIds,
}) {
  const now =
    new Date()
      .toISOString();

  const details = {
    expanded_zip: {
      expanded:
        true,

      expanded_at:
        now,

      child_count:
        childIds.length,

      child_normative_ids:
        childIds,

      entries:
        entries.map(
          (entry) =>
            entry.entryName
        ),
    },
  };

  const {
    data: current,
    error: loadError,
  } = await supabase
    .from("normatives")
    .select(
      "analysis_details"
    )
    .eq(
      "id",
      ID
    )
    .single();

  if (loadError) {
    throw new Error(
      `Error leyendo analysis_details del ZIP: ${loadError.message}`
    );
  }

  const {
    error,
  } = await supabase
    .from("normatives")
    .update({
      /*
       * El ZIP queda solamente como contenedor histórico.
       * Sus documentos hijos son las normativas procesables.
       */
      status:
        "ARCHIVED",

      processing_recommended:
        null,

      processing_selected:
        null,

      analysis_stage:
        "COMPLETED",

      analysis_progress:
        100,

      analysis_reason:
        `ZIP expandido correctamente en ${childIds.length} documentos individuales. El contenedor original se conserva archivado.`,

      analyzed_at:
        now,

      analysis_details: {
        ...(current?.analysis_details ?? {}),
        ...details,
      },
    })
    .eq(
      "id",
      ID
    );

  if (error) {
    throw new Error(
      `Error actualizando ZIP padre: ${error.message}`
    );
  }
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

async function main() {
  console.log("");

  console.log(
    "========== GDP ZIP EXPANDER =========="
  );

  console.log(
    `Normative ID: ${ID}`
  );

  console.log(
    `Dry run:      ${
      DRY_RUN
        ? "Sí"
        : "No"
    }`
  );

  console.log("");

  const parent =
    await loadParent();

  console.log(
    `Normativa: ${parent.title}`
  );

  console.log(
    `Archivo:   ${parent.original_filename}`
  );

  console.log(
    `Estado:    ${parent.status}`
  );

  console.log(
    `Stage:     ${parent.analysis_stage}`
  );

  const relations =
    await loadRelations();

  console.log(
    `Relaciones heredables: ${relations.length}`
  );

  if (
    relations.length === 0
  ) {
    throw new Error(
      "El ZIP no tiene relaciones en normative_social_works"
    );
  }

  const zipBuffer =
    await downloadParentZip(
      parent
    );

  const zip =
    new AdmZip(
      zipBuffer
    );

  const entries =
    zip
      .getEntries()
      .filter(
        (entry) =>
          !entry.isDirectory
      );

  console.log(
    `Archivos dentro del ZIP: ${entries.length}`
  );

  if (
    entries.length === 0
  ) {
    throw new Error(
      "El ZIP no contiene archivos"
    );
  }

  console.log("");

  let created = 0;
  let reused = 0;
  let uploaded = 0;
  let relationsCreated = 0;

  const childIds = [];

  for (
    let index = 0;
    index < entries.length;
    index++
  ) {
    const entry =
      entries[index];

    const filename =
      path.basename(
        entry.entryName
      );

    const buffer =
      entry.getData();

    const hash =
      sha256(buffer);

    const mimeType =
      inferMime(filename);

    const storagePath =
      buildChildStoragePath({
        parent,
        filename,
        hash,
      });

    console.log(
      `[${index + 1}/${entries.length}] ${filename}`
    );

    console.log(
      `  MIME: ${mimeType}`
    );

    console.log(
      `  Bytes: ${buffer.length}`
    );

    console.log(
      `  SHA: ${hash}`
    );

    const existing =
      await findNormativeBySha(
        hash
      );

    if (existing) {
      console.log(
        `  -> REUTILIZAR normative_id=${existing.id}`
      );

      reused++;

      if (!DRY_RUN) {
        for (
          const relation
          of relations
        ) {
          const relationResult =
            await ensureRelation({
              normativeId:
                existing.id,

              relation,
            });

          if (
            relationResult.created
          ) {
            relationsCreated++;
          }
        }

        childIds.push(
          existing.id
        );
      }

      console.log("");

      continue;
    }

    console.log(
      "  -> NUEVA normativa"
    );

    console.log(
      `  -> Storage: ${storagePath}`
    );

    if (DRY_RUN) {
      console.log(
        "  -> DRY RUN: no se sube ni inserta"
      );

      console.log("");

      continue;
    }

    /*
     * 1. Subir archivo físico.
     */
    await uploadChild({
      storagePath,
      buffer,
      mimeType,
    });

    uploaded++;

    /*
     * 2. Crear fila en normatives.
     */
    const child =
      await createChild({
        parent,
        filename,
        buffer,
        hash,
        storagePath,
      });

    created++;

    childIds.push(
      child.id
    );

    /*
     * 3. Heredar todas las relaciones del ZIP.
     */
    for (
      const relation
      of relations
    ) {
      const relationResult =
        await ensureRelation({
          normativeId:
            child.id,

          relation,
        });

      if (
        relationResult.created
      ) {
        relationsCreated++;
      }
    }

    console.log(
      `  -> Creada normative_id=${child.id}`
    );

    console.log("");
  }

  /*
   * Sólo archivamos el ZIP cuando el proceso
   * real terminó y tenemos los hijos registrados.
   */
  if (!DRY_RUN) {
    if (
      childIds.length !==
      entries.length
    ) {
      throw new Error(
        `No se archivará el ZIP: hay ${entries.length} archivos pero solamente ${childIds.length} normativas hijas registradas.`
      );
    }

    await updateParent({
      entries,
      childIds,
    });
  }

  console.log(
    "========== RESUMEN =========="
  );

  console.log(
    `Archivos ZIP:             ${entries.length}`
  );

  console.log(
    `Normativas nuevas:        ${created}`
  );

  console.log(
    `Normativas reutilizadas:  ${reused}`
  );

  console.log(
    `Archivos subidos:         ${uploaded}`
  );

  console.log(
    `Relaciones creadas:       ${relationsCreated}`
  );

  console.log(
    `Hijos registrados:        ${childIds.length}`
  );

  console.log("");

  if (DRY_RUN) {
    console.log(
      "DRY RUN: no se modificó Storage ni la base."
    );
  } else {
    console.log(
      "ZIP expandido correctamente."
    );

    console.log(
      "El ZIP padre quedó ARCHIVED / COMPLETED."
    );

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

    process.exit(1);
  }
);