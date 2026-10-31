/**
 * Editor: the central mutable state. Tools, panels and the canvas view all
 * talk to this object; it owns the document, view transform, selection,
 * undo history and file workflows.
 */

import { DEFAULT_TOOL_OPTIONS, type ToolId, type ToolOptions, type ViewState } from '../types';
import {
  AUTOSAVE_INTERVAL_MS,
  clearAutosave,
  createAutosaveStore,
  writeAutosave,
  type AutosaveStore,
} from './autosave';
import { context2d, copyCanvas, createCanvas } from './canvas';
import { EditorDocument, type BlendMode, type Layer } from './document';
import { blendWithMask } from './filters';
import { History } from './history';
import {
  canvasToBlob,
  deserializeProject,
  download,
  fileExtension,
  loadImageElement,
  sanitizeFilename,
  serializeProject,
} from './io';
import { exportPsd, importPsd } from './psd';
import {
  rasterizeSelection,
  selectionBounds,
  selectionIsEmpty,
  selectionPath,
  type SelectionShape,
} from './selection';

export interface Snapshot {
  width: number;
  height: number;
  activeId: string;
  layers: Layer[];
  selection: SelectionShape | null;
}

export type EditorEvent =
  | 'render'
  | 'ui'
  | 'selection'
  | 'cursor'
  | 'toast'
  | 'new-document'
  | 'tool';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export class Editor {
  doc: EditorDocument;
  toolId: ToolId = 'brush';
  options: ToolOptions = structuredClone(DEFAULT_TOOL_OPTIONS);
  primary = '#111827';
  secondary = '#ffffff';
  view: ViewState = { zoom: 1, panX: 0, panY: 0 };
  selection: SelectionShape | null = null;
  viewport = { width: 800, height: 600 };
  history = new History<Snapshot>(20);
  name = 'untitled';
  modified = false;
  lastToast = '';
  cursor = { x: 0, y: 0, inside: false };

  private listeners = new Map<EditorEvent, Set<() => void>>();
  private maskCache: { shape: SelectionShape; canvas: HTMLCanvasElement } | null = null;
  private clipboard: { canvas: HTMLCanvasElement; x: number; y: number } | null = null;

  /** True when there is an internal copy to paste (a copied layer region). */
  get hasClipboard(): boolean {
    return this.clipboard !== null;
  }

  /** Crash recovery storage; injectable so tests can avoid IndexedDB. */
  readonly autosaveStore: AutosaveStore;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private autosaveBusy = false;
  lastAutosaveAt = 0;

  constructor(doc?: EditorDocument, autosaveStore: AutosaveStore = createAutosaveStore()) {
    this.doc = doc ?? new EditorDocument(1200, 800, '#ffffff');
    this.autosaveStore = autosaveStore;
  }

  // ---- events -------------------------------------------------------------

  on(event: EditorEvent, listener: () => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: EditorEvent): void {
    this.listeners.get(event)?.forEach((listener) => listener());
  }

  requestRender(): void {
    this.emit('render');
  }

  toast(message: string): void {
    this.lastToast = message;
    this.emit('toast');
  }

  get activeLayer(): Layer {
    return this.doc.activeLayer;
  }

  get hasSelection(): boolean {
    return selectionIsEmpty(this.selection) === false;
  }

  // ---- document lifecycle -------------------------------------------------

  newDocument(width: number, height: number, background: string, name = 'untitled'): void {
    this.doc = new EditorDocument(width, height, background);
    this.name = name;
    this.selection = null;
    this.maskCache = null;
    this.history.clear();
    this.modified = false;
    void clearAutosave(this.autosaveStore);
    this.emit('ui');
    this.emit('selection');
    this.emit('new-document');
    this.requestRender();
  }

  loadDocument(doc: EditorDocument, name: string): void {
    this.doc = doc;
    this.name = name;
    this.selection = null;
    this.maskCache = null;
    this.history.clear();
    this.modified = false;
    void clearAutosave(this.autosaveStore);
    this.emit('ui');
    this.emit('selection');
    this.emit('new-document');
    this.requestRender();
  }

  changed(): void {
    this.doc.invalidate();
    this.modified = true;
    this.emit('ui');
    this.requestRender();
  }

  /** Cheap repaint used during a drag; skips rebuilding side panels. */
  touch(): void {
    this.doc.invalidate();
    this.modified = true;
    this.requestRender();
  }

  // ---- history ------------------------------------------------------------

  capture(): Snapshot {
    return {
      width: this.doc.width,
      height: this.doc.height,
      activeId: this.doc.activeId,
      layers: this.doc.layers.map((layer) => ({ ...layer, canvas: copyCanvas(layer.canvas) })),
      selection: this.selection ? structuredClone(this.selection) : null,
    };
  }

  restore(snapshot: Snapshot): void {
    this.doc.width = snapshot.width;
    this.doc.height = snapshot.height;
    this.doc.layers = snapshot.layers.map((layer) => ({
      ...layer,
      canvas: copyCanvas(layer.canvas),
    }));
    this.doc.activeId = snapshot.activeId;
    this.doc.invalidate();
    this.selection = snapshot.selection ? structuredClone(snapshot.selection) : null;
    this.maskCache = null;
    this.emit('selection');
    this.changed();
  }

  beginUndo(): void {
    this.history.push(this.capture());
    this.emit('ui');
  }

  undo(): void {
    const previous = this.history.undo(this.capture());
    if (!previous) {
      this.toast('Nothing to undo');
      return;
    }
    this.restore(previous);
    this.toast('Undo');
  }

  redo(): void {
    const next = this.history.redo(this.capture());
    if (!next) {
      this.toast('Nothing to redo');
      return;
    }
    this.restore(next);
    this.toast('Redo');
  }

  // ---- tools & colors -----------------------------------------------------

  setTool(id: ToolId): void {
    if (this.toolId === id) return;
    this.toolId = id;
    this.emit('tool');
    this.requestRender();
  }

  setPrimary(hex: string): void {
    this.primary = hex;
    this.emit('ui');
  }

  setSecondary(hex: string): void {
    this.secondary = hex;
    this.emit('ui');
  }

  swapColors(): void {
    [this.primary, this.secondary] = [this.secondary, this.primary];
    this.emit('ui');
  }

  resetColors(): void {
    this.primary = '#111827';
    this.secondary = '#ffffff';
    this.emit('ui');
  }

  updateOptions(patch: Partial<ToolOptions>): void {
    this.options = { ...this.options, ...patch };
    this.emit('tool');
    this.emit('ui');
  }

  // ---- view ---------------------------------------------------------------

  setViewport(width: number, height: number): void {
    this.viewport = { width, height };
  }

  screenToDoc(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.view.panX) / this.view.zoom,
      y: (screenY - this.view.panY) / this.view.zoom,
    };
  }

  docToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: x * this.view.zoom + this.view.panX,
      y: y * this.view.zoom + this.view.panY,
    };
  }

  setZoom(zoom: number, screenX?: number, screenY?: number): void {
    const next = clamp(zoom, 0.02, 32);
    const cx = screenX ?? this.viewport.width / 2;
    const cy = screenY ?? this.viewport.height / 2;
    const before = this.screenToDoc(cx, cy);
    this.view.zoom = next;
    const after = this.screenToDoc(cx, cy);
    this.view.panX += (after.x - before.x) * next;
    this.view.panY += (after.y - before.y) * next;
    this.emit('ui');
    this.requestRender();
  }

  zoomBy(factor: number, screenX?: number, screenY?: number): void {
    this.setZoom(this.view.zoom * factor, screenX, screenY);
  }

  zoomToFit(): void {
    const { width: vw, height: vh } = this.viewport;
    const margin = 48;
    const zoom = clamp(
      Math.min((vw - margin * 2) / this.doc.width, (vh - margin * 2) / this.doc.height),
      0.02,
      8,
    );
    this.view.zoom = zoom;
    this.view.panX = (vw - this.doc.width * zoom) / 2;
    this.view.panY = (vh - this.doc.height * zoom) / 2;
    this.emit('ui');
    this.requestRender();
  }

  panBy(dx: number, dy: number): void {
    this.view.panX += dx;
    this.view.panY += dy;
    this.requestRender();
  }

  // ---- selection ----------------------------------------------------------

  setSelection(shape: SelectionShape | null): void {
    this.selection = shape && !selectionIsEmpty(shape) ? shape : null;
    this.maskCache = null;
    this.emit('selection');
    this.requestRender();
  }

  clearSelection(): void {
    if (!this.selection) return;
    this.selection = null;
    this.maskCache = null;
    this.emit('selection');
    this.requestRender();
  }

  selectAll(): void {
    this.setSelection({ kind: 'rect', x: 0, y: 0, width: this.doc.width, height: this.doc.height });
  }

  selectionMaskCanvas(): HTMLCanvasElement | null {
    if (!this.selection) return null;
    if (this.maskCache?.shape === this.selection) return this.maskCache.canvas;
    const canvas = rasterizeSelection(this.selection, this.doc.width, this.doc.height);
    if (canvas) this.maskCache = { shape: this.selection, canvas };
    return canvas;
  }

  selectionMaskData(): Uint8Array | null {
    const canvas = this.selectionMaskCanvas();
    if (!canvas) return null;
    const data = context2d(canvas, true).getImageData(0, 0, canvas.width, canvas.height).data;
    const mask = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) mask[p] = data[i + 3];
    return mask;
  }

  /** Clip a layer context to the current selection, if any. */
  applySelectionClip(ctx: CanvasRenderingContext2D): boolean {
    if (!this.selection) return false;
    ctx.clip(selectionPath(this.selection));
    return true;
  }

  deleteSelection(): void {
    const layer = this.activeLayer;
    if (!layer || layer.locked) {
      this.toast('Layer is locked');
      return;
    }
    this.beginUndo();
    const ctx = context2d(layer.canvas);
    if (this.selection) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fill(selectionPath(this.selection));
      ctx.restore();
    } else {
      ctx.clearRect(0, 0, this.doc.width, this.doc.height);
    }
    this.changed();
  }

  copySelection(): boolean {
    const layer = this.activeLayer;
    if (!layer) return false;
    const bounds = this.selection
      ? selectionBounds(this.selection)
      : { x: 0, y: 0, width: this.doc.width, height: this.doc.height };
    const x = clamp(Math.floor(bounds.x), 0, this.doc.width);
    const y = clamp(Math.floor(bounds.y), 0, this.doc.height);
    const width = clamp(Math.ceil(bounds.width), 1, this.doc.width - x);
    const height = clamp(Math.ceil(bounds.height), 1, this.doc.height - y);
    const canvas = createCanvas(width, height);
    context2d(canvas).drawImage(layer.canvas, -x, -y);
    if (this.selection) {
      const ctx = context2d(canvas);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.translate(-x, -y);
      ctx.fill(selectionPath(this.selection));
    }
    this.clipboard = { canvas, x, y };
    this.toast('Copied');
    return true;
  }

  cutSelection(): void {
    if (!this.copySelection()) return;
    this.deleteSelection();
  }

  paste(): void {
    if (!this.clipboard) {
      this.toast('Clipboard is empty');
      return;
    }
    this.beginUndo();
    this.doc.addCanvasLayer(this.clipboard.canvas, 'Pasted layer', this.clipboard.x, this.clipboard.y);
    this.changed();
    this.toast('Pasted');
  }

  // ---- layers -------------------------------------------------------------

  addLayer(): void {
    this.beginUndo();
    this.doc.addLayer();
    this.changed();
  }

  duplicateLayer(id = this.doc.activeId): void {
    this.beginUndo();
    this.doc.duplicateLayer(id);
    this.changed();
  }

  removeLayer(id = this.doc.activeId): void {
    this.beginUndo();
    if (!this.doc.removeLayer(id)) {
      this.toast('A document needs at least one layer');
      return;
    }
    this.changed();
  }

  mergeDown(): void {
    this.beginUndo();
    if (!this.doc.mergeDown(this.doc.activeId)) {
      this.toast('Nothing below to merge into');
      return;
    }
    this.changed();
  }

  flattenImage(): void {
    const flat = this.doc.flatten();
    this.beginUndo();
    const layer: Layer = {
      id: `layer-${Date.now()}`,
      name: 'Background',
      canvas: flat,
      visible: true,
      opacity: 1,
      blend: 'normal',
      locked: false,
    };
    this.doc.layers = [layer];
    this.doc.activeId = layer.id;
    this.changed();
    this.toast('Image flattened');
  }

  moveLayer(id: string, index: number): void {
    this.beginUndo();
    this.doc.moveLayer(id, index);
    this.changed();
  }

  setLayerVisibility(id: string, visible: boolean): void {
    const layer = this.doc.getLayer(id);
    if (!layer) return;
    layer.visible = visible;
    this.changed();
  }

  setLayerOpacity(id: string, opacity: number): void {
    const layer = this.doc.getLayer(id);
    if (!layer) return;
    layer.opacity = clamp(opacity, 0, 1);
    this.changed();
  }

  setLayerBlend(id: string, blend: BlendMode): void {
    const layer = this.doc.getLayer(id);
    if (!layer) return;
    layer.blend = blend;
    this.changed();
  }

  setLayerLocked(id: string, locked: boolean): void {
    const layer = this.doc.getLayer(id);
    if (!layer) return;
    layer.locked = locked;
    this.changed();
  }

  renameLayer(id: string, name: string): void {
    const layer = this.doc.getLayer(id);
    if (!layer) return;
    layer.name = name.trim() || layer.name;
    this.changed();
  }

  setActiveLayer(id: string): void {
    this.doc.activeId = id;
    this.emit('ui');
    this.requestRender();
  }

  /** Shift the active layer by whole pixels (keyboard nudging). */
  nudge(dx: number, dy: number): void {
    const layer = this.activeLayer;
    if (!layer) return;
    if (layer.locked) {
      this.toast('Layer is locked');
      return;
    }
    this.beginUndo();
    const source = copyCanvas(layer.canvas);
    const ctx = context2d(layer.canvas);
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.drawImage(source, dx, dy);
    this.changed();
  }

  // ---- pixels -------------------------------------------------------------

  /** Run a pixel operation on the active layer, respecting the selection. */
  applyPixelOp(label: string, op: (data: Uint8ClampedArray) => void): boolean {
    const layer = this.activeLayer;
    if (!layer) return false;
    if (layer.locked) {
      this.toast('Layer is locked');
      return false;
    }
    this.beginUndo();
    const ctx = context2d(layer.canvas, true);
    const image = ctx.getImageData(0, 0, this.doc.width, this.doc.height);
    const filtered = new Uint8ClampedArray(image.data);
    op(filtered);
    const mask = this.selectionMaskData();
    if (mask) blendWithMask(image.data, filtered, mask);
    else image.data.set(filtered);
    ctx.putImageData(image, 0, 0);
    this.changed();
    this.toast(label);
    return true;
  }

  /** Rasterize text onto the active layer at document coordinates. */
  drawText(text: string, x: number, y: number): void {
    if (!text.trim()) return;
    const layer = this.activeLayer;
    if (!layer || layer.locked) {
      this.toast('Layer is locked');
      return;
    }
    const style = this.options.text;
    this.beginUndo();
    const ctx = context2d(layer.canvas);
    ctx.save();
    this.applySelectionClip(ctx);
    ctx.fillStyle = this.primary;
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'top';
    ctx.textAlign = style.align;
    const weight = style.bold ? '700' : '400';
    const italic = style.italic ? 'italic' : 'normal';
    ctx.font = `${italic} ${weight} ${style.fontSize}px ${style.fontFamily}`;
    const lines = text.split('\n');
    const lineHeight = style.fontSize * 1.25;
    lines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeight);
    });
    ctx.restore();
    this.changed();
    this.toast('Text added');
  }

  // ---- document transforms ------------------------------------------------

  resizeImage(width: number, height: number): void {
    this.beginUndo();
    this.doc.resize(width, height);
    this.selection = null;
    this.maskCache = null;
    this.emit('selection');
    this.changed();
    this.toast(`Resized to ${Math.round(width)} × ${Math.round(height)}`);
  }

  cropDocument(x: number, y: number, width: number, height: number): void {
    this.beginUndo();
    this.doc.crop(x, y, width, height);
    this.selection = null;
    this.maskCache = null;
    this.emit('selection');
    this.changed();
    this.toast(`Cropped to ${this.doc.width} × ${this.doc.height}`);
  }

  flipDocument(horizontal: boolean): void {
    this.beginUndo();
    this.doc.flip(horizontal);
    this.dropSelection();
    this.changed();
    this.toast(horizontal ? 'Flipped horizontally' : 'Flipped vertically');
  }

  rotateDocument(turns: number): void {
    const t = ((turns % 4) + 4) % 4;
    if (t === 0) return;
    this.beginUndo();
    this.doc.rotate(t);
    this.dropSelection();
    this.changed();
    const label = t === 2 ? 'Rotated 180°' : t === 1 ? 'Rotated 90° right' : 'Rotated 90° left';
    this.toast(label);
  }

  /** Selections are document-space geometry, so transforms clear them. */
  private dropSelection(): void {
    if (!this.selection) {
      this.changed();
      return;
    }
    this.selection = null;
    this.maskCache = null;
    this.emit('selection');
  }

  // ---- files --------------------------------------------------------------

  saveProject(): void {
    download(serializeProject(this.doc, this.name), `${sanitizeFilename(this.name)}.reoo`);
    this.modified = false;
    void clearAutosave(this.autosaveStore);
    this.toast('Project saved');
  }

  // ---- crash recovery -----------------------------------------------------

  /** Begin periodically stashing unsaved work for crash recovery. */
  startAutosave(intervalMs = AUTOSAVE_INTERVAL_MS): void {
    if (this.autosaveTimer !== null) return;
    this.autosaveTimer = setInterval(() => {
      void this.autosaveNow();
    }, intervalMs);
  }

  stopAutosave(): void {
    if (this.autosaveTimer === null) return;
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = null;
  }

  /** Write a recovery snapshot when there is unsaved work. */
  async autosaveNow(): Promise<boolean> {
    if (this.autosaveBusy || !this.modified) return false;
    this.autosaveBusy = true;
    try {
      const project = await serializeProject(this.doc, this.name).text();
      const written = await writeAutosave(this.autosaveStore, this.name, project);
      if (written) this.lastAutosaveAt = Date.now();
      return written;
    } catch {
      return false;
    } finally {
      this.autosaveBusy = false;
    }
  }

  /** Forget any stored recovery snapshot (used after a real save or open). */
  discardAutosave(): void {
    void clearAutosave(this.autosaveStore);
  }

  async exportImage(format: ExportFormat, quality = 0.92, scale = 1): Promise<void> {
    let canvas = this.doc.flatten();
    if (scale !== 1) {
      const scaled = createCanvas(canvas.width * scale, canvas.height * scale);
      const ctx = context2d(scaled);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
      canvas = scaled;
    }
    if (format === 'jpeg') {
      const opaque = createCanvas(canvas.width, canvas.height);
      const ctx = context2d(opaque);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, opaque.width, opaque.height);
      ctx.drawImage(canvas, 0, 0);
      canvas = opaque;
    }
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const blob = await canvasToBlob(canvas, mime, quality);
    download(blob, `${sanitizeFilename(this.name)}.${format === 'jpeg' ? 'jpg' : format}`);
    this.toast(`Exported ${format.toUpperCase()}`);
  }

  async exportPsd(): Promise<void> {
    await exportPsd(this.doc, this.name);
    this.toast('Exported PSD');
  }

  async openFile(file: File): Promise<void> {
    const ext = fileExtension(file.name);
    try {
      if (ext === 'reoo') {
        const { doc, name } = await deserializeProject(await file.text());
        this.loadDocument(doc, name);
        this.toast(`Opened ${file.name}`);
        return;
      }
      if (ext === 'psd' || ext === 'psb') {
        const result = await importPsd(file);
        this.loadDocument(result.doc, sanitizeFilename(file.name));
        this.toast(
          `Imported ${result.layerCount} layer${result.layerCount === 1 ? '' : 's'} from PSD`,
        );
        return;
      }
      const image = await loadImageElement(file);
      if (image.naturalWidth > 12_000 || image.naturalHeight > 12_000) {
        throw new Error('That image is larger than 12000px.');
      }
      const doc = new EditorDocument(
        image.naturalWidth,
        image.naturalHeight,
        'transparent',
      );
      doc.layers = [];
      doc.addCanvasLayer(image, sanitizeFilename(file.name));
      this.loadDocument(doc, sanitizeFilename(file.name));
      this.toast(`Opened ${image.naturalWidth} × ${image.naturalHeight} image`);
    } catch (error) {
      this.toast(error instanceof Error ? error.message : 'Could not open that file');
    }
  }

  async placeImage(file: File): Promise<void> {
    try {
      const image = await loadImageElement(file);
      this.beginUndo();
      const scale = Math.min(1, this.doc.width / image.naturalWidth, this.doc.height / image.naturalHeight);
      if (scale < 1) {
        const canvas = createCanvas(image.naturalWidth * scale, image.naturalHeight * scale);
        context2d(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
        this.doc.addCanvasLayer(canvas, sanitizeFilename(file.name));
      } else {
        this.doc.addCanvasLayer(image, sanitizeFilename(file.name));
      }
      this.changed();
      this.toast('Placed as new layer');
    } catch {
      this.toast('Could not place that image');
    }
  }

  /** Pick the merged color at a document position. */
  pickColor(x: number, y: number): string | null {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.doc.width || py >= this.doc.height) return null;
    const data = context2d(this.doc.composite(), true).getImageData(px, py, 1, 1).data;
    if (data[3] === 0) return null;
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(data[0])}${hex(data[1])}${hex(data[2])}`;
  }
}
