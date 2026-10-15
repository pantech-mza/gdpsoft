// GDPSoft — consulta sobre la pertenencia general de la sucursal a Cámara/Colegio.
// No determina el circuito de una obra social ni autoriza recepción o dispensación.
import {
  CAMARA_BRANCHES,
  COLEGIO_BRANCHES,
  identifyCircuitBranch,
} from '../operations/camara-colegio-policy.mjs';

function fold(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// Patrones intencionalmente acotados: «¿Qué circuito utiliza mi sucursal?» no
// pregunta cómo tramitar OSDEPYM, aunque esa obra social esté activa en el chat.
// «¿Qué circuito utiliza mi sucursal para OSDEPYM?» NO debe entrar aquí.
export function isGeneralBranchCircuitQuestion(question) {
  const q = fold(question);
  return [
    /^(?:que|cual) circuito (?:utiliza|usa|tiene|maneja|trabaja) (?:mi|nuestra|esta|la) sucursal$/,
    /^(?:que|cual) circuito (?:es|tiene|le corresponde a) (?:mi|nuestra|esta|la) sucursal$/,
    /^(?:que|cual) (?:es|seria) (?:el )?circuito (?:de|para) (?:mi|nuestra|esta|la) sucursal$/,
    /^(?:que|cual) es el circuito (?:de|que utiliza|que tiene) (?:mi|nuestra|esta|la) sucursal$/,
    /^(?:a que|a cual) circuito pertenece (?:mi|nuestra|esta|la) sucursal$/,
    /^(?:mi|nuestra|esta|la) sucursal (?:pertenece a|es de|trabaja por|va por) (?:camara|colegio)$/,
    /^(?:mi|nuestra|esta|la) sucursal (?:es|esta en) (?:camara|colegio)$/,
  ].some((pattern) => pattern.test(q));
}

export function resolveGeneralBranchMembership({branchName, branchCode, branchType} = {}) {
  const branch = identifyCircuitBranch({ branchName, branchCode });
  const listedGroup = CAMARA_BRANCHES.includes(branch) ? 'CAMARA' :
    COLEGIO_BRANCHES.includes(branch) ? 'COLEGIO' : null;
  const normalizedType = fold(branchType).replace(/ /g, '');
  const databaseGroup = normalizedType === 'camara' ? 'CAMARA' :
    normalizedType === 'colegio' ? 'COLEGIO' : null;
  if (listedGroup && databaseGroup && listedGroup !== databaseGroup) {
    return {status:'CONFLICT', group:null, branch};
  }
  const group = listedGroup || databaseGroup;
  return group
    ? {status:'CONFIRMED', group, branch, source:listedGroup ? 'GDP_PROCEDURE' : 'BRANCH_RECORD'}
    : {status:'UNKNOWN', group:null, branch};
}

export function formatGeneralBranchMembershipResponse({branch, result} = {}) {
  if (!branch) {
    return 'No tengo una sucursal identificada en esta conversación. Ingresá desde tu cuenta de sucursal para consultar si pertenece a Cámara o Colegio.';
  }
  const branchLabel = String(branch.name || branch.code || 'actual').trim();
  if (result?.status === 'CONFLICT') {
    return `Los datos del circuito general de ${branchLabel} no coinciden entre el registro de sucursales y el procedimiento Cámara–Colegio. Consultá con Administración para confirmarlos.`;
  }
  if (result?.status !== 'CONFIRMED') {
    return `No puedo confirmar si ${branchLabel} pertenece a Cámara o Colegio con los datos actuales. Consultá con Administración.`;
  }
  const label = result.group === 'CAMARA' ? 'Cámara' : 'Colegio';
  return `La sucursal ${branchLabel} pertenece al circuito general ${label}.\n\nEsto no determina el circuito de una obra social específica: algunas se tramitan de forma directa o tienen excepciones por sucursal. Tampoco autoriza por sí solo la recepción ni la dispensación de una receta.`;
}
