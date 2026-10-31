import { describe, expect, it } from 'vitest';
import {
  brightnessContrast,
  grayscale,
  hueSaturation,
  invert,
  levels,
  posterize,
  sepia,
  threshold,
} from '../src/core/adjustments';

function pixels(...rgba: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba);
}

describe('adjustments', () => {
  it('inverts channels but not alpha', () => {
    const data = pixels(0, 20, 255, 200);
    invert(data);
    expect(Array.from(data)).toEqual([255, 235, 0, 200]);
  });

  it('grayscales to equal channels', () => {
    const data = pixels(255, 0, 0, 255);
    grayscale(data);
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
    expect(data[3]).toBe(255);
  });

  it('is a no-op for zero brightness/contrast', () => {
    const data = pixels(10, 20, 30, 255);
    brightnessContrast(data, 0, 0);
    expect(Array.from(data)).toEqual([10, 20, 30, 255]);
  });

  it('raises brightness', () => {
    const data = pixels(100, 100, 100, 255);
    brightnessContrast(data, 20, 0);
    expect(data[0]).toBe(151);
  });

  it('maps levels between black and white points', () => {
    const data = pixels(0, 128, 255, 255);
    levels(data, 64, 192, 1);
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(128);
    expect(data[2]).toBe(255);
  });

  it('thresholds to black or white', () => {
    const data = pixels(10, 10, 10, 255, 240, 240, 240, 255);
    threshold(data, 128);
    expect(Array.from(data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it('posterizes into discrete levels', () => {
    const data = pixels(0, 64, 128, 255);
    posterize(data, 2);
    expect(Array.from(data)).toEqual([0, 0, 255, 255]);
  });

  it('applies a sepia tone', () => {
    const data = pixels(255, 255, 255, 255);
    sepia(data);
    // White maps to a warm, slightly darker tint: green clipped high, blue pulled down.
    expect(data[0]).toBe(255);
    expect(data[1]).toBeGreaterThan(200);
    expect(data[2]).toBeLessThan(data[1]);
    expect(data[3]).toBe(255);
  });

  it('keeps colors when hue/saturation are zero', () => {
    const data = pixels(40, 90, 140, 255);
    hueSaturation(data, 0, 0, 0);
    expect(Array.from(data)).toEqual([40, 90, 140, 255]);
  });
});
