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
1. Identify EVERY room that has a label or a walled boundary, INCLUDING small
   ones — entry halls, closets, alcoves, vestibules, utility nooks. Do not
   skip a room because it's small (a 1.5 m² entry hall still counts).
2. Each room's bounding box must match its actual position and size on the
   image. Use precise coordinates — do NOT round to 0.05 increments.
3. Rooms must NOT overlap. Check every pair.
4. The union of all room boxes IS the apartment's outer shape. If part of
   the image is exterior space (outside the apartment walls, outdoors, a
   neighbouring unit, blank margin), LEAVE THAT SPACE UNCOVERED. Do not
   stretch rooms to fill the image bounds.
   - An L-shaped apartment must produce L-shaped coverage (a gap in one
     corner of the image).
   - A T-shaped or irregular apartment must produce irregular coverage.
   - If you flatten an L-shape into a rectangle, the downstream 3D render
     will show the wrong building outline — this is a critical failure mode.
5. Shared interior walls between adjacent rooms should have matching
   coordinates so the rooms align cleanly.

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
const GRID_COLS = 12;
const GRID_ROWS = 8;

// 1-9, then A-Z. Floor plans rarely exceed 9 rooms; the letters cover the rest.
function roomMarker(i: number): string {
  if (i < 9) return String(i + 1);
  return String.fromCharCode('A'.charCodeAt(0) + (i - 9));
}

// Project the normalized room boxes onto an ASCII grid so Gemini gets a quick
// pictorial reference alongside the exact coordinates. Last-write-wins on
// overlaps — the textual coords remain the authoritative layout source.
function buildAsciiGrid(rooms: RoomLike[]): string {
  const grid: string[][] = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => '.'),
  );
  rooms.forEach((room, i) => {
    const marker = roomMarker(i);
    const c0 = Math.max(0, Math.floor(room.x * GRID_COLS));
    const c1 = Math.min(GRID_COLS, Math.ceil((room.x + room.width) * GRID_COLS));
    const r0 = Math.max(0, Math.floor(room.y * GRID_ROWS));
    const r1 = Math.min(GRID_ROWS, Math.ceil((room.y + room.depth) * GRID_ROWS));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) grid[r][c] = marker;
    }
  });
  return grid.map((row) => row.join('')).join('\n');
}

