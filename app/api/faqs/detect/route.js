import OpenAI from 'openai';
import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { requireAdminActor } from '../../../../lib/server/gdp-actor';
import { rebuildFaqSignalsFromLog } from '../../../../lib/server/faq-detection.mjs';
import { getSuggestThreshold } from '../../../../lib/faqs/semantic.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST: analiza las consultas del piloto ya registradas, las agrupa por significado
// y propone como FAQ las que llegaron al umbral. Es seguro repetirlo.
export async function POST(request) {
  const access = await requireAdminActor(request);
  if (!access.actor) return Response.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embed = async (texts) => (await openai.embeddings.create({
      model: 'text-embedding-3-small', input: texts, dimensions: 256,
    })).data.map((item) => item.embedding);
    const summary = await rebuildFaqSignalsFromLog({ db: supabaseAdmin, embed });
    return Response.json({ ok: true, threshold: getSuggestThreshold(), ...summary });
  } catch (error) {
    console.error('POST /api/faqs/detect error:', error);
    return Response.json({ ok: false, error: error?.message || 'No se pudo analizar el piloto' }, { status: 500 });
  }
}
