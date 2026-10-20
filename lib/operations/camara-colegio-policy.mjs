// GDPSoft — procedimiento Cámara/Colegio informado por Farmacias del Plata, 15/10/2026.
// La modalidad operativa NO equivale a aceptación ni a verificación de una receta.
// Mantener excepciones por sucursal separadas de normativas/Recordá/Ficha.
export const CIRCUIT_PROCEDURE_SOURCE = "Procedimiento Cámara–Colegio GDP, 15/10/2026";

export const cleanCircuitKey = (value) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();

const BRANCH_ALIASES = {
  DP1:["DP1","DP 1"], DP2:["DP2","DP 2"], DP3:["DP3","DP 3"],
  DP4:["DP4","DP 4"], DP5:["DP5","DP 5"], DP6:["DP6","DP 6"],
  DP7:["DP7","DP 7"], DP8:["DP8","DP 8"],
  ECONO_ALAMEDA:["ECONO ALAMEDA","ECONOFARMA ALAMEDA"],
  ECONO_HOSPITAL:["ECONO HOSPITAL","ECONOFARMA HOSPITAL"],
  ECONO_LAS_HERAS:["ECONO LAS HERAS","ECONOFARMA LAS HERAS"],
  ECONO_SAN_MARTIN:["ECONO SAN MARTIN","ECONOFARMA SAN MARTIN"],
  ECONO_MAS:["ECONO MAS","ECONOMAS","ECONOFARMA MAS"],
  FARMA_UCO:["FARMA UCO","FARMAUCO"], LOS_CERROS:["LOS CERROS"],
  ANDINA:["ANDINA"], CONDOR:["CONDOR"],
  GUTIERREZ:["GUTIERREZ","GUTIERREZ YRIGOYEN","GUTIERREZ IRIGOYEN","YRIGOYEN"],
  RODRIGUEZ_PENA:["RODRIGUEZ PENA","R PENA","R PEÑA","RPEÑA","RODRIGUEZ PEÑA"],
  SAN_FRANCISCO:["SAN FRANCISCO"], SAN_RAFAEL:["SAN RAFAEL"],
  LAVALLE:["LAVALLE"], DEL_CERRO:["DEL CERRO"], LIBERTAD:["LIBERTAD"],
  DEL_CENTRO:["DEL CENTRO"], LA_JIRAFA_2:["LA JIRAFA 2","LJ2"],
  ECONO_MAIPU:["ECONO MAIPU","ECONOFARMA MAIPU","E MAIPU"],
  LA_JIRAFA_1:["LA JIRAFA 1","LJ1"], CORDILLERA:["CORDILLERA"],
};
const BRANCH_INDEX = new Map(Object.entries(BRANCH_ALIASES)
  .flatMap(([id, aliases]) => aliases.map((alias) => [cleanCircuitKey(alias), id])));

export const CAMARA_BRANCHES = Object.freeze([
  "DP1","DP2","DP3","DP4","DP5","DP7","DP8",
  "ECONO_ALAMEDA","ECONO_HOSPITAL","ECONO_LAS_HERAS","ECONO_SAN_MARTIN",
  "ECONO_MAS","FARMA_UCO","LOS_CERROS","ANDINA",
]);
export const COLEGIO_BRANCHES = Object.freeze([
  "CONDOR","GUTIERREZ","RODRIGUEZ_PENA","SAN_FRANCISCO","SAN_RAFAEL",
  "LAVALLE","DP6","DEL_CERRO","LIBERTAD","DEL_CENTRO",
  "LA_JIRAFA_2","ECONO_MAIPU","LA_JIRAFA_1","CORDILLERA",
]);
const camara = new Set(CAMARA_BRANCHES);
const colegio = new Set(COLEGIO_BRANCHES);

// No usar coincidencias parciales: OSDE NO es OSDEPYM.
const WORK_ALIASES = {
  OSECAC:["OSECAC"],
  FEDERACION_PATRONAL_ART:["FEDERACION PATRONAL ART","FEDERACION PATRONAL"],
  AMPES_ASISTIR:["AMPES ASISTIR","AMPES"],
  OSSEG:["OSSEG"], OSDE:["OSDE"],
  OSTES:["OSTES"], OSPAV:["OSPAV"],
  LUIS_PASTEUR:["LUIS PASTEUR","OBRA SOCIAL LUIS PASTEUR"],
  OSFYHC:["OSFYHC"], PROVINCIA_ART:["PROVINCIA ART"],
};
const WORK_INDEX = new Map(Object.entries(WORK_ALIASES)
  .flatMap(([id, aliases]) => aliases.map((alias) => [cleanCircuitKey(alias), id])));

export function identifyCircuitBranch({branchName, branchCode} = {}) {
  const candidates = [branchCode, branchName];
  const identified = candidates.map((s) => BRANCH_INDEX.get(cleanCircuitKey(s))).filter(Boolean);
  // Protección ante código y nombre contradictorios: no seleccionar una sucursal arbitraria.
  if (new Set(identified).size > 1) return null;
  return identified[0] || null;
}
export function identifyCircuitWork(socialWorkName) {
  return WORK_INDEX.get(cleanCircuitKey(socialWorkName)) || null;
}

