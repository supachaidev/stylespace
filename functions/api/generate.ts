/**
 * generate.ts — POST /api/generate
 * ===================================
 *
 * First Gemini call in the pipeline: floor-plan image + room layout +
 * style description → photorealistic isometric 3D render.
 *
 * Results are cached in KV keyed by `sha256(image)_sha256(prompt)`.
 * Repeated (image, style) requests skip Gemini entirely.
 */

import { GoogleGenAI } from '@google/genai';
import type { Env } from '../_lib/env';
import { bytesToBase64 } from '../_lib/base64';
import { getFile } from '../_lib/formdata';
import { sha256Hex } from '../_lib/hash';
import { getCached, setCached } from '../_lib/cache';
import { buildBasePrompt } from '../_lib/prompts';

interface RoomData {
  rooms: { label: string; x: number; y: number; width: number; depth: number }[];
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const form = await request.formData();
    const file = getFile(form, 'file');
    const stylePrompt = form.get('style_prompt');
    const roomDataRaw = form.get('room_data');
    const materialSummaryRaw = form.get('material_summary');
    const materialSummary = typeof materialSummaryRaw === 'string' && materialSummaryRaw.trim()
      ? materialSummaryRaw
      : undefined;

    if (!file || typeof stylePrompt !== 'string' || typeof roomDataRaw !== 'string') {
      return Response.json({ error: 'Missing file, style_prompt, or room_data' }, { status: 400 });
    }

    const rooms = (JSON.parse(roomDataRaw) as RoomData).rooms ?? [];
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    const imageHash = await sha256Hex(imageBytes, 16);

    // Cache check — avoids redundant Gemini calls entirely. The materials
    // hash means swapping a SKU regenerates without invalidating other
    // (style, BOM) combinations on the same image.
    const cached = await getCached(env.STYLESPACE_RENDER_CACHE, imageHash, stylePrompt, materialSummary);
    if (cached) {
      return Response.json({ render_url: `data:image/png;base64,${cached}` });
    }

    const prompt = buildBasePrompt(rooms, stylePrompt, materialSummary);
    const imageB64 = bytesToBase64(imageBytes);

    const ai = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: imageB64 } },
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
        await setCached(env.STYLESPACE_RENDER_CACHE, imageHash, stylePrompt, inline.data, materialSummary);
        return Response.json({ render_url: `data:image/png;base64,${inline.data}` });
      }
    }

    return Response.json({ error: 'Gemini did not return an image.' }, { status: 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};
