import { requireActor } from "../../../../lib/decision-trees/auth";
import OpenAI, { toFile } from "openai";
import { isSpreadsheetFile } from "../../../../lib/normatives/spreadsheet-text.mjs";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ORIGINAL_BUCKET = "normativas-originales";
const PROCESSED_BUCKET = "normativas-procesadas";

async function updateNormative(normativeId, values) {
  const { error } = await supabaseAdmin
    .from("normatives")
    .update(values)
    .eq("id", normativeId);

  if (error) {
    throw new Error(
      `No se pudo actualizar la normativa: ${error.message}`
    );
  }
}

export async function POST(request) {
  const access = await requireActor(request, true);
  if (access.error) return access.error;
  const url = new URL(request.url);

  const normativeId = Number(
    url.searchParams.get("normativeId")
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

  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        ok: false,
        error: "Falta OPENAI_API_KEY",
      },
      {
        status: 500,
      }
    );
  }

  if (!process.env.OPENAI_VECTOR_STORE_ID) {
    return Response.json(
      {
        ok: false,
        error: "Falta OPENAI_VECTOR_STORE_ID",
      },
      {
        status: 500,
      }
    );
  }

  const vectorStoreId =
    process.env.OPENAI_VECTOR_STORE_ID;

  let currentOpenAIFileId = null;

  try {
    // =====================================================
    // 1. OBTENER NORMATIVA
    // =====================================================

    const {
      data: normative,
      error: normativeError,
    } = await supabaseAdmin
      .from("normatives")
      .select(`
        id,
        title,
        original_filename,
        mime_type,
        status,
        version,
        is_current,
        document_kind,

        storage_path_original,
        storage_path_processed,

        processing_recommended,
        processing_selected,

        source_system,

        openai_file_id,
        openai_vector_store_file_id,
        openai_vector_store_id,
        openai_status
      `)
      .eq("id", normativeId)
      .single();

    if (normativeError) {
      throw new Error(
        normativeError.message
      );
    }

    // =====================================================
    // 2. VALIDACIONES
    // =====================================================

    if (!normative.processing_selected) {
      return Response.json(
        {
          ok: false,
          error:
            "El administrador todavía no confirmó DIRECT u OCR",
        },
        {
          status: 409,
        }
      );
    }

    if (
      !["DIRECT", "OCR"].includes(
        normative.processing_selected
      )
    ) {
      return Response.json(
        {
          ok: false,
          error:
            `Modo de procesamiento inválido: ${normative.processing_selected}`,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Si ya quedó indexado correctamente,
     * no lo volvemos a subir.
     */
    if (
      normative.status === "INDEXED" &&
      normative.openai_status === "completed" &&
      normative.openai_vector_store_id === vectorStoreId &&
      normative.openai_file_id
    ) {
      return Response.json({
        ok: true,
        already_indexed: true,
        normative_id: normative.id,
        openai_file_id:
          normative.openai_file_id,
        vector_store_id:
          normative.openai_vector_store_id,
        message:
          "La normativa ya está indexada en OpenAI",
      });
    }

    // =====================================================
    // 3. ELEGIR ARCHIVO SEGÚN DIRECT / OCR
    // =====================================================

    let bucket;
    let storagePath;
    let filename;
    let mimeType;

    if (
      normative.processing_selected === "DIRECT"
    ) {
      bucket =
        ORIGINAL_BUCKET;

      storagePath =
        normative.storage_path_original;

      filename =
        normative.original_filename;

      mimeType =
        normative.mime_type ||
        "application/pdf";

      // v3.13.47 — planillas Excel: se indexa el texto generado en el análisis.
      if (
        isSpreadsheetFile(normative.original_filename) &&
        normative.storage_path_processed
      ) {
        bucket = PROCESSED_BUCKET;
        storagePath = normative.storage_path_processed;
        filename = `${normative.original_filename}.txt`;
        mimeType = "text/plain";
      }
    } else {
      /*
       * OCR:
       * en una próxima etapa generaremos un TXT/PDF procesado
       * y lo almacenaremos en normativas-procesadas.
       */
      bucket =
        PROCESSED_BUCKET;

      storagePath =
        normative.storage_path_processed;

      filename =
        `${normative.original_filename}__OCR.txt`;

      mimeType =
        "text/plain";

      if (!storagePath) {
        return Response.json(
          {
            ok: false,
            error:
              "La normativa está configurada como OCR pero todavía no existe un archivo procesado",
          },
          {
            status: 409,
          }
        );
      }
    }

    if (!storagePath) {
      throw new Error(
        "La normativa no tiene archivo disponible para procesar"
      );
    }

    // =====================================================
    // 4. MARCAR COMO PROCESSING
    // =====================================================

    await updateNormative(
      normativeId,
      {
        status: "PROCESSING",
        openai_vector_store_id:
          vectorStoreId,
        openai_status:
          "preparing",
        error_message:
          null,
      }
    );

    // =====================================================
    // 5. DESCARGAR ARCHIVO DESDE SUPABASE
    // =====================================================

    const {
      data: fileBlob,
      error: downloadError,
    } =
      await supabaseAdmin.storage
        .from(bucket)
        .download(storagePath);

    if (downloadError) {
      throw new Error(
        `No se pudo descargar el archivo desde Supabase: ${downloadError.message}`
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

    if (!bytes.length) {
      throw new Error(
        "El archivo descargado está vacío"
      );
    }

    // =====================================================
    // 6. OBTENER RELACIONES CON OOSS
    // =====================================================

    const {
      data: relations,
      error: relationsError,
    } = await supabaseAdmin
      .from("normative_social_works")
      .select(`
        social_work_id,
        billing_channel_id
      `)
      .eq(
        "normative_id",
        normativeId
      );

    if (relationsError) {
      throw new Error(
        relationsError.message
      );
    }

    /*
     * Solamente agregamos social_work_id como atributo
     * directo cuando el documento pertenece a UNA sola OOSS.
     *
     * Esto evita guardar metadata incorrecta cuando una misma
     * normativa pertenece a varias obras sociales.
     */
    let singleSocialWork = null;

    if (
      Array.isArray(relations) &&
      relations.length === 1
    ) {
      const {
        data: sw,
        error: swError,
      } = await supabaseAdmin
        .from("social_works")
        .select(`
          id,
          id_soft,
          name
        `)
        .eq(
          "id",
          relations[0].social_work_id
        )
        .single();

      if (swError) {
        throw new Error(
          swError.message
        );
      }

      singleSocialWork = {
        ...sw,
        billing_channel_id:
          relations[0].billing_channel_id,
      };
    }

    // =====================================================
    // 7. SUBIR ARCHIVO A OPENAI
    // =====================================================

    let openAIFileId =
      normative.openai_file_id;

    if (!openAIFileId) {
      const uploadable =
        await toFile(
          bytes,
          filename,
          {
            type: mimeType,
          }
        );

      const openAIFile =
        await openai.files.create({
          file: uploadable,
          purpose: "user_data",
        });

      openAIFileId =
        openAIFile.id;

      currentOpenAIFileId =
        openAIFileId;

      /*
       * Guardamos inmediatamente el ID.
       * Si falla la indexación después,
       * no perdemos trazabilidad del archivo subido.
       */
      await updateNormative(
        normativeId,
        {
          openai_file_id:
            openAIFileId,

          openai_vector_store_id:
            vectorStoreId,

          openai_status:
            "uploaded",
        }
      );
    } else {
      currentOpenAIFileId =
        openAIFileId;
    }

    // =====================================================
    // 8. METADATA DEL VECTOR STORE
    // =====================================================

    const attributes = {
      normative_id:
        normative.id,

      version:
        normative.version,

      is_current:
        Boolean(
          normative.is_current
        ),

      processing_mode:
        normative.processing_selected,

      source_system:
        normative.source_system ||
        "UNKNOWN",
    };

    if (normative.document_kind) {
      attributes.document_kind =
        normative.document_kind;
    }

    /*
     * Solo agregamos datos de OOSS cuando el archivo
     * pertenece inequívocamente a una sola.
     */
    if (singleSocialWork) {
      attributes.social_work_id =
        singleSocialWork.id;

      if (
        singleSocialWork.id_soft !==
        null
      ) {
        attributes.id_soft =
          singleSocialWork.id_soft;
      }

      if (
        singleSocialWork.billing_channel_id !==
        null
      ) {
        attributes.billing_channel_id =
          singleSocialWork.billing_channel_id;
      }
    }

    // =====================================================
    // 9. ASOCIAR AL VECTOR STORE + ESPERAR INDEXACIÓN
    // =====================================================

    let vectorStoreFile;

    /*
     * Si ya existe una asociación previa,
     * primero comprobamos su estado.
     */
    if (
      normative.openai_vector_store_file_id
    ) {
      vectorStoreFile =
        await openai.vectorStores.files.retrieve(
          normative.openai_vector_store_file_id,
          {
            vector_store_id:
              vectorStoreId,
          }
        );

      if (
        vectorStoreFile.status ===
        "in_progress"
      ) {
        vectorStoreFile =
          await openai.vectorStores.files.poll(
            vectorStoreId,
            vectorStoreFile.id,
            {
              pollIntervalMs: 1000,
            }
          );
      }
    } else {
      vectorStoreFile =
        await openai.vectorStores.files.createAndPoll(
          vectorStoreId,
          {
            file_id:
              openAIFileId,

            attributes,
          },
          {
            pollIntervalMs:
              1000,
          }
        );

      /*
       * Guardamos la asociación.
       */
      await updateNormative(
        normativeId,
        {
          openai_vector_store_file_id:
            vectorStoreFile.id,

          openai_status:
            vectorStoreFile.status,
        }
      );
    }

    // =====================================================
    // 10. VERIFICAR RESULTADO
    // =====================================================

    if (
      vectorStoreFile.status !==
      "completed"
    ) {
      const openAIError =
        vectorStoreFile
          .last_error
          ?.message ||
        `La indexación terminó con estado ${vectorStoreFile.status}`;

      await updateNormative(
        normativeId,
        {
          status: "ERROR",

          openai_status:
            vectorStoreFile.status,

          openai_vector_store_file_id:
            vectorStoreFile.id,

          error_message:
            openAIError,
        }
      );

      return Response.json(
        {
          ok: false,

          normative_id:
            normativeId,

          openai_file_id:
            openAIFileId,

          vector_store_file_id:
            vectorStoreFile.id,

          vector_store_id:
            vectorStoreId,

          status:
            vectorStoreFile.status,

          error:
            openAIError,
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // 11. INDEXACIÓN COMPLETADA
    // =====================================================

    await updateNormative(
      normativeId,
      {
        status:
          "INDEXED",

        openai_file_id:
          openAIFileId,

        openai_vector_store_file_id:
          vectorStoreFile.id,

        openai_vector_store_id:
          vectorStoreId,

        openai_status:
          "completed",

        error_message:
          null,
      }
    );

    return Response.json({
      ok: true,

      message:
        "Normativa indexada correctamente en OpenAI",

      normative_id:
        normative.id,

      filename,

      processing_mode:
        normative.processing_selected,

      openai_file_id:
        openAIFileId,

      vector_store_file_id:
        vectorStoreFile.id,

      vector_store_id:
        vectorStoreId,

      openai_status:
        "completed",

      attributes,

      already_indexed:
        false,
    });
  } catch (error) {
    console.error(
      "Normative processing error:",
      error
    );

    try {
      await updateNormative(
        normativeId,
        {
          status:
            "ERROR",

          openai_status:
            "error",

          error_message:
            error?.message ||
            "Error desconocido procesando normativa",
        }
      );
    } catch (
      updateError
    ) {
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

        openai_file_id:
          currentOpenAIFileId,

        error:
          error?.message ||
          "Error desconocido procesando normativa",
      },
      {
        status: 500,
      }
    );
  }
}