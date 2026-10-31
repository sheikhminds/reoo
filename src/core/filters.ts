/**
 * Pixel-level image processing. Everything here operates on RGBA
 * Uint8ClampedArray data so it can be unit tested in Node without a canvas.
 */

import type { RGBA } from './color';

const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

export interface FillOptions {
  color: RGBA;
  /** 0..255 maximum per-channel difference from the seed pixel. */
  tolerance: number;
  /** When false, every matching pixel in the image is filled. */
  contiguous?: boolean;
  /** Optional per-pixel alpha mask (one byte per pixel). */
  mask?: Uint8Array | null;
}

/**
 * Paint-bucket fill. Returns the number of pixels changed.
 * Implements a scanline flood fill; the `visited` buffer guarantees
 * termination even when the fill color equals the target color.
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  options: FillOptions,
): number {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return 0;
  const { color, tolerance, contiguous = true, mask = null } = options;
  const maskAt = (idx: number) => (mask ? mask[idx] > 0 : true);
  const start = (sy * width + sx) * 4;
  if (!maskAt(sy * width + sx)) return 0;

  const tr = data[start];
  const tg = data[start + 1];
  const tb = data[start + 2];
  const ta = data[start + 3];

  const matches = (x: number, y: number): boolean => {
    const idx = y * width + x;
    if (!maskAt(idx)) return false;
    const i = idx * 4;
    return (
      Math.abs(data[i] - tr) <= tolerance &&
      Math.abs(data[i + 1] - tg) <= tolerance &&
      Math.abs(data[i + 2] - tb) <= tolerance &&
      Math.abs(data[i + 3] - ta) <= tolerance
    );
  };

  /** Writes the fill color and reports whether the pixel actually changed. */
  const write = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4;
    if (
      data[i] === color.r &&
      data[i + 1] === color.g &&
      data[i + 2] === color.b &&
      data[i + 3] === color.a
    ) {
      return false;
    }
    data[i] = color.r;
    data[i + 1] = color.g;
    data[i + 2] = color.b;
    data[i + 3] = color.a;
    return true;
  };

  const visited = new Uint8Array(width * height);
  let changed = 0;

  if (!contiguous) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (visited[y * width + x]) continue;
        if (!matches(x, y)) continue;
        visited[y * width + x] = 1;
        if (write(x, y)) changed++;
      }
    }
    return changed;
  }

  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (y < 0 || y >= height) continue;
    const row = y * width;
    if (visited[row + x]) continue;
    if (!matches(x, y)) continue;

    let left = x;
    while (left > 0 && !visited[row + left - 1] && matches(left - 1, y)) left--;
    let right = x;
    while (right < width - 1 && !visited[row + right + 1] && matches(right + 1, y)) right++;

    for (let i = left; i <= right; i++) {
      visited[row + i] = 1;
      if (write(i, y)) changed++;
    }

    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      const nrow = ny * width;
      let i = left;
      while (i <= right) {
        while (i <= right && (visited[nrow + i] || !matches(i, ny))) i++;
        if (i > right) break;
        stack.push(i, ny);
        while (i <= right && !visited[nrow + i] && matches(i, ny)) i++;
      }
    }
  }
  return changed;
}

function boxBlurChannel(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  const temp = new Float32Array(src.length);
  const diameter = radius * 2 + 1;
  // Horizontal pass.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      sum += src[row + Math.min(width - 1, Math.max(0, x))];
    }
    for (let x = 0; x < width; x++) {
      temp[row + x] = sum / diameter;
      const outIdx = row + Math.max(0, x - radius);
      const inIdx = row + Math.min(width - 1, x + radius + 1);
      sum += src[inIdx] - src[outIdx];
    }
  }
  // Vertical pass.
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += temp[Math.min(height - 1, Math.max(0, y)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum / diameter;
      const outIdx = Math.max(0, y - radius) * width + x;
      const inIdx = Math.min(height - 1, y + radius + 1) * width + x;
      sum += temp[inIdx] - temp[outIdx];
    }
  }
}

