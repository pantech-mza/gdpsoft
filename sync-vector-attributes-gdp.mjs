import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY;

const VECTOR_STORE_ID =
  process.env.OPENAI_VECTOR_STORE_ID ||
  "vs_6aac0d4a273881919e002d606e691d01";

if (!SUPABASE_URL) {
  throw new Error(
    "Falta SUPABASE_URL"
  );
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error(
    "Falta SUPABASE_SECRET_KEY"
  );
}

if (!OPENAI_API_KEY) {
  throw new Error(
    "Falta OPENAI_API_KEY"
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

// --------------------------------------------------
// CLI
// --------------------------------------------------

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

  const item =
    args.find(
      (arg) =>
        arg.startsWith(
          prefix
        )
    );

  return item
    ? item.slice(
        prefix.length
      )
    : null;
}

const DRY_RUN =
  hasFlag(
    "dry-run"
  );

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

// --------------------------------------------------
// LOAD NORMATIVES
// --------------------------------------------------

async function loadNormatives() {
  let query =
    supabase
      .from(
        "normatives"
      )
      .select(`
        id,
        title,
        document_kind,
        version,
        is_current,
        processing_selected,
        source_system,
        openai_file_id,
        openai_vector_store_file_id,
        openai_vector_store_id,
        status
      `)
      .eq(
        "status",
        "INDEXED"
      )
      .not(
        "openai_file_id",
        "is",
        null
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
      `Error leyendo normatives: ${error.message}`
    );
  }

  return data ?? [];
}

// --------------------------------------------------
// LOAD RELATIONS
// --------------------------------------------------

async function loadRelations(
  normativeIds
) {
  if (
    normativeIds.length === 0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "normative_social_works"
      )
      .select(`
        id,
        normative_id,
        social_work_id,
        billing_channel_id,
        scope_id,
        document_role,
        is_primary
      `)
      .in(
        "normative_id",
        normativeIds
      )
      .order(
        "id",
        {
          ascending: true,
        }
      );

  if (error) {
    throw new Error(
      `Error leyendo relaciones: ${error.message}`
    );
  }

  return data ?? [];
}

// --------------------------------------------------
// LOAD LEGACY
// --------------------------------------------------

