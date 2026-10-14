function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function text(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function countWords(value) {
  const t = text(value);
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

function performanceScore({ elapsedMs, route }) {
  const ms = Number(elapsedMs);
  if (!Number.isFinite(ms) || ms <= 0) return 100;

  const r = String(route || "").toUpperCase();

  if (["CACHE", "STRUCTURED_PROFILE", "STRUCTURED_OPERATION"].includes(r)) {
    if (ms <= 1000) return 100;
    if (ms <= 2000) return 85;
    if (ms <= 3000) return 65;
    if (ms <= 6000) return 35;
    return 10;
  }

  if (ms <= 2500) return 100;
  if (ms <= 4000) return 85;
  if (ms <= 6000) return 70;
  if (ms <= 8000) return 45;
  return 20;
}

function concisionScore(answer) {
  const words = countWords(answer);
  if (!words) return 0;
  if (words <= 70) return 100;
  if (words <= 120) return 90;
  if (words <= 180) return 75;
  if (words <= 260) return 55;
  return 35;
}

function sourceScore({ source, route, found }) {
  const s = String(source || "").toUpperCase();
  const r = String(route || "").toUpperCase();

  if (found === false) return 0;
  if (s === "CACHE" || r === "CACHE") return 100;
  if (s === "OPENAI_FILE_SEARCH") return 100;
  if (s.includes("STRUCTURED") || r.includes("STRUCTURED")) return 100;
  if (s.includes("IMAGE") || r.includes("IMAGE")) return 90;
  return 65;
}

function contextScore({ expected, actual, socialWorkId }) {
  const expectedId = Number(expected?.social_work_id || socialWorkId || 0);
  if (!expectedId) return 100;

  const actualId = Number(
    actual?.context?.social_work_id ||
      actual?.social_work?.id ||
      actual?.detected_social_work_id ||
      0
  );

  if (!actualId) return 45;
  return actualId === expectedId ? 100 : 0;
}

function safetyScore({ actual, status }) {
  if (status === "ERROR") return 0;

  const answer = normalize(actual?.answer);
  const uncertain =
    answer.includes("requiere revision") ||
    answer.includes("no puedo confirmar") ||
    answer.includes("no puedo determinar");

  const unsafePositive =
    answer.includes("si, esta sucursal puede recibirla") ||
    answer.includes("si. esta sucursal puede recibirla") ||
    answer.includes("puede recibirla sin inconvenientes");

  if (uncertain && unsafePositive) return 0;
  if (actual?.found === false) return 55;
  if (status === "FAIL") return 35;
  return 100;
}

function correctnessScore({ status, actual, expected, normativeId }) {
  if (status === "ERROR") return 0;

  let score =
    status === "PASS"
      ? 100
      : status === "WARNING"
      ? 88
      : status === "FAIL"
      ? 25
      : 50;

  if (actual?.found === false) score = Math.min(score, 30);

  const expectedNormative = Number(expected?.normative_id || 0);
  const actualNormative = Number(actual?.normative_id || normativeId || 0);

  if (expectedNormative && actualNormative) {
    score = expectedNormative === actualNormative ? Math.max(score, 95) : 0;
  }

  return clamp(score);
}

export function calculateQaQuality({
  category,
  status,
  expected = {},
  actual = {},
  route = null,
  source = null,
  elapsedMs = null,
  socialWorkId = null,
  normativeId = null,
}) {
  if (String(category || "").toUpperCase() === "INTEGRITY") {
    return {
      score: null,
      level: null,
      breakdown: {
        applicable: false,
        reason: "Integridad documental",
      },
    };
  }

  const correctness = correctnessScore({ status, actual, expected, normativeId });
  const sourceQuality = sourceScore({ source, route, found: actual?.found });
  const context = contextScore({ expected, actual, socialWorkId });
  const safety = safetyScore({ actual, status });
  const concision = concisionScore(actual?.answer || actual?.direct_answer || "");
  const performance = performanceScore({ elapsedMs, route });

  const weighted =
    correctness * 0.35 +
    sourceQuality * 0.15 +
    concision * 0.15 +
    safety * 0.15 +
    context * 0.1 +
    performance * 0.1;

  const score = Math.round(clamp(weighted) * 100) / 100;
  const level = score >= 85 ? "BUENA" : score >= 70 ? "ACEPTABLE" : "CRITICA";

  return {
    score,
    level,
    breakdown: {
      applicable: true,
      correctness: Math.round(correctness),
      source: Math.round(sourceQuality),
      context: Math.round(context),
      concision: Math.round(concision),
      safety: Math.round(safety),
      performance: Math.round(performance),
      weights: {
        correctness: 35,
        source: 15,
        concision: 15,
        safety: 15,
        context: 10,
        performance: 10,
      },
    },
  };
}
