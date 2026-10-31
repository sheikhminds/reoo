import { describe, expect, it } from 'vitest';
import { hsvToRgb, luminance, parseColor, readableText, rgbToHsv, toHex } from '../src/core/color';

describe('color', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#ff8800')).toEqual({ r: 255, g: 136, b: 0, a: 255 });
  });

  it('parses short hex and alpha hex', () => {
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0, a: 255 });
    expect(parseColor('#11223380')).toEqual({ r: 17, g: 34, b: 51, a: 128 });
  });

  it('parses rgb and rgba strings', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 255 });
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 128 });
  });

  it('rejects nonsense', () => {
    expect(() => parseColor('not-a-color')).toThrow();
    expect(() => parseColor('#12345')).toThrow();
  });

  it('round-trips hex', () => {
    const rgb = { r: 12, g: 200, b: 77 };
    expect(parseColor(toHex(rgb))).toEqual({ ...rgb, a: 255 });
  });

  it('converts RGB to HSV and back', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, v: 100 });
    expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, v: 100 });
    expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(hsvToRgb(rgbToHsv({ r: 40, g: 90, b: 140 }))).toEqual({ r: 40, g: 90, b: 140 });
  });

  it('picks readable text colors', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(readableText({ r: 255, g: 255, b: 255 })).toBe('#12141a');
    expect(readableText({ r: 0, g: 0, b: 0 })).toBe('#ffffff');
  });
});
