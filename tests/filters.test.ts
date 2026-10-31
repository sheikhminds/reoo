import { describe, expect, it } from 'vitest';
import {
  addNoise,
  alphaMask,
  blendWithMask,
  blur,
  floodFill,
  pixelate,
  sharpen,
} from '../src/core/filters';

function solid(width: number, height: number, r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

function pixel(data: Uint8ClampedArray, x: number, y: number, width: number): number[] {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe('flood fill', () => {
  it('fills only the contiguous region', () => {
    const width = 5;
    const height = 5;
    const data = solid(width, height, 255, 255, 255);
    // Vertical wall at x = 2.
    for (let y = 0; y < height; y++) {
      const i = (y * width + 2) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    const changed = floodFill(data, width, height, 0, 0, {
      color: { r: 255, g: 0, b: 0, a: 255 },
      tolerance: 0,
    });
    expect(changed).toBe(10);
    expect(pixel(data, 0, 0, width)).toEqual([255, 0, 0, 255]);
    expect(pixel(data, 4, 0, width)).toEqual([255, 255, 255, 255]);
  });

  it('fills every match when contiguous is false', () => {
    const width = 5;
    const height = 5;
    const data = solid(width, height, 255, 255, 255);
    for (let y = 0; y < height; y++) {
      const i = (y * width + 2) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    const changed = floodFill(data, width, height, 0, 0, {
      color: { r: 0, g: 0, b: 255, a: 255 },
      tolerance: 0,
      contiguous: false,
    });
    expect(changed).toBe(20);
  });

  it('respects tolerance', () => {
    const make = () => {
      const data = solid(2, 1, 255, 255, 255);
      const i = 4;
      data[i] = 250;
      data[i + 1] = 250;
      data[i + 2] = 250;
      return data;
    };
    expect(
      floodFill(make(), 2, 1, 0, 0, { color: { r: 0, g: 0, b: 0, a: 255 }, tolerance: 3 }),
    ).toBe(1);
    expect(
      floodFill(make(), 2, 1, 0, 0, { color: { r: 0, g: 0, b: 0, a: 255 }, tolerance: 10 }),
    ).toBe(2);
  });

  it('reports no change when the region already holds the fill color', () => {
    const data = solid(2, 2, 10, 20, 30);
    expect(
      floodFill(data, 2, 2, 0, 0, { color: { r: 10, g: 20, b: 30, a: 255 }, tolerance: 0 }),
    ).toBe(0);
  });

  it('honors the selection mask', () => {
    const data = solid(2, 2, 255, 255, 255);
    const mask = new Uint8Array([255, 255, 0, 0]);
    const changed = floodFill(data, 2, 2, 0, 0, {
      color: { r: 0, g: 0, b: 0, a: 255 },
      tolerance: 0,
      mask,
    });
    expect(changed).toBe(2);
    expect(pixel(data, 1, 1, 2)).toEqual([255, 255, 255, 255]);
  });

  it('does nothing when the seed is outside', () => {
    const data = solid(2, 2, 255, 255, 255);
    expect(
      floodFill(data, 2, 2, 9, 9, { color: { r: 0, g: 0, b: 0, a: 255 }, tolerance: 0 }),
    ).toBe(0);
  });
});

describe('pixel filters', () => {
  it('keeps a solid opaque image unchanged after blur', () => {
    const width = 4;
    const height = 4;
    const data = solid(width, height, 200, 60, 40);
    blur(data, width, height, 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b, a] = pixel(data, x, y, width);
        expect(a).toBe(255);
        expect(r).toBeCloseTo(200, 0);
        expect(g).toBeCloseTo(60, 0);
        expect(b).toBeCloseTo(40, 0);
      }
    }
  });

  it('pixelates a 2x2 block to its average', () => {
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 100, 100, 100, 255,
      200, 200, 200, 255, 40, 40, 40, 255,
    ]);
    pixelate(data, 2, 2, 2);
    const values = [0, 4, 8, 12].map((i) => data[i]);
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe(85);
  });

  it('sharpens without changing the alpha channel', () => {
    const data = solid(3, 3, 120, 120, 120);
    const center = (1 * 3 + 1) * 4;
    data[center] = 200;
    sharpen(data, 3, 3, 100);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it('adds deterministic noise for a given seed', () => {
    const a = solid(8, 8, 128, 128, 128);
    const b = solid(8, 8, 128, 128, 128);
    addNoise(a, 40, 42, true);
    addNoise(b, 40, 42, true);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(solid(8, 8, 128, 128, 128)));
  });

  it('extracts alpha masks and blends with them', () => {
    const target = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]);
    const filtered = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
    blendWithMask(target, filtered, new Uint8Array([255, 0]));
    expect(Array.from(target)).toEqual([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(Array.from(alphaMask(target))).toEqual([255, 0]);
  });
});
