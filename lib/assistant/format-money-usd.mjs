// Solo presentación: no redondea ni modifica valores de costos persistidos.
const twoDecimals = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function formatMoneyUsd(value) {
  const amount = Number(value ?? 0);
  return `US$${twoDecimals.format(Number.isFinite(amount) ? amount : 0)}`;
}

// v3.13.50 — importes muy chicos (p. ej. el promedio por solicitud, ~US$0.0038) se muestran
// con 4 decimales; con 2 decimales aparecían como US$0.00.
const fourDecimals = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
export function formatMoneyUsdPrecise(value) {
  const amount = Number(value ?? 0);
  return `US$${fourDecimals.format(Number.isFinite(amount) ? amount : 0)}`;
}
