/** Adjustments applied in place to RGBA buffers. Pure and unit tested. */

import { hsvToRgb, rgbToHsv } from './color';

const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

export function brightnessContrast(data: Uint8ClampedArray, brightness: number, contrast: number): void {
  const b = (brightness / 100) * 255;
  const c = (contrast / 100) * 255;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = clamp255(factor * (data[i] + b - 128) + 128);
    data[i + 1] = clamp255(factor * (data[i + 1] + b - 128) + 128);
    data[i + 2] = clamp255(factor * (data[i + 2] + b - 128) + 128);
  }
}

export function hueSaturation(
  data: Uint8ClampedArray,
  hueShift: number,
  saturation: number,
  lightness: number,
): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const hsv = rgbToHsv({ r: data[i], g: data[i + 1], b: data[i + 2] });
    hsv.h = (hsv.h + hueShift + 360) % 360;
    hsv.s = Math.min(100, Math.max(0, hsv.s * (1 + saturation / 100)));
    hsv.v = Math.min(100, Math.max(0, hsv.v * (1 + lightness / 100)));
    const rgb = hsvToRgb(hsv);
    data[i] = rgb.r;
    data[i + 1] = rgb.g;
    data[i + 2] = rgb.b;
  }
}

export function invert(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
}

export function grayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
  }
}

export function threshold(data: Uint8ClampedArray, level: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const v = y >= level ? 255 : 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
}

export function posterize(data: Uint8ClampedArray, levels: number): void {
  const n = Math.max(2, Math.min(64, Math.round(levels)));
  const step = 255 / (n - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
  }
}

export function levels(
  data: Uint8ClampedArray,
  inBlack: number,
  inWhite: number,
  gamma: number,
): void {
  const black = Math.min(254, Math.max(0, inBlack));
  const white = Math.max(black + 1, Math.min(255, inWhite));
  const g = Math.max(0.01, gamma);
  const lookup = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const normalized = (i - black) / (white - black);
    lookup[i] = clamp255(Math.pow(Math.min(1, Math.max(0, normalized)), 1 / g) * 255);
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lookup[data[i]];
    data[i + 1] = lookup[data[i + 1]];
    data[i + 2] = lookup[data[i + 2]];
  }
}

export function sepia(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = clamp255(0.393 * r + 0.769 * g + 0.189 * b);
    data[i + 1] = clamp255(0.349 * r + 0.686 * g + 0.168 * b);
    data[i + 2] = clamp255(0.272 * r + 0.534 * g + 0.131 * b);
  }
}
