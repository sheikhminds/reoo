/** Document + layer model. Layers are full-size raster canvases. */

import { context2d, copyCanvas, createCanvas } from './canvas';

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export const BLEND_LABELS: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'color-dodge': 'Color Dodge',
  'color-burn': 'Color Burn',
  'hard-light': 'Hard Light',
  'soft-light': 'Soft Light',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity',
};

export interface Layer {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  locked: boolean;
}

let idCounter = 0;

export function layerId(): string {
  idCounter += 1;
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `layer-${idCounter}-${random}`;
}

export function blendToComposite(blend: BlendMode): GlobalCompositeOperation {
  return blend === 'normal' ? 'source-over' : (blend as GlobalCompositeOperation);
}

export class EditorDocument {
  width: number;
  height: number;
  layers: Layer[] = [];
  activeId = '';
  private compositeCanvas: HTMLCanvasElement | null = null;
  private compositeDirty = true;
  private layerCounter = 1;

  constructor(width: number, height: number, background: 'transparent' | string = '#ffffff') {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    const backgroundLayer = this.addLayer('Background');
    if (background !== 'transparent') {
      const ctx = context2d(backgroundLayer.canvas);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  get activeLayer(): Layer {
    return this.layers.find((l) => l.id === this.activeId) ?? this.layers[this.layers.length - 1];
  }

  getLayer(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  private blank(): HTMLCanvasElement {
    return createCanvas(this.width, this.height);
  }

  /** Insert a new empty layer directly above the active layer. */
  addLayer(name?: string): Layer {
    const layer: Layer = {
      id: layerId(),
      name: name ?? `Layer ${this.layerCounter++}`,
      canvas: this.blank(),
      visible: true,
      opacity: 1,
      blend: 'normal',
      locked: false,
    };
    const activeIndex = this.layers.findIndex((l) => l.id === this.activeId);
    const insertAt = activeIndex >= 0 ? activeIndex + 1 : this.layers.length;
    this.layers.splice(insertAt, 0, layer);
    this.activeId = layer.id;
    this.invalidate();
    return layer;
  }

  /** Add an imported image as a new layer, positioned at (left, top). */
  addCanvasLayer(canvas: CanvasImageSource, name: string, left = 0, top = 0): Layer {
    const layer = this.addLayer(name);
    const ctx = context2d(layer.canvas);
    ctx.drawImage(canvas, left, top);
    this.invalidate();
    return layer;
  }

  removeLayer(id: string): boolean {
    if (this.layers.length <= 1) return false;
    const index = this.layers.findIndex((l) => l.id === id);
    if (index < 0) return false;
    this.layers.splice(index, 1);
    if (this.activeId === id) {
      this.activeId = this.layers[Math.max(0, index - 1)].id;
    }
    this.invalidate();
    return true;
  }

  duplicateLayer(id: string): Layer | null {
    const source = this.getLayer(id);
    if (!source) return null;
    const index = this.layers.indexOf(source);
    const copy: Layer = {
      ...source,
      id: layerId(),
      name: `${source.name} copy`,
      canvas: copyCanvas(source.canvas),
    };
    this.layers.splice(index + 1, 0, copy);
    this.activeId = copy.id;
    this.invalidate();
    return copy;
  }

  /** Move a layer to an absolute index (0 = bottom). */
  moveLayer(id: string, targetIndex: number): void {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index < 0) return;
    const clamped = Math.max(0, Math.min(this.layers.length - 1, targetIndex));
    if (clamped === index) return;
    const [layer] = this.layers.splice(index, 1);
    this.layers.splice(clamped, 0, layer);
    this.invalidate();
  }

  mergeDown(id: string): boolean {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index <= 0) return false;
    const upper = this.layers[index];
    const lower = this.layers[index - 1];
    if (lower.locked) return false;
    const ctx = context2d(lower.canvas);
    ctx.save();
    ctx.globalAlpha = upper.opacity;
    ctx.globalCompositeOperation = blendToComposite(upper.blend);
    ctx.drawImage(upper.canvas, 0, 0);
    ctx.restore();
    this.layers.splice(index, 1);
    this.activeId = lower.id;
    this.invalidate();
    return true;
  }

  /** Composite every visible layer bottom-to-top. Cached until invalidated. */
  composite(): HTMLCanvasElement {
    if (this.compositeCanvas && !this.compositeDirty) return this.compositeCanvas;
    const canvas = this.compositeCanvas ?? createCanvas(this.width, this.height);
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, this.width, this.height);
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = blendToComposite(layer.blend);
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.compositeCanvas = canvas;
    this.compositeDirty = false;
    return canvas;
  }

  /** Flattened copy, safe to export or hand to a caller. */
  flatten(): HTMLCanvasElement {
    const output = createCanvas(this.width, this.height);
    context2d(output).drawImage(this.composite(), 0, 0);
    return output;
  }

  invalidate(): void {
    this.compositeDirty = true;
  }

  /** Scale the whole document, including all layer pixels. */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.width && h === this.height) return;
    for (const layer of this.layers) {
      const next = createCanvas(w, h);
      const ctx = context2d(next);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(layer.canvas, 0, 0, this.width, this.height, 0, 0, w, h);
      layer.canvas = next;
    }
    this.width = w;
    this.height = h;
    this.compositeCanvas = null;
    this.invalidate();
  }

  /** Crop to a rectangle in document coordinates. */
  crop(x: number, y: number, width: number, height: number): void {
    const sx = Math.max(0, Math.round(x));
    const sy = Math.max(0, Math.round(y));
    const sw = Math.max(1, Math.min(this.width - sx, Math.round(width)));
    const sh = Math.max(1, Math.min(this.height - sy, Math.round(height)));
    for (const layer of this.layers) {
      const next = createCanvas(sw, sh);
      context2d(next).drawImage(layer.canvas, -sx, -sy);
      layer.canvas = next;
    }
    this.width = sw;
    this.height = sh;
    this.compositeCanvas = null;
    this.invalidate();
  }

  dispose(): void {
    this.compositeCanvas = null;
    this.layers = [];
  }
}
