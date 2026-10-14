import crypto from "crypto";

import {
  supabaseAdmin,
} from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFileName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// =========================================================
// GET - LISTAR NORMATIVAS DE UNA OBRA SOCIAL
// =========================================================

export async function GET(
  request,
  { params }
) {
  try {
    const { id } = await params;

    const socialWorkId =
      Number(id);

    if (
      !Number.isInteger(
        socialWorkId
      ) ||
      socialWorkId <= 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "ID de obra social inválido",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: relations,
      error,
    } =
      await supabaseAdmin
        .from(
          "normative_social_works"
        )
        .select(`
          id,
          normative_id,
          social_work_id,
          is_primary,
          notes,
          billing_channel_id,
          document_role,
          scope_id,
          created_at,

          normatives!inner (
            id,
            title,
            original_filename,
            mime_type,
            file_size_bytes,
            storage_path_original,
            storage_path_processed,
            processing_recommended,
            processing_selected,
            analysis_confidence,
            analysis_reason,
            status,
            version,
            effective_from,
            effective_to,
            is_current,
            openai_status,
            source_url,
            source_system,
            source_modified_at,
            document_kind,
            created_at,
            updated_at
          ),

          billing_channels (
            id,
            code,
            name
          ),

          social_work_scopes (
            id,
            code,
            name,
            description,
            active
          )
        `)
        .eq(
          "social_work_id",
          socialWorkId
        )
        .eq(
          "normatives.is_current",
          true
        )
        .order(
          "id",
          {
            ascending: false,
          }
        );

    if (error) {
      console.error(
        "GET social work normatives error:",
        error
      );

      return Response.json(
        {
          ok: false,
          error:
            error.message ||
            "No se pudieron cargar las normativas",
        },
        {
          status: 500,
        }
      );
    }

    const normatives =
      (relations || [])
        .map(
          (relation) => {
            const normative =
              relation.normatives;

            if (!normative) {
              return null;
            }

            return {
              ...normative,

              relation: {
                id:
                  relation.id,

                normative_id:
                  relation.normative_id,

                social_work_id:
                  relation.social_work_id,

                is_primary:
                  relation.is_primary,

                document_role:
                  relation.document_role,

                billing_channel_id:
                  relation.billing_channel_id,

                billing_channel:
                  relation.billing_channels ||
                  null,

                scope_id:
                  relation.scope_id,

                scope:
                  relation.social_work_scopes ||
                  null,

                notes:
                  relation.notes,

                created_at:
                  relation.created_at,
              },
            };
          }
        )
        .filter(Boolean);

    return Response.json({
      ok: true,
      count:
        normatives.length,
      normatives,
    });
  } catch (error) {
    console.error(
      "GET /api/social-works/[id]/normatives error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error cargando normativas",
      },
      {
        status: 500,
      }
    );
  }
}

// =========================================================
// POST - CARGAR NUEVA NORMATIVA
// =========================================================

