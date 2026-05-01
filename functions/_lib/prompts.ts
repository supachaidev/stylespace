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
  area_sqm?: number;
  zone?: 'wet' | 'dry';
  fixtures?: string[];
}

// ─── Claude Vision: floor-plan → room JSON ─────────────────────────────────
export const ANALYZE_PROMPT = `You are analyzing a 2D floor plan image. Your output drives both a 3D
render AND a real bill of materials for SCG renovation products, so the
quantities below must be plausible — they will be multiplied by tile/paint
prices to produce a quote.

COORDINATE SYSTEM (for the visual layout):
- The image is a 1.0 × 1.0 grid.
- x=0.0 is the LEFT edge, x=1.0 is the RIGHT edge.
- y=0.0 is the TOP edge, y=1.0 is the BOTTOM edge.
- (x, y) is the TOP-LEFT corner of a room's bounding box.
- width extends RIGHT from x, depth extends DOWN from y.

REAL-WORLD DIMENSIONS:
- Look at any dimension labels on the plan. If sizes are shown in metres or
  millimetres, use them. Otherwise, infer realistic sizes from typical Thai
  apartment/house room dimensions (bedroom 9-16 m², bathroom 3-6 m², living
  10-25 m², kitchen 6-12 m², balcony 2-5 m²).
- For each room, output:
    - area_sqm: floor area in square metres (number)
    - zone: "wet" for bathrooms / kitchens / laundry; otherwise "dry"
    - fixtures: array of items visible inside the room (lowercase strings).
      Use these labels when present: "toilet", "basin", "shower", "bathtub",
      "kitchen_sink", "stove", "fridge". Empty array for rooms with none.

LAYOUT RULES:
1. Identify all rooms and their labels.
2. Mentally divide the floor plan into a grid; place rooms so they tile
   together — shared walls should have matching coordinates.
3. Rooms must NOT overlap. Check every pair.
4. Rooms should collectively cover the entire floor plan with minimal gaps.
5. Use increments of 0.05 for cleaner alignment.

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
      "color": "#E8D5B7",
      "area_sqm": 18,
      "zone": "dry",
      "fixtures": []
    }
  ],
  "total_rooms": 5
}

Room types: living, bedroom, kitchen, bathroom, dining, corridor, balcony, other
Colors: living=#E8D5B7, bedroom=#B7C4E8, kitchen=#E8E4B7, bathroom=#B7E8E4,
        dining=#E8C4B7, corridor=#D4D4D4, balcony=#C4E8B7, other=#E0E0E0

IMPORTANT: All room labels MUST be in English, even if the floor plan has labels in another language. Translate them.`;

// ─── Gemini: floor-plan → first render ─────────────────────────────────────
export function buildBasePrompt(
  rooms: RoomLike[],
  stylePrompt: string,
  materialSummary?: string,
): string {
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

  // When the recommend endpoint has run, the BOM's material summary is the
  // ground-truth list of finishes the user is paying for — make Gemini honour
  // it instead of inventing materials.
  const materialBlock = materialSummary && materialSummary.trim()
    ? `\nMATERIALS USED (these are the actual SCG products in the BOM — render them faithfully):\n${materialSummary}\n`
    : '';

  return `Generate a photorealistic isometric 3D cutaway rendering of this apartment floor plan.

The apartment has exactly ${total} rooms:
${roomDescriptions}

INTERIOR DESIGN STYLE:
${stylePrompt}
${materialBlock}
REQUIREMENTS:
- Isometric view from above at a 45-degree angle, no roof, all rooms visible.
- Show exactly ${total} rooms matching the floor plan layout — no more, no less.
- Add furniture appropriate to each room type.
- Professional architectural rendering, high quality, detailed.
- The layout must match the original floor plan.`;
}

// ─── Claude: rooms + style → SCG product BOM ───────────────────────────────
//
// Produces a real renovation quote from the room analysis. The output drives
// both the BOM panel (price + per-pick rationale) and the Gemini render
// prompt (the material_summary line is appended to the style prompt so the
// render visibly uses the chosen finishes).

interface RecommendRoom {
  id: string;
  label: string;
  type: string;
  area_sqm: number;
  zone: 'wet' | 'dry';
  fixtures: string[];
}

