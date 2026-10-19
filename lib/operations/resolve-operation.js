import { resolveDeclaredCircuitPolicy } from "./camara-colegio-policy.mjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

function clean(value) {
  return typeof value === "string"
    ? value.trim()
    : value;
}

export async function resolveOperation({
  branchId = null,
  branchCode = null,
  socialWorkId = null,
  socialWorkName = null,
}) {
  branchId =
    branchId !== null
      ? Number(branchId)
      : null;

  socialWorkId =
    socialWorkId !== null
      ? Number(socialWorkId)
      : null;

  branchCode = clean(branchCode);
  socialWorkName = clean(socialWorkName);

  if (!branchId && !branchCode) {
    return {
      ok: false,
      resolved: false,
      error: "BRANCH_REQUIRED",
    };
  }

  if (!socialWorkId && !socialWorkName) {
    return {
      ok: false,
      resolved: false,
      error: "SOCIAL_WORK_REQUIRED",
    };
  }

  // =====================================================
  // SUCURSAL
  // =====================================================

  let branchQuery = supabase
    .from("branches")
    .select(
      "id, name, code, branch_type, active"
    )
    .eq("active", true);

  branchQuery = branchId
    ? branchQuery.eq("id", branchId)
    : branchQuery.eq("code", branchCode);

  const {
    data: branch,
    error: branchError,
  } = await branchQuery.maybeSingle();

  if (branchError) throw branchError;

  if (!branch) {
    return {
      ok: false,
      resolved: false,
      error: "BRANCH_NOT_FOUND",
    };
  }

  // =====================================================
  // OBRA SOCIAL
  // =====================================================

  let socialWorkQuery = supabase
    .from("social_works")
    .select(
      "id, id_soft, name, active"
    )
    .eq("active", true);

  socialWorkQuery = socialWorkId
    ? socialWorkQuery.eq(
        "id",
        socialWorkId
      )
    : socialWorkQuery.ilike(
        "name",
        socialWorkName
      );

  const {
    data: socialWork,
    error: socialWorkError,
  } =
    await socialWorkQuery.maybeSingle();

  if (socialWorkError) {
    throw socialWorkError;
  }

  if (!socialWork) {
    return {
      ok: false,
      resolved: false,
      error: "SOCIAL_WORK_NOT_FOUND",
    };
  }

  // Procedimiento aprobado/suministrado por Farmacias del Plata.
  // No modifica normativas ni convierte el circuito en permiso de dispensación.
  const declaredPolicy = resolveDeclaredCircuitPolicy({
    branchName: branch.name, branchCode: branch.code, socialWorkName: socialWork.name,
  });

  // =====================================================
  // REGLAS
  // =====================================================

  const {
    data: rules,
    error: rulesError,
  } = await supabase
    .from("social_work_operation_rules")
    .select(`
      id,
      social_work_id,
      rule_scope,
      branch_id,
      branch_type,
      operation_mode,
      validator_id,
      validator_branch_id,
      validation_branch_type,
      validator_url,
      validation_instructions,
      presentation_branch_id,
      presentation_branch_type,
      presentation_instructions,
      quick_code,
      operation_summary,
      instructions,
      notes,
      source_type,
      source_reference,
      priority,
      approved_at,
      valid_from,
      valid_to,
      can_receive,
      reception_all_day,
      reception_until
    `)
    .eq(
      "social_work_id",
      socialWork.id
    )
    .eq("approved", true)
    .eq("active", true)
    .order("priority", {
      ascending: false,
    });

  if (rulesError) throw rulesError;

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const activeRules = (
    rules || []
  ).filter((rule) => {
    if (
      rule.valid_from &&
      rule.valid_from > today
    ) {
      return false;
    }

    if (
      rule.valid_to &&
      rule.valid_to < today
    ) {
      return false;
    }

    return true;
  });

  // =====================================================
  // RESOLUCIÓN
  //
  // BRANCH
  // ↓
  // BRANCH_TYPE
  // ↓
  // GLOBAL
  // =====================================================

  const branchRule =
    activeRules.find(
      (rule) =>
        rule.rule_scope === "BRANCH" &&
        Number(rule.branch_id) ===
          Number(branch.id)
    );

  const branchTypeRule =
    activeRules.find(
      (rule) =>
        rule.rule_scope ===
          "BRANCH_TYPE" &&
        rule.branch_type ===
          branch.branch_type
    );

  const globalRule =
    activeRules.find(
      (rule) =>
        rule.rule_scope === "GLOBAL"
    );

  let rule = null;
  let resolutionSource = null;

  if (branchRule) {
    rule = branchRule;
    resolutionSource =
      "BRANCH_OVERRIDE";
  } else if (branchTypeRule) {
    rule = branchTypeRule;
    resolutionSource =
      "BRANCH_TYPE";
  } else if (globalRule) {
    rule = globalRule;
    resolutionSource = "GLOBAL";
  }

  // Hay reglas particulares que no pueden inferirse de un "Cámara/Colegio" genérico.
  // Una discrepancia con una regla activa de Supabase NO se resuelve a ciegas.
  const explicitPolicy = declaredPolicy && declaredPolicy.status !== "GENERAL";
  const policyMode = declaredPolicy?.mode;
  const conflict = Boolean(explicitPolicy && rule &&
    !["UNSPECIFIED", "REVIEW_REQUIRED"].includes(policyMode) &&
    String(rule.operation_mode || "").toUpperCase() !== policyMode);
  if (explicitPolicy && (!rule || conflict || declaredPolicy.status === "AMBIGUOUS")) {
    const needsReview = conflict || declaredPolicy.status === "AMBIGUOUS";
    const reviewExplanation = conflict
      ? `El procedimiento del 15/10/2026 indica ${policyMode}, pero Supabase tiene ${rule.operation_mode}. Requiere revisión administrativa.`
      : declaredPolicy.notes;
    return {
      ok:true, resolved:true, source:needsReview ? "POLICY_REVIEW_REQUIRED" : "DECLARED_PROCEDURE",
      branch:{id:branch.id,code:branch.code,name:branch.name,type:branch.branch_type},
      socialWork:{id:socialWork.id,idSoft:socialWork.id_soft,name:socialWork.name},
      operation:{
        mode:needsReview ? "REVIEW_REQUIRED" : policyMode,
        canReceive:needsReview ? null : declaredPolicy.canReceive,
        summary:null, instructions:reviewExplanation || null,
        validation:{validatorBranch:declaredPolicy.validatorBranchName
          ? {name:declaredPolicy.validatorBranchName} : null,
          branchType:null,instructions:null},
        presentation:{branch:null,branchType:null,instructions:null},
        reception:{allDay:declaredPolicy.allDay,until:declaredPolicy.until},
        policyNotes:reviewExplanation || declaredPolicy.notes || null,
      },
      rule:{id:rule?.id ?? null,scope:rule?.rule_scope || "GDP_PROCEDURE",
        priority:rule?.priority ?? null,sourceReference:declaredPolicy.sourceReference},
    };
  }
  if (!rule) {
    // El procedimiento general solo informa sobre Cámara–Colegio; no habilita
    // automáticamente a recibir cualquier OOSS ni conoce su validador exacto.
    if (declaredPolicy) {
      return {
        ok:true, resolved:true, source:"DECLARED_PROCEDURE_GENERAL",
        branch:{id:branch.id,code:branch.code,name:branch.name,type:branch.branch_type},
        socialWork:{id:socialWork.id,idSoft:socialWork.id_soft,name:socialWork.name},
        operation:{mode:declaredPolicy.mode,canReceive:declaredPolicy.canReceive,
          summary:null,instructions:null,
          validation:{validatorBranch:null,branchType:null,instructions:null},
          presentation:{branch:null,branchType:null,instructions:null},
          reception:{allDay:declaredPolicy.allDay,until:declaredPolicy.until},
          policyNotes:declaredPolicy.notes},
        rule:{id:null,scope:"GDP_PROCEDURE",sourceReference:declaredPolicy.sourceReference},
      };
    }
    return {ok:true,resolved:false,source:"NONE",branch,socialWork,operation:null,rule:null};
  }

  // =====================================================
  // SUCURSALES RELACIONADAS
  // =====================================================

  const relatedIds = [
    rule.validator_branch_id,
    rule.presentation_branch_id,
  ].filter(Boolean);

  let relatedBranches = [];

  if (relatedIds.length) {
    const {
      data,
      error,
    } = await supabase
      .from("branches")
      .select(
        "id, name, code, branch_type"
      )
      .in("id", relatedIds);

    if (error) throw error;

    relatedBranches = data || [];
  }

  const validatorBranch =
    rule.validator_branch_id
      ? relatedBranches.find(
          (item) =>
            Number(item.id) ===
            Number(
              rule.validator_branch_id
            )
        ) || null
      : null;

  const presentationBranch =
    rule.presentation_branch_id
      ? relatedBranches.find(
          (item) =>
            Number(item.id) ===
            Number(
              rule.presentation_branch_id
            )
        ) || null
      : null;

  return {
    ok: true,
    resolved: true,

    source: resolutionSource,

    branch: {
      id: branch.id,
      code: branch.code,
      name: branch.name,
      type: branch.branch_type,
    },

    socialWork: {
      id: socialWork.id,
      idSoft: socialWork.id_soft,
      name: socialWork.name,
    },

    operation: {
      mode: rule.operation_mode,

      canReceive:explicitPolicy && declaredPolicy.canReceive !== null
        ? declaredPolicy.canReceive : rule.can_receive,

      summary:
        rule.operation_summary,

      instructions:
        rule.instructions,

      validation: {
        validatorId:
          rule.validator_id,

        validatorUrl:
          rule.validator_url,

        validatorBranch,

        branchType:
          rule.validation_branch_type,

        instructions:
          rule.validation_instructions,
      },

      presentation: {
        branch:
          presentationBranch,

        branchType:
          rule.presentation_branch_type,

        instructions:
          rule.presentation_instructions,
      },

      reception: {
        allDay:declaredPolicy?.mode === "UNSPECIFIED" ? declaredPolicy.allDay : rule.reception_all_day,
        until:declaredPolicy?.mode === "UNSPECIFIED" ? declaredPolicy.until : rule.reception_until,
      },
      policyNotes:declaredPolicy?.status === "GENERAL" ? null : declaredPolicy?.notes || null,
      validatorBranchName:declaredPolicy?.validatorBranchName || null,
    },

    rule: {
      id: rule.id,
      scope: rule.rule_scope,
      priority: rule.priority,

      sourceType:
        rule.source_type,

      sourceReference:
        rule.source_reference,

      approvedAt:
        rule.approved_at,
    },
  };
}