/** File I/O: images, the native .reoo project format, downloads. */

import { context2d } from './canvas';
import { BLEND_MODES, EditorDocument, type BlendMode, type Layer, layerId } from './document';

export const PROJECT_EXTENSION = '.reoo';
export const PROJECT_VERSION = 1;

export interface ProjectLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  locked: boolean;
  data: string;
}

export interface ProjectFile {
  app: 'reoo';
  version: number;
  name: string;
  width: number;
  height: number;
  activeId: string;
  savedAt: string;
  layers: ProjectLayer[];
}

export function loadImageElement(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    image.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      reject(new Error('Could not decode that image.'));
    };
    image.src = url;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      type,
      quality,
    );
  });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-z0-9-_ ]+/gi, '')
      .trim()
      .replace(/\s+/g, '-') || 'untitled'
  );
}

export function serializeProject(doc: EditorDocument, name: string): Blob {
  const data: ProjectFile = {
    app: 'reoo',
    version: PROJECT_VERSION,
    name,
    width: doc.width,
    height: doc.height,
    activeId: doc.activeId,
    savedAt: new Date().toISOString(),
    layers: doc.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blend: layer.blend,
      locked: layer.locked,
      data: layer.canvas.toDataURL('image/png'),
    })),
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function deserializeProject(text: string): Promise<{ doc: EditorDocument; name: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid project file.');
  const data = parsed as Partial<ProjectFile>;
  if (data.app !== 'reoo') throw new Error('Not a Reoo project file.');
  if (typeof data.width !== 'number' || typeof data.height !== 'number') {
    throw new Error('Project is missing a canvas size.');
  }
  if (!Array.isArray(data.layers) || data.layers.length === 0) {
    throw new Error('Project has no layers.');
  }
  if (data.width > 12000 || data.height > 12000 || data.width < 1 || data.height < 1) {
    throw new Error('Project dimensions are out of range.');
  }

  const doc = new EditorDocument(data.width, data.height, 'transparent');
  doc.layers = [];
  for (const entry of data.layers) {
    if (!entry || typeof entry.data !== 'string') continue;
    const image = await loadImageElement(entry.data);
    const canvas = document.createElement('canvas');
    canvas.width = doc.width;
    canvas.height = doc.height;
    context2d(canvas).drawImage(image, 0, 0);
    const layer: Layer = {
      id: typeof entry.id === 'string' ? entry.id : layerId(),
      name: typeof entry.name === 'string' ? entry.name : 'Layer',
      visible: entry.visible !== false,
      opacity: typeof entry.opacity === 'number' ? Math.min(1, Math.max(0, entry.opacity)) : 1,
      blend: BLEND_MODES.includes(entry.blend as BlendMode) ? (entry.blend as BlendMode) : 'normal',
      locked: entry.locked === true,
      canvas,
    };
    doc.layers.push(layer);
  }
  if (doc.layers.length === 0) throw new Error('Project layers could not be decoded.');
  doc.activeId = doc.layers.some((l) => l.id === data.activeId)
    ? (data.activeId as string)
    : doc.layers[doc.layers.length - 1].id;
  doc.invalidate();
  return { doc, name: typeof data.name === 'string' ? data.name : 'untitled' };
}

export function fileExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}
