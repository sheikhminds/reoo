/** Color utilities. All functions are pure and dependency-free. */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number; // 0..255
}

export interface HSV {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Accepts #rgb, #rrggbb, rgb(), rgba() and a small set of names. */
export function parseColor(input: string): RGBA {
  const value = input.trim().toLowerCase();
  const named: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff0000',
    green: '#00ff00',
    blue: '#0000ff',
    transparent: '#00000000',
  };
  if (named[value]) return parseColor(named[value]);

  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length !== 6 && hex.length !== 8) throw new Error(`Invalid color: ${input}`);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    return { r, g, b, a };
  }

  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (match) {
    const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return {
      r: clamp(Math.round(parts[0] ?? 0), 0, 255),
      g: clamp(Math.round(parts[1] ?? 0), 0, 255),
      b: clamp(Math.round(parts[2] ?? 0), 0, 255),
      a: clamp(Math.round((parts[3] ?? 1) * 255), 0, 255),
    };
  }

  throw new Error(`Invalid color: ${input}`);
}

export function toHex(rgb: RGB): string {
  const h = (n: number) =>
    clamp(Math.round(n), 0, 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

export function rgbaString(c: RGBA): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255})`;
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;
  const c = vn * sn;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let rgb: [number, number, number];
  if (hh < 1) rgb = [c, x, 0];
  else if (hh < 2) rgb = [x, c, 0];
  else if (hh < 3) rgb = [0, c, x];
  else if (hh < 4) rgb = [0, x, c];
  else if (hh < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = vn - c;
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

/** Relative luminance (WCAG), used to pick readable text on a swatch. */
export function luminance({ r, g, b }: RGB): number {
  const chan = (c: number) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

export function readableText(rgb: RGB): string {
  return luminance(rgb) > 0.45 ? '#12141a' : '#ffffff';
}

/** Parse `color` and return an rgba() string with the given alpha (0..1). */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return rgbaString({ ...c, a: Math.round(clamp(alpha, 0, 1) * 255) });
}
