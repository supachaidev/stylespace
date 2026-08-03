/**
 * generate.ts — POST /api/generate
 * ===================================
 *
 * First Gemini call in the pipeline: room schematic + style description →
 * photorealistic isometric 3D render.
 *
 * After Gemini returns, a verify-and-retry pass kicks in: Claude Vision
 * compares the render to the schematic and scores layout fidelity. If the
 * score is below the threshold AND Claude flags it as retryable, we
 * regenerate ONCE with the specific issues appended as corrective feedback.
 * This catches the worst outliers (wrong room count, squared-off L-shapes,
 * missing rooms) without unbounded retry cost.
 *
 * Results are cached in KV keyed by `sha256(image)_sha256(prompt)`.
 * Repeated (image, style) requests skip both Gemini and the verify pass.
 */

import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../_lib/env';
import { checkRateLimit } from '../_lib/ratelimit';
import { bytesToBase64 } from '../_lib/base64';
import { getFile } from '../_lib/formdata';
import { sha256Hex } from '../_lib/hash';
import { getCached, setCached } from '../_lib/cache';
import { buildBasePrompt, buildVerifyPrompt } from '../_lib/prompts';

interface RoomData {
  rooms: { label: string; x: number; y: number; width: number; depth: number }[];
}

interface VerifyResult {
  score: number;
  room_count_correct: boolean;
  outline_shape_correct: boolean;
  issues: string[];
  should_retry: boolean;
}

const VERIFY_SCORE_THRESHOLD = 70;

async function callGemini(
  ai: GoogleGenAI,
  prompt: string,
  imageB64: string,
): Promise<string | null> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: imageB64 } },
      ],
    }],
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData;
    if (inline?.mimeType?.startsWith('image/') && inline.data) {
      return inline.data;
    }
  }
  return null;
}

// Verify the render against the schematic. Failures here are non-fatal — the
// caller falls back to "ship the render as-is" rather than failing the request.
async function verifyRender(
  client: Anthropic,
  schematicB64: string,
  renderB64: string,
  rooms: { label: string }[],
): Promise<VerifyResult | null> {
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      thinking: { type: 'disabled' },
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: schematicB64 } },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: renderB64 } },
          { type: 'text', text: buildVerifyPrompt(rooms) },
        ],
      }],
    });

    const first = message.content.find((b) => b.type === 'text');
    if (!first || first.type !== 'text') return null;
    let text = first.text.trim();
    if (text.startsWith('```')) {
      const nl = text.indexOf('\n');
      const last = text.lastIndexOf('```');
      if (nl > 0 && last > nl) text = text.slice(nl + 1, last).trim();
    }
    const parsed = JSON.parse(text) as Partial<VerifyResult>;
    if (typeof parsed.score !== 'number' || !Array.isArray(parsed.issues)) return null;
    return {
      score: parsed.score,
      room_count_correct: parsed.room_count_correct === true,
      outline_shape_correct: parsed.outline_shape_correct === true,
      issues: parsed.issues.filter((s): s is string => typeof s === 'string'),
      should_retry: parsed.should_retry === true,
    };
  } catch {
    return null;
  }
}

function buildCorrectivePrompt(basePrompt: string, issues: string[]): string {
  // A mirrored layout gets a directional instruction, not just the issue list —
  // "fix: mirrored" alone tends to reproduce the same camera choice.
  const mirrorHint = issues.some((s) => /mirror/i.test(s))
    ? '\nThe previous render was MIRRORED left-to-right. Re-read the [L] and [R] markers in the schematic\'s FRONT band: the [L] edge must be on the LEFT of the image. Flip your camera to the correct side.'
    : '';

  return `${basePrompt}

PREVIOUS ATTEMPT HAD THESE LAYOUT PROBLEMS — fix them in this regeneration:
${issues.map((s) => `- ${s}`).join('\n')}${mirrorHint}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const limited = await checkRateLimit(env.STYLESPACE_RENDER_CACHE, request);
    if (limited) return limited;

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

    // room_data is client-supplied — a bad payload is the caller's error
    // (400), not ours (500). buildBasePrompt calls .toFixed() on the
    // coordinates, so non-finite numbers would otherwise throw mid-request.
    let rooms: RoomData['rooms'];
    try {
      const parsed = JSON.parse(roomDataRaw) as RoomData;
      rooms = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
    } catch {
      return Response.json({ error: 'room_data is not valid JSON' }, { status: 400 });
    }
    const roomsValid = rooms.every((r) =>
      typeof r?.label === 'string' &&
      [r.x, r.y, r.width, r.depth].every((n) => Number.isFinite(n)));
    if (!roomsValid) {
      return Response.json({ error: 'room_data rooms are malformed' }, { status: 400 });
    }

    const imageBytes = new Uint8Array(await file.arrayBuffer());
    const imageHash = await sha256Hex(imageBytes, 16);

    const cached = await getCached(env.STYLESPACE_RENDER_CACHE, imageHash, stylePrompt, materialSummary);
    if (cached) {
      return Response.json({ render_url: `data:image/png;base64,${cached}` });
    }

    const prompt = buildBasePrompt(rooms, stylePrompt, materialSummary);
    const imageB64 = bytesToBase64(imageBytes);

    const ai = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });
    let renderB64 = await callGemini(ai, prompt, imageB64);
    if (!renderB64) {
      return Response.json({ error: 'Gemini did not return an image.' }, { status: 502 });
    }

    // Verify-and-retry. Verify failures fall through (we ship the first render).
    // A successful retry replaces the render before we cache.
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const verdict = await verifyRender(anthropic, imageB64, renderB64, rooms);
    if (verdict && verdict.should_retry && verdict.score < VERIFY_SCORE_THRESHOLD && verdict.issues.length > 0) {
      const retryPrompt = buildCorrectivePrompt(prompt, verdict.issues);
      const retryB64 = await callGemini(ai, retryPrompt, imageB64);
      if (retryB64) renderB64 = retryB64;
    }

    await setCached(env.STYLESPACE_RENDER_CACHE, imageHash, stylePrompt, renderB64, materialSummary);
    return Response.json({ render_url: `data:image/png;base64,${renderB64}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};
