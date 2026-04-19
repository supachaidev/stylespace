/**
 * analyze.ts — POST /api/analyze
 * ================================
 *
 * Floor Plan Room Detection via Claude Vision. Verbatim port of the Python
 * analyze_rooms() + fix_overlaps(). Runs as a Cloudflare Pages Function.
 *
 * The image is resized in the browser before upload (see src/lib/resize.ts),
 * so this endpoint just forwards the bytes to Claude and normalises the
 * response. Returns the same JSON shape the Python backend returned.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../_lib/env';
import { bytesToBase64 } from '../_lib/base64';
import { getFile } from '../_lib/formdata';
import { ANALYZE_PROMPT } from '../_lib/prompts';

interface Room {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  color: string;
}

interface RoomData {
  rooms: Room[];
  total_rooms: number;
}

const FALLBACK: RoomData = {
  rooms: [{
    id: 'room_1', label: 'Room', type: 'other',
    x: 0.1, y: 0.1, width: 0.8, depth: 0.8, color: '#E0E0E0',
  }],
  total_rooms: 1,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Even with careful prompting, Claude sometimes returns rooms that overlap
 * slightly. Iterate over every pair and shrink the overlapping one along
 * whichever axis has the smaller overlap (less visual distortion).
 */
function fixOverlaps(rooms: Room[]): Room[] {
  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i];
    for (let j = i + 1; j < rooms.length; j++) {
      const b = rooms[j];
      const ax1 = a.x, ay1 = a.y;
      const ax2 = a.x + a.width, ay2 = a.y + a.depth;
      const bx1 = b.x, by1 = b.y;
      const bx2 = b.x + b.width, by2 = b.y + b.depth;

      if (ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1) {
        const overlapX = Math.min(ax2 - bx1, bx2 - ax1);
        const overlapY = Math.min(ay2 - by1, by2 - ay1);

        if (overlapX < overlapY) {
          if (ax1 < bx1) a.width = Math.max(0.05, bx1 - ax1);
          else b.width = Math.max(0.05, ax1 - bx1);
        } else {
          if (ay1 < by1) a.depth = Math.max(0.05, by1 - ay1);
          else b.depth = Math.max(0.05, ay1 - by1);
        }
      }
    }
  }
  return rooms;
}

function parseClaudeJSON(raw: string): RoomData {
  let text = raw.trim();
  // Sometimes Claude wraps JSON in ```json ... ``` fences despite being asked not to
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n');
    const lastFence = text.lastIndexOf('```');
    if (firstNewline > 0 && lastFence > firstNewline) {
      text = text.slice(firstNewline + 1, lastFence).trim();
    }
  }
  const data = JSON.parse(text) as RoomData;

  for (const room of data.rooms ?? []) {
    room.x = clamp(Number(room.x), 0, 1);
    room.y = clamp(Number(room.y), 0, 1);
    room.width = clamp(Number(room.width), 0, 1);
    room.depth = clamp(Number(room.depth), 0, 1);
    if (room.x + room.width > 1) room.width = 1 - room.x;
    if (room.y + room.depth > 1) room.depth = 1 - room.y;
  }

  if (!data.rooms || data.rooms.length === 0) return FALLBACK;
  data.rooms = fixOverlaps(data.rooms);
  return data;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const form = await request.formData();
    const file = getFile(form, 'file');
    if (!file) {
      return Response.json({ error: 'Missing file' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const b64 = bytesToBase64(bytes);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
          },
          { type: 'text', text: ANALYZE_PROMPT },
        ],
      }],
    });

    const first = message.content[0];
    if (first.type !== 'text') return Response.json(FALLBACK);

    try {
      return Response.json(parseClaudeJSON(first.text));
    } catch {
      return Response.json(FALLBACK);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};