const REQUIRES_CAMARA_SPECIAL = new Set(["OSTES","OSPAV","LUIS_PASTEUR","OSFYHC"]);
const FEDERACION_DIRECT = new Set(["LA_JIRAFA_2","SAN_FRANCISCO","DEL_CERRO","LIBERTAD"]);
const OSDE_SPECIAL = new Set(["LAVALLE","DEL_CENTRO","RODRIGUEZ_PENA","ANDINA"]);
const AMPES_ALL_DAY = new Set([
  "DP4","ECONO_MAIPU","ECONO_MAS","LA_JIRAFA_1","ECONO_SAN_MARTIN","FARMA_UCO",
]);

export function resolveDeclaredCircuitPolicy({branchName, branchCode, socialWorkName} = {}) {
  const branch = identifyCircuitBranch({branchName, branchCode});
  if (!branch) return null; // sucursal nueva/desconocida: no inventar circuito.
  const group = camara.has(branch) ? "CAMARA" : colegio.has(branch) ? "COLEGIO" : null;
  if (!group) return null;
  const work = identifyCircuitWork(socialWorkName);
  const output = (mode, extra = {}) => ({
    matched:true, branch, group, work, mode, canReceive:null, allDay:null,
    until:null, validatorBranchName:null, status:"DEFINED",
    sourceReference:CIRCUIT_PROCEDURE_SOURCE, ...extra,
  });
  if (work === "OSECAC") {
    if (branch === "DP1") return output("EXTERNAL_VALIDATOR", {canReceive:true,
      validatorBranchName:"San Francisco", notes:"DP1 valida OSECAC con el validador de San Francisco (SUC: San Francisco). No se valida por Econo Más."});
    if (["ECONO_MAS","SAN_RAFAEL"].includes(branch)) return output("DIRECT", {
      canReceive:true, notes:"OSECAC se recibe directamente por el sistema propio de esta sucursal."});
    return output("CAMARA_COLEGIO", {canReceive:true});
  }
  if (work === "FEDERACION_PATRONAL_ART") {
    return output(FEDERACION_DIRECT.has(branch) ? "DIRECT" : "CAMARA_COLEGIO",
      {canReceive:FEDERACION_DIRECT.has(branch) ? true : null,
      notes:FEDERACION_DIRECT.has(branch) ? "Recepción directa indicada expresamente." : null});
  }
  if (work === "OSSEG") return output(branch === "SAN_FRANCISCO" ? "DIRECT" : "CAMARA_COLEGIO");
  if (work === "OSDE") return output(OSDE_SPECIAL.has(branch) ? "CAMARA_COLEGIO" : "DIRECT");
  if (work === "AMPES_ASISTIR") {
    return output("UNSPECIFIED", {canReceive:true, allDay:AMPES_ALL_DAY.has(branch),
      until:AMPES_ALL_DAY.has(branch) ? null : "20:00",
      notes:"El procedimiento suministrado define horarios, no validador ni circuito para AMPES Asistir."});
  }
  // Confirmación del cliente, 16/10/2026: las sucursales de COLEGIO
  // tramitan Provincia ART por Cámara–Colegio. Esta aclaración agrega una regla
  // y NO deroga excepciones anteriores de otras obras sociales.
  // Para CAMARA, el circuito de Provincia ART permanece sin confirmar.
  if (work === "PROVINCIA_ART") {
    if (group === "COLEGIO") return output("CAMARA_COLEGIO", {
      sourceReference:"Aclaración Farmacias del Plata, 16/10/2026",
      notes:"Provincia ART: circuito Cámara–Colegio confirmado para sucursales de Colegio."
    });
    return output("REVIEW_REQUIRED", {
      status:"AMBIGUOUS",
      notes:"Provincia ART: el cliente confirmó Cámara–Colegio en sucursales de Colegio, pero el circuito para sucursales de Cámara sigue pendiente de confirmación."
    });
  }
  if (REQUIRES_CAMARA_SPECIAL.has(work) && group === "CAMARA") return output("CAMARA_COLEGIO");
  // Regla genérica del documento. No confirma habilitación del convenio ni el validador efectivo.
  return output("REGULAR_VALIDATOR", {status:"GENERAL", notes:
    "No figura una obligación particular de Cámara–Colegio para esta combinación en el procedimiento; verificar convenio vigente y validador correspondiente (Zetti u otro)."});
}

export function circuitModeLabel(mode, {validatorBranchName} = {}) {
  switch (mode) {
    case "CAMARA_COLEGIO":return "Cámara–Colegio";
    case "EXTERNAL_VALIDATOR":return validatorBranchName ? `directo por el validador de ${validatorBranchName}` : "validador externo";
    case "DIRECT":return "directo";
    case "REGULAR_VALIDATOR":return "validación habitual (Zetti u otro validador habilitado)";
    case "REVIEW_REQUIRED":return "pendiente de confirmar";
    default:return "no especificado";
  }
}

