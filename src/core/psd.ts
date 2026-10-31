/**
 * PSD import/export via ag-psd (MIT). Loaded lazily so the editor stays light
 * for people who never touch PSD files.
 */

import { context2d } from './canvas';
import { BLEND_MODES, EditorDocument, type BlendMode, type Layer, layerId } from './document';
import { download, sanitizeFilename } from './io';
import type { Layer as PsdLayer, Psd } from 'ag-psd';

const MAX_DIMENSION = 12_000;
const MAX_LAYERS = 300;

const PSD_TO_BLEND: Record<string, BlendMode> = {
  normal: 'normal',
  dissolve: 'normal',
  darken: 'darken',
  multiply: 'multiply',
  'color burn': 'color-burn',
  'linear burn': 'color-burn',
  'darker color': 'darken',
  lighten: 'lighten',
  screen: 'screen',
  'color dodge': 'color-dodge',
  'linear dodge': 'screen',
  'lighter color': 'lighten',
  overlay: 'overlay',
  'soft light': 'soft-light',
  'hard light': 'hard-light',
  'vivid light': 'hard-light',
  'linear light': 'hard-light',
  'pin light': 'hard-light',
  'hard mix': 'hard-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'pass through': 'normal',
};

const TO_PSD_BLEND: Record<BlendMode, NonNullable<PsdLayer['blendMode']>> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color dodge',
  'color-burn': 'color burn',
  'hard-light': 'hard light',
  'soft-light': 'soft light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

export interface PsdImportResult {
  doc: EditorDocument;
  layerCount: number;
  skipped: number;
}

function psdLayerToDocLayer(source: PsdLayer, docWidth: number, docHeight: number): Layer | null {
  const left = source.left ?? 0;
  const top = source.top ?? 0;
  let canvas: HTMLCanvasElement | null = null;
  if (source.canvas) {
    canvas = document.createElement('canvas');
    canvas.width = docWidth;
    canvas.height = docHeight;
    context2d(canvas).drawImage(source.canvas, left, top);
  }
  if (!canvas) return null;
  const blend = PSD_TO_BLEND[source.blendMode ?? 'normal'] ?? 'normal';
  return {
    id: layerId(),
    name: source.name || 'Layer',
    canvas,
    visible: source.hidden !== true,
    opacity: typeof source.opacity === 'number' ? Math.min(1, Math.max(0, source.opacity)) : 1,
    blend: BLEND_MODES.includes(blend) ? blend : 'normal',
    locked: source.transparencyProtected === true,
  };
}

export async function importPsd(file: File): Promise<PsdImportResult> {
  const { readPsd } = await import('ag-psd');
  const buffer = await file.arrayBuffer();
  const psd = readPsd(buffer, {
    skipThumbnail: true,
    totalMemoryLimit: 512 * 1024 * 1024,
    logMissingFeatures: false,
  }) as Psd;

  if (!psd.width || !psd.height) throw new Error('PSD has no canvas size.');
  if (psd.width > MAX_DIMENSION || psd.height > MAX_DIMENSION) {
    throw new Error(`PSD is too large (max ${MAX_DIMENSION}px per side).`);
  }

  const doc = new EditorDocument(psd.width, psd.height, 'transparent');
  doc.layers = [];
  let skipped = 0;

  const addLeaf = (source: PsdLayer, inheritedHidden: boolean): void => {
    const layer = psdLayerToDocLayer(source, doc.width, doc.height);
    if (!layer) {
      skipped++;
      return;
    }
    layer.visible = layer.visible && !inheritedHidden;
    doc.layers.push(layer);
  };

  const walk = (layers: PsdLayer[] | undefined, inheritedHidden: boolean): void => {
    for (const source of layers ?? []) {
      if (doc.layers.length >= MAX_LAYERS) {
        skipped++;
        continue;
      }
      const hidden = inheritedHidden || source.hidden === true;
      if (source.children && source.children.length > 0) {
        walk(source.children, hidden);
      } else {
        if (source.clipping) continue; // clipped layers need their base; keep it simple
        addLeaf(source, hidden);
      }
    }
  };

  walk(psd.children, false);

  if (doc.layers.length === 0) {
    // Some PSDs only carry a flattened composite image.
    if (psd.canvas) {
      const canvas = document.createElement('canvas');
      canvas.width = doc.width;
      canvas.height = doc.height;
      context2d(canvas).drawImage(psd.canvas, 0, 0);
      doc.layers.push({
        id: layerId(),
        name: 'PSD composite',
        canvas,
        visible: true,
        opacity: 1,
        blend: 'normal',
        locked: false,
      });
    } else {
      throw new Error('No usable layers were found in that PSD.');
    }
  }

  doc.activeId = doc.layers[doc.layers.length - 1].id;
  doc.invalidate();
  return { doc, layerCount: doc.layers.length, skipped };
}

export async function exportPsd(doc: EditorDocument, name: string): Promise<void> {
  const { writePsd } = await import('ag-psd');
  const children: PsdLayer[] = doc.layers.map((layer) => ({
    name: layer.name,
    canvas: layer.canvas,
    left: 0,
    top: 0,
    right: doc.width,
    bottom: doc.height,
    opacity: Math.round(layer.opacity * 100),
    hidden: !layer.visible,
    blendMode: TO_PSD_BLEND[layer.blend],
    transparencyProtected: layer.locked,
  }));
  const psd: Psd = {
    width: doc.width,
    height: doc.height,
    children,
    canvas: doc.flatten(),
  };
  const buffer = writePsd(psd, { generateThumbnail: true, noBackground: true });
  const blob = new Blob([buffer], { type: 'image/vnd.adobe.photoshop' });
  download(blob, `${sanitizeFilename(name)}.psd`);
}

