// @vitest-environment happy-dom
/**
 * Boots the real app shell against a simulated DOM with a stubbed Canvas 2D
 * context. This is a wiring/regression test: it proves the modules load, the
 * UI mounts, and the main editor operations run without throwing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

class FakeImageData {
  data: Uint8ClampedArray;
  constructor(
    data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {
    this.data = data;
  }
}

type FakeBuffer = { data: Uint8ClampedArray; w: number; h: number };

function makeContext(
  canvas: HTMLCanvasElement,
  bufferFor: (canvas: HTMLCanvasElement) => FakeBuffer,
): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    canvas,
    getImageData: (x: number, y: number, w: number, h: number) => {
      const source = bufferFor(canvas);
      const out = new FakeImageData(new Uint8ClampedArray(Math.max(1, w * h * 4)), w, h);
      for (let row = 0; row < h; row++) {
        const sy = y + row;
        if (sy < 0 || sy >= source.h) continue;
        for (let col = 0; col < w; col++) {
          const sx = x + col;
          if (sx < 0 || sx >= source.w) continue;
          const si = (sy * source.w + sx) * 4;
          const di = (row * w + col) * 4;
          out.data[di] = source.data[si];
          out.data[di + 1] = source.data[si + 1];
          out.data[di + 2] = source.data[si + 2];
          out.data[di + 3] = source.data[si + 3];
        }
      }
      return out;
    },
    putImageData: (image: FakeImageData, x: number, y: number) => {
      const target = bufferFor(canvas);
      for (let row = 0; row < image.height; row++) {
        const ty = y + row;
        if (ty < 0 || ty >= target.h) continue;
        for (let col = 0; col < image.width; col++) {
          const tx = x + col;
          if (tx < 0 || tx >= target.w) continue;
          const si = (row * image.width + col) * 4;
          const di = (ty * target.w + tx) * 4;
          target.data[di] = image.data[si];
          target.data[di + 1] = image.data[si + 1];
          target.data[di + 2] = image.data[si + 2];
          target.data[di + 3] = image.data[si + 3];
        }
      }
    },
    clearRect: (x: number, y: number, w: number, h: number) => {
      const target = bufferFor(canvas);
      for (let row = 0; row < h; row++) {
        const ty = y + row;
        if (ty < 0 || ty >= target.h) continue;
        for (let col = 0; col < w; col++) {
          const tx = x + col;
          if (tx < 0 || tx >= target.w) continue;
          target.data.fill(0, (ty * target.w + tx) * 4, (ty * target.w + tx) * 4 + 4);
        }
      }
    },
    createImageData: (w: number, h: number) =>
      new FakeImageData(new Uint8ClampedArray(Math.max(1, w * h * 4)), w, h),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    measureText: (t: string) => ({ width: t.length * 8 }),
    getLineDash: () => [],
    isPointInPath: () => false,
  };
  return new Proxy(ctx, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return typeof prop === 'string' && /^[a-z]/.test(prop) ? () => {} : undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function installCanvasStubs(): void {
  const proto = window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  const buffers = new WeakMap<HTMLCanvasElement, FakeBuffer>();

  const bufferFor = (canvas: HTMLCanvasElement): FakeBuffer => {
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    let buffer = buffers.get(canvas);
    if (!buffer || buffer.w !== w || buffer.h !== h) {
      buffer = { data: new Uint8ClampedArray(w * h * 4), w, h };
      buffers.set(canvas, buffer);
    }
    return buffer;
  };

  proto.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== '2d') return null;
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = makeContext(this, bufferFor);
      contexts.set(this, ctx);
    }
    return ctx;
  };
  proto.toDataURL = () => 'data:image/png;base64,AAAA';
  proto.toBlob = (cb: (blob: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/png' }));

  Object.defineProperty(proto, 'width', {
    get(this: { __w?: number }) {
      return this.__w ?? 300;
    },
    set(this: { __w?: number }, value: number) {
      this.__w = value;
    },
  });
  Object.defineProperty(proto, 'height', {
    get(this: { __h?: number }) {
      return this.__h ?? 150;
    },
    set(this: { __h?: number }, value: number) {
      this.__h = value;
    },
  });

  const g = globalThis as unknown as Record<string, unknown>;
  // Image decoding is not implemented in the simulated DOM; resolve immediately
  // with fixed intrinsic dimensions so image workflows can be exercised.
  class FakeImage {
    naturalWidth = 64;
    naturalHeight = 48;
    width = 64;
    height = 48;
    onload: (() => void) | null = null;
    onerror: ((error?: unknown) => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  g.Image = FakeImage;
  g.Path2D ??= class {
    moveTo() {}
    lineTo() {}
    closePath() {}
    rect() {}
    ellipse() {}
    arc() {}
    arcTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
  };
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  g.requestAnimationFrame ??= (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
  g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

describe('app smoke test', () => {
  let app: { editor: import('../src/core/editor').Editor };
  let root: HTMLElement;
  const errors: string[] = [];

  beforeAll(async () => {
    installCanvasStubs();
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
      original(...args);
    };

    root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);

    const { App } = await import('../src/ui/app');
    app = new App(root);
  });

  it('mounts the full shell', () => {
    expect(root.querySelector('.app-shell')).not.toBeNull();
    expect(root.querySelector('#menubar button')).not.toBeNull();
    expect(root.querySelectorAll('#toolbar button').length).toBeGreaterThanOrEqual(10);
    expect(root.querySelector('#stage canvas')).not.toBeNull();
    expect(root.querySelectorAll('#layers-panel .layer-row').length).toBe(1);
  });

  it('starts with a default document', () => {
    const { editor } = app;
    expect(editor.doc.width).toBe(1200);
    expect(editor.doc.height).toBe(800);
    expect(editor.doc.layers.length).toBe(1);
  });

  it('adds layers and tracks history', () => {
    const { editor } = app;
    editor.addLayer();
    expect(editor.doc.layers.length).toBe(2);
    editor.undo();
    expect(editor.doc.layers.length).toBe(1);
    editor.redo();
    expect(editor.doc.layers.length).toBe(2);
  });

  it('selects, clips and deselects', () => {
    const { editor } = app;
    editor.selectAll();
    expect(editor.selection).not.toBeNull();
    expect(editor.selectionMaskData()).not.toBeNull();
    editor.clearSelection();
    expect(editor.selection).toBeNull();
  });

  it('zooms and fits', () => {
    const { editor } = app;
    editor.setZoom(2);
    expect(editor.view.zoom).toBeCloseTo(2, 5);
    editor.zoomToFit();
    expect(editor.view.zoom).toBeGreaterThan(0);
    editor.setZoom(1);
  });

  it('applies a filter to the active layer', () => {
    const { editor } = app;
    expect(editor.applyPixelOp('Inverted', (data) => data.fill(255))).toBe(true);
  });

  it('runs the export path end to end', async () => {
    const { editor } = app;
    await expect(editor.exportImage('png', 0.92, 1)).resolves.toBeUndefined();
  });

  it('paints a brush stroke through the tool pipeline', () => {
    const { editor } = app;
    const stage = root.querySelector('#stage canvas') as HTMLCanvasElement;
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });

    const pointer = (type: string, x: number, y: number, buttons: number) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        buttons,
        pointerId: 1,
        pointerType: 'mouse',
      });
      stage.dispatchEvent(event);
    };

    editor.setTool('brush');
    pointer('pointerdown', 400, 300, 1);
    pointer('pointermove', 420, 310, 1);
    pointer('pointerup', 420, 310, 0);

    expect(editor.modified).toBe(true);
    expect(editor.history.canUndo).toBe(true);
  });

  it('exports a PSD', async () => {
    const { editor } = app;
    await expect(editor.exportPsd()).resolves.toBeUndefined();
  });

  it('imports a PSD round-tripped through ag-psd', async () => {
    const { writePsdBuffer } = await import('ag-psd');
    const pixels = new Uint8ClampedArray(4 * 2 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 200;
      pixels[i + 1] = 40;
      pixels[i + 2] = 40;
      pixels[i + 3] = 255;
    }
    const buffer = writePsdBuffer({
      width: 4,
      height: 2,
      children: [
        {
          name: 'Imported layer',
          left: 0,
          top: 0,
          right: 4,
          bottom: 2,
          opacity: 0.5,
          blendMode: 'multiply',
          imageData: { data: pixels, width: 4, height: 2 },
        },
      ],
    } as never);
    const file = new File([new Uint8Array(buffer)], 'sample.psd', { type: 'image/psd' });

    const { editor } = app;
    await editor.openFile(file);

    expect(editor.name).toBe('sample');
    expect(editor.doc.width).toBe(4);
    expect(editor.doc.height).toBe(2);
    expect(editor.doc.layers.length).toBeGreaterThanOrEqual(1);
    const layer = editor.doc.layers.find((l) => l.name === 'Imported layer');
    expect(layer).toBeDefined();
    expect(layer?.blend).toBe('multiply');
    // ag-psd normalizes layer opacity to 0-1; import must not rescale it.
    expect(layer?.opacity).toBeCloseTo(0.5, 1);
  });

  it('rotates and flips the document', () => {
    const { editor } = app;
    const before = { w: editor.doc.width, h: editor.doc.height };

    editor.rotateDocument(1);
    expect(editor.doc.width).toBe(before.h);
    expect(editor.doc.height).toBe(before.w);

    editor.rotateDocument(3);
    expect(editor.doc.width).toBe(before.w);
    expect(editor.doc.height).toBe(before.h);

    editor.flipDocument(true);
    editor.flipDocument(false);
    expect(editor.doc.width).toBe(before.w);
    expect(editor.doc.height).toBe(before.h);

    // Transforms are undoable like any other edit.
    editor.undo();
    editor.redo();
    expect(editor.doc.width).toBe(before.w);
  });

  it('drops the selection when the document is transformed', () => {
    const { editor } = app;
    editor.selectAll();
    editor.rotateDocument(2);
    expect(editor.selection).toBeNull();
  });

  it('places an image pasted from another app as a new layer', async () => {
    const { editor } = app;
    const before = editor.doc.layers.length;
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'pasted.png', { type: 'image/png' });

    const event = new Event('paste', { bubbles: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
    });
    window.dispatchEvent(event);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(editor.doc.layers.length).toBe(before + 1);
    expect(editor.doc.layers[editor.doc.layers.length - 1].name).toContain('pasted');
  });

  it('autosaves unsaved work and can restore it', async () => {
    const { editor } = app;
    const { readAutosave, clearAutosave } = await import('../src/core/autosave');
    const { deserializeProject } = await import('../src/core/io');

    await clearAutosave(editor.autosaveStore);
    editor.addLayer();
    expect(editor.modified).toBe(true);

    expect(await editor.autosaveNow()).toBe(true);
    const snapshot = await readAutosave(editor.autosaveStore);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.name).toBe(editor.name);

    const { doc } = await deserializeProject(snapshot!.project);
    expect(doc.width).toBe(editor.doc.width);
    expect(doc.layers.length).toBe(editor.doc.layers.length);
  });

  it('does not autosave when nothing changed', async () => {
    const { editor } = app;
    editor.discardAutosave();
    editor.modified = false;
    expect(await editor.autosaveNow()).toBe(false);
  });

  it('offers to restore an autosaved session on boot', async () => {
    const { createMemoryStore, writeAutosave } = await import('../src/core/autosave');
    const { serializeProject } = await import('../src/core/io');

    const store = createMemoryStore();
    const project = await serializeProject(app.editor.doc, 'recovered project').text();
    await writeAutosave(store, 'recovered project', project);

    const secondRoot = document.createElement('div');
    secondRoot.id = 'app-restore';
    document.body.appendChild(secondRoot);

    const { App } = await import('../src/ui/app');
    const second = new App(secondRoot, store);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const modal = document.querySelector('.modal-backdrop .modal');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Restore previous session?');

    const restore = Array.from(modal!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Restore',
    );
    expect(restore).toBeDefined();
    restore!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(second.editor.name).toBe('recovered project');
    expect(second.editor.doc.layers.length).toBe(app.editor.doc.layers.length);
    second.editor.stopAutosave();
    secondRoot.remove();
  });

  it('records undo only when a bucket fill actually changes pixels', async () => {
    const { editor } = app;
    const { createTools } = await import('../src/tools');
    const { context2d } = await import('../src/core/canvas');

    // Fresh document so the seed point is inside the canvas and history starts empty.
    editor.newDocument(16, 16, '#ffffff', 'fill test');
    const tools = createTools({ editor, beginText: () => {} });
    const pointer = (x: number, y: number) => ({
      x,
      y,
      screenX: x,
      screenY: y,
      pressure: 1,
      pen: false,
      alt: false,
      shift: false,
      ctrl: false,
    });

    editor.setTool('fill');
    editor.options.fill = { tolerance: 0, contiguous: true };
    editor.setPrimary('#ff0000');
    expect(editor.history.undoDepth).toBe(0);

    tools.fill.down(pointer(4, 4));
    expect(editor.history.undoDepth).toBe(1);

    const layer = editor.activeLayer;
    expect(layer).not.toBeNull();
    const pixel = context2d(layer!.canvas, true).getImageData(4, 4, 1, 1).data;
    expect([pixel[0], pixel[1], pixel[2], pixel[3]]).toEqual([255, 0, 0, 255]);

    // Same seed, same color: the pixels already match, so no undo step is burned.
    tools.fill.down(pointer(4, 4));
    expect(editor.history.undoDepth).toBe(1);

    // A click outside the canvas changes nothing and is not recorded either.
    tools.fill.down(pointer(40, 40));
    expect(editor.history.undoDepth).toBe(1);
  });

  it('reports no console errors while doing all of the above', () => {
    expect(errors).toEqual([]);
  });

  afterAll(() => {
    app.editor.stopAutosave();
  });
});
