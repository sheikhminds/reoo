/** Small canvas helpers used across the app. */

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(
  canvas: HTMLCanvasElement,
  willReadFrequently = false,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently });
  if (!ctx) throw new Error('2D canvas is not available in this browser');
  return ctx;
}

export function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = createCanvas(source.width, source.height);
  context2d(copy).drawImage(source, 0, 0);
  return copy;
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
  context2d(canvas).clearRect(0, 0, canvas.width, canvas.height);
}

/** Trim transparent borders. Returns the original rect when fully transparent. */
export function contentBounds(canvas: HTMLCanvasElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { width, height } = canvas;
  const data = context2d(canvas, true).getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