async function loadLegacy(
  normativeIds
) {
  if (
    normativeIds.length === 0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "legacy_social_works_staging"
      )
      .select(`
        imported_normative_id,
        id_soft,
        canonical_social_work_id,
        imported_social_work_id
      `)
      .in(
        "imported_normative_id",
        normativeIds
      )
      .not(
        "id_soft",
        "is",
        null
      )
      .order(
        "id",
        {
          ascending: true,
        }
      );

  if (error) {
    throw new Error(
      `Error leyendo staging: ${error.message}`
    );
  }

  return data ?? [];
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function uniqueNumbers(
  values
) {
  return [
    ...new Set(
      values
        .map(Number)
        .filter(
          Number.isFinite
        )
    ),
  ];
}

function getRelationsFor(
  normativeId,
  relations
) {
  return relations
    .filter(
      (r) =>
        Number(
          r.normative_id
        ) ===
        Number(
          normativeId
        )
    )
    .filter(
      (r) =>
        r.social_work_id !==
        null
    );
}

function getLegacyRowsFor(
  normativeId,
  legacyRows
) {
  return legacyRows
    .filter(
      (row) =>
        Number(
          row.imported_normative_id
        ) ===
        Number(
          normativeId
        )
    );
}

function chooseSocialWorks(
  normativeId,
  relations
) {
  const rows =
    getRelationsFor(
      normativeId,
      relations
    );

  const primaryRows =
    rows.filter(
      (r) =>
        r.is_primary ===
        true
    );

  const ordered = [
    ...primaryRows,
    ...rows.filter(
      (r) =>
        r.is_primary !==
        true
    ),
  ];

  return uniqueNumbers(
    ordered.map(
      (r) =>
        r.social_work_id
    )
  );
}

function chooseIdSoft(
  normativeId,
  legacyRows
) {
  const rows =
    getLegacyRowsFor(
      normativeId,
      legacyRows
    );

  const values =
    uniqueNumbers(
      rows.map(
        (row) =>
          row.id_soft
      )
    );

  return (
    values[0] ??
    null
  );
}

function buildAttributes({
  normative,
  relations,
  legacyRows,
}) {
  const socialWorks =
    chooseSocialWorks(
      normative.id,
      relations
    );

  if (
    socialWorks.length === 0
  ) {
    throw new Error(
      "Normativa sin social_work_id relacionado"
    );
  }

  if (
    socialWorks.length > 2
  ) {
    throw new Error(
      `Normativa con ${socialWorks.length} OOSS. Requiere revisión manual.`
    );
  }

  const idSoft =
    chooseIdSoft(
      normative.id,
      legacyRows
    );

  const attributes = {
    normative_id:
      Number(
        normative.id
      ),

    social_work_id:
      socialWorks[0],

    is_current:
      Boolean(
        normative.is_current
      ),

    version:
      Number(
        normative.version ??
        1
      ),

    document_kind:
      String(
        normative.document_kind ??
        "INITIAL"
      ),

    source_system:
      String(
        normative.source_system ??
        "GDP_SOFT"
      ),

    processing_mode:
      String(
        normative.processing_selected ??
        "DIRECT"
      ),
  };

  if (
    idSoft !== null
  ) {
    attributes.id_soft =
      idSoft;
  }

  if (
    socialWorks.length === 2
  ) {
    attributes.secondary_social_work_id =
      socialWorks[1];

    attributes.multi_social_work =
      true;
  }

  return attributes;
}

// --------------------------------------------------
// SYNC ONE
// --------------------------------------------------

async function syncOne({
  normative,
  relations,
  legacyRows,
}) {
  console.log(
    `[${normative.id}] ${normative.title}`
  );

  try {
    const attributes =
      buildAttributes({
        normative,
        relations,
        legacyRows,
      });

    console.log(
      `  File: ${normative.openai_file_id}`
    );

    console.log(
      `  Attributes:`
    );

    console.log(
      JSON.stringify(
        attributes,
        null,
        2
      )
        .split("\n")
        .map(
          (line) =>
            `    ${line}`
        )
        .join("\n")
    );

    if (DRY_RUN) {
      console.log(
        "  -> DRY RUN"
      );

      return {
        success: true,
      };
    }

    const updated =
      await openai
        .vectorStores
        .files
        .update(
          normative.openai_file_id,
          {
            vector_store_id:
              VECTOR_STORE_ID,

            attributes,
          }
        );

    console.log(
      `  -> UPDATED (${updated.status})`
    );

    return {
      success: true,
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

    return {
      success: false,
      error: message,
    };
  }
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function main() {
  console.log("");

  console.log(
    "========== GDP VECTOR ATTRIBUTE SYNC =========="
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

  if (
    ID !== null
  ) {
    console.log(
      `ID:           ${ID}`
    );
  }

  console.log("");

  const normatives =
    await loadNormatives();

  console.log(
    `Normativas: ${normatives.length}`
  );

  if (
    normatives.length === 0
  ) {
    return;
  }

  const normativeIds =
    normatives.map(
      (n) => n.id
    );

  const [
    relations,
    legacyRows,
  ] =
    await Promise.all([
      loadRelations(
        normativeIds
      ),
      loadLegacy(
        normativeIds
      ),
    ]);

  let correct = 0;
  let errors = 0;

  console.log("");

  for (
    const normative
    of normatives
  ) {
    const result =
      await syncOne({
        normative,
        relations,
        legacyRows,
      });

    if (
      result.success
    ) {
      correct++;
    } else {
      errors++;
    }

    console.log("");
  }

  console.log(
    "========== RESUMEN =========="
  );

  console.log(
    `Procesados: ${normatives.length}`
  );

  console.log(
    `Correctos:  ${correct}`
  );

  console.log(
    `Errores:    ${errors}`
  );

  if (DRY_RUN) {
    console.log("");

    console.log(
      "DRY RUN: OpenAI no fue modificado."
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