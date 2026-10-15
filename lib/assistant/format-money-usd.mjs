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
