export const EXPECTATION = {
  MUST_ANSWER: "MUST_ANSWER",
  MAY_BE_ABSENT: "MAY_BE_ABSENT",
  NEEDS_SCOPE: "NEEDS_SCOPE"
};

export const NORMATIVE_QUESTION_BANK = [
  { code: "GENERAL", category: "General", expectation: EXPECTATION.MUST_ANSWER, template: "requisitos principales de {OOSS}" },

  { code: "VIGENCIA", category: "Receta", expectation: EXPECTATION.MUST_ANSWER, template: "cuantos dias de vigencia tiene la receta de {OOSS}?" },
  { code: "TIPO_RECETA", category: "Receta", expectation: EXPECTATION.MUST_ANSWER, template: "que tipo de receta acepta {OOSS}?" },
  { code: "ELECTRONICA", category: "Receta", expectation: EXPECTATION.MUST_ANSWER, template: "{OOSS} acepta receta electronica o digital?" },

  { code: "PARTICULAR", category: "Receta", expectation: EXPECTATION.MAY_BE_ABSENT, template: "{OOSS} acepta recetario particular?" },
  { code: "OFICIAL", category: "Receta", expectation: EXPECTATION.MAY_BE_ABSENT, template: "{OOSS} exige recetario oficial?" },

  { code: "FIRMA", category: "Profesional", expectation: EXPECTATION.MUST_ANSWER, template: "que requisitos tiene la firma del medico para {OOSS}?" },
  { code: "SELLO", category: "Profesional", expectation: EXPECTATION.MUST_ANSWER, template: "{OOSS} requiere sello medico?" },
  { code: "MATRICULA", category: "Profesional", expectation: EXPECTATION.MUST_ANSWER, template: "{OOSS} requiere numero de matricula del profesional?" },

  { code: "DIAGNOSTICO", category: "Receta", expectation: EXPECTATION.MUST_ANSWER, template: "{OOSS} requiere diagnostico en la receta?" },
  { code: "MEMBRETE", category: "Receta", expectation: EXPECTATION.MUST_ANSWER, template: "{OOSS} requiere membrete o identificacion de la institucion?" },
  { code: "BENEFICIARIO", category: "Afiliado", expectation: EXPECTATION.MUST_ANSWER, template: "que datos del beneficiario debe tener la receta de {OOSS}?" },
  { code: "AFILIADO", category: "Afiliado", expectation: EXPECTATION.MUST_ANSWER, template: "{OOSS} exige numero de afiliado en la receta?" },
  { code: "PLAN", category: "Afiliado", expectation: EXPECTATION.MAY_BE_ABSENT, template: "debe figurar el plan del afiliado para {OOSS}?" },
  { code: "FECHA", category: "Receta", expectation: EXPECTATION.MUST_ANSWER, template: "{OOSS} exige fecha de prescripcion?" },

  { code: "MONODROGA", category: "Medicamento", expectation: EXPECTATION.MUST_ANSWER, template: "{OOSS} exige prescripcion por monodroga?" },
  { code: "COMERCIAL", category: "Medicamento", expectation: EXPECTATION.MUST_ANSWER, template: "se puede indicar nombre comercial en {OOSS}?" },
  { code: "SUSTITUCION", category: "Medicamento", expectation: EXPECTATION.MUST_ANSWER, template: "se puede sustituir la marca del medicamento en {OOSS}?" },

  { code: "CANT_ESPECIALIDADES", category: "Topes", expectation: EXPECTATION.MAY_BE_ABSENT, template: "cuantas especialidades diferentes permite {OOSS} por receta?" },
  { code: "CANT_ENVASES", category: "Topes", expectation: EXPECTATION.MAY_BE_ABSENT, template: "cuantos envases permite {OOSS} por receta o renglon?" },
  { code: "TAMANIO", category: "Topes", expectation: EXPECTATION.MAY_BE_ABSENT, template: "que pasa con el tamaño del envase en {OOSS}?" },

  { code: "VALIDACION", category: "Validacion", expectation: EXPECTATION.MUST_ANSWER, template: "por donde se valida {OOSS}?" },
  { code: "VALIDACION_OBLIG", category: "Validacion", expectation: EXPECTATION.MUST_ANSWER, template: "la validacion es obligatoria para {OOSS}?" },

  { code: "AUTORIZACION", category: "Autorizacion", expectation: EXPECTATION.MAY_BE_ABSENT, template: "cuando requiere autorizacion {OOSS}?" },
  { code: "AUT_ESPECIAL", category: "Autorizacion", expectation: EXPECTATION.MAY_BE_ABSENT, template: "como se manejan las autorizaciones especiales de {OOSS}?" },

  { code: "COBERTURA", category: "Cobertura", expectation: EXPECTATION.NEEDS_SCOPE, template: "que cobertura tiene {OOSS}?" },
  { code: "PLANES", category: "Cobertura", expectation: EXPECTATION.NEEDS_SCOPE, template: "que planes y porcentajes de cobertura tiene {OOSS}?" },

  { code: "PMI", category: "Cobertura", expectation: EXPECTATION.MAY_BE_ABSENT, template: "como funciona el plan materno infantil de {OOSS}?" },
  { code: "CRONICIDAD", category: "Cobertura", expectation: EXPECTATION.MAY_BE_ABSENT, template: "que indica la normativa de {OOSS} sobre cronicidad?" },
  { code: "DISCAPACIDAD", category: "Cobertura", expectation: EXPECTATION.MAY_BE_ABSENT, template: "que cobertura o requisitos tiene discapacidad en {OOSS}?" },

  { code: "PSICOFARMACOS", category: "Medicamento", expectation: EXPECTATION.MAY_BE_ABSENT, template: "que requisitos tienen los psicofarmacos en {OOSS}?" },
  { code: "FOTOCOPIA", category: "Presentacion", expectation: EXPECTATION.MAY_BE_ABSENT, template: "{OOSS} acepta fotocopia de receta?" },
  { code: "CREDENCIAL", category: "Afiliado", expectation: EXPECTATION.MAY_BE_ABSENT, template: "que credencial acepta {OOSS}?" },
  { code: "DNI", category: "Afiliado", expectation: EXPECTATION.MAY_BE_ABSENT, template: "{OOSS} exige documento de identidad?" },
  { code: "ENMIENDAS", category: "Receta", expectation: EXPECTATION.MAY_BE_ABSENT, template: "como deben salvarse las enmiendas para {OOSS}?" },
  { code: "FACTURACION", category: "Facturacion", expectation: EXPECTATION.MAY_BE_ABSENT, template: "como se presenta o factura {OOSS}?" },
  { code: "EXCLUIDOS", category: "Medicamento", expectation: EXPECTATION.MAY_BE_ABSENT, template: "que medicamentos o productos estan excluidos en {OOSS}?" },
  { code: "CONTACTO", category: "Contacto", expectation: EXPECTATION.NEEDS_SCOPE, template: "hay telefono o contacto para consultas de {OOSS}?" }
];

export function buildQuestion(template, socialWorkName) {
  return String(template).replaceAll("{OOSS}", socialWorkName);
}
