// v3.13.164 — Streaming de la respuesta: utilidades compartidas (motor, rutas y chat).
// Protocolo (text/event-stream): "draft" {text} = borrador en vivo; "final" {status, data} = respuesta definitiva y verificada.

// Extrae, de un JSON que se está escribiendo, el texto parcial del campo "respuesta" (decodificando escapes).
export function extractPartialAnswer(jsonText, key = 'respuesta') {
  const s = String(jsonText || '');
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(s);
  if (!m) return '';
  let out = ''; let i = m.index + m[0].length;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') break;
    if (c === '\\') {
      const n = s[i + 1];
      if (n === undefined) break;
      if (n === 'u') { const hex = s.slice(i + 2, i + 6); if (hex.length < 4 || /[^0-9a-fA-F]/.test(hex)) break; out += String.fromCharCode(parseInt(hex, 16)); i += 6; continue; }
      out += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' })[n] ?? n; i += 2; continue;
    }
    out += c; i += 1;
  }
  return out;
}

export const sseEncode = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// Lee un cuerpo text/event-stream y llama onEvent(event, data) por cada evento completo.
export async function readSse(body, onEvent) {
  const reader = body.getReader(); const decoder = new TextDecoder(); let buf = '';
  const flush = (block) => {
    let event = 'message'; const data = [];
    for (const line of block.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, '')); }
    if (!data.length) return;
    let parsed; try { parsed = JSON.parse(data.join('\n')); } catch { return; }
    onEvent(event, parsed);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx; while ((idx = buf.indexOf('\n\n')) !== -1) { flush(buf.slice(0, idx)); buf = buf.slice(idx + 2); }
  }
  buf += decoder.decode(); if (buf.trim()) flush(buf);
}

// Respuesta SSE: run(emit) hace el trabajo y devuelve {status, data}; el último evento es siempre "final".
export function sseResponse(run) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event, data) => { if (!closed) { try { controller.enqueue(encoder.encode(sseEncode(event, data))); } catch { closed = true; } } };
      try { const out = await run(emit); emit('final', out); }
      catch (e) { emit('final', { status: 500, data: { ok: false, error: 'No pude responder la consulta.', code: 'STREAM_ERROR' } }); }
      closed = true; try { controller.close(); } catch { /* ya cerrado */ }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
