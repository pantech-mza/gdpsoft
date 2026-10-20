import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno."
  );
  process.exit(1);
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

const INPUT_FILE = path.resolve(
  process.cwd(),
  "data/import/obras_sociales.json"
);

// =========================================================
// NORMALIZACIÓN
// =========================================================

function cleanString(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return String(value).trim();
}

function normalizeName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[._]/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function toInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? Math.trunc(n)
    : null;
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

// =========================================================
// DETECCIÓN / SANITIZACIÓN DE SECRETOS
// =========================================================

const sensitivePatterns = [
  /\bpassword\b/i,
  /\bcontrase(?:ñ|n)a\b/i,
  /\bclave\b/i,
  /\busuario\s*:/i,
  /\buser\s*:/i,
  /\blogin\s*:/i,
  /\bcredencial(?:es)?\b/i,
];

function sanitizeObservation(value) {
  if (!value) {
    return {
      text: null,
      sensitivity: "SAFE",
      aiAllowed: false,
      containsSensitive: false,
    };
  }

  const original =
    String(value);

  const lines =
    original.split(/\r?\n/);

  let containsSensitive =
    false;

  const sanitizedLines =
    lines.map((line) => {
      const sensitive =
        sensitivePatterns.some(
          (pattern) =>
            pattern.test(line)
        );

      if (sensitive) {
        containsSensitive =
          true;

        return "[DATO SENSIBLE LEGACY OMITIDO]";
      }

      return line;
    });

  const text =
    sanitizedLines
      .join("\n")
      .trim();

  return {
    text:
      text || null,

    sensitivity:
      containsSensitive
        ? "SECRET"
        : "SAFE",

    // Una observación marcada SECRET
    // nunca debe utilizarse automáticamente con IA.
    aiAllowed:
      !containsSensitive &&
      Boolean(text),

    containsSensitive,
  };
}

// =========================================================
// LEER JSON
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  console.error(
    `No existe el archivo: ${INPUT_FILE}`
  );

  process.exit(1);
}

const raw =
  fs.readFileSync(
    INPUT_FILE,
    "utf8"
  );

const sourceRecords =
  JSON.parse(raw);

if (
  !Array.isArray(
    sourceRecords
  )
) {
  console.error(
    "El JSON debe contener un array."
  );

  process.exit(1);
}

console.log(
  `Registros encontrados: ${sourceRecords.length}`
);

// =========================================================
// CREAR LOTE
// =========================================================

const batchName =
  `PLATASOFT_${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}`;

const {
  data: batch,
  error: batchError,
} = await supabase
  .from(
    "legacy_import_batches"
  )
  .insert({
    name: batchName,
    source_system:
      "PLATASOFT",
    status: "PENDING",
    total_records:
      sourceRecords.length,
    notes:
      "Importación automática del universo legacy de obras sociales.",
  })
  .select(
    "id, name"
  )
  .single();

if (batchError) {
  console.error(
    "Error creando lote:",
    batchError
  );

  process.exit(1);
}

console.log(
  `Lote creado: ${batch.id} - ${batch.name}`
);

// =========================================================
// TRANSFORMAR
// =========================================================

let sensitiveCount = 0;

const rows =
  sourceRecords.map(
    (record) => {

      const observation =
        sanitizeObservation(
          record.observations
        );

      if (
        observation
          .containsSensitive
      ) {
        sensitiveCount++;
      }

      /*
       * source_raw también se guarda
       * sanitizado para no copiar
       * credenciales al cloud.
       */
      const sanitizedRaw = {
        ...record,
        observations:
          observation.text,
      };

      return {
        batch_id:
          batch.id,

        id_soft:
          toInteger(
            record.id
          ),

        legacy_name:
          cleanString(
            record.names
          ),

        legacy_name_normalized:
          normalizeName(
            record.names
          ),

        plan:
          cleanString(
            record.plan
          ),

        status:
          cleanString(
            record.status
          ),

        recipe_type:
          cleanString(
            record.recipe_type
          ),

        recipe_validity_days:
          toInteger(
            record.recipe_validity
          ),

        letterhead:
          cleanString(
            record.letterhead
          ),

        rp:
          toInteger(
            record.rp
          ),

        validator_name:
          cleanString(
            record.validator_name
          ),

        validator_type:
          cleanString(
            record.validator_type
          ),

        diagnosis:
          cleanString(
            record.diagnosis
          ),

        monodrug:
          cleanString(
            record.monodrug
          ),

        commercial_name:
          cleanString(
            record.commercial_name
          ),

        substitution:
          cleanString(
            record.substitution
          ),

        observations:
          observation.text,

        robinson:
          Boolean(
            Number(
              record.robinson
            )
          ),

        source_modified_at:
          toTimestamp(
            record.modified
          ),

        normative_url:
          cleanString(
            record.normative
          ),

        migration_action:
          "PENDING",

        observation_sensitivity:
          observation
            .sensitivity,

        observation_ai_allowed:
          observation
            .aiAllowed,

        review_status:
          "PENDING",

        source_raw:
          sanitizedRaw,
      };
    }
  );

// =========================================================
// INSERTAR EN BLOQUES
// =========================================================

const CHUNK_SIZE = 50;

let inserted = 0;
let errors = 0;

for (
  let index = 0;
  index < rows.length;
  index += CHUNK_SIZE
) {
  const chunk =
    rows.slice(
      index,
      index + CHUNK_SIZE
    );

  const {
    error,
  } = await supabase
    .from(
      "legacy_social_works_staging"
    )
    .insert(chunk);

  if (error) {
    console.error(
      `Error en bloque ${
        index + 1
      }-${
        index +
        chunk.length
      }:`,
      error
    );

    errors +=
      chunk.length;

    continue;
  }

  inserted +=
    chunk.length;

  console.log(
    `Insertados ${inserted}/${rows.length}`
  );
}

// =========================================================
// ACTUALIZAR LOTE
// =========================================================

const finalStatus =
  errors === 0
    ? "LOADED"
    : "ERROR";

const {
  error: updateError,
} = await supabase
  .from(
    "legacy_import_batches"
  )
  .update({
    status:
      finalStatus,

    processed_records:
      inserted,

    error_records:
      errors,

    completed_at:
      new Date()
        .toISOString(),
  })
  .eq(
    "id",
    batch.id
  );

if (updateError) {
  console.error(
    "No se pudo actualizar el lote:",
    updateError
  );
}

// =========================================================
// RESUMEN
// =========================================================

console.log("");
console.log(
  "================================="
);
console.log(
  "IMPORTACIÓN STAGING FINALIZADA"
);
console.log(
  "================================="
);

console.log(
  `Lote: ${batch.id}`
);

console.log(
  `Origen: ${sourceRecords.length}`
);

console.log(
  `Insertados: ${inserted}`
);

console.log(
  `Errores: ${errors}`
);

console.log(
  `Observaciones sensibles detectadas: ${sensitiveCount}`
);

console.log(
  `Estado: ${finalStatus}`
);