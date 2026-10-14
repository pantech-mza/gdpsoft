/** Paginación de un conjunto YA filtrado, sin alterar su orden ni sus registros. */
export function paginate(items, requestedPage, pageSize = 10) {
  if (!Array.isArray(items)) throw new TypeError("items debe ser un arreglo");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError("pageSize inválido");
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(Number.isSafeInteger(requestedPage) ? requestedPage : 1, totalPages));
  const start = (page - 1) * pageSize;
  return {
    page,
    totalPages,
    total,
    items: items.slice(start, start + pageSize),
    from: total ? start + 1 : 0,
    to: Math.min(start + pageSize, total),
  };
}
