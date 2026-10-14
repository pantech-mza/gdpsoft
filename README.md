# GDP AI Lab v5

Laboratorio local para validar respuestas sobre normativas de Farmacias del Plata usando OpenAI File Search y OCR/visión.

## Novedades v5

- Cada documento se carga asociado a una **Obra social / entidad**.
- Ese dato se guarda como atributo del archivo en el Vector Store.
- Cuando GDP conoce la obra social activa, **File Search filtra sólo los documentos de esa entidad**, evitando mezclar normativas.
- Si hay varias obras sociales y el empleado pregunta algo ambiguo, GDP responde **“¿De qué obra social querés consultar?”** y espera que el empleado la escriba.
- La pregunta original queda pendiente: si el empleado escribe `Galeno`, GDP retoma automáticamente la consulta anterior.
- El contexto mantiene una **obra social activa** para preguntas cortas posteriores como `y cuanto dura?`.
- Si el empleado escribe otra entidad (`y sancor?`), el contexto cambia a esa obra social.
- El seguimiento opcional usa un botón único (`Ver requisitos`, `Ver vigencia`, etc.) en lugar de Sí/No.
- Se conserva el Modo diagnóstico con scores, chunks, tokens y tiempo.
- Selector de GPT-4.1 mini / GPT-5.6 Terra.

## Instalación

1. Crear `.env.local`:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

2. Instalar y ejecutar:

```bash
npm install
npm run dev
```

3. Abrir `http://localhost:3000`.

## Importante para actualizar desde v4

Los documentos cargados con v4 no tenían el atributo `entity_key`. Para probar el filtrado estricto de v5, reiniciá el laboratorio y cargá nuevamente Galeno y Sancor indicando su entidad en el nuevo campo.


## v7 - Ajuste de altura del chat
- En escritorio, el panel de chat toma automáticamente la misma altura que el panel de Normativas.
- La conversación usa scroll interno cuando supera esa altura.
- En pantallas angostas vuelve a altura automática para mantener el diseño responsive.


## Cambio v7: cambio de obra social por nombre parcial

- Reconoce menciones naturales como `y sancor?`, `ahora sancor`, `en galeno` y nombres parciales inequívocos.
- Una entidad mencionada explícitamente en el mensaje actual tiene prioridad sobre la entidad activa anterior.
- File Search se filtra inmediatamente por la nueva `entity_key`, evitando buscar `Sancor` dentro de documentos de Galeno.
- Si dos entidades resultaran igualmente compatibles con lo escrito, GDP pide aclaración en vez de elegir una arbitrariamente.


## Cambios v8
- Las respuestas con varios requisitos, pasos o condiciones se presentan como listas verticales.
- Las consultas puntuales (porcentaje, cobertura, sí/no) se mantienen en una sola frase, sin agregar información no solicitada.
- Los detalles opcionales también usan listas cuando contienen varios puntos.
