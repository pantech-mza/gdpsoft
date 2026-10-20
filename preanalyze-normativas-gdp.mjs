import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const BUCKET = "normativas-originales";

const ANALYZER_VERSION = "gdp-preanalysis-v1";

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
  const item = args.find((arg) => arg.startsWith(prefix));

  return item
    ? item.slice(prefix.length)
    : null;
}

const DRY_RUN = hasFlag("dry-run");

const ID = getArg("id")
  ? Number(getArg("id"))
  : null;

const LIMIT = getArg("limit")
  ? Number(getArg("limit"))
  : null;

const CONCURRENCY = getArg("concurrency")
  ? Math.max(
      1,
      Number(getArg("concurrency"))
    )
  : 3;

if (
  ID !== null &&
  (!Number.isInteger(ID) || ID <= 0)
) {
  throw new Error(
    "--id debe ser un ID válido de normatives"
  );
}

if (
  LIMIT !== null &&
  (!Number.isInteger(LIMIT) || LIMIT <= 0)
) {
  throw new Error(
    "--limit debe ser un entero mayor a 0"
  );
}

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripXml(value) {
  return normalizeText(
    decodeXmlEntities(
      String(value ?? "")
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
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function result({
  recommended = null,
  confidence = null,
  reason,
  stage,
  details = {},
}) {
  return {
    recommended,
    confidence,
    reason,
    stage,
    progress: 100,
    details: {
      analyzer_version:
        ANALYZER_VERSION,
      ...details,
    },
  };
}

// ------------------------------------------------------------
// PDF
// ------------------------------------------------------------

async function analyzePdf(buffer) {
  const loadingTask =
    pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
    });

  const pdf = await loadingTask.promise;

  let totalChars = 0;
  let pagesWithText = 0;

  const pageStats = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {
    const page =
      await pdf.getPage(pageNumber);

    const content =
      await page.getTextContent();

    const text = normalizeText(
      content.items
        .map((item) => item.str || "")
        .join(" ")
    );

    const chars = text.length;

    totalChars += chars;

    if (chars >= 40) {
      pagesWithText++;
    }

    pageStats.push({
      page: pageNumber,
      chars,
    });
  }

  const pages = pdf.numPages;

  const coverage =
    pages > 0
      ? pagesWithText / pages
      : 0;

  const avgChars =
    pages > 0
      ? totalChars / pages
      : 0;

  /*
    Criterio conservador:

    DIRECT:
    - al menos 120 caracteres totales
    - >= 80% de las páginas tienen texto
    - promedio >= 60 caracteres/página

    Si no:
    OCR.

    Esto hace que PDFs escaneados o mixtos
    terminen recomendados para OCR.
  */

  if (
    totalChars >= 120 &&
    coverage >= 0.8 &&
    avgChars >= 60
  ) {
    return result({
      recommended: "DIRECT",
      confidence:
        coverage >= 0.95
          ? 0.98
          : 0.9,
      reason:
        "PDF con capa de texto extraíble suficiente y cobertura alta entre páginas.",
      stage: "PREANALYZED",
      details: {
        format: "PDF",
        pages,
        total_chars:
          totalChars,
        pages_with_text:
          pagesWithText,
        text_coverage:
          Number(
            coverage.toFixed(4)
          ),
        avg_chars_per_page:
          Number(
            avgChars.toFixed(2)
          ),
        page_stats:
          pageStats,
      },
    });
  }

  return result({
    recommended: "OCR",
    confidence:
      totalChars < 50
        ? 0.99
        : 0.9,
    reason:
      "PDF sin capa de texto suficiente o con cobertura parcial; se recomienda OCR.",
    stage: "PREANALYZED",
    details: {
      format: "PDF",
      pages,
      total_chars:
        totalChars,
      pages_with_text:
        pagesWithText,
      text_coverage:
        Number(
          coverage.toFixed(4)
        ),
      avg_chars_per_page:
        Number(
          avgChars.toFixed(2)
        ),
      page_stats:
        pageStats,
    },
  });
}

// ------------------------------------------------------------
// DOCX
// ------------------------------------------------------------

async function analyzeDocx(buffer) {
  const extracted =
    await mammoth.extractRawText({
      buffer,
    });

  const text =
    normalizeText(
      extracted.value
    );

  if (text.length >= 50) {
    return result({
      recommended: "DIRECT",
      confidence: 0.98,
      reason:
        "Documento DOCX con texto extraíble directamente.",
      stage: "PREANALYZED",
      details: {
        format: "DOCX",
        extracted_chars:
          text.length,
        extraction_messages:
          extracted.messages?.length ??
          0,
      },
    });
  }

  return result({
    recommended: null,
    confidence: null,
    reason:
      "DOCX sin texto extraíble suficiente. Requiere revisión manual antes de elegir DIRECT u OCR.",
    stage: "REVIEW_REQUIRED",
    details: {
      format: "DOCX",
      extracted_chars:
        text.length,
      extraction_messages:
        extracted.messages?.length ??
        0,
    },
  });
}

// ------------------------------------------------------------
// DOC LEGACY
// ------------------------------------------------------------

async function analyzeDoc(buffer) {
  const extractor =
    new WordExtractor();

  const extracted =
    await extractor.extract(buffer);

  const text =
    normalizeText(
      extracted.getBody()
    );

  if (text.length >= 50) {
    return result({
      recommended: "DIRECT",
      confidence: 0.95,
      reason:
        "Documento Word legado (.doc) con texto extraíble directamente.",
      stage: "PREANALYZED",
      details: {
        format: "DOC",
        extracted_chars:
          text.length,
      },
    });
  }

  return result({
    recommended: null,
    confidence: null,
    reason:
      "Documento DOC sin texto extraíble suficiente. Requiere revisión manual.",
    stage: "REVIEW_REQUIRED",
    details: {
      format: "DOC",
      extracted_chars:
        text.length,
    },
  });
}

// ------------------------------------------------------------
// XLSX
// ------------------------------------------------------------

async function analyzeXlsx(buffer) {
  const workbook =
    XLSX.read(buffer, {
      type: "buffer",
    });

  let totalChars = 0;

  const sheets = [];

  for (
    const sheetName
    of workbook.SheetNames
  ) {
    const sheet =
      workbook.Sheets[
        sheetName
      ];

    const csv =
      XLSX.utils.sheet_to_csv(
        sheet,
        {
          blankrows: false,
        }
      );

    const text =
      normalizeText(csv);

    totalChars +=
      text.length;

    sheets.push({
      name: sheetName,
      extracted_chars:
        text.length,
    });
  }

  if (totalChars >= 20) {
    return result({
      recommended: "DIRECT",
      confidence: 0.98,
      reason:
        "Planilla XLSX con contenido estructurado extraíble directamente.",
      stage: "PREANALYZED",
      details: {
        format: "XLSX",
        sheet_count:
          workbook.SheetNames.length,
        extracted_chars:
          totalChars,
        sheets,
      },
    });
  }

  return result({
    recommended: null,
    confidence: null,
    reason:
      "XLSX sin contenido extraíble suficiente. Requiere revisión manual.",
    stage: "REVIEW_REQUIRED",
    details: {
      format: "XLSX",
      sheet_count:
        workbook.SheetNames.length,
      extracted_chars:
        totalChars,
      sheets,
    },
  });
}

// ------------------------------------------------------------
// ODT
// ------------------------------------------------------------

async function analyzeOdt(buffer) {
  const zip =
    new AdmZip(buffer);

  const entry =
    zip.getEntry(
      "content.xml"
    );

  if (!entry) {
    return result({
      recommended: null,
      confidence: null,
      reason:
        "ODT sin content.xml. Requiere revisión manual.",
      stage: "REVIEW_REQUIRED",
      details: {
        format: "ODT",
      },
    });
  }

  const xml =
    entry
      .getData()
      .toString("utf8");

  const text =
    stripXml(xml);

  if (text.length >= 50) {
    return result({
      recommended: "DIRECT",
      confidence: 0.97,
      reason:
        "Documento ODT con texto extraíble directamente.",
      stage: "PREANALYZED",
      details: {
        format: "ODT",
        extracted_chars:
          text.length,
      },
    });
  }

  return result({
    recommended: null,
    confidence: null,
    reason:
      "ODT sin texto extraíble suficiente. Requiere revisión manual.",
    stage: "REVIEW_REQUIRED",
    details: {
      format: "ODT",
      extracted_chars:
        text.length,
    },
  });
}

// ------------------------------------------------------------
// IMAGES
// ------------------------------------------------------------

function analyzeImage(
  mimeType
) {
  return result({
    recommended: "OCR",
    confidence: 1,
    reason:
      "Archivo de imagen; requiere OCR para obtener texto.",
    stage: "PREANALYZED",
    details: {
      format: mimeType,
    },
  });
}

// ------------------------------------------------------------
// ZIP
// ------------------------------------------------------------

function analyzeZip(buffer) {
  let entries = [];

  try {
    const zip =
      new AdmZip(buffer);

    entries = zip
      .getEntries()
      .filter(
        (entry) =>
          !entry.isDirectory
      )
      .map((entry) => ({
        name:
          entry.entryName,
        size:
          entry.header?.size ??
          null,
      }));
  } catch {
    // No interrumpir todo el proceso.
  }

  return result({
    recommended: null,
    confidence: null,
    reason:
      "Archivo ZIP. Puede contener múltiples documentos y requiere revisión antes de seleccionar DIRECT u OCR.",
    stage: "REVIEW_REQUIRED",
    details: {
      format: "ZIP",
      contained_files:
        entries.length,
      entries,
    },
  });
}

// ------------------------------------------------------------
// ROUTER
// ------------------------------------------------------------

async function analyzeBuffer(
  mimeType,
  buffer
) {
  switch (mimeType) {
    case "application/pdf":
      return analyzePdf(
        buffer
      );

    case "application/msword":
      return analyzeDoc(
        buffer
      );

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return analyzeDocx(
        buffer
      );

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return analyzeXlsx(
        buffer
      );

    case "application/vnd.oasis.opendocument.text":
      return analyzeOdt(
        buffer
      );

    case "image/jpeg":
    case "image/png":
      return analyzeImage(
        mimeType
      );

    case "application/zip":
      return analyzeZip(
        buffer
      );

    default:
      return result({
        recommended: null,
        confidence: null,
        reason:
          `MIME no soportado automáticamente: ${mimeType}`,
        stage:
          "REVIEW_REQUIRED",
        details: {
          format:
            mimeType,
        },
      });
  }
}

// ------------------------------------------------------------
// DOWNLOAD
// ------------------------------------------------------------

async function downloadNormative(
  normative
) {
  const {
    data,
    error,
  } = await supabase.storage
    .from(BUCKET)
    .download(
      normative
        .storage_path_original
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

  const arrayBuffer =
    await data.arrayBuffer();

  return Buffer.from(
    arrayBuffer
  );
}

// ------------------------------------------------------------
// DATABASE
// ------------------------------------------------------------

async function loadPendingNormatives() {
  let query =
    supabase
      .from("normatives")
      .select(`
        id,
        title,
        original_filename,
        mime_type,
        file_size_bytes,
        storage_path_original,
        status,
        processing_recommended,
        processing_selected,
        analysis_stage
      `)
      .eq(
        "status",
        "PENDING_ANALYSIS"
      )
      .is(
        "processing_selected",
        null
      );

  /*
    Por defecto sólo tomamos los que
    todavía no tienen recomendación.
  */
  query = query.is(
    "processing_recommended",
    null
  );

  if (ID !== null) {
    query = query.eq(
      "id",
      ID
    );
  }

  query = query.order(
    "id",
    {
      ascending: true,
    }
  );

  if (LIMIT !== null) {
    query = query.limit(
      LIMIT
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `DB load: ${error.message}`
    );
  }

  return data ?? [];
}

async function saveAnalysis(
  normative,
  analysis
) {
  const now =
    new Date()
      .toISOString();

  const update = {
    processing_recommended:
      analysis.recommended,

    analysis_confidence:
      analysis.confidence,

    analysis_reason:
      analysis.reason,

    analyzed_at:
      now,

    analysis_stage:
      analysis.stage,

    analysis_progress:
      analysis.progress,

    analysis_details: {
      ...analysis.details,

      preanalysis: {
        normative_id:
          normative.id,

        original_filename:
          normative.original_filename,

        mime_type:
          normative.mime_type,

        analyzed_at:
          now,
      },
    },

    /*
      IMPORTANTE:
      NO actualizamos:
      - processing_selected
      - status
      - approved_by
      - approved_at
      - OpenAI IDs/status
    */
  };

  if (DRY_RUN) {
    return update;
  }

  const {
    error,
  } = await supabase
    .from("normatives")
    .update(update)
    .eq(
      "id",
      normative.id
    )
    .eq(
      "status",
      "PENDING_ANALYSIS"
    )
    .is(
      "processing_selected",
      null
    );

  if (error) {
    throw new Error(
      `DB update: ${error.message}`
    );
  }

  return update;
}

// ------------------------------------------------------------
// PROCESS ONE
// ------------------------------------------------------------

async function processNormative(
  normative
) {
  const prefix =
    `[${normative.id}]`;

  console.log(
    `${prefix} ${normative.original_filename}`
  );

  try {
    if (
      !normative
        .storage_path_original
    ) {
      throw new Error(
        "storage_path_original vacío"
      );
    }

    const buffer =
      await downloadNormative(
        normative
      );

    const analysis =
      await analyzeBuffer(
        normative.mime_type,
        buffer
      );

    await saveAnalysis(
      normative,
      analysis
    );

    console.log(
      `${prefix} -> ${
        analysis.recommended ??
        "REVIEW"
      } | ${
        analysis.stage
      } | ${
        analysis.confidence ??
        "-"
      }`
    );

    return {
      id: normative.id,
      success: true,
      recommended:
        analysis.recommended,
      stage:
        analysis.stage,
      reason:
        analysis.reason,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `${prefix} ERROR: ${message}`
    );

    /*
      Un error técnico no debe inventar
      DIRECT ni OCR.
    */
    if (!DRY_RUN) {
      const {
        error:
          updateError,
      } = await supabase
        .from("normatives")
        .update({
          analysis_stage:
            "REVIEW_REQUIRED",

          analysis_progress:
            100,

          analysis_reason:
            `Error técnico durante preanálisis: ${message}`,

          analyzed_at:
            new Date()
              .toISOString(),

          analysis_details: {
            analyzer_version:
              ANALYZER_VERSION,

            technical_error:
              message,
          },
        })
        .eq(
          "id",
          normative.id
        )
        .eq(
          "status",
          "PENDING_ANALYSIS"
        );

      if (updateError) {
        console.error(
          `${prefix} ERROR guardando fallo: ${updateError.message}`
        );
      }
    }

    return {
      id: normative.id,
      success: false,
      recommended: null,
      stage:
        "REVIEW_REQUIRED",
      error:
        message,
    };
  }
}

// ------------------------------------------------------------
// CONCURRENCY
// ------------------------------------------------------------

async function mapLimit(
  items,
  limit,
  handler
) {
  const results =
    new Array(
      items.length
    );

  let cursor = 0;

  async function worker() {
    while (true) {
      const index =
        cursor++;

      if (
        index >= items.length
      ) {
        return;
      }

      results[index] =
        await handler(
          items[index]
        );
    }
  }

  const workerCount =
    Math.min(
      limit,
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount,
      },
      () => worker()
    )
  );

  return results;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

async function main() {
  console.log("");
  console.log(
    "========== GDP NORMATIVAS PREANALYSIS =========="
  );

  console.log(
    `Bucket:       ${BUCKET}`
  );

  console.log(
    `Dry run:      ${
      DRY_RUN
        ? "Sí"
        : "No"
    }`
  );

  console.log(
    `Concurrencia: ${CONCURRENCY}`
  );

  if (ID !== null) {
    console.log(
      `Normative ID: ${ID}`
    );
  }

  if (LIMIT !== null) {
    console.log(
      `Limit:        ${LIMIT}`
    );
  }

  console.log("");

  const normatives =
    await loadPendingNormatives();

  console.log(
    `Normativas a analizar: ${normatives.length}`
  );

  if (
    normatives.length === 0
  ) {
    console.log(
      "No hay normativas pendientes que cumplan los filtros."
    );

    return;
  }

  console.log("");

  const results =
    await mapLimit(
      normatives,
      CONCURRENCY,
      processNormative
    );

  const direct =
    results.filter(
      (item) =>
        item?.success &&
        item.recommended ===
          "DIRECT"
    ).length;

  const ocr =
    results.filter(
      (item) =>
        item?.success &&
        item.recommended ===
          "OCR"
    ).length;

  const review =
    results.filter(
      (item) =>
        item?.success &&
        !item.recommended
    ).length;

  const errors =
    results.filter(
      (item) =>
        !item?.success
    ).length;

  console.log("");
  console.log(
    "========== RESUMEN =========="
  );

  console.log(
    `Analizadas:              ${results.length}`
  );

  console.log(
    `Recomendadas DIRECT:     ${direct}`
  );

  console.log(
    `Recomendadas OCR:        ${ocr}`
  );

  console.log(
    `Revisión requerida:      ${review}`
  );

  console.log(
    `Errores técnicos:        ${errors}`
  );

  console.log("");
  console.log(
    "processing_selected NO fue modificado."
  );

  console.log(
    "status NO fue modificado."
  );

  console.log(
    "No se envió ningún archivo a OpenAI."
  );
}

main().catch(
  (error) => {
    console.error("");
    console.error(
      "ERROR FATAL:"
    );

    console.error(
      error
    );

    process.exit(1);
  }
);