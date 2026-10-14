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

  if (!rule) {
    return {
      ok: true,
      resolved: false,
      source: "NONE",
      branch,
      socialWork,
      operation: null,
      rule: null,
    };
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

      canReceive:
        rule.can_receive,

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
        allDay:
          rule.reception_all_day,

        until:
          rule.reception_until,
      },
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