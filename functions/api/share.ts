/**
 * share.ts — POST/GET /api/share
 * =================================
 *
 * Persists a result snapshot (render image + BOM + style + analysis +
 * quiz tags) under a random short ID so the user can paste a link and
 * have someone else open the same result.
 *
 *   POST /api/share
 *     body: SharePayload
 *     → 200 { id: "abc12345" }
 *     The frontend builds the URL (e.g. https://app/?share=abc12345)
 *     and copies it to the clipboard.
 *
 *   GET  /api/share?id=abc12345
 *     → 200 SharePayload
 *     → 404 { error: "Not found" }
 *
 * Storage lives in the existing KV namespace (STYLESPACE_RENDER_CACHE),
 * keyed `share_<id>`. Entries expire after 30 days — long enough for the
 * recipient to actually open it, short enough to bound storage cost.
 */

import type { Env } from '../_lib/env';

interface SharePayload {
  render_url: string;       // Full data:image/png;base64,... URL
  style_id: string;
  style_label: string;
  style_description: string;
  bom: unknown;             // Whole RecommendResponse — opaque to this endpoint
  analysis: unknown;        // Whole AnalyzeResponse — opaque to this endpoint
  quiz_tags?: string[];     // Optional, only when the user took the quiz
}

const TTL_SECONDS = 60 * 60 * 24 * 30;       // 30 days
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;   // 5 MB — KV allows 25, but our renders are ~300 KB; this caps abuse

/** 8-char base32 ID (≈ 40 bits of randomness). Collision odds are negligible
 *  at the share volumes we care about. */
function newShareId(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  // Crockford-style alphabet (no I, L, O, U) so links don't get misread.
  const alpha = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let out = '';
  for (const b of bytes) {
    out += alpha[b & 31];
    out += alpha[(b >> 3) & 31];
  }
  return out.slice(0, 8).toLowerCase();
}

function looksLikePngDataUrl(s: unknown): s is string {
  return typeof s === 'string' && s.startsWith('data:image/png;base64,');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const text = await request.text();
    if (text.length > MAX_PAYLOAD_BYTES) {
      return Response.json({ error: 'Payload too large' }, { status: 413 });
    }

    const payload = JSON.parse(text) as SharePayload;
    if (!looksLikePngDataUrl(payload?.render_url)) {
      return Response.json({ error: 'Missing or invalid render_url' }, { status: 400 });
    }
    if (typeof payload.style_id !== 'string' || typeof payload.style_label !== 'string') {
      return Response.json({ error: 'Missing style' }, { status: 400 });
    }

    const id = newShareId();
    await env.STYLESPACE_RENDER_CACHE.put(`share_${id}`, text, {
      expirationTtl: TTL_SECONDS,
    });

    return Response.json({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  // Reject ids that aren't our own format — protects KV against scans.
  if (!id || !/^[0-9a-z]{6,16}$/.test(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  const value = await env.STYLESPACE_RENDER_CACHE.get(`share_${id}`);
  if (!value) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Stream the stored JSON straight back — saves a parse + re-stringify.
  return new Response(value, {
    headers: { 'content-type': 'application/json' },
  });
};
