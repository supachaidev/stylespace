/**
 * prompts.ts — Prompt Builders for Claude + Gemini
 * ==================================================
 *
 * Keeping all prompt text in one file makes it easy to tune without
 * touching the endpoint logic. Prompts here are verbatim ports of the
 * originals in backend/analyze.py and backend/render.py.
 */

interface RoomLike {
  label: string;
  x: number;
  y: number;
  width: number;
  depth: number;
}

// ─── Claude Vision: floor-plan → room JSON ─────────────────────────────────
export const ANALYZE_PROMPT = `You are analyzing a 2D floor plan image to extract room bounding boxes for a 3D visualization.

COORDINATE SYSTEM:
- The image is a 1.0 × 1.0 grid.
- x=0.0 is the LEFT edge, x=1.0 is the RIGHT edge.
- y=0.0 is the TOP edge, y=1.0 is the BOTTOM edge.
- (x, y) is the TOP-LEFT corner of a room's bounding box.
- width extends RIGHT from x, depth extends DOWN from y.

STEP-BY-STEP PROCESS:
1. First, identify all rooms and their labels from the floor plan.
2. Mentally divide the floor plan into a grid. Think about which rooms are adjacent to which.
3. Place rooms so they TILE together like puzzle pieces — shared walls should have matching coordinates.
   For example, if Room A ends at x=0.5 (x=0.1, width=0.4), the room to its right should start at x=0.5.
4. CRITICAL: Rooms must NOT overlap. Check every pair. If room A occupies x=[0.1, 0.5] y=[0.0, 0.4] and room B occupies x=[0.3, 0.7] y=[0.2, 0.6], they overlap — fix this.
5. Rooms should collectively cover the entire floor plan area with minimal gaps.
6. Use increments of 0.05 for cleaner alignment.

Return ONLY valid JSON. No markdown, no explanation, no code fences.

{
  "rooms": [
    {
      "id": "room_1",
      "label": "Living Room",
      "type": "living",
      "x": 0.0,
      "y": 0.0,
      "width": 0.5,
      "depth": 0.4,
      "color": "#E8D5B7"
    }
  ],
  "total_rooms": 5
}

Room types: living, bedroom, kitchen, bathroom, dining, corridor, balcony, other
Colors: living=#E8D5B7, bedroom=#B7C4E8, kitchen=#E8E4B7, bathroom=#B7E8E4,
        dining=#E8C4B7, corridor=#D4D4D4, balcony=#C4E8B7, other=#E0E0E0

IMPORTANT: All room labels MUST be in English, even if the floor plan has labels in another language. Translate them.`;

// ─── Gemini: floor-plan → first render ─────────────────────────────────────
export function buildBasePrompt(rooms: RoomLike[], stylePrompt: string): string {
  const total = rooms.length;

  const roomDescriptions = rooms.map((room) => {
    const cx = room.x + room.width / 2;
    const cy = room.y + room.depth / 2;
    const hPos = cx < 0.35 ? 'left' : cx > 0.65 ? 'right' : 'center';
    const vPos = cy < 0.35 ? 'top' : cy > 0.65 ? 'bottom' : 'middle';
    const area = room.width * room.depth;
    const size = area > 0.1 ? 'large' : area < 0.04 ? 'small' : 'medium';
    return `- ${room.label} (${size}, at ${vPos}-${hPos} of the plan)`;
  }).join('\n');

  return `Generate a photorealistic isometric 3D cutaway rendering of this apartment floor plan.

The apartment has exactly ${total} rooms:
${roomDescriptions}

INTERIOR DESIGN STYLE:
${stylePrompt}

REQUIREMENTS:
- Isometric view from above at a 45-degree angle, no roof, all rooms visible.
- Show exactly ${total} rooms matching the floor plan layout — no more, no less.
- Add furniture appropriate to each room type.
- Professional architectural rendering, high quality, detailed.
- The layout must match the original floor plan.`;
}

// ─── Gemini: existing render → new style ───────────────────────────────────
export function buildRestylePrompt(stylePrompt: string): string {
  return `Transform this interior design rendering into a different style.
Keep the EXACT same room layout, camera angle, and room positions. Do NOT change the architecture or room arrangement.
Only change the interior design style: walls, floors, furniture, lighting, and decor.

NEW STYLE:
${stylePrompt}

RULES:
- Keep the same isometric camera angle and room positions exactly as shown.
- Replace all furniture, wall colors, floor materials, and decorations to match the new style.
- Every room must remain in the same position and size.
- The result should look like the same apartment redesigned by a different interior designer.`;
}
