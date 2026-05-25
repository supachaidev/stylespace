/**
 * annotate.ts — Floor-Plan Annotation Overlay
 * ============================================
 *
 * Produces a JPEG `File` that shows the original floor plan with the
 * Claude-extracted room bounding boxes and labels drawn on top.
 *
 * We send this annotated image to Gemini instead of the raw floor plan so
 * the layout is anchored visually — Gemini can no longer "interpret" the
 * room boundaries; they're already drawn for it. This is the biggest
 * layout-accuracy win available without changing models.
 */

interface RoomBox {
  label: string;
  x: number;      // 0..1, top-left
  y: number;      // 0..1, top-left
  width: number;  // 0..1
  depth: number;  // 0..1
}

const PALETTE = [
  '#E8D5B7', '#B7C4E8', '#E8E4B7', '#B7E8E4',
  '#E8C4B7', '#D4D4D4', '#C4E8B7', '#E0E0E0',
];

export async function annotateFloorPlan(
  file: File,
  rooms: RoomBox[],
  maxSize: number,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Slight global wash so the overlay reads clearly on busy plans
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(0, 0, w, h);

  const fontSize = Math.max(12, Math.round(w / 48));
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';

  rooms.forEach((room, i) => {
    const rx = room.x * w;
    const ry = room.y * h;
    const rw = room.width * w;
    const rd = room.depth * h;

    const fill = PALETTE[i % PALETTE.length];
    ctx.fillStyle = hexToRgba(fill, 0.55);
    ctx.fillRect(rx, ry, rw, rd);

    ctx.strokeStyle = '#1F1F1F';
    ctx.lineWidth = Math.max(2, Math.round(w / 320));
    ctx.strokeRect(rx + 1, ry + 1, rw - 2, rd - 2);

    // Label chip in the box's top-left corner
    const padding = Math.round(fontSize * 0.35);
    const text = room.label;
    const metrics = ctx.measureText(text);
    const chipW = Math.min(rw - 4, metrics.width + padding * 2);
    const chipH = fontSize + padding * 2;
    const chipX = rx + 4;
    const chipY = ry + 4;

    ctx.fillStyle = 'rgba(31, 31, 31, 0.85)';
    ctx.fillRect(chipX, chipY, chipW, chipH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, chipX + padding, chipY + padding);
  });

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9);
  });
  if (!blob) throw new Error('Canvas toBlob failed');

  const base = file.name.replace(/\.[^.]+$/, '') || 'upload';
  return new File([blob], `${base}_annotated.jpg`, { type: 'image/jpeg' });
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
