// v3.13.100 — Llamada a OpenAI (chat completions, salida JSON) con tiempo máximo y reintento ante 429/5xx.
export function makeCallModel({ apiKey, timeoutMs = 60000, retries = 2 } = {}) {
  return async function callModel(messages, { model, onDelta } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: ctl.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, ...(/^gpt-4/i.test(model) ? { temperature: 0 } : {}), ...(onDelta ? { stream: true, stream_options: { include_usage: true } } : {}) }) });  // temperatura 0: misma pregunta, misma respuesta (o1/o4/gpt-5 no la admiten)
        if ((r.status === 429 || r.status >= 500) && attempt < retries) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); continue; }
        if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
        if (onDelta && r.body) {
          // v3.13.164 — streaming: se acumula el texto y se avisa cada fragmento (el resultado final es el mismo).
          const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; let text = ''; let tin = 0; let tout = 0;
          const take = (line) => {
            if (!line.startsWith('data:')) return; const d = line.slice(5).trim(); if (!d || d === '[DONE]') return;
            let j; try { j = JSON.parse(d); } catch { return; }
            const piece = j.choices?.[0]?.delta?.content; if (piece) { text += piece; try { onDelta(text); } catch { /* el borrador no puede romper la respuesta */ } }
            if (j.usage) { tin = j.usage.prompt_tokens || 0; tout = j.usage.completion_tokens || 0; }
          };
          for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let n; while ((n = buf.indexOf('\n')) !== -1) { take(buf.slice(0, n).trim()); buf = buf.slice(n + 1); } }
          if (buf.trim()) take(buf.trim());
          return { text, tin, tout };
        }
        const j = await r.json();
        return { text: j.choices?.[0]?.message?.content || '', tin: j.usage?.prompt_tokens || 0, tout: j.usage?.completion_tokens || 0 };
      } catch (e) { if (attempt >= retries) throw e; } finally { clearTimeout(t); }
    }
    throw new Error('OpenAI no respondió');
  };
}
