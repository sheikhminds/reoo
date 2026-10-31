/**
 * Canvas view: rendering, zoom/pan, pointer routing and the inline text editor.
 */

import { context2d } from '../core/canvas';
import type { Editor } from '../core/editor';
import { selectionPath } from '../core/selection';
import { createTools } from '../tools';
import type { PointerInfo, Tool, ToolId } from '../types';

const CHECKER_SIZE = 12;

function buildCheckerPattern(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CHECKER_SIZE * 2;
  canvas.height = CHECKER_SIZE * 2;
  const ctx = context2d(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#d7d9de';
  ctx.fillRect(0, 0, CHECKER_SIZE, CHECKER_SIZE);
  ctx.fillRect(CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE);
  return canvas;
}

export class CanvasView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tools: Record<ToolId, Tool>;
  private activeTool: Tool;
  private scheduled = false;
  private antsOffset = 0;
  private antsTimer: number | null = null;
  private dpr = 1;
  private hasFit = false;
  private spaceDown = false;
  private panning = false;
  private panLast = { x: 0, y: 0 };
  private pointer = { x: 0, y: 0, inside: false };
  private pointerDown = false;
  private checker: CanvasPattern | null = null;
  private textArea: HTMLTextAreaElement | null = null;
  private textOrigin = { x: 0, y: 0 };
  private textCommitAt = 0;
  private cleanups: Array<() => void> = [];

  constructor(
    private editor: Editor,
    private container: HTMLElement,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'reoo-canvas';
    this.canvas.tabIndex = 0;
    this.container.appendChild(this.canvas);
    this.ctx = context2d(this.canvas);
    this.checker = this.ctx.createPattern(buildCheckerPattern(), 'repeat');

    this.tools = createTools({
      editor: this.editor,
      beginText: (p) => this.beginText(p),
    });
    this.activeTool = this.tools[this.editor.toolId];

    this.observeResize();
    this.bindEvents();
    this.subscribe();
    this.resize();
    this.updateCursor();
  }

  private subscribe(): void {
    this.cleanups.push(this.editor.on('render', () => this.requestRender()));
    this.cleanups.push(
      this.editor.on('new-document', () => {
        this.cancelText();
        this.resize();
        this.editor.zoomToFit();
        this.requestRender();
      }),
    );
    this.cleanups.push(
      this.editor.on('tool', () => {
        this.activeTool = this.tools[this.editor.toolId];
        this.updateCursor();
        this.requestRender();
      }),
    );
    this.cleanups.push(
      this.editor.on('selection', () => {
        if (this.editor.selection) this.scheduleAnts();
        this.requestRender();
      }),
    );
    this.cleanups.push(this.editor.on('ui', () => this.requestRender()));
  }

  private observeResize(): void {
    const onResize = () => this.resize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', onResize);
      this.cleanups.push(() => window.removeEventListener('resize', onResize));
      return;
    }
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.container);
    this.cleanups.push(() => observer.disconnect());
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.editor.setViewport(width, height);
    if (!this.hasFit) {
      this.hasFit = true;
      this.editor.zoomToFit();
    }
    this.requestRender();
  }

  updateCursor(): void {
    let cursor = 'default';
    if (this.spaceDown || this.panning) cursor = 'grabbing';
    else if (this.editor.toolId === 'brush' || this.editor.toolId === 'eraser') cursor = 'none';
    else cursor = this.activeTool.cursor();
    this.canvas.style.cursor = cursor;
  }

  requestRender(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.render();
    });
  }

  private scheduleAnts(): void {
    if (this.antsTimer !== null) return;
    const tick = () => {
      if (!this.editor.selection) {
        this.antsTimer = null;
        return;
      }
      this.antsOffset = (this.antsOffset + 1) % 8;
      this.render();
      this.antsTimer = window.setTimeout(tick, 110);
    };
    this.antsTimer = window.setTimeout(tick, 110);
  }

  render(): void {
    const ctx = this.ctx;
    const editor = this.editor;
    const zoom = editor.view.zoom;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#15171c';
    ctx.fillRect(0, 0, width, height);

    const x = editor.view.panX;
    const y = editor.view.panY;
    const dw = editor.doc.width * zoom;
    const dh = editor.doc.height * zoom;

    // Drop shadow + checkerboard.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(x, y, dw, dh);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, dw, dh);
    ctx.clip();
    if (this.checker) {
      ctx.fillStyle = this.checker;
      ctx.fillRect(x, y, dw, dh);
    }
    ctx.imageSmoothingEnabled = zoom < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(editor.doc.composite(), x, y, dw, dh);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, dw, dh);

    this.drawSelection(ctx);
    this.activeTool.drawOverlay?.(ctx);
    this.drawBrushCursor(ctx);
  }

  private drawSelection(ctx: CanvasRenderingContext2D): void {
    const editor = this.editor;
    if (!editor.selection) return;
    const zoom = editor.view.zoom;
    ctx.save();
    ctx.translate(editor.view.panX, editor.view.panY);
    ctx.scale(zoom, zoom);
    const path = selectionPath(editor.selection);
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineDashOffset = -this.antsOffset / zoom;
    ctx.stroke(path);
    ctx.strokeStyle = '#000000';
    ctx.lineDashOffset = (4 - this.antsOffset) / zoom;
    ctx.stroke(path);
    ctx.restore();
  }

  private drawBrushCursor(ctx: CanvasRenderingContext2D): void {
    const editor = this.editor;
    if (!this.pointer.inside) return;
    if (editor.toolId !== 'brush' && editor.toolId !== 'eraser') return;
    if (this.panning) return;
    const options = editor.toolId === 'brush' ? editor.options.brush : editor.options.eraser;
    const radius = Math.max(1, (options.size * editor.view.zoom) / 2);
    const { x, y } = this.pointer;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.restore();
  }

  // ---- text ---------------------------------------------------------------

  private beginText(p: PointerInfo): void {
    this.commitText();
    if (Date.now() - this.textCommitAt < 200) return;
    const editor = this.editor;
    const screen = editor.docToScreen(p.x, p.y);
    const style = editor.options.text;
    const area = document.createElement('textarea');
    area.className = 'text-editor';
    area.style.left = `${screen.x}px`;
    area.style.top = `${screen.y}px`;
    area.style.fontFamily = style.fontFamily;
    area.style.fontSize = `${style.fontSize * editor.view.zoom}px`;
    area.style.fontWeight = style.bold ? '700' : '400';
    area.style.fontStyle = style.italic ? 'italic' : 'normal';
    area.style.textAlign = style.align;
    area.style.color = editor.primary;
    area.placeholder = 'Type…';
    area.spellcheck = false;
    area.wrap = 'off';
    this.container.appendChild(area);
    this.textArea = area;
    this.textOrigin = { x: p.x, y: p.y };
    requestAnimationFrame(() => {
      area.focus();
      this.autosizeText();
    });
    area.addEventListener('input', () => this.autosizeText());
    area.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelText();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.commitText();
      }
    });
    area.addEventListener('blur', () => {
      if (this.textArea === area) this.commitText();
    });
  }

  private autosizeText(): void {
    if (!this.textArea) return;
    this.textArea.style.height = 'auto';
    this.textArea.style.height = `${this.textArea.scrollHeight}px`;
  }

  private commitText(): void {
    const area = this.textArea;
    if (!area) return;
    this.textArea = null;
    const value = area.value;
    area.remove();
    this.textCommitAt = Date.now();
    if (value.trim()) this.editor.drawText(value, this.textOrigin.x, this.textOrigin.y);
  }

  private cancelText(): void {
    const area = this.textArea;
    if (!area) return;
    this.textArea = null;
    area.remove();
    this.requestRender();
  }

  // ---- input --------------------------------------------------------------

  private pointerInfo(event: PointerEvent): PointerInfo {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const point = this.editor.screenToDoc(screenX, screenY);
    return {
      x: point.x,
      y: point.y,
      screenX,
      screenY,
      pressure: event.pressure > 0 ? event.pressure : 0.5,
      pen: event.pointerType === 'pen',
      alt: event.altKey,
      shift: event.shiftKey,
      ctrl: event.ctrlKey || event.metaKey,
    };
  }

  private bindEvents(): void {
    const canvas = this.canvas;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 1) event.preventDefault();
      canvas.focus();
      this.pointerDown = true;
      canvas.setPointerCapture(event.pointerId);
      const info = this.pointerInfo(event);

      if (event.button === 1 || this.spaceDown) {
        this.panning = true;
        this.panLast = { x: info.screenX, y: info.screenY };
        this.updateCursor();
        return;
      }
      const tempPicker =
        event.altKey &&
        ['brush', 'eraser', 'fill', 'shape', 'gradient'].includes(this.editor.toolId);
      if (tempPicker) {
        const color = this.editor.pickColor(info.x, info.y);
        if (color) this.editor.setPrimary(color);
        return;
      }
      this.activeTool.down(info);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        inside: true,
      };
      const info = this.pointerInfo(event);
      this.editor.cursor = { x: info.x, y: info.y, inside: true };
      this.editor.emit('cursor');

      if (this.panning) {
        this.editor.panBy(info.screenX - this.panLast.x, info.screenY - this.panLast.y);
        this.panLast = { x: info.screenX, y: info.screenY };
        return;
      }
      if (this.pointerDown) this.activeTool.move(info);
      else this.requestRender();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      if (this.panning) {
        this.panning = false;
        this.updateCursor();
        return;
      }
      this.activeTool.up(this.pointerInfo(event));
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (event.ctrlKey || event.metaKey) {
        this.editor.zoomBy(Math.exp(-event.deltaY * 0.0018), x, y);
      } else {
        this.editor.panBy(-event.deltaX, -event.deltaY);
      }
    };

    const onEnter = () => {
      this.pointer.inside = true;
      this.updateCursor();
      this.requestRender();
    };
    const onLeave = () => {
      this.pointer.inside = false;
      this.editor.cursor = { ...this.editor.cursor, inside: false };
      this.editor.emit('cursor');
      this.requestRender();
    };

    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) void this.editor.openFile(file);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerenter', onEnter);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.code === 'Space' && !this.spaceDown) {
        this.spaceDown = true;
        event.preventDefault();
        this.updateCursor();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        this.spaceDown = false;
        this.updateCursor();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.cleanups.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  cancelActiveTool(): void {
    this.activeTool.cancel?.();
  }

  dispose(): void {
    this.cleanups.forEach((fn) => fn());
    if (this.antsTimer !== null) window.clearTimeout(this.antsTimer);
    this.canvas.remove();
  }
}
