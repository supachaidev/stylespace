/**
 * draw.ts — Floor Plan Drawing Canvas
 * =====================================
 *
 * Lets the user sketch a floor plan instead of uploading one. The canvas
 * mirrors the upload pipeline by exporting a PNG `File` that drops straight
 * into `handleUpload()` — Claude sees it the same as a photographed plan.
 *
 * Strokes are stored as point arrays so undo can replay them. Drawing uses
 * destination-over composition (none) for ink and source-over with white for
 * the eraser — visually identical to drawing on white paper.
 */
export type DrawTool = 'pen' | 'eraser';

interface Stroke {
  tool: DrawTool;
  points: Array<{ x: number; y: number }>;
}

export class FloorPlanCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private dpr = 1;
  private tool: DrawTool = 'pen';
  private penWidth = 3.5;
  private eraserWidth = 22;
  private onChange: () => void;

  constructor(canvas: HTMLCanvasElement, onChange: () => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.onChange = onChange;

    // Sync the bitmap to the displayed CSS size × DPR so strokes stay crisp
    // on hi-DPI screens. ResizeObserver re-fires on layout changes (e.g.
    // rotation, devtools opening) without us listening to window resize.
    new ResizeObserver(() => this.syncSize()).observe(canvas);
    this.syncSize();

    this.bindEvents();
  }

  /** Match the canvas bitmap to its rendered size, then redraw all strokes. */
  private syncSize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.dpr = dpr;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.redraw();
  }

  private redraw(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Keep the bitmap transparent so the wrapper's grid backdrop shows
    // through wherever there's no ink. White export is composited in toFile.
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(this.dpr, this.dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.strokes) this.paintStroke(s);
  }

  private paintStroke(s: Stroke): void {
    const ctx = this.ctx;
    if (s.points.length === 0) return;
    // Eraser uses destination-out so it clears alpha instead of painting white
    // — the grid backdrop reappears as the user erases, matching expectation.
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = '#000000';
      ctx.lineWidth = this.eraserWidth;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = '#000000';
      ctx.lineWidth = this.penWidth;
    }
    ctx.beginPath();
    const [first, ...rest] = s.points;
    if (rest.length === 0) {
      // A single tap → render a dot of width = stroke radius
      ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    ctx.moveTo(first.x, first.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  private pointFromEvent(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private bindEvents(): void {
    const c = this.canvas;
    // Pointer events unify mouse + touch + pen and let us capture the pointer
    // so a stroke continues even if the user drags off-canvas mid-stroke.
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      this.current = { tool: this.tool, points: [this.pointFromEvent(e)] };
      this.paintStroke(this.current);
    });

    c.addEventListener('pointermove', (e) => {
      if (!this.current) return;
      const p = this.pointFromEvent(e);
      this.current.points.push(p);
      // Incremental paint: draw just the latest segment so we don't replay
      // the entire stroke every move event.
      const ctx = this.ctx;
      const prev = this.current.points[this.current.points.length - 2];
      if (this.current.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = this.eraserWidth;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = this.penWidth;
      }
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    });

    const finish = (e: PointerEvent) => {
      if (!this.current) return;
      try { c.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      this.strokes.push(this.current);
      this.current = null;
      this.onChange();
    };
    c.addEventListener('pointerup', finish);
    c.addEventListener('pointercancel', finish);

    // Suppress the default touch gestures (scroll/zoom) only on the canvas
    // so the page itself remains scrollable above and below it.
    c.style.touchAction = 'none';
  }

  setTool(tool: DrawTool): void {
    this.tool = tool;
  }

  getTool(): DrawTool {
    return this.tool;
  }

  undo(): void {
    if (this.strokes.length === 0) return;
    this.strokes.pop();
    this.redraw();
    this.onChange();
  }

  clear(): void {
    if (this.strokes.length === 0) return;
    this.strokes = [];
    this.redraw();
    this.onChange();
  }

  isEmpty(): boolean {
    return this.strokes.length === 0;
  }

  /** Export the canvas as a PNG File ready for /api/analyze. */
  async toFile(filename = 'drawing.png'): Promise<File> {
    // The interactive canvas is transparent so the wrapper grid shows
    // through. For export we need a clean white-background PNG so Claude
    // sees the same thing a photographed plan would look like — composite
    // the strokes onto a fresh white canvas.
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('Could not get export 2D context');
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(this.canvas, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      out.toBlob(resolve, 'image/png');
    });
    if (!blob) throw new Error('Canvas toBlob failed');
    return new File([blob], filename, { type: 'image/png' });
  }
}
