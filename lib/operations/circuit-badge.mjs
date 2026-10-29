// v3.13.121 — etiqueta «Circuito Cámara-Colegio» por OBRA SOCIAL (no por sucursal).
// Fuente: procedimiento Cámara–Colegio informado por Farmacias del Plata (mismo que usa el bot).
import { identifyCircuitWork } from './camara-colegio-policy.mjs';

const DETAIL = {
  OSECAC: 'Todas las sucursales hacen Cámara-Colegio, salvo Econo Más y San Rafael (directa). DP1 la valida con el validador de San Francisco.',
  FEDERACION_PATRONAL_ART: 'Reciben directo LJ2, San Francisco, Del Cerro y Libertad; el resto hace Cámara-Colegio.',
  OSSEG: 'Todas las sucursales hacen Cámara-Colegio, salvo San Francisco (directa).',
  OSDE: 'Solo hacen Cámara-Colegio Lavalle, Del Centro, R. Peña y Andina; el resto la recibe directo.',
  OSTES: 'Las sucursales de Cámara la gestionan por Cámara-Colegio (DP1 solo la recibe por este circuito).',
  OSPAV: 'Las sucursales de Cámara la gestionan por Cámara-Colegio.',
  LUIS_PASTEUR: 'Las sucursales de Cámara la gestionan por Cámara-Colegio.',
  OSFYHC: 'Las sucursales de Cámara la gestionan por Cámara-Colegio.',
  PROVINCIA_ART: 'Las sucursales de Colegio la tramitan por el circuito Cámara-Colegio.',
};
export const CIRCUIT_BADGE_LABEL = 'Circuito Cámara-Colegio';

/** {label, detail} si la obra social opera por Cámara-Colegio según el procedimiento; null si no. */
export function camaraColegioBadge(socialWorkName, branchType) {
  const work = identifyCircuitWork(socialWorkName);
  // Provincia ART: en Cámara es directa (sin circuito); solo las de Colegio van por Cámara-Colegio.
  if (work === 'PROVINCIA_ART' && String(branchType || '').toUpperCase() !== 'COLEGIO') return null;
  return work && DETAIL[work] ? { label: CIRCUIT_BADGE_LABEL, detail: DETAIL[work] } : null;
}
