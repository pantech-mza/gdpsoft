import { requireAdminActor, jsonError } from "../../../../lib/server/gdp-actor";
import { collectPagedOpenAIBuckets, MAX_DAILY_BUCKETS } from "../../../../lib/openai/daily-buckets.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unixSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

async function openAIGet(path, params = {}) {
  const url = new URL(`https://api.openai.com${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;

    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const raw = await response.text();
  let json;

  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`OpenAI devolvió una respuesta no JSON (${response.status})`);
  }

  if (!response.ok) {
    const error = new Error(
      json?.error?.message || json?.message || `OpenAI respondió HTTP ${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return json;
}

async function getAllPages(path, params) {
  // OpenAI permite como máximo 31 buckets para bucket_width=1d.
  // El paginado conserva los 90 días sin recortar las estadísticas.
  return collectPagedOpenAIBuckets(openAIGet, path, params);
}

function flattenBuckets(buckets) {
  const rows = [];

  for (const bucket of buckets || []) {
    for (const result of bucket?.results || []) {
      rows.push({
        ...result,
        bucket_start_time: bucket.start_time,
        bucket_end_time: bucket.end_time,
      });
    }
  }

  return rows;
}

function groupUsageByModel(rows) {
  const map = new Map();

  for (const row of rows) {
    const model = row.model || "SIN_MODELO";
    const current = map.get(model) || {
      model,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };

    current.requests += Number(row.num_model_requests || 0);
    current.input_tokens += Number(row.input_tokens || 0);
    current.output_tokens += Number(row.output_tokens || 0);
    current.total_tokens = current.input_tokens + current.output_tokens;

    map.set(model, current);
  }

  return [...map.values()].sort((a, b) => b.total_tokens - a.total_tokens);
}

function groupCostsByLineItem(rows) {
  const map = new Map();

  for (const row of rows) {
    const name = row.line_item || "Sin categoría";
    const value = Number(row?.amount?.value || 0);
    map.set(name, (map.get(name) || 0) + value);
  }

  return [...map.entries()]
    .map(([name, cost_usd]) => ({
      name,
      cost_usd: Number(cost_usd.toFixed(8)),
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);
}

function buildDaily(costBuckets, usageBuckets) {
  const map = new Map();

  for (const bucket of costBuckets || []) {
    const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
    const current = map.get(date) || {
      date,
      cost_usd: 0,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };

    for (const row of bucket.results || []) {
      current.cost_usd += Number(row?.amount?.value || 0);
    }

    map.set(date, current);
  }

  for (const bucket of usageBuckets || []) {
    const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
    const current = map.get(date) || {
      date,
      cost_usd: 0,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };

    for (const row of bucket.results || []) {
      current.requests += Number(row.num_model_requests || 0);
      current.input_tokens += Number(row.input_tokens || 0);
      current.output_tokens += Number(row.output_tokens || 0);
    }

    current.total_tokens = current.input_tokens + current.output_tokens;
    map.set(date, current);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      cost_usd: Number(row.cost_usd.toFixed(8)),
      total_tokens: Number(row.input_tokens || 0) + Number(row.output_tokens || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 7)));

    const access = await requireAdminActor(request);
    if (!access.actor) return jsonError(access.error, access.status);

    if (!process.env.OPENAI_ADMIN_KEY) {
      return Response.json({
        ok: true,
        configured: false,
        message: "Falta OPENAI_ADMIN_KEY en .env.local",
      });
    }

    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const startTime = unixSeconds(start);
    const endTime = unixSeconds(end);
    const projectId = String(process.env.OPENAI_PROJECT_ID || "").trim() || null;

    const projectParams = projectId
      ? { "project_ids[]": [projectId] }
      : {};

    const [costBuckets, usageBuckets] = await Promise.all([
      getAllPages("/v1/organization/costs", {
        start_time: startTime,
        end_time: endTime,
        bucket_width: "1d",
        limit: MAX_DAILY_BUCKETS,
        "group_by[]": ["line_item"],
        ...projectParams,
      }),
      getAllPages("/v1/organization/usage/completions", {
        start_time: startTime,
        end_time: endTime,
        bucket_width: "1d",
        limit: MAX_DAILY_BUCKETS,
        "group_by[]": ["model"],
        ...projectParams,
      }),
    ]);

    const costRows = flattenBuckets(costBuckets);
    const usageRows = flattenBuckets(usageBuckets);

    const totalCostUsd = costRows.reduce(
      (sum, row) => sum + Number(row?.amount?.value || 0),
      0
    );

    const totalRequests = usageRows.reduce(
      (sum, row) => sum + Number(row.num_model_requests || 0),
      0
    );

    const totalInputTokens = usageRows.reduce(
      (sum, row) => sum + Number(row.input_tokens || 0),
      0
    );

    const totalOutputTokens = usageRows.reduce(
      (sum, row) => sum + Number(row.output_tokens || 0),
      0
    );

    const byModel = groupUsageByModel(usageRows);
    const byLineItem = groupCostsByLineItem(costRows);
    const daily = buildDaily(costBuckets, usageBuckets);

    return Response.json({
      ok: true,
      configured: true,
      period_days: days,
      timezone: "UTC",
      project_filter: projectId,
      summary: {
        total_cost_usd: Number(totalCostUsd.toFixed(8)),
        requests: totalRequests,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens,
        average_cost_per_request:
          totalRequests > 0
            ? Number((totalCostUsd / totalRequests).toFixed(8))
            : 0,
        top_model: byModel?.[0]?.model || null,
      },
      by_model: byModel,
      by_line_item: byLineItem,
      daily,
    });
  } catch (error) {
    console.error("openai-usage error:", error);

    return Response.json(
      {
        ok: false,
        error: error?.message || "No se pudo obtener el uso de OpenAI",
      },
      { status: Number(error?.status) || 500 }
    );
  }
}