export function buildRecommendPrompt(
  rooms: RecommendRoom[],
  styleLabel: string,
  stylePrompt: string,
  catalogText: string,
  quizTags: string[] = [],
): string {
  const roomsBlock = rooms.map((r) =>
    `  - ${r.id}: "${r.label}" (type=${r.type}, area=${r.area_sqm} m², zone=${r.zone}, fixtures=[${r.fixtures.join(',') || 'none'}])`
  ).join('\n');

  // The lifestyle profile lets Claude tie picks back to the user's actual
  // quiz answers — "you said you cook every day" lands harder than a
  // generic style-based justification.
  const profileBlock = quizTags.length > 0
    ? `\nUSER LIFESTYLE PROFILE (from a 6-question quiz the user just took):\n${quizTags.map((tag) => `  - ${tag}`).join('\n')}\n\nWhen writing reasons and the rationale, reference SPECIFIC items from this profile (not the style label). Examples: "your cook-every-day kitchen needs a durable matte porcelain", "the spa-like bathroom you wanted pairs well with the freestanding tub". Each reason_en/th should connect to either a profile item OR a concrete material property — never just restate the style.\n`
    : '';

  return `You are a Thai interior-renovation specialist building a SCG bill of materials for a homeowner.

DESIGN STYLE: ${styleLabel}
STYLE NOTES: ${stylePrompt}
${profileBlock}
ROOMS (from the floor-plan analysis):
${roomsBlock}

SCG PRODUCT CATALOG (pick ONLY from these SKUs):
${catalogText}

YOUR TASK:
For every room above, recommend SCG products that fit BOTH the design style
and the room's purpose. Follow these rules exactly:

1) FLOOR for every room — pick exactly ONE product from category=floor_tile.
   quantity = round(area_sqm × 1.10, 1)   // 10% cut/waste overage

2) WALL FINISH for every room — pick exactly ONE of:
   - category=wall_tile  (preferred for wet zones, especially bathrooms)
   - category=wall_panel (for accent walls in dry zones)
   - category=paint      (for the rest of the dry zones)
   For tile/panel (unit=m²): quantity = round(4 × sqrt(area_sqm) × 2.4, 1)   // perimeter × wall height
   For paint (unit=9L_can): quantity = max(1, ceil( (4 × sqrt(area_sqm) × 2.6) / 60 ))

3) SANITARY WARE — only for wet zones, and only when the fixture is listed
   in the room's "fixtures" array.
   - "toilet"  → ONE product from subcategory=toilet,  quantity=1
   - "basin"   → ONE product from subcategory=basin,   quantity=1
   - "basin"   → ONE matching faucet (subcategory=faucet), quantity=1
   - "shower"  → ONE product from subcategory=shower,  quantity=1
   - "bathtub" → ONE product from subcategory=bathtub, quantity=1
   Do NOT invent fixtures that aren't listed. Skip "kitchen_sink"/"stove"/
   "fridge" for now — they are not in the catalog.

4) ROOFING — skip entirely (this is interior renovation).

Pick products whose style_tags overlap with the style. Prefer products
tagged with the style ID; only fall back to neutral picks when needed.
Stay consistent across rooms — the same floor tile family should be used
for connected dry zones unless the user clearly wants contrast.

OUTPUT — return ONLY valid JSON. No markdown, no code fences.

{
  "picks": [
    {
      "sku": "COT-FT-002",
      "room_id": "room_1",
      "quantity": 19.8,
      "reason_en": "Light-oak plank reinforces the bright Scandinavian feel and ties into the dining area.",
      "reason_th": "ลายไม้โอ๊คอ่อนช่วยเสริมความสว่างของสไตล์สแกนดิเนเวียน และเชื่อมกับห้องทานข้าว"
    }
  ],
  "rationale_en": "1-3 sentences explaining the overall material story — why these picks work together for THIS user.",
  "rationale_th": "ภาษาไทย 1-3 ประโยค อธิบายภาพรวมว่าวัสดุที่เลือกทำงานร่วมกันอย่างไรสำหรับผู้ใช้คนนี้",
  "material_summary": "A SHORT phrase (≤180 chars) describing the dominant materials and colours so a 3D render can use them. Example: 'light oak wood-look floors, pure white walls with one charcoal accent wall, brushed brass fixtures, white sanitary ware'."
}

Constraints:
- Every "sku" you output MUST appear in the catalog above (case-sensitive).
- Every "room_id" MUST match one of the room IDs above.
- Reasons must be concrete (mention a material/colour/feel), not generic.
- "reason_en" and "reason_th" should each be ≤120 characters.`;
}

// ─── Gemini: existing render → new style ───────────────────────────────────
export function buildRestylePrompt(stylePrompt: string, materialSummary?: string): string {
  const materialBlock = materialSummary && materialSummary.trim()
    ? `\nMATERIALS TO USE (these are the actual SCG products in the BOM — render them faithfully):\n${materialSummary}\n`
    : '';

  return `Transform this interior design rendering into a different style.
Keep the EXACT same room layout, camera angle, and room positions. Do NOT change the architecture or room arrangement.
Only change the interior design style: walls, floors, furniture, lighting, and decor.

NEW STYLE:
${stylePrompt}
${materialBlock}
RULES:
- Keep the same isometric camera angle and room positions exactly as shown.
- Replace all furniture, wall colors, floor materials, and decorations to match the new style.
- Every room must remain in the same position and size.
- The result should look like the same apartment redesigned by a different interior designer.`;
}
