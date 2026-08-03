/**
 * restyle.ts — POST /api/restyle
 * ==================================
 *
 * Takes an existing render (data URL) and asks Gemini to redecorate it in
 * a new style while preserving the layout and camera angle exactly. This
 * is cheaper and faster than regenerating from the floor plan.
 *
 * Cached in KV with a `restyle_` prefix so the key space doesn't collide
 * with the /generate cache.
 */

import { GoogleGenAI } from '@google/genai';
import type { Env } from '../_lib/env';
import { checkRateLimit } from '../_lib/ratelimit';
import { stripDataUrlPrefix } from '../_lib/base64';
import { sha256Hex } from '../_lib/hash';
import { getCached, setCached } from '../_lib/cache';
import { buildRestylePrompt } from '../_lib/prompts';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const limited = await checkRateLimit(request);
    if (limited) return limited;

    const form = await request.formData();
    const baseImage = form.get('base_image');
    const stylePrompt = form.get('style_prompt');
    const materialSummaryRaw = form.get('material_summary');
    const materialSummary = typeof materialSummaryRaw === 'string' && materialSummaryRaw.trim()
      ? materialSummaryRaw
      : undefined;

    if (typeof baseImage !== 'string' || typeof stylePrompt !== 'string') {
      return Response.json({ error: 'Missing base_image or style_prompt' }, { status: 400 });
    }

    const b64 = stripDataUrlPrefix(baseImage);

    // Fingerprint the whole base64 string. A prefix-only hash (the old
    // Python port hashed 2 KB) risks serving the wrong cached render if two
    // base images ever share a prefix — and hashing ~300 KB costs microseconds.
    const fingerprint = `restyle_${await sha256Hex(b64, 16)}`;

    const cached = await getCached(env.STYLESPACE_RENDER_CACHE, fingerprint, stylePrompt, materialSummary);
    if (cached) {
      return Response.json({ render_url: `data:image/png;base64,${cached}` });
    }

    const prompt = buildRestylePrompt(stylePrompt, materialSummary);
    const ai = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: b64 } },
        ],
      }],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.mimeType?.startsWith('image/') && inline.data) {
        await setCached(env.STYLESPACE_RENDER_CACHE, fingerprint, stylePrompt, inline.data, materialSummary);
        return Response.json({ render_url: `data:image/png;base64,${inline.data}` });
      }
    }

    return Response.json({ error: 'Gemini did not return an image.' }, { status: 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};