export function buildBasePrompt(
  rooms: RoomLike[],
  stylePrompt: string,
  materialSummary?: string,
): string {
  const total = rooms.length;

  // Exact normalized coordinates — no more vague "large, at top-left" hints.
  // The reference image already has the boxes drawn; this text is the
  // ground-truth backup if Gemini can't read the overlay precisely.
  const roomDescriptions = rooms.map((room, i) => {
    const x0 = room.x.toFixed(2);
    const x1 = (room.x + room.width).toFixed(2);
    const y0 = room.y.toFixed(2);
    const y1 = (room.y + room.depth).toFixed(2);
    return `  [${roomMarker(i)}] ${room.label}: x ${x0}–${x1}, y ${y0}–${y1}`;
  }).join('\n');

  const grid = buildAsciiGrid(rooms);

  // When the recommend endpoint has run, the BOM's material summary is the
  // ground-truth list of finishes the user is paying for — make Gemini honour
  // it instead of inventing materials.
  const materialBlock = materialSummary && materialSummary.trim()
    ? `\nMATERIALS USED (these are the actual SCG products in the BOM — render them faithfully):\n${materialSummary}\n`
    : '';

  return `Generate a photorealistic isometric 3D cutaway rendering of an apartment.

The attached image is a ROOM SCHEMATIC, not a real floor plan. Each solid coloured block is one room, labelled with a marker like [1], [2], etc. Treat the schematic as the authoritative layout: the apartment has exactly the rooms shown in the schematic, in those exact positions, with those exact relative sizes.

ORIENTATION AIDS: The dark band along the schematic's BOTTOM edge labelled "FRONT — CAMERA SIDE" marks the side of the apartment nearest the camera. The [L] and [R] letters in that band mark the layout's left and right edges. The band and its letters are orientation aids only — they are NOT rooms and NOT part of the apartment.

CRITICAL — APARTMENT OUTLINE: The union of all coloured blocks IS the apartment's outer shape. If the blocks form an L-shape, the apartment is L-shaped. If they form a T, a U, or any irregular polygon, render that EXACT polygon. The white (uncoloured) area of the schematic is OUTSIDE the apartment — do not extend walls, floors, or rooms into it. Do not square the building off into a rectangle. Do not subdivide or merge blocks.

COORDINATE SYSTEM (for cross-reference): image is a 1.0 × 1.0 grid. x = 0 left, x = 1 right; y = 0 top, y = 1 bottom.

The apartment has exactly ${total} rooms (markers match the blocks in the schematic):
${roomDescriptions}

LAYOUT GRID (${GRID_COLS}×${GRID_ROWS}, '.' = empty, each digit/letter is the room with that marker):
${grid}

INTERIOR DESIGN STYLE:
${stylePrompt}
${materialBlock}
HARD REQUIREMENTS:
- Isometric view from above at a 45-degree angle, no roof, all rooms visible.
- CAMERA POSITION: the camera sits on the schematic's BOTTOM edge (the FRONT band) looking toward the top edge. The schematic's LEFT edge (marked [L]) MUST appear on the LEFT side of the rendered image; the RIGHT edge (marked [R]) MUST appear on the RIGHT. NEVER mirror, flip, or rotate the layout — a room at x 0.0–0.3 belongs on the render's left, a room at x 0.7–1.0 on its right.
- Exactly ${total} rooms. Do not invent, merge, omit, or subdivide rooms. The room count must match the schematic.
- Each room's position and proportions must match its coloured block in the schematic. A room in the top-left of the schematic must be in the top-left of the render; a wide room must be wide.
- The apartment's outer shape must match the union of the coloured blocks EXACTLY. L-shape stays L-shape; irregular polygons stay irregular. Do not square the building off. White space in the schematic = outside the apartment.
- Add furniture appropriate to each room type (use the labels to identify type).
- Photorealistic, professional architectural rendering, high quality, detailed materials.
- Do not draw the coloured blocks, markers, labels, or the FRONT orientation band in the render — they are layout instructions only.`;
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

// ─── Claude: render fidelity check (verify-and-retry loop) ─────────────────
//
// Called after Gemini returns a render. Claude sees both the schematic and
// the render, then scores how faithfully the render reproduces the layout.
// Low scores trigger one regeneration with the specific issues appended as
// corrective feedback to the original Gemini prompt.

interface VerifyRoom {
  label: string;
}

export function buildVerifyPrompt(rooms: VerifyRoom[]): string {
  const roomList = rooms.map((r, i) => `  [${roomMarker(i)}] ${r.label}`).join('\n');

  return `You are quality-checking an AI-generated 3D apartment render against the room schematic it was supposed to follow.

You will see TWO images:
1. The room SCHEMATIC — clean coloured blocks = rooms; white space = OUTSIDE the apartment. The dark band along its bottom edge ("FRONT — CAMERA SIDE", with [L]/[R] letters) is an orientation aid — it is NOT a room; ignore it when judging the outline.
2. The RENDER — an isometric 3D apartment that should match the schematic's layout, viewed from the schematic's bottom (FRONT) edge.

The render must:
- Contain exactly the same number of rooms as the schematic.
- Place each room in the same relative position (top/bottom/left/right) and similar proportions.
- NOT be mirrored: a room on the schematic's LEFT must appear on the render's LEFT. Check this explicitly — pick an off-centre room and confirm its side matches. A left-right mirrored layout is a critical failure: score it below 50 and set should_retry to true.
- Reproduce the apartment's OUTER SHAPE — if the schematic is L-shaped, the render must be L-shaped. If white space appears in one corner of the schematic, the render must NOT extend the building into that corner.
- Not invent extra rooms, hallways, or floors not present in the schematic.

EXPECTED ROOMS (from the schematic):
${roomList}

Return ONLY valid JSON. No markdown, no code fences, no commentary.

{
  "score": <0-100>,
  "room_count_correct": true|false,
  "outline_shape_correct": true|false,
  "issues": ["short specific problem", "another problem"],
  "should_retry": true|false
}

Scoring guide:
- 90-100: layout matches the schematic well; minor cosmetic differences only.
- 70-89:  mostly correct; one or two issues a designer would notice.
- 50-69:  noticeable layout drift (outline wrong, a room missing or swapped).
- below 50: significantly different layout.

Set "should_retry" to true when score < 70 AND the issues are layout-related (room count, outline, position) rather than purely aesthetic — a regeneration with corrective hints is likely to help.

Each "issues" string must be ONE concrete problem under 80 characters. Examples:
- "L-shape squared off into a rectangle"
- "entry hall (room [3]) missing from the render"
- "kitchen and dining are swapped"
- "extra room appears in top-left that is not in the schematic"
- "layout mirrored left-right: bedroom [2] is on the right, schematic has it left"`;
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