export function formatCircuitResponse(result, operationType = "RECEPTION") {
  if (!result?.resolved || !result.operation) return null;
  const op = result.operation;
  const conflict = op.mode === "REVIEW_REQUIRED";
  const name = result.socialWork?.name || "esta obra social";
  const branch = result.branch?.name || result.branch?.code || "tu sucursal";
  const mode = circuitModeLabel(op.mode, {validatorBranchName:op.validation?.validatorBranch?.name || op.validatorBranchName});
  const detail = op.reception?.allDay === true ? "Horario: todo el día." :
    op.reception?.until ? `Horario: hasta las ${String(op.reception.until).slice(0,5)}.` : "";
  const notes = op.policyNotes || op.notes || "";
  const extra = [detail, notes].filter(Boolean).join(" ");
  if (conflict) return `No puedo confirmar el circuito de ${name} en ${branch}. Hay una regla pendiente de aclaración o datos operativos contradictorios. ${notes} Consultá con Administración antes de recibir o tramitar la receta.`;
  if (operationType === "RECEPTION") {
    const lead = op.canReceive === false ? "No: la sucursal no está habilitada para recibir esta obra social." :
      op.canReceive === true ? `${op.reception?.until ? "La sucursal tiene recepción habilitada con límite horario" : "Sí, la sucursal está habilitada para recibir esta obra social"}.` :
        `No puedo confirmar con este procedimiento si ${branch} está habilitada para recibir ${name}.`;
    return `${lead}\nCircuito operativo registrado: ${mode}. ${extra}\nEsto no confirma que la receta sea válida: verificar plan, convenio, normativa y requisitos de Recordá/Ficha.`.trim();
  }
  if (operationType === "VALIDATION") {
    const instructions = op.validation?.instructions || "";
    return `Para ${name} en ${branch}: circuito ${mode}. ${[instructions,extra].filter(Boolean).join(" ")} Verificá el validador específico habilitado y la normativa correspondiente.`;
  }
  if (operationType === "PRESENTATION") {
    const destination = op.presentation?.branch?.name || op.presentation?.branchType || null;
    return `Para ${name} en ${branch}: circuito ${mode}. ${destination ? `Presentación registrada: ${destination}.` : "El procedimiento no indica el destino exacto de presentación."} ${extra}`;
  }
  return `Para ${name} en ${branch}, el circuito indicado es ${mode}. ${extra}\nConfirmá convenio, validador y requisitos normativos antes de recibir o dispensar.`.trim();
}

// ---------------------------------------------------------------------------
// v3.13.22 — validador externo por sucursal (p. ej. OSECAC en DP1 → San Francisco)
// ---------------------------------------------------------------------------
const foldText = (value) => ` ${String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const BRANCH_LABELS = { ECONO_MAS: "Econo Más", SAN_FRANCISCO: "San Francisco" };
const branchLabel = (id) => BRANCH_LABELS[id] || String(id).replace(/_/g, " ")
  .toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function describeBranchValidatorException({branchName, branchCode, socialWorkName} = {}) {
  const policy = resolveDeclaredCircuitPolicy({branchName, branchCode, socialWorkName});
  if (!policy || policy.mode !== "EXTERNAL_VALIDATOR" || !policy.validatorBranchName) return null;
  return {
    work: String(socialWorkName || "").trim(),
    branchLabel: String(branchCode || branchName || policy.branch).trim(),
    validatorName: policy.validatorBranchName,
    validatorBranchId: BRANCH_INDEX.get(cleanCircuitKey(policy.validatorBranchName)) || null,
  };
}

export function mentionedCircuitBranches(question) {
  const q = foldText(question);
  return Object.entries(BRANCH_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => q.includes(foldText(alias))))
    .map(([id]) => id);
}

// Aclaración que se agrega a las respuestas de Ficha sobre validación.
export function formatBranchValidatorNote(exception) {
  if (!exception) return "";
  return `En ${exception.branchLabel}, ${exception.work} se valida con el validador de ${exception.validatorName} (SUC: ${exception.validatorName}).`;
}

// «¿Por Econo Más?» / «¿Por San Francisco?» dentro de una conversación sobre esa obra social.
export function answerValidatorChallenge(exception, question) {
  if (!exception) return null;
  const mentioned = mentionedCircuitBranches(question);
  if (!mentioned.length) return null;
  if (mentioned.includes(exception.validatorBranchId)) {
    return `Sí, en ${exception.branchLabel} ${exception.work} se valida por el validador de ${exception.validatorName} (SUC: ${exception.validatorName}).`;
  }
  const names = mentioned.map(branchLabel).join(" / ");
  return `No, en ${exception.branchLabel} ${exception.work} no se valida por ${names}, sino por el validador de ${exception.validatorName} (SUC: ${exception.validatorName}).`;
}
