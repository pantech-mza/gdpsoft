/**
 * Página correcta para PostgREST (rango inclusivo).
 * offset: posición de inicio en el conjunto filtrado; limit: número máximo de registros.
 * loaded: registros ya obtenidos de ESTE lote; no es una posición absoluta.
 */
export function nextCandidatePage({offset=0,loaded=0,limit,pageSize=200}) {
  for (const [name,value] of Object.entries({offset,loaded,limit,pageSize})) {
    if (!Number.isSafeInteger(value) || value < 0 || (name==='pageSize' && value===0)) {
      throw new RangeError(`${name} debe ser un entero ${name==='pageSize'?'positivo':'no negativo'}`);
    }
  }
  if (loaded>=limit) return null;
  const size=Math.min(pageSize,limit-loaded);
  const from=offset+loaded;
  const to=from+size-1;
  if (!Number.isSafeInteger(to)) throw new RangeError('El rango solicitado excede el entero máximo seguro');
  return {from,to,size};
}
