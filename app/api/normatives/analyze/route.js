import { requireActor } from "../../../../lib/decision-trees/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { getDocumentProxy } from "unpdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const ORIGINAL_BUCKET = "normativas-originales";

async function updateAnalysis(normativeId, values) {
  const { error } = await supabaseAdmin
    .from("normatives")
    .update(values)
    .eq("id", normativeId);

  if (error) {
    throw new Error(
      `No se pudo actualizar el análisis: ${error.message}`
    );
  }
}

function normalizeText(items = []) {
  return items
    .map((item) => item?.str || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildRecommendation({
  totalPages,
  totalChars,
  usefulTextPages,
  lowTextPages,
  emptyTextPages,
}) {
  const averageChars =
    totalPages > 0
      ? totalChars / totalPages
      : 0;

  const textCoverage =
    totalPages > 0
      ? usefulTextPages / totalPages
      : 0;

  const lowTextRatio =
    totalPages > 0
      ? lowTextPages / totalPages
      : 0;

  const emptyTextRatio =
    totalPages > 0
      ? emptyTextPages / totalPages
      : 0;

  /*
   * Score de aptitud para procesamiento directo.
   *
   * Lo que realmente nos importa:
   * ¿el PDF ya contiene suficiente texto digital
   * como para indexarlo correctamente?
   */
  const densityScore = Math.min(
    averageChars / 700,
    1
  );

  const directScore =
    textCoverage * 0.65 +
    densityScore * 0.35;

  let recommendation;

  /*
   * Casos claramente OCR.
   */
  if (
    textCoverage < 0.55 ||
    emptyTextRatio >= 0.4 ||
    averageChars < 100
  ) {
    recommendation = "OCR";
  }

  /*
   * Casos claramente directos.
   */
  else if (
    textCoverage >= 0.8 &&
    averageChars >= 250
  ) {
    recommendation = "DIRECT";
  }

  /*
   * Zona intermedia.
   */
  else {
    recommendation =
      directScore >= 0.62
        ? "DIRECT"
        : "OCR";
  }

  let confidence;

  if (recommendation === "DIRECT") {
    confidence =
      0.5 +
      Math.abs(directScore - 0.5);
  } else {
    confidence =
      0.5 +
      Math.abs(0.5 - directScore);
  }

  confidence = Math.min(
    confidence,
    0.99
  );

  let reason;

  if (recommendation === "DIRECT") {
    reason =
      `El documento contiene texto digital extraíble en ` +
      `${Math.round(textCoverage * 100)}% de sus páginas, ` +
      `con un promedio de ${Math.round(
        averageChars
      )} caracteres por página. ` +
      `La extracción obtenida es suficiente para procesar ` +
      `e indexar el documento directamente.`;
  } else {
    reason =
      `El documento presenta texto digital insuficiente. ` +
      `${lowTextPages} de ${totalPages} páginas tienen poco texto ` +
      `y ${emptyTextPages} prácticamente no contienen texto extraíble. ` +
      `Se recomienda OCR antes de la indexación.`;
  }

  return {
    recommendation,

    confidence:
      round(confidence, 4),

    reason,

    metrics: {
      total_pages:
        totalPages,

      total_chars:
        totalChars,

      average_chars_per_page:
        Math.round(averageChars),

      pages_with_useful_text:
        usefulTextPages,

      low_text_pages:
        lowTextPages,

      empty_text_pages:
        emptyTextPages,

      text_coverage_percent:
        Math.round(
          textCoverage * 100
        ),

      low_text_percent:
        Math.round(
          lowTextRatio * 100
        ),

      empty_text_percent:
        Math.round(
          emptyTextRatio * 100
        ),

      direct_score:
        round(directScore, 4),
    },
  };
}

export async function POST(request) {
  const access = await requireActor(request, true);
  if (access.error) return access.error;
  const url =
    new URL(request.url);

  const normativeId =
    Number(
      url.searchParams.get(
        "normativeId"
      )
    );

  if (
    !Number.isInteger(normativeId) ||
    normativeId <= 0
  ) {
    return Response.json(
      {
        ok: false,
        error: "normativeId inválido",
      },
      {
        status: 400,
      }
    );
  }

  let pdf = null;

  try {
    // =====================================================
    // 1. BUSCAR NORMATIVA
    // =====================================================

    const {
      data: normative,
      error: normativeError,
    } = await supabaseAdmin
      .from("normatives")
      .select(`
        id,
        original_filename,
        mime_type,
        storage_path_original,
        status,
        processing_selected
      `)
      .eq("id", normativeId)
      .single();

    if (normativeError) {
      throw new Error(
        normativeError.message
      );
    }

    if (
      !normative.storage_path_original
    ) {
      throw new Error(
        "La normativa no tiene archivo original asociado"
      );
    }

    // =====================================================
    // 2. INICIAR ANÁLISIS
    // =====================================================

    await updateAnalysis(
      normativeId,
      {
        status:
          "PENDING_ANALYSIS",

        analysis_stage:
          "LOADING",

        analysis_progress:
          10,

        analysis_reason:
          null,

        analysis_confidence:
          null,

        analysis_details:
          null,

        processing_recommended:
          null,

        error_message:
          null,
      }
    );

    // =====================================================
    // 3. DESCARGAR ARCHIVO DESDE STORAGE
    // =====================================================

    const {
      data: fileBlob,
      error: downloadError,
    } =
      await supabaseAdmin.storage
        .from(ORIGINAL_BUCKET)
        .download(
          normative
            .storage_path_original
        );

    if (downloadError) {
      throw new Error(
        `No se pudo descargar el archivo: ${downloadError.message}`
      );
    }

    if (!fileBlob) {
      throw new Error(
        "Supabase no devolvió el archivo"
      );
    }

    const arrayBuffer =
      await fileBlob.arrayBuffer();

    const bytes =
      new Uint8Array(
        arrayBuffer
      );

    // =====================================================
    // 4. VALIDAR PDF
    // =====================================================

    await updateAnalysis(
      normativeId,
      {
        analysis_stage:
          "VALIDATING",

        analysis_progress:
          20,
      }
    );

    if (!bytes.length) {
      throw new Error(
        "El archivo está vacío"
      );
    }

    const signature =
      new TextDecoder().decode(
        bytes.slice(0, 5)
      );

    // v3.13.34 — documentos de texto (DOCX, TXT, MD, HTML) no necesitan OCR ni
    // análisis de páginas: se marcan listos para indexar de forma DIRECTA.
    const lowerName = String(normative.original_filename || "").toLowerCase();
    const extension = lowerName.includes(".") ? lowerName.split(".").pop() : "";
    const looksLikeZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const isTextDocument =
      signature !== "%PDF-" &&
      ((extension === "docx" && looksLikeZip) || ["txt", "md", "html", "htm"].includes(extension));
    if (isTextDocument) {
      const analyzedAtText = new Date().toISOString();
      await updateAnalysis(normativeId, {
        status: "READY_TO_PROCESS",
        analysis_stage: "COMPLETED",
        analysis_progress: 100,
        processing_recommended: "DIRECT",
        analysis_confidence: 1,
        analysis_reason: `Documento ${extension.toUpperCase()}: contiene texto digital, no requiere OCR.`,
        analysis_details: { engine: "text-document", extension, analyzed_at: analyzedAtText, analysis_version: "1.0" },
        analyzed_at: analyzedAtText,
        error_message: null,
      });
      return Response.json({
        ok: true,
        normative_id: normative.id,
        filename: normative.original_filename,
        recommendation: "DIRECT",
        confidence: 1,
        reason: `Documento ${extension.toUpperCase()}: contiene texto digital, no requiere OCR.`,
        metrics: { extension },
        processing_selected: normative.processing_selected ?? null,
        requires_admin_confirmation: true,
      });
    }

    if (
      signature !== "%PDF-"
    ) {
      throw new Error(
        "El archivo almacenado no parece ser un PDF válido"
      );
    }

    // =====================================================
    // 5. CARGAR PDF CON UNPDF
    // =====================================================

    /*
     * unpdf utiliza una build serverless
     * de PDF.js.
     *
     * No utiliza Web Worker.
     * No requiere @napi-rs/canvas para texto.
     */

    pdf =
      await getDocumentProxy(
        bytes,
        {
          disableFontFace: true,

          /*
           * Protección básica frente a PDFs
           * malformados que declaren imágenes enormes.
           */
          maxImageSize:
            16_777_216,
        }
      );

    const totalPages =
      pdf.numPages;

    if (
      !totalPages ||
      totalPages < 1
    ) {
      throw new Error(
        "El PDF no contiene páginas"
      );
    }

    await updateAnalysis(
      normativeId,
      {
        analysis_stage:
          "EXTRACTING",

        analysis_progress:
          30,

        analysis_details: {
          total_pages:
            totalPages,

          pages_analyzed:
            0,
        },
      }
    );

    // =====================================================
    // 6. ANALIZAR PÁGINA POR PÁGINA
    // =====================================================

    let totalChars = 0;

    let usefulTextPages = 0;

    let lowTextPages = 0;

    let emptyTextPages = 0;

    const pageStats = [];

    let lastSavedProgress = 30;

    for (
      let pageNumber = 1;
      pageNumber <= totalPages;
      pageNumber++
    ) {
      const page =
        await pdf.getPage(
          pageNumber
        );

      const textContent =
        await page.getTextContent();

      const pageText =
        normalizeText(
          textContent.items
        );

      const charCount =
        pageText.length;

      totalChars +=
        charCount;

      /*
       * < 20 caracteres:
       * prácticamente sin texto.
       */
      const isEmpty =
        charCount < 20;

      /*
       * < 100 caracteres:
       * muy poco texto útil.
       */
      const isLowText =
        charCount < 100;

      const hasUsefulText =
        charCount >= 100;

      if (isEmpty) {
        emptyTextPages++;
      }

      if (isLowText) {
        lowTextPages++;
      }

      if (hasUsefulText) {
        usefulTextPages++;
      }

      pageStats.push({
        page:
          pageNumber,

        chars:
          charCount,

        text_items:
          textContent
            .items
            .length,

        empty_text:
          isEmpty,

        low_text:
          isLowText,

        useful_text:
          hasUsefulText,
      });

      try {
        page.cleanup();
      } catch {
        // No es crítico.
      }

      // ===================================================
      // PROGRESO REAL DEL DOCUMENTO
      // 30% → 82%
      // ===================================================

      const progress =
        30 +
        Math.round(
          (
            pageNumber /
            totalPages
          ) * 52
        );

      if (
        progress >=
          lastSavedProgress + 3 ||
        pageNumber ===
          totalPages
      ) {
        lastSavedProgress =
          progress;

        await updateAnalysis(
          normativeId,
          {
            analysis_stage:
              "EXTRACTING",

            analysis_progress:
              progress,

            analysis_details: {
              total_pages:
                totalPages,

              pages_analyzed:
                pageNumber,

              total_chars_so_far:
                totalChars,
            },
          }
        );
      }
    }

    // =====================================================
    // 7. DETECCIÓN DE CALIDAD
    // =====================================================

    await updateAnalysis(
      normativeId,
      {
        analysis_stage:
          "SCAN_DETECTION",

        analysis_progress:
          88,

        analysis_details: {
          total_pages:
            totalPages,

          pages_analyzed:
            totalPages,

          total_chars:
            totalChars,

          pages_with_useful_text:
            usefulTextPages,

          low_text_pages:
            lowTextPages,

          empty_text_pages:
            emptyTextPages,
        },
      }
    );

    // =====================================================
    // 8. EVALUAR DIRECT / OCR
    // =====================================================

    await updateAnalysis(
      normativeId,
      {
        analysis_stage:
          "EVALUATING",

        analysis_progress:
          94,
      }
    );

    const result =
      buildRecommendation({
        totalPages,
        totalChars,
        usefulTextPages,
        lowTextPages,
        emptyTextPages,
      });

    const analyzedAt =
      new Date().toISOString();

    const finalDetails = {
      ...result.metrics,

      analyzed_at:
        analyzedAt,

      engine:
        "unpdf",

      analysis_version:
        "1.0",

      thresholds: {
        empty_text_max_chars:
          20,

        useful_text_min_chars:
          100,

        direct_good_average_chars:
          250,

        reference_chars_per_page:
          700,
      },

      pages:
        pageStats,
    };

    // =====================================================
    // 9. GUARDAR RESULTADO
    // =====================================================

    await updateAnalysis(
      normativeId,
      {
        status:
          "READY_TO_PROCESS",

        analysis_stage:
          "COMPLETED",

        analysis_progress:
          100,

        processing_recommended:
          result.recommendation,

        /*
         * processing_selected queda intacto.
         *
         * El administrador debe aceptar
         * DIRECT u OCR.
         */

        analysis_confidence:
          result.confidence,

        analysis_reason:
          result.reason,

        analysis_details:
          finalDetails,

        analyzed_at:
          analyzedAt,

        error_message:
          null,
      }
    );

    try {
      await pdf.destroy();
      pdf = null;
    } catch {
      // No crítico.
    }

    return Response.json({
      ok: true,

      normative_id:
        normative.id,

      filename:
        normative.original_filename,

      recommendation:
        result.recommendation,

      confidence:
        result.confidence,

      reason:
        result.reason,

      metrics:
        result.metrics,

      processing_selected:
        normative
          .processing_selected ??
        null,

      requires_admin_confirmation:
        true,
    });
  } catch (error) {
    console.error(
      "Normative analysis error:",
      error
    );

    if (pdf) {
      try {
        await pdf.destroy();
      } catch {
        // No crítico.
      }
    }

    try {
      await updateAnalysis(
        normativeId,
        {
          status:
            "ERROR",

          analysis_stage:
            "ERROR",

          error_message:
            error?.message ||
            "Error desconocido durante el análisis",
        }
      );
    } catch (updateError) {
      console.error(
        "No se pudo guardar el error:",
        updateError
      );
    }

    return Response.json(
      {
        ok: false,

        normative_id:
          normativeId,

        error:
          error?.message ||
          "Error desconocido durante el análisis",
      },
      {
        status: 500,
      }
    );
  }
}