/** Premultiplied alpha blur avoids dark halos around transparent edges. */
function blurImageData(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  const n = width * height;
  const channels = Array.from({ length: 4 }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    channels[0][i] = data[i * 4] * a;
    channels[1][i] = data[i * 4 + 1] * a;
    channels[2][i] = data[i * 4 + 2] * a;
    channels[3][i] = data[i * 4 + 3];
  }
  const temp = new Float32Array(n);
  for (const channel of channels) {
    boxBlurChannel(channel, temp, width, height, radius);
    channel.set(temp);
  }
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const a = channels[3][i] / 255;
      data[i * 4 + c] = a === 0 ? 0 : clamp255(channels[c][i] / a);
    }
    data[i * 4 + 3] = clamp255(channels[3][i]);
  }
}

export function blur(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  const r = Math.floor(radius);
  if (r < 1) return;
  blurImageData(data, width, height, r);
}

/** Three box passes approximate a Gaussian blur. */
export function gaussianBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(1, Math.round(radius));
  for (let i = 0; i < 3; i++) blurImageData(data, width, height, r);
}

export function sharpen(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount === 0) return;
  const src = new Uint8ClampedArray(data);
  const strength = amount / 100;
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const py = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const px = Math.min(width - 1, Math.max(0, x + kx));
            const p = src[(py * width + px) * 4 + c];
            sum += p * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        data[i + c] = clamp255(src[i + c] + (sum - src[i + c]) * strength);
      }
    }
  }
}

export function pixelate(data: Uint8ClampedArray, width: number, height: number, block: number): void {
  const size = Math.max(2, Math.floor(block));
  if (size < 2) return;
  const src = new Uint8ClampedArray(data);
  for (let by = 0; by < height; by += size) {
    for (let bx = 0; bx < width; bx += size) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      const maxY = Math.min(height, by + size);
      const maxX = Math.min(width, bx + size);
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const i = (y * width + x) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
          count++;
        }
      }
      if (!count) continue;
      r /= count;
      g /= count;
      b /= count;
      a /= count;
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const i = (y * width + x) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = a;
        }
      }
    }
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addNoise(
  data: Uint8ClampedArray,
  amount: number,
  seed = 1337,
  monochrome = false,
): void {
  if (amount <= 0) return;
  const rand = mulberry32(seed);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (monochrome) {
      const n = (rand() - 0.5) * amount * 2;
      data[i] = clamp255(data[i] + n);
      data[i + 1] = clamp255(data[i + 1] + n);
      data[i + 2] = clamp255(data[i + 2] + n);
    } else {
      data[i] = clamp255(data[i] + (rand() - 0.5) * amount * 2);
      data[i + 1] = clamp255(data[i + 1] + (rand() - 0.5) * amount * 2);
      data[i + 2] = clamp255(data[i + 2] + (rand() - 0.5) * amount * 2);
    }
  }
}

/** Mix `filtered` into `target` using an 8-bit selection mask (0..255). */
export function blendWithMask(
  target: Uint8ClampedArray,
  filtered: Uint8ClampedArray,
  mask: Uint8Array,
): void {
  for (let i = 0, p = 0; i < target.length; i += 4, p++) {
    const m = mask[p] / 255;
    if (m === 0) continue;
    target[i] = target[i] + (filtered[i] - target[i]) * m;
    target[i + 1] = target[i + 1] + (filtered[i + 1] - target[i + 1]) * m;
    target[i + 2] = target[i + 2] + (filtered[i + 2] - target[i + 2]) * m;
    target[i + 3] = target[i + 3] + (filtered[i + 3] - target[i + 3]) * m;
  }
}

/** Extract the alpha channel of an RGBA buffer as one byte per pixel. */
export function alphaMask(data: Uint8ClampedArray): Uint8Array {
  const mask = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) mask[p] = data[i + 3];
  return mask;
}
