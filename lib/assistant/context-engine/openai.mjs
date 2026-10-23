// v3.13.100 — Llamada a OpenAI (chat completions, salida JSON) con tiempo máximo y reintento ante 429/5xx.
export function makeCallModel({ apiKey, timeoutMs = 60000, retries = 2 } = {}) {
  return async function callModel(messages, { model }) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: ctl.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }) });
        if ((r.status === 429 || r.status >= 500) && attempt < retries) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); continue; }
        if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j = await r.json();
        return { text: j.choices?.[0]?.message?.content || '', tin: j.usage?.prompt_tokens || 0, tout: j.usage?.completion_tokens || 0 };
      } catch (e) { if (attempt >= retries) throw e; } finally { clearTimeout(t); }
    }
    throw new Error('OpenAI no respondió');
  };
}
