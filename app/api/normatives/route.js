import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/admin";

export async function GET() {
  try {
    const { data, error } =
      await supabaseAdmin
        .from("normatives")
        .select(`
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
          updated_at,

          normative_social_works (
            id,
            normative_id,
            social_work_id,
            is_primary,
            document_role,
            billing_channel_id,
            scope_id,
            notes,

            social_works (
              id,
              name,
              active
            ),

            social_work_scopes (
              id,
              code,
              name,
              description,
              active
            ),

            billing_channels (
              id,
              code,
              name
            )
          )
        `)
        .eq("is_current", true)
        .neq("status", "ARCHIVED")
        .order("updated_at", {
          ascending: false,
        });

    if (error) {
      console.error(
        "GET /api/normatives Supabase error:",
        error
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudieron cargar las normativas",
          details:
            process.env.NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        },
        {
          status: 500,
        }
      );
    }

    const normatives =
      (data || []).map(
        (normative) => {
          const relations =
            normative.normative_social_works ||
            [];

          return {
            id:
              normative.id,

            title:
              normative.title,

            original_filename:
              normative.original_filename,

            mime_type:
              normative.mime_type,

            file_size_bytes:
              normative.file_size_bytes,

            storage_path_original:
              normative.storage_path_original,

            storage_path_processed:
              normative.storage_path_processed,

            processing_recommended:
              normative.processing_recommended,

            processing_selected:
              normative.processing_selected,

            analysis_confidence:
              normative.analysis_confidence,

            analysis_reason:
              normative.analysis_reason,

            status:
              normative.status,

            version:
              normative.version,

            effective_from:
              normative.effective_from,

            effective_to:
              normative.effective_to,

            is_current:
              normative.is_current,

            openai_status:
              normative.openai_status,

            source_url:
              normative.source_url,

            source_system:
              normative.source_system,

            source_modified_at:
              normative.source_modified_at,

            document_kind:
              normative.document_kind,

            created_at:
              normative.created_at,

            updated_at:
              normative.updated_at,

            normative_social_works:
              relations,

            social_works:
              relations
                .map(
                  (
                    relation
                  ) => ({
                    id:
                      relation
                        .social_works
                        ?.id ??
                      relation.social_work_id,

                    name:
                      relation
                        .social_works
                        ?.name ??
                      null,

                    active:
                      relation
                        .social_works
                        ?.active ??
                      null,

                    is_primary:
                      relation.is_primary,

                    document_role:
                      relation.document_role,

                    billing_channel_id:
                      relation.billing_channel_id,

                    billing_channel:
                      relation.billing_channels
                        ? {
                            id:
                              relation
                                .billing_channels
                                .id,

                            code:
                              relation
                                .billing_channels
                                .code,

                            name:
                              relation
                                .billing_channels
                                .name,
                          }
                        : null,

                    scope_id:
                      relation.scope_id,

                    scope:
                      relation.social_work_scopes
                        ? {
                            id:
                              relation
                                .social_work_scopes
                                .id,

                            code:
                              relation
                                .social_work_scopes
                                .code,

                            name:
                              relation
                                .social_work_scopes
                                .name,

                            description:
                              relation
                                .social_work_scopes
                                .description,

                            active:
                              relation
                                .social_work_scopes
                                .active,
                          }
                        : null,

                    notes:
                      relation.notes,
                  })
                )
                .filter(
                  (item) =>
                    item.id != null
                ),
          };
        }
      );

    return NextResponse.json({
      ok: true,
      count:
        normatives.length,
      normatives,
    });
  } catch (error) {
    console.error(
      "GET /api/normatives unexpected error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Error interno al cargar las normativas",
      },
      {
        status: 500,
      }
    );
  }
}