/**
 * annotate.ts — Floor-Plan Schematic
 * ===================================
 *
 * Produces a clean JPEG `File` showing each room as a solid colored block
 * with a bold marker + label, on a neutral white background. The source
 * floor-plan image's aspect ratio is preserved so Gemini renders in the
 * same orientation.
 *
 * Why a clean schematic instead of an annotated overlay on the original
 * plan: image-generation models weight the input image heavily. When the
 * original plan's walls/text/dimensions are still visible underneath an
 * overlay, Gemini gets two competing spatial signals and tends to follow
 * the architectural drawing instead of our partitioning. A standalone
 * schematic gives Gemini a single, unambiguous layout to follow.
 */

interface RoomBox {
  label: string;
  x: number;      // 0..1, top-left
  y: number;      // 0..1, top-left
  width: number;  // 0..1
  depth: number;  // 0..1
  area_sqm?: number;
}

const PALETTE = [
  '#E8D5B7', '#B7C4E8', '#E8E4B7', '#B7E8E4',
  '#E8C4B7', '#D4D4D4', '#C4E8B7', '#F4C2C2',
];

// 1-9, then A-Z. Must match roomMarker() in functions/_lib/prompts.ts so
// the text-prompt markers cross-reference the schematic.
function roomMarker(i: number): string {
  if (i < 9) return String(i + 1);
  return String.fromCharCode('A'.charCodeAt(0) + (i - 9));
}

export async function annotateFloorPlan(
  file: File,
  rooms: RoomBox[],
  maxSize: number,
): Promise<File> {
  // Use the source image purely for its aspect ratio — we don't draw it.
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  bitmap.close();

  // Orientation band appended BELOW the room area. Gemini has no way to know
  // which side of the plan the camera should face, and with a near-symmetric
  // (especially hand-drawn) plan it mirrors the layout roughly half the time.
  // A visual anchor beats prose: the band marks the camera side, and the L/R
  // letters pin the horizontal axis. Rooms keep their 0..1 coords within the
  // area ABOVE the band, so the coordinate text in the prompt stays valid.
  const bandH = Math.max(28, Math.round(h * 0.08));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h + bandH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  // Neutral background — gives Gemini nothing to interpret except our boxes
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h + bandH);

  const borderWidth = Math.max(3, Math.round(Math.min(w, h) / 200));
  const markerFontSize = Math.max(28, Math.round(Math.min(w, h) / 18));
  const labelFontSize = Math.max(14, Math.round(Math.min(w, h) / 36));
  const areaFontSize = Math.max(11, Math.round(Math.min(w, h) / 48));

  rooms.forEach((room, i) => {
    const rx = Math.round(room.x * w);
    const ry = Math.round(room.y * h);
    const rw = Math.round(room.width * w);
    const rd = Math.round(room.depth * h);

    // Solid color block — no transparency, nothing bleeding through
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(rx, ry, rw, rd);

    // Dark border so adjacent rooms are visibly separated
    ctx.strokeStyle = '#1F1F1F';
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(
      rx + borderWidth / 2,
      ry + borderWidth / 2,
      rw - borderWidth,
      rd - borderWidth,
    );

    // Centered marker (big) + label (smaller) + area (smallest, optional)
    const cx = rx + rw / 2;
    const cy = ry + rd / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1F1F1F';

    ctx.font = `800 ${markerFontSize}px system-ui, sans-serif`;
    ctx.fillText(`[${roomMarker(i)}]`, cx, cy - labelFontSize);

    ctx.font = `600 ${labelFontSize}px system-ui, sans-serif`;
    ctx.fillText(room.label, cx, cy + markerFontSize / 4);

    if (typeof room.area_sqm === 'number' && room.area_sqm > 0) {
      ctx.font = `400 ${areaFontSize}px system-ui, sans-serif`;
      ctx.fillStyle = '#3A3A3A';
      ctx.fillText(`${room.area_sqm.toFixed(1)} m²`, cx, cy + markerFontSize / 4 + labelFontSize);
    }
  });

  // Orientation band: dark strip = the side nearest the camera, with the
  // left/right edges lettered. Referenced by name in buildBasePrompt and
  // buildVerifyPrompt (functions/_lib/prompts.ts) — keep the wording in sync.
  ctx.fillStyle = '#1F3A5F';
  ctx.fillRect(0, h, w, bandH);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  const bandFontSize = Math.max(12, Math.round(bandH * 0.5));
  ctx.font = `700 ${bandFontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('FRONT — CAMERA SIDE', w / 2, h + bandH / 2);
  ctx.textAlign = 'left';
  ctx.fillText('[L]', Math.round(bandH * 0.3), h + bandH / 2);
  ctx.textAlign = 'right';
  ctx.fillText('[R]', w - Math.round(bandH * 0.3), h + bandH / 2);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
  if (!blob) throw new Error('Canvas toBlob failed');

  const base = file.name.replace(/\.[^.]+$/, '') || 'upload';
  return new File([blob], `${base}_schematic.jpg`, { type: 'image/jpeg' });
}
