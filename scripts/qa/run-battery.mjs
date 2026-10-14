import {
  loadEnv,
  qaFetch,
  startRun,
  saveResult,
  finishRun,
  BASE_URL
} from "./_utils.mjs";
import {
  EXPECTATION,
  NORMATIVE_QUESTION_BANK,
  buildQuestion
} from "../../qa/normatives/question-bank.mjs";


// Expectativas específicas auditadas contra normativa real.
const EXPECTATION_OVERRIDES = {
  "99": { SELLO: EXPECTATION.MAY_BE_ABSENT }, // CAMIONEROS
  "20": { // BOREAL
    FIRMA: EXPECTATION.MAY_BE_ABSENT,
    BENEFICIARIO: EXPECTATION.MAY_BE_ABSENT,
  },
};

function resolveExpectation(socialWork, test) {
  return (
    EXPECTATION_OVERRIDES?.[String(socialWork?.id)]?.[test.code] ||
    test.expectation
  );
}

function detectIntentMismatch(test, actual) {
  const route = String(actual?.route || "").toUpperCase();

  // STRUCTURED_CONTACT solo es válido para la pregunta específica de contacto.
  // Evita falsos PASS como "número de afiliado" -> Contacto.
  if (route === "STRUCTURED_CONTACT" && test.code !== "CONTACTO") {
    return "INTENT_MISMATCH: la consulta no solicita información de contacto";
  }

  // Las aclaraciones estructuradas solo son esperables donde falta alcance.
  if (
    route === "STRUCTURED_CLARIFICATION" &&
    !["COBERTURA", "PLANES", "CONTACTO"].includes(test.code)
  ) {
    return "INTENT_MISMATCH: aclaración de alcance inesperada para esta pregunta";
  }

  return null;
}

loadEnv();

