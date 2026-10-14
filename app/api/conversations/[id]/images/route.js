import crypto from "crypto";

import {
  supabaseAdmin,
} from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "assistant-images";

const MAX_FILE_SIZE =
  10 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

// =========================================================
// SANITIZAR NOMBRE
// =========================================================

function sanitizeFileName(
  value = "imagen"
) {
  const cleaned =
    String(value)
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^[-.]+|[-.]+$/g,
        ""
      );

  return (
    cleaned ||
    "imagen.jpg"
  );
}

// =========================================================
// CARGAR CONVERSACIÓN
// =========================================================

async function loadConversation(
  conversationId
) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("conversations")
    .select(`
      id,
      user_id,
      branch_id,
      device_id,
      active_social_work_id,
      active_billing_channel_id,
      closed_at
    `)
    .eq(
      "id",
      conversationId
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}

// =========================================================
// CREAR URL TEMPORAL
// =========================================================

async function createPreviewUrl(
  storagePath
) {
  if (!storagePath) {
    return null;
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .createSignedUrl(
      storagePath,
      60 * 10
    );

  if (error) {
    console.error(
      "createPreviewUrl:",
      error.message
    );

    return null;
  }

  return (
    data?.signedUrl ||
    null
  );
}

// =========================================================
// GET
// LISTAR IMÁGENES DE LA CONVERSACIÓN
// =========================================================

export async function GET(
  request,
  { params }
) {
  try {
    const { id } =
      await params;

    const conversationId =
      String(
        id || ""
      ).trim();

    if (!conversationId) {
      return Response.json(
        {
          ok: false,
          error:
            "Falta conversationId",
          code:
            "CONVERSATION_REQUIRED",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // VALIDAR CONVERSACIÓN
    // =====================================================

    const conversation =
      await loadConversation(
        conversationId
      );

    if (!conversation) {
      return Response.json(
        {
          ok: false,
          error:
            "Conversación no encontrada",
          code:
            "CONVERSATION_NOT_FOUND",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // OBTENER IMÁGENES
    // =====================================================

    const {
      data: images,
      error,
    } = await supabaseAdmin
      .from(
        "conversation_images"
      )
      .select(`
        id,
        conversation_id,
        branch_id,
        device_id,
        storage_path,
        original_filename,
        mime_type,
        file_size_bytes,
        status,
        is_active,
        analysis,
        analysis_error,
        created_at,
        updated_at
      `)
      .eq(
        "conversation_id",
        conversationId
      )
      .is(
        "deleted_at",
        null
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      throw new Error(
        error.message
      );
    }

    // =====================================================
    // GENERAR URLs TEMPORALES
    // =====================================================

    const result = [];

    for (
      const image of
        images || []
    ) {
      const previewUrl =
        await createPreviewUrl(
          image.storage_path
        );

      result.push({
        ...image,
        preview_url:
          previewUrl,
      });
    }

    return Response.json({
      ok: true,

      conversation: {
        id:
          conversation.id,

        branch_id:
          conversation.branch_id,

        device_id:
          conversation.device_id,

        social_work_id:
          conversation
            .active_social_work_id,
      },

      images:
        result,
    });
  } catch (error) {
    console.error(
      "GET conversation images:",
      error
    );

    return Response.json(
      {
        ok: false,

        error:
          error?.message ||
          "No se pudieron cargar las imágenes.",

        code:
          "IMAGE_LIST_ERROR",
      },
      {
        status: 500,
      }
    );
  }
}

// =========================================================
// POST
// SUBIR IMAGEN
// =========================================================

export async function POST(
  request,
  { params }
) {
  let uploadedPath =
    null;

  try {
    const { id } =
      await params;

    const conversationId =
      String(
        id || ""
      ).trim();

    if (!conversationId) {
      return Response.json(
        {
          ok: false,
          error:
            "Falta conversationId",
          code:
            "CONVERSATION_REQUIRED",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // CONVERSACIÓN
    // =====================================================

    const conversation =
      await loadConversation(
        conversationId
      );

    if (!conversation) {
      return Response.json(
        {
          ok: false,

          error:
            "Conversación no encontrada",

          code:
            "CONVERSATION_NOT_FOUND",
        },
        {
          status: 404,
        }
      );
    }

    if (
      conversation.closed_at
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "La conversación está cerrada",

          code:
            "CONVERSATION_CLOSED",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * IMPORTANTE:
     *
     * branch_id y device_id NO vienen
     * del frontend.
     *
     * Se obtienen de la conversación.
     */

    if (
      !conversation.branch_id
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "La conversación no tiene una sucursal asociada.",

          code:
            "BRANCH_REQUIRED",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !conversation.device_id
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "La conversación no tiene un dispositivo asociado.",

          code:
            "DEVICE_REQUIRED",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // FORM DATA
    // =====================================================

    const formData =
      await request.formData();

    const file =
      formData.get(
        "file"
      );

    if (
      !file ||
      typeof file ===
        "string"
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "Falta la imagen.",

          code:
            "IMAGE_REQUIRED",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // MIME
    // =====================================================

    const mimeType =
      String(
        file.type || ""
      )
        .toLowerCase()
        .trim();

    if (
      !ALLOWED_MIME_TYPES.has(
        mimeType
      )
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "Formato no permitido. Usá JPG, PNG o WEBP.",

          code:
            "INVALID_IMAGE_TYPE",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // TAMAÑO
    // =====================================================

    const fileSize =
      Number(
        file.size || 0
      );

    if (
      !fileSize
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "La imagen está vacía.",

          code:
            "EMPTY_IMAGE",
        },
        {
          status: 400,
        }
      );
    }

    if (
      fileSize >
      MAX_FILE_SIZE
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "La imagen supera el límite de 10 MB.",

          code:
            "IMAGE_TOO_LARGE",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // NOMBRE / EXTENSIÓN
    // =====================================================

    const originalFilename =
      sanitizeFileName(
        file.name ||
          "receta.jpg"
      );

    let extension =
      "jpg";

    if (
      mimeType ===
      "image/png"
    ) {
      extension =
        "png";
    }

    if (
      mimeType ===
      "image/webp"
    ) {
      extension =
        "webp";
    }

    const fileId =
      crypto.randomUUID();

    const storagePath =
      `conversation-images/${conversationId}/${fileId}.${extension}`;

    // =====================================================
    // BUFFER
    // =====================================================

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    // =====================================================
    // SUBIR STORAGE PRIVADO
    // =====================================================

    const {
      error:
        uploadError,
    } =
      await supabaseAdmin
        .storage
        .from(BUCKET)
        .upload(
          storagePath,
          buffer,
          {
            contentType:
              mimeType,

            upsert:
              false,

            cacheControl:
              "3600",
          }
        );

    if (uploadError) {
      throw new Error(
        uploadError.message
      );
    }

    uploadedPath =
      storagePath;

    // =====================================================
    // DESACTIVAR IMAGEN ANTERIOR
    // =====================================================

    const {
      error:
        deactivateError,
    } =
      await supabaseAdmin
        .from(
          "conversation_images"
        )
        .update({
          is_active:
            false,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "conversation_id",
          conversationId
        )
        .eq(
          "is_active",
          true
        )
        .is(
          "deleted_at",
          null
        );

    if (deactivateError) {
      /*
       * No detenemos la carga,
       * pero dejamos registrado
       * el problema.
       */
      console.error(
        "Deactivate previous images:",
        deactivateError.message
      );
    }

    // =====================================================
    // INSERT DB
    // =====================================================

    const {
      data: image,
      error:
        insertError,
    } =
      await supabaseAdmin
        .from(
          "conversation_images"
        )
        .insert({
          id:
            fileId,

          conversation_id:
            conversationId,

          branch_id:
            conversation.branch_id,

          device_id:
            conversation.device_id,

          storage_path:
            storagePath,

          original_filename:
            originalFilename,

          mime_type:
            mimeType,

          file_size_bytes:
            fileSize,

          status:
            "UPLOADED",

          is_active:
            true,
        })
        .select(`
          id,
          conversation_id,
          branch_id,
          device_id,
          storage_path,
          original_filename,
          mime_type,
          file_size_bytes,
          status,
          is_active,
          created_at,
          updated_at
        `)
        .single();

    if (insertError) {
      throw new Error(
        insertError.message
      );
    }

    // =====================================================
    // PREVIEW TEMPORAL
    // =====================================================

    const previewUrl =
      await createPreviewUrl(
        storagePath
      );

    // =====================================================
    // TOUCH CONVERSATION
    // =====================================================

    const {
      error:
        touchError,
    } =
      await supabaseAdmin
        .from(
          "conversations"
        )
        .update({
          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          conversationId
        );

    if (touchError) {
      console.error(
        "Conversation touch:",
        touchError.message
      );
    }

    // =====================================================
    // RESPUESTA
    // =====================================================

    return Response.json({
      ok: true,

      image: {
        ...image,

        preview_url:
          previewUrl,
      },

      context: {
        conversation_id:
          conversationId,

        branch_id:
          conversation.branch_id,

        device_id:
          conversation.device_id,

        social_work_id:
          conversation
            .active_social_work_id,
      },
    });
  } catch (error) {
    console.error(
      "POST conversation image:",
      error
    );

    /*
     * Si Storage se completó pero
     * la DB falló, eliminamos
     * el archivo para evitar basura.
     */

    if (uploadedPath) {
      try {
        await supabaseAdmin
          .storage
          .from(BUCKET)
          .remove([
            uploadedPath,
          ]);
      } catch (
        cleanupError
      ) {
        console.error(
          "Image cleanup:",
          cleanupError
        );
      }
    }

    return Response.json(
      {
        ok: false,

        error:
          error?.message ||
          "No se pudo subir la imagen.",

        code:
          "IMAGE_UPLOAD_ERROR",
      },
      {
        status: 500,
      }
    );
  }
}