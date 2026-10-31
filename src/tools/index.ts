/**
 * Tool implementations. Every tool receives document-space pointer events
 * from the canvas view and mutates the active layer through the editor.
 */

import { parseColor, rgbaString } from '../core/color';
import { copyCanvas, context2d } from '../core/canvas';
import type { Editor } from '../core/editor';
import { floodFill } from '../core/filters';
import { normalizeRect, selectionPath, type Point } from '../core/selection';
import type { PointerInfo, Tool, ToolId } from '../types';

export interface ToolContext {
  editor: Editor;
  beginText(p: PointerInfo): void;
}

const TRANSPARENT = 'rgba(0,0,0,0)';

function colorWithAlpha(hex: string, alpha: number): string {
  return rgbaString({ ...parseColor(hex), a: Math.round(alpha * 255) });
}

/** Top-most visible layer with a non-transparent pixel at (x, y). */
function layerAt(editor: Editor, x: number, y: number): string | null {
  for (let i = editor.doc.layers.length - 1; i >= 0; i--) {
    const layer = editor.doc.layers[i];
    if (!layer.visible) continue;
    if (x < 0 || y < 0 || x >= editor.doc.width || y >= editor.doc.height) continue;
    const data = context2d(layer.canvas, true).getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (data[3] > 0) return layer.id;
  }
  return null;
}

function makePencil(editor: Editor, id: 'brush' | 'eraser'): Tool {
  let painting = false;
  let last = { x: 0, y: 0 };
  let lastScreen = { x: 0, y: 0 };

  const options = () => (id === 'eraser' ? editor.options.eraser : editor.options.brush);

  const stamp = (x: number, y: number, pressure: number): void => {
    const layer = editor.activeLayer;
    if (!layer) return;
    const { size, hardness, opacity } = options();
    const pressureScale = pressure > 0 ? 0.35 + pressure * 0.65 : 1;
    const radius = Math.max(0.5, (size * pressureScale) / 2);
    const ctx = context2d(layer.canvas);
    ctx.save();
    if (editor.selection) ctx.clip(selectionPath(editor.selection));
    if (id === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = opacity / 100;
      ctx.fillStyle = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = opacity / 100;
      ctx.fillStyle = editor.primary;
    }
    const inner = Math.max(0, Math.min(0.98, hardness / 100));
    if (radius < 1.2 || hardness >= 100) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const gradient = ctx.createRadialGradient(x, y, radius * inner, x, y, radius);
      const solid = id === 'eraser' ? 'rgba(0,0,0,1)' : colorWithAlpha(editor.primary, 1);
      gradient.addColorStop(0, solid);
      gradient.addColorStop(1, TRANSPARENT);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    editor.touch();
  };

  const strokeTo = (x: number, y: number, pressure: number): void => {
    const size = options().size;
    const step = Math.max(1, size * 0.12);
    const dx = x - last.x;
    const dy = y - last.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) {
      stamp(x, y, pressure);
      return;
    }
    const steps = Math.max(1, Math.ceil(distance / step));
    for (let i = 1; i <= steps; i++) {
      stamp(last.x + (dx * i) / steps, last.y + (dy * i) / steps, pressure);
    }
  };

  return {
    id,
    cursor: () => 'none',
    down(p) {
      const layer = editor.activeLayer;
      if (!layer) return;
      if (layer.locked) {
        editor.toast('Layer is locked');
        return;
      }
      painting = true;
      last = { x: p.x, y: p.y };
      lastScreen = { x: p.screenX, y: p.screenY };
      editor.beginUndo();
      stamp(p.x, p.y, p.pen ? p.pressure : 0);
    },
    move(p) {
      if (!painting) return;
      // Stroke in document space using the screen delta so zoom stays accurate.
      const docDx = (p.screenX - lastScreen.x) / editor.view.zoom;
      const docDy = (p.screenY - lastScreen.y) / editor.view.zoom;
      const tx = last.x + docDx;
      const ty = last.y + docDy;
      strokeTo(tx, ty, p.pen ? p.pressure : 0);
      last = { x: tx, y: ty };
      lastScreen = { x: p.screenX, y: p.screenY };
    },
    up() {
      if (!painting) return;
      painting = false;
      editor.changed();
    },
  };
}

function selectTool(editor: Editor): Tool {
  let start: Point | null = null;
  let points: Point[] = [];
  let mode: 'rect' | 'ellipse' | 'lasso' = editor.options.select.shape;

  const constrain = (dx: number, dy: number, shift: boolean): { width: number; height: number } => {
    if (!shift) return { width: dx, height: dy };
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return { width: Math.sign(dx || 1) * size, height: Math.sign(dy || 1) * size };
  };

  return {
    id: 'select',
    cursor: () => 'crosshair',
    down(p) {
      mode = editor.options.select.shape;
      start = { x: p.x, y: p.y };
      points = [{ x: p.x, y: p.y }];
      editor.setSelection(null);
    },
    move(p) {
      if (!start) return;
      if (mode === 'lasso') {
        const previous = points[points.length - 1];
        if (Math.hypot(p.x - previous.x, p.y - previous.y) >= 1.5) {
          points.push({ x: p.x, y: p.y });
          editor.setSelection({ kind: 'polygon', points: [...points, { x: p.x, y: p.y }] });
        }
        return;
      }
      const { width, height } = constrain(p.x - start.x, p.y - start.y, p.shift);
      editor.setSelection({
        kind: mode,
        x: start.x,
        y: start.y,
        width,
        height,
      });
    },
    up(p) {
      if (!start) return;
      if (mode === 'lasso') {
        const points2 = [...points, { x: p.x, y: p.y }];
        if (points2.length >= 3) {
          editor.setSelection({ kind: 'polygon', points: points2 });
        } else {
          editor.setSelection(null);
        }
      } else {
        const { width, height } = constrain(p.x - start.x, p.y - start.y, p.shift);
        const rect = normalizeRect({ x: start.x, y: start.y, width, height });
        editor.setSelection(rect.width < 1 || rect.height < 1 ? null : { kind: mode, ...rect });
      }
      start = null;
      points = [];
    },
    cancel() {
      start = null;
      points = [];
      editor.setSelection(null);
    },
  };
}

function moveTool(editor: Editor): Tool {
  let layerId: string | null = null;
  let source: HTMLCanvasElement | null = null;
  let start: Point | null = null;
  let moved = false;
  let recorded = false;

  return {
    id: 'move',
    cursor: () => 'move',
    down(p) {
      if (editor.options.move.autoSelect) {
        const found = layerAt(editor, p.x, p.y);
        if (found) editor.setActiveLayer(found);
      }
      const layer = editor.activeLayer;
      if (!layer) return;
      if (layer.locked) {
        editor.toast('Layer is locked');
        return;
      }
      layerId = layer.id;
      source = copyCanvas(layer.canvas);
      start = { x: p.x, y: p.y };
      moved = false;
      recorded = false;
    },
    move(p) {
      if (!start || !layerId || !source) return;
      const layer = editor.doc.getLayer(layerId);
      if (!layer) return;
      const dx = Math.round(p.x - start.x);
      const dy = Math.round(p.y - start.y);
      if (dx === 0 && dy === 0) return;
      if (!recorded) {
        editor.beginUndo();
        recorded = true;
      }
      const ctx = context2d(layer.canvas);
      ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      ctx.drawImage(source, dx, dy);
      moved = true;
      editor.touch();
    },
    up() {
      if (moved) editor.changed();
      start = null;
      source = null;
      layerId = null;
    },
  };
}

function fillTool(editor: Editor): Tool {
  return {
    id: 'fill',
    cursor: () => 'crosshair',
    down(p) {
      const layer = editor.activeLayer;
      if (!layer) return;
      if (layer.locked) {
        editor.toast('Layer is locked');
        return;
      }
      const color = parseColor(editor.primary);
      const mask = editor.selectionMaskData();
      editor.beginUndo();
      const ctx = context2d(layer.canvas, true);
      const image = ctx.getImageData(0, 0, editor.doc.width, editor.doc.height);
      const changedPixels = floodFill(image.data, editor.doc.width, editor.doc.height, p.x, p.y, {
        color: { ...color, a: 255 },
        tolerance: editor.options.fill.tolerance,
        contiguous: editor.options.fill.contiguous,
        mask,
      });
      if (changedPixels > 0) {
        ctx.putImageData(image, 0, 0);
        editor.changed();
      } else {
        editor.toast('Nothing to fill there');
      }
    },
    move() {},
    up() {},
  };
}

function gradientTool(editor: Editor): Tool {
  let start: Point | null = null;
  let current: Point | null = null;

  const gradientFor = (ctx: CanvasRenderingContext2D): CanvasGradient => {
    const { type, mode, reverse } = editor.options.gradient;
    const s = start as Point;
    const c = current ?? s;
    let gradient: CanvasGradient;
    if (type === 'radial') {
      const radius = Math.max(1, Math.hypot(c.x - s.x, c.y - s.y));
      gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
    } else {
      gradient = ctx.createLinearGradient(s.x, s.y, c.x, c.y);
    }
    const from =
      mode === 'fg-transparent' ? colorWithAlpha(editor.primary, 1) : editor.primary;
    const to =
      mode === 'fg-transparent' ? colorWithAlpha(editor.primary, 0) : editor.secondary;
    gradient.addColorStop(0, reverse ? to : from);
    gradient.addColorStop(1, reverse ? from : to);
    return gradient;
  };

  return {
    id: 'gradient',
    cursor: () => 'crosshair',
    down(p) {
      start = { x: p.x, y: p.y };
      current = { x: p.x, y: p.y };
    },
    move(p) {
      if (start) current = { x: p.x, y: p.y };
    },
    up(p) {
      const layer = editor.activeLayer;
      if (!start || !layer) return;
      if (layer.locked) {
        editor.toast('Layer is locked');
        start = null;
        current = null;
        return;
      }
      current = { x: p.x, y: p.y };
      editor.beginUndo();
      const ctx = context2d(layer.canvas);
      ctx.save();
      if (editor.selection) ctx.clip(selectionPath(editor.selection));
      ctx.fillStyle = gradientFor(ctx);
      ctx.fillRect(0, 0, editor.doc.width, editor.doc.height);
      ctx.restore();
      start = null;
      current = null;
      editor.changed();
    },
    drawOverlay(ctx) {
      if (!start) return;
      const a = editor.docToScreen(start.x, start.y);
      const b = editor.docToScreen(current?.x ?? start.x, current?.y ?? start.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const point of [a, b]) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

function shapeTool(editor: Editor): Tool {
  let start: Point | null = null;
  let current: Point | null = null;
  let editorOptionsShift = false;

  const rectFor = (): { x: number; y: number; width: number; height: number } | null => {
    if (!start || !current) return null;
    const shift = editorOptionsShift;
    let width = current.x - start.x;
    let height = current.y - start.y;
    if (shift) {
      const size = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width || 1) * size;
      height = Math.sign(height || 1) * size;
    }
    return normalizeRect({ x: start.x, y: start.y, width, height });
  };

  const draw = (ctx: CanvasRenderingContext2D, preview: boolean): void => {
    const rect = rectFor();
    if (!rect) return;
    const { kind, fill, stroke, strokeWidth, radius } = editor.options.shape;
    ctx.save();
    if (!preview && editor.selection) ctx.clip(selectionPath(editor.selection));
    ctx.globalAlpha = preview ? 0.75 : 1;
    ctx.beginPath();
    if (kind === 'rect') {
      if (radius > 0) ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
      else ctx.rect(rect.x, rect.y, rect.width, rect.height);
    } else if (kind === 'ellipse') {
      ctx.ellipse(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width / 2,
        rect.height / 2,
        0,
        0,
        Math.PI * 2,
      );
    } else {
      ctx.moveTo(start?.x ?? 0, start?.y ?? 0);
      ctx.lineTo(current?.x ?? 0, current?.y ?? 0);
    }
    if (kind === 'line') {
      ctx.strokeStyle = editor.primary;
      ctx.lineWidth = Math.max(1, strokeWidth);
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      if (fill) {
        ctx.fillStyle = editor.primary;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = editor.secondary;
        ctx.lineWidth = Math.max(1, strokeWidth);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  return {
    id: 'shape',
    cursor: () => 'crosshair',
    down(p) {
      start = { x: p.x, y: p.y };
      current = { x: p.x, y: p.y };
      editorOptionsShift = p.shift;
    },
    move(p) {
      current = { x: p.x, y: p.y };
      editorOptionsShift = p.shift;
      editor.requestRender();
    },
    up(p) {
      current = { x: p.x, y: p.y };
      editorOptionsShift = p.shift;
      const rect = rectFor();
      const layer = editor.activeLayer;
      if (!rect || !layer) {
        start = null;
        current = null;
        return;
      }
      if (layer.locked) {
        editor.toast('Layer is locked');
        start = null;
        current = null;
        return;
      }
      const tooSmall = editor.options.shape.kind === 'line'
        ? Math.hypot(p.x - (start as Point).x, p.y - (start as Point).y) < 2
        : rect.width < 1 || rect.height < 1;
      if (tooSmall) {
        start = null;
        current = null;
        return;
      }
      editor.beginUndo();
      draw(context2d(layer.canvas), false);
      start = null;
      current = null;
      editor.changed();
    },
    drawOverlay(ctx) {
      if (!start || !current) return;
      const { kind } = editor.options.shape;
      const a = editor.docToScreen(start.x, start.y);
      const b = editor.docToScreen(current.x, current.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      if (kind === 'line') {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else {
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      }
      ctx.restore();
    },
    cancel() {
      start = null;
      current = null;
    },
  };
}

function textTool(ctx: ToolContext): Tool {
  return {
    id: 'text',
    cursor: () => 'text',
    down(p) {
      ctx.beginText(p);
    },
    move() {},
    up() {},
  };
}

function eyedropperTool(editor: Editor): Tool {
  const pick = (p: PointerInfo, target: 'primary' | 'secondary'): void => {
    const color = editor.pickColor(p.x, p.y);
    if (!color) return;
    if (target === 'secondary') editor.setSecondary(color);
    else editor.setPrimary(color);
  };
  return {
    id: 'eyedropper',
    cursor: () => 'crosshair',
    down(p) {
      pick(p, p.alt ? 'secondary' : 'primary');
    },
    move() {},
    up() {},
  };
}

function cropTool(editor: Editor): Tool {
  let start: Point | null = null;
  let current: Point | null = null;

  const rect = (): { x: number; y: number; width: number; height: number } | null => {
    if (!start || !current) return null;
    const raw = normalizeRect({
      x: start.x,
      y: start.y,
      width: current.x - start.x,
      height: current.y - start.y,
    });
    const x = Math.max(0, Math.min(editor.doc.width, raw.x));
    const y = Math.max(0, Math.min(editor.doc.height, raw.y));
    const width = Math.min(editor.doc.width - x, raw.width);
    const height = Math.min(editor.doc.height - y, raw.height);
    return { x, y, width, height };
  };

  return {
    id: 'crop',
    cursor: () => 'crosshair',
    down(p) {
      start = { x: p.x, y: p.y };
      current = { x: p.x, y: p.y };
      editor.requestRender();
    },
    move(p) {
      if (!start) return;
      current = { x: p.x, y: p.y };
      editor.requestRender();
    },
    up() {
      const area = rect();
      if (area && area.width >= 2 && area.height >= 2) {
        editor.cropDocument(Math.round(area.x), Math.round(area.y), Math.round(area.width), Math.round(area.height));
      }
      start = null;
      current = null;
      editor.requestRender();
    },
    cancel() {
      start = null;
      current = null;
      editor.requestRender();
    },
    drawOverlay(ctx) {
      const area = rect();
      if (!area) return;
      const a = editor.docToScreen(area.x, area.y);
      const b = editor.docToScreen(area.x + area.width, area.y + area.height);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      for (let i = 1; i < 3; i++) {
        const x = a.x + ((b.x - a.x) * i) / 3;
        const y = a.y + ((b.y - a.y) * i) / 3;
        ctx.beginPath();
        ctx.moveTo(x, a.y);
        ctx.lineTo(x, b.y);
        ctx.moveTo(a.x, y);
        ctx.lineTo(b.x, y);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

function handTool(editor: Editor): Tool {
  let last: { x: number; y: number } | null = null;
  return {
    id: 'hand',
    cursor: () => 'grab',
    down(p) {
      last = { x: p.screenX, y: p.screenY };
    },
    move(p) {
      if (!last) return;
      editor.panBy(p.screenX - last.x, p.screenY - last.y);
      last = { x: p.screenX, y: p.screenY };
    },
    up() {
      last = null;
    },
  };
}

function zoomTool(editor: Editor): Tool {
  return {
    id: 'zoom',
    cursor: () => 'zoom-in',
    down(p) {
      editor.zoomBy(p.alt ? 0.8 : 1.25, p.screenX, p.screenY);
    },
    move() {},
    up() {},
  };
}

export function createTools(context: ToolContext): Record<ToolId, Tool> {
  const { editor } = context;
  return {
    move: moveTool(editor),
    select: selectTool(editor),
    brush: makePencil(editor, 'brush'),
    eraser: makePencil(editor, 'eraser'),
    fill: fillTool(editor),
    gradient: gradientTool(editor),
    shape: shapeTool(editor),
    text: textTool(context),
    eyedropper: eyedropperTool(editor),
    crop: cropTool(editor),
    hand: handTool(editor),
    zoom: zoomTool(editor),
  };
}