if (!process.env.QA_RUNNER_SECRET) {
  console.error("Falta QA_RUNNER_SECRET en .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);

function argValue(name) {
  const p = args.find((x) => x.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const all = args.includes("--all");
const swArg = argValue("sw");
const limitSw = Number(argValue("limit-sw") || 0);
const limitQuestions = Math.max(
  1,
  Math.min(NORMATIVE_QUESTION_BANK.length, Number(argValue("questions") || NORMATIVE_QUESTION_BANK.length))
);
const delayMs = Math.max(0, Number(argValue("delay") || 100));
const onlyFrom = Math.max(0, Number(argValue("from") || 0));

function normalize(v = "") {
  return String(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function answerText(actual) {
  return String(
    actual?.answer ||
    actual?.direct_answer ||
    actual?.summary ||
    ""
  ).trim();
}

function looksLikeNoInformation(answer) {
  const a = normalize(answer);
  if (!a) return true;

  const patterns = [
    "no encuentro esa informacion",
    "no encuentro esa información",
    "no se encontro informacion",
    "no se encontró información",
    "no tengo informacion",
    "no tengo información",
    "no hay informacion disponible",
    "no hay información disponible",
    "no encuentro informacion",
    "no encuentro información",
    "no pude encontrar",
    "no puedo encontrar",
    "no figura en la normativa",
    "no esta especificado en la normativa",
    "no está especificado en la normativa",
    "la normativa no especifica",
    "la normativa no indica",
    "no cuento con informacion",
    "no cuento con información"
  ];

  return patterns.some((p) => a.includes(normalize(p)));
}


function looksLikeNeedsScope(answer) {
  const a = normalize(answer);

  const patterns = [
    "depende del plan",
    "depende de la prestacion",
    "depende de la prestación",
    "depende de la cobertura",
    "depende del circuito",
    "segun el plan",
    "según el plan",
    "segun la prestacion",
    "según la prestación",
    "necesito que me indiques",
    "indicame el plan",
    "indicame la prestacion",
    "indicame la prestación",
    "que plan",
    "qué plan",
    "que cobertura",
    "qué cobertura",
    "queres consultar",
    "querés consultar",
    "aclarame",
    "aclará"
  ];

  return patterns.some((p) => a.includes(normalize(p)));
}

function evaluateExpectedBehavior({
  expectation,
  answer,
  found,
  responseOk,
  actualOk,
  validRoute,
  correctSw,
  elapsed
}) {
  const noInfo = looksLikeNoInformation(answer);
  const needsScope = looksLikeNeedsScope(answer);
  const empty = !answer;
  const tooLong = wordCount(answer) > 220;

  // =====================================================
  // 1. ERRORES DUROS / SEMÁNTICA
  // =====================================================

  if (!responseOk || actualOk === false) {
    return { status: "FAIL", reason: "Error de respuesta" };
  }

  if (!correctSw) {
    return { status: "FAIL", reason: "OOSS de contexto incorrecta" };
  }

  if (!validRoute) {
    return { status: "FAIL", reason: "Ruta inesperada" };
  }

  if (empty) {
    return { status: "FAIL", reason: "Respuesta vacía" };
  }

  let semanticStatus = "PASS";
  let semanticReason = null;

  if (expectation === EXPECTATION.MUST_ANSWER) {
    if (found === false) {
      return { status: "FAIL", reason: "found=false en un dato que debe responder" };
    }

    if (noInfo) {
      return { status: "FAIL", reason: "No encontró un dato que debe responder" };
    }
  }

  if (expectation === EXPECTATION.MAY_BE_ABSENT) {
    // La ausencia de dato puede ser correcta.
    // No retornamos todavía: primero evaluamos performance.
    if (found === false || noInfo) {
      semanticReason = "Dato no especificado en la fuente disponible";
    }
  }

  if (expectation === EXPECTATION.NEEDS_SCOPE) {
    if (needsScope) {
      semanticReason = "Solicita el contexto necesario";
    } else if (found === false || noInfo) {
      semanticStatus = "WARNING";
      semanticReason =
        "Debería pedir plan, prestación o circuito en lugar de responder que no encuentra información";
    }
  }

  // =====================================================
  // 2. PERFORMANCE / UX
  // =====================================================

  if (elapsed > 6000) {
    const reason = semanticReason
      ? `${semanticReason} · Respuesta > 6s`
      : "Respuesta > 6s";

    return {
      status: "WARNING",
      reason,
    };
  }

  if (tooLong) {
    const reason = semanticReason
      ? `${semanticReason} · Respuesta demasiado extensa para mostrador`
      : "Respuesta demasiado extensa para mostrador";

    return {
      status: "WARNING",
      reason,
    };
  }

  return {
    status: semanticStatus,
    reason: semanticReason,
  };
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const catalog = (await qaFetch("/api/admin/qa/catalog")).social_works || [];
const withNorm = catalog.filter((sw) => (sw.normatives || []).length > 0);

let selected = withNorm;

if (swArg) {
  const wanted = normalize(swArg);

  // Si se pasa un ID, coincidencia exacta por ID.
  const byId = withNorm.filter((sw) => String(sw.id) === String(swArg));

  if (byId.length) {
    selected = byId;
  } else {
    // Por nombre, coincidencia exacta normalizada.
    // Ej: --sw=OSDE toma OSDE, pero NO OSDEPYM.
    const exact = withNorm.filter((sw) => normalize(sw.name) === wanted);

    if (exact.length) {
      selected = exact;
    } else {
      // Si no hay exacta, permitimos una búsqueda parcial SOLO si devuelve una sola OOSS.
      const partial = withNorm.filter((sw) => normalize(sw.name).includes(wanted));

      if (partial.length === 1) {
        selected = partial;
      } else if (partial.length > 1) {
        console.error(`El filtro --sw=${swArg} coincide con varias obras sociales:`);
        partial.forEach((sw) => console.error(`- ${sw.id} · ${sw.name}`));
        console.error("Usá el nombre exacto o el ID.");
        process.exit(1);
      } else {
        selected = [];
      }
    }
  }
}

if (!all && !swArg) {
  // Seguridad: sin --all no dispara miles de requests accidentalmente.
  selected = withNorm.slice(0, limitSw > 0 ? limitSw : 1);
}

if (limitSw > 0) selected = selected.slice(0, limitSw);
if (onlyFrom > 0) selected = selected.slice(onlyFrom);

if (!selected.length) {
  console.error("No se encontraron obras sociales para ejecutar.");
  process.exit(1);
}

const questions = NORMATIVE_QUESTION_BANK.slice(0, limitQuestions);
const totalPlanned = selected.length * questions.length;

console.log("");
console.log("GDPSoft QA · BATERÍA NORMATIVA");
console.log(`OOSS: ${selected.length}`);
console.log(`Preguntas por OOSS: ${questions.length}`);
console.log(`Consultas planificadas: ${totalPlanned}`);
console.log("");

const run = await startRun(
  "NORMATIVE",
  `QA Batería Normativas ${new Date().toLocaleString("es-AR")}`,
  {
    mode: "battery",
    social_works: selected.length,
    questions_per_social_work: questions.length,
    planned_cases: totalPlanned
  }
);

console.log(`Run ${run.id}`);

let done = 0;

for (const sw of selected) {
  console.log(`\n=== ${sw.name} (${sw.id}) ===`);

  const ctx = await qaFetch("/api/admin/qa/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ socialWorkId: sw.id })
  });

  for (const test of questions) {
    done += 1;
    const resolvedExpectation = resolveExpectation(sw, test);
    const question = buildQuestion(test.template, sw.name);
    const t = Date.now();

    let actual = {};
    let status = "ERROR";
    let reason = null;

    try {
      const response = await fetch(BASE_URL() + "/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: ctx.conversation.id,
          question
        })
      });

      actual = await response.json();
      const elapsed = Number(actual?.elapsed_ms || Date.now() - t);
      const answer = answerText(actual);

      const validRoute = [
        "SEMANTIC",
        "CACHE",
        "STRUCTURED_PROFILE",
        "STRUCTURED_OPERATION",
        "STRUCTURED_CONTACT",
        "STRUCTURED_RULE",
        "STRUCTURED_CLARIFICATION"
      ].includes(actual?.route);

      const correctSw =
        Number(actual?.context?.social_work_id || sw.id) === Number(sw.id);

      const found = actual?.found !== false;

      const evaluation = evaluateExpectedBehavior({
        expectation: resolvedExpectation,
        answer,
        found,
        responseOk: response.ok,
        actualOk: actual?.ok,
        validRoute,
        correctSw,
        elapsed
      });

      status = evaluation.status;
      reason = evaluation.reason;

      const intentMismatch = detectIntentMismatch(test, actual);
      if (intentMismatch) {
        status = "FAIL";
        reason = intentMismatch;
      }

      if ((!response.ok || actual?.ok === false) && actual?.error) {
        reason = actual.error;
      } else if (!validRoute) {
        reason = `Ruta inesperada ${actual?.route || "SIN_RUTA"}`;
      }

      await saveResult(run.id, {
        case_id: `BAT-SW-${sw.id}-${test.code}`,
        suite: "NORMATIVE",
        category: "RESPONSE",
        social_work_id: sw.id,
        normative_id: actual?.normative_id || null,
        question,
        expected: {
          social_work_id: sw.id,
          topic: test.category,
          test_code: test.code,
          expectation: resolvedExpectation,
          found: resolvedExpectation === EXPECTATION.MUST_ANSWER ? true : null,
          max_ms: 6000,
          concise: true
        },
        actual,
        route: actual?.route || null,
        source: actual?.source || null,
        model: actual?.model || null,
        elapsed_ms: elapsed,
        input_tokens: actual?.usage?.input_tokens || 0,
        output_tokens: actual?.usage?.output_tokens || 0,
        status,
        score: status === "PASS" ? 100 : status === "WARNING" ? 80 : 0,
        failure_reason: reason
      });

      console.log(
        `[${status}] ${done}/${totalPlanned} ${test.code} · ${test.expectation} · ${elapsed}ms${reason ? ` · ${reason}` : ""}`
      );
    } catch (e) {
      await saveResult(run.id, {
        case_id: `BAT-SW-${sw.id}-${test.code}`,
        suite: "NORMATIVE",
        category: "RESPONSE",
        social_work_id: sw.id,
        question,
        expected: {
          social_work_id: sw.id,
          topic: test.category,
          test_code: test.code,
          expectation: resolvedExpectation
        },
        actual: { error: e.message },
        status: "ERROR",
        score: 0,
        failure_reason: e.message
      });

      console.log(`[ERROR] ${done}/${totalPlanned} ${test.code} · ${e.message}`);
    }

    if (delayMs) await sleep(delayMs);
  }
}

const final = await finishRun(run.id);
console.log("\nFINAL:", final);
