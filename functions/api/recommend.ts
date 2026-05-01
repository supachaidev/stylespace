/**
 * recommend.ts — POST /api/recommend
 * =====================================
 *
 * Reasoning step that turns a floor-plan analysis + style prompt into a
 * concrete SCG bill of materials. Claude picks products from the curated
 * catalog and writes a per-pick rationale plus a material_summary that
 * feeds back into the Gemini render prompt — so the render visibly uses
 * the chosen finishes.
 *
 * Request body (application/json):
 *   {
 *     "rooms": RoomInfo[],            // from /api/analyze
 *     "style_label": string,          // human-readable style name (e.g. "Japanese Zen")
 *     "style_prompt": string          // detailed English prompt sent to Gemini
 *   }
 *
 * Response: RecommendResponse (see src/types.ts)
 *
 * The result is cached in KV under `recommend_<roomsHash>_<styleHash>` so a
 * second click on the same style during the same session skips the call.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../_lib/env';
import { sha256Hex } from '../_lib/hash';
import { buildRecommendPrompt } from '../_lib/prompts';
import { catalogForPrompt, findProduct, type Product } from '../_lib/catalog';

interface RoomInput {
  id: string;
  label: string;
  type: string;
  area_sqm: number;
  zone: 'wet' | 'dry';
  fixtures: string[];
}

interface RecommendBody {
  rooms: RoomInput[];
  style_label: string;
  style_prompt: string;
}

interface ClaudePick {
  sku: string;
  room_id: string;
  quantity: number;
  reason_en: string;
  reason_th: string;
}

interface ClaudeResponse {
  picks: ClaudePick[];
  rationale_en: string;
  rationale_th: string;
  material_summary: string;
}

interface BomLine {
  sku: string;
  name_en: string;
  name_th: string;
  category: string;
  swatch: string;
  unit: string;
  unit_price_thb: number;
  quantity: number;
  line_total_thb: number;
  reason_en: string;
  reason_th: string;
  room_id: string;
}

interface RecommendResponse {
  bom: BomLine[];
  grand_total_thb: number;
  rationale_en: string;
  rationale_th: string;
  material_summary: string;
}

function parseClaudeJSON(raw: string): ClaudeResponse {
  let text = raw.trim();
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n');
    const lastFence = text.lastIndexOf('```');
    if (firstNewline > 0 && lastFence > firstNewline) {
      text = text.slice(firstNewline + 1, lastFence).trim();
    }
  }
  return JSON.parse(text) as ClaudeResponse;
}

function roundQuantity(q: number, unit: Product['unit']): number {
  if (unit === 'piece' || unit === '9L_can') return Math.max(1, Math.round(q));
  // For m² we keep one decimal so the user sees "19.8 m²" not just "20".
  return Math.max(0.1, Math.round(q * 10) / 10);
}

function buildBomLines(claude: ClaudeResponse, roomIds: Set<string>): BomLine[] {
  const lines: BomLine[] = [];
  for (const pick of claude.picks ?? []) {
    const product = findProduct(pick.sku);
    if (!product) continue;                           // drop hallucinated SKUs
    if (!roomIds.has(pick.room_id)) continue;         // drop hallucinated rooms

    const qty = roundQuantity(Number(pick.quantity) || 0, product.unit);
    if (qty <= 0) continue;

    lines.push({
      sku: product.sku,
      name_en: product.name_en,
      name_th: product.name_th,
      category: product.category,
      swatch: product.swatch,
      unit: product.unit,
      unit_price_thb: product.price_thb,
      quantity: qty,
      line_total_thb: Math.round(qty * product.price_thb),
      reason_en: typeof pick.reason_en === 'string' ? pick.reason_en.slice(0, 240) : '',
      reason_th: typeof pick.reason_th === 'string' ? pick.reason_th.slice(0, 240) : '',
      room_id: pick.room_id,
    });
  }
  return lines;
}

async function cacheKey(rooms: RoomInput[], stylePrompt: string): Promise<string> {
  // Hash a stable shape: only the fields that influence the BOM. We omit
  // labels because Claude doesn't read them at this step (the room's type,
  // size, and zone are what matter).
  const compact = rooms.map((r) => ({
    id: r.id, type: r.type, area: Math.round(r.area_sqm * 10) / 10,
    zone: r.zone, fixtures: [...r.fixtures].sort(),
  }));
  const roomsHash = await sha256Hex(JSON.stringify(compact), 16);
  const styleHash = await sha256Hex(stylePrompt, 12);
  return `recommend_${roomsHash}_${styleHash}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json<RecommendBody>();
    const rooms = Array.isArray(body?.rooms) ? body.rooms : [];
    const styleLabel = typeof body?.style_label === 'string' ? body.style_label : '';
    const stylePrompt = typeof body?.style_prompt === 'string' ? body.style_prompt : '';

    if (rooms.length === 0 || !stylePrompt) {
      return Response.json({ error: 'Missing rooms or style_prompt' }, { status: 400 });
    }

    // Cache check — same rooms+style on a repeat click skips Claude.
    const key = await cacheKey(rooms, stylePrompt);
    const cached = await env.STYLESPACE_RENDER_CACHE.get(key);
    if (cached) {
      return Response.json(JSON.parse(cached) as RecommendResponse);
    }

    const prompt = buildRecommendPrompt(rooms, styleLabel, stylePrompt, catalogForPrompt());

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });

    const first = message.content[0];
    if (first.type !== 'text') {
      return Response.json({ error: 'Claude returned no text content' }, { status: 502 });
    }

    let parsed: ClaudeResponse;
    try {
      parsed = parseClaudeJSON(first.text);
    } catch {
      return Response.json({ error: 'Could not parse recommendation JSON' }, { status: 502 });
    }

    const roomIdSet = new Set(rooms.map((r) => r.id));
    const bom = buildBomLines(parsed, roomIdSet);
    const grandTotal = bom.reduce((sum, l) => sum + l.line_total_thb, 0);

    const response: RecommendResponse = {
      bom,
      grand_total_thb: grandTotal,
      rationale_en: typeof parsed.rationale_en === 'string' ? parsed.rationale_en : '',
      rationale_th: typeof parsed.rationale_th === 'string' ? parsed.rationale_th : '',
      material_summary: typeof parsed.material_summary === 'string'
        ? parsed.material_summary.slice(0, 400)
        : '',
    };

    // KV write is fire-and-forget; this Function returns before the value
    // is replicated, but a hit later in the session avoids the Claude call.
    await env.STYLESPACE_RENDER_CACHE.put(key, JSON.stringify(response));

    return Response.json(response);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};

