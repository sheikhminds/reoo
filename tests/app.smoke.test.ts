// @vitest-environment happy-dom
/**
 * Boots the real app shell against a simulated DOM with a stubbed Canvas 2D
 * context. This is a wiring/regression test: it proves the modules load, the
 * UI mounts, and the main editor operations run without throwing.
 */
import { beforeAll, describe, expect, it } from 'vitest';

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

function makeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    canvas,
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      new FakeImageData(new Uint8ClampedArray(Math.max(1, w * h * 4)), w, h),
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
  proto.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== '2d') return null;
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = makeContext(this);
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

  it('reports no console errors while doing all of the above', () => {
    expect(errors).toEqual([]);
  });
});
