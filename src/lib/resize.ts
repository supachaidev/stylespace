/**
 * resize.ts — Client-Side Image Resize
 * ======================================
 *
 * Produces a JPEG `File` sized so the longest edge is at most `maxSize`
 * pixels (aspect ratio preserved). Re-encodes at 85% quality so callers
 * always see image/jpeg regardless of the source format.
 *
 * Smaller images out = cheaper downstream AI-API calls.
 */

export async function resizeImageFile(file: File, maxSize: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  });
  if (!blob) throw new Error('Canvas toBlob failed');

  // Preserve the original file name (sans extension) but force .jpg
  const base = file.name.replace(/\.[^.]+$/, '') || 'upload';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