export async function POST(
  request,
  { params }
) {
  try {
    const { id } =
      await params;

    const socialWorkId =
      Number(id);

    if (
      !Number.isInteger(
        socialWorkId
      ) ||
      socialWorkId <= 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "ID de obra social inválido",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // VALIDAR OBRA SOCIAL
    // =====================================================

    const {
      data: socialWork,
      error: socialWorkError,
    } =
      await supabaseAdmin
        .from("social_works")
        .select(`
          id,
          id_soft,
          name
        `)
        .eq(
          "id",
          socialWorkId
        )
        .single();

    if (
      socialWorkError ||
      !socialWork
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Obra social no encontrada",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // FORM DATA
    // =====================================================

    const formData =
      await request.formData();

    const file =
      formData.get("file");

    const title =
      String(
        formData.get("title") ||
          ""
      ).trim();

    const documentKind =
      String(
        formData.get(
          "documentKind"
        ) || "INITIAL"
      )
        .trim()
        .toUpperCase();

    const isPrimary =
      String(
        formData.get(
          "isPrimary"
        ) || "false"
      ) === "true";

    const scopeIdRaw =
      String(
        formData.get(
          "scopeId"
        ) || ""
      ).trim();

    const effectiveFromRaw =
      String(
        formData.get(
          "effectiveFrom"
        ) || ""
      ).trim();

    const notes =
      String(
        formData.get("notes") ||
          ""
      ).trim();

    // =====================================================
    // VALIDACIONES
    // =====================================================

    if (!title) {
      return Response.json(
        {
          ok: false,
          error:
            "El título es obligatorio",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !file ||
      typeof file.arrayBuffer !==
        "function"
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Debe seleccionar un archivo",
        },
        {
          status: 400,
        }
      );
    }

    const allowedDocumentKinds =
      [
        "INITIAL",
        "FULL_REPLACEMENT",
        "AMENDMENT",
        "CIRCULAR",
      ];

    if (
      !allowedDocumentKinds.includes(
        documentKind
      )
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Tipo de documento inválido",
        },
        {
          status: 400,
        }
      );
    }

    let scopeId =
      null;

    if (!isPrimary) {
      scopeId =
        Number(
          scopeIdRaw
        );

      if (
        !Number.isInteger(
          scopeId
        ) ||
        scopeId <= 0
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Las normativas Extra requieren seleccionar un alcance",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: scope,
        error: scopeError,
      } =
        await supabaseAdmin
          .from(
            "social_work_scopes"
          )
          .select(`
            id,
            social_work_id,
            active
          `)
          .eq(
            "id",
            scopeId
          )
          .eq(
            "social_work_id",
            socialWorkId
          )
          .eq(
            "active",
            true
          )
          .maybeSingle();

      if (scopeError) {
        throw new Error(
          scopeError.message
        );
      }

      if (!scope) {
        return Response.json(
          {
            ok: false,
            error:
              "El alcance seleccionado no pertenece a esta obra social o está inactivo",
          },
          {
            status: 400,
          }
        );
      }
    }

    let effectiveFrom =
      null;

    if (effectiveFromRaw) {
      const date =
        new Date(
          `${effectiveFromRaw}T00:00:00`
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Fecha de vigencia inválida",
          },
          {
            status: 400,
          }
        );
      }

      effectiveFrom =
        effectiveFromRaw;
    }

    // =====================================================
    // LEER ARCHIVO
    // =====================================================

    const buffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    if (
      buffer.length === 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "El archivo está vacío",
        },
        {
          status: 400,
        }
      );
    }

    const sha256 =
      crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");

    const originalFileName =
      String(
        file.name ||
          "documento"
      );

    const safeFileName =
      sanitizeFileName(
        originalFileName
      ) || "documento";

    const folderName =
      sanitizeFileName(
        socialWork.name
      ) ||
      `obra-social-${socialWorkId}`;

    const sourceId =
      socialWork.id_soft ||
      socialWork.id;

    const storagePath =
      `obras-sociales/${sourceId}/${folderName}/${sha256}/${safeFileName}`;

    // =====================================================
    // EVITAR DUPLICADO
    // =====================================================

    const {
      data:
        existingNormative,
      error: existingError,
    } =
      await supabaseAdmin
        .from("normatives")
        .select(`
          id,
          title,
          sha256,
          storage_path_original
        `)
        .eq(
          "sha256",
          sha256
        )
        .maybeSingle();

    if (
      existingError
    ) {
      throw new Error(
        existingError.message
      );
    }

    if (
      existingNormative
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Este archivo ya existe en el sistema",
          existing_normative:
            existingNormative,
        },
        {
          status: 409,
        }
      );
    }

    // =====================================================
    // SUBIR STORAGE
    // =====================================================

    const {
      error: uploadError,
    } =
      await supabaseAdmin
        .storage
        .from(
          "normativas-originales"
        )
        .upload(
          storagePath,
          buffer,
          {
            contentType:
              file.type ||
              "application/octet-stream",
            upsert: false,
          }
        );

    if (
      uploadError
    ) {
      throw new Error(
        uploadError.message
      );
    }

    // =====================================================
    // CREAR NORMATIVA
    // =====================================================

    const {
      data: normative,
      error: normativeError,
    } =
      await supabaseAdmin
        .from("normatives")
        .insert({
          title,

          original_filename:
            originalFileName,

          mime_type:
            file.type ||
            null,

          file_size_bytes:
            buffer.length,

          storage_path_original:
            storagePath,

          storage_path_processed:
            null,

          sha256,

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

          version: 1,

          effective_from:
            effectiveFrom,

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
            null,

          source_system:
            "GDP_SOFT",

          source_modified_at:
            null,

          source_metadata: {
            uploaded_from:
              "ADMIN",

            social_work_id:
              socialWorkId,

            social_work_name:
              socialWork.name,

            scope_id:
              scopeId,
          },

          document_kind:
            documentKind,

          supersedes_normative_id:
            null,

          change_summary:
            null,

          approved_by:
            null,

          approved_at:
            null,

          analysis_stage:
            "PENDING_ANALYSIS",

          analysis_progress:
            0,
        })
        .select(`
          id,
          title,
          original_filename,
          status,
          version,
          is_current,
          document_kind,
          storage_path_original,
          analysis_stage,
          analysis_progress,
          created_at
        `)
        .single();

    if (
      normativeError
    ) {
      await supabaseAdmin
        .storage
        .from(
          "normativas-originales"
        )
        .remove([
          storagePath,
        ]);

      throw new Error(
        normativeError.message
      );
    }

    // =====================================================
    // RELACIÓN
    // =====================================================

    const {
      data: relation,
      error: relationError,
    } =
      await supabaseAdmin
        .from(
          "normative_social_works"
        )
        .insert({
          normative_id:
            normative.id,

          social_work_id:
            socialWorkId,

          is_primary:
            isPrimary,

          notes:
            notes ||
            null,

          billing_channel_id:
            null,

          document_role:
            isPrimary
              ? "PRIMARY"
              : "EXTRA",

          scope_id:
            isPrimary
              ? null
              : scopeId,
        })
        .select(`
          id,
          normative_id,
          social_work_id,
          is_primary,
          document_role,
          scope_id,
          notes,
          created_at
        `)
        .single();

    if (
      relationError
    ) {
      await supabaseAdmin
        .from(
          "normatives"
        )
        .delete()
        .eq(
          "id",
          normative.id
        );

      await supabaseAdmin
        .storage
        .from(
          "normativas-originales"
        )
        .remove([
          storagePath,
        ]);

      throw new Error(
        relationError.message
      );
    }

    return Response.json(
      {
        ok: true,
        normative,
        relation,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Normative upload error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error cargando normativa",
      },
      {
        status: 500,
      }
    );
  }
}