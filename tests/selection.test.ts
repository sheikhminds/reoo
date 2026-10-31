import { describe, expect, it } from 'vitest';
import {
  normalizeRect,
  pointInPolygon,
  selectionBounds,
  selectionContains,
  selectionIsEmpty,
  type SelectionShape,
} from '../src/core/selection';

describe('selection geometry', () => {
  it('normalizes negative rectangles', () => {
    expect(normalizeRect({ x: 10, y: 10, width: -4, height: -6 })).toEqual({
      x: 6,
      y: 4,
      width: 4,
      height: 6,
    });
  });

  it('computes bounds for rectangles, ellipses and polygons', () => {
    expect(selectionBounds({ kind: 'rect', x: 2, y: 3, width: 4, height: 5 })).toEqual({
      x: 2,
      y: 3,
      width: 4,
      height: 5,
    });
    expect(
      selectionBounds({
        kind: 'polygon',
        points: [
          { x: 5, y: 1 },
          { x: 2, y: 8 },
          { x: 9, y: 4 },
        ],
      }),
    ).toEqual({ x: 2, y: 1, width: 7, height: 7 });
  });

  it('tests rectangle containment', () => {
    const shape: SelectionShape = { kind: 'rect', x: 10, y: 10, width: 20, height: 20 };
    expect(selectionContains(shape, 15, 15)).toBe(true);
    expect(selectionContains(shape, 30, 30)).toBe(true);
    expect(selectionContains(shape, 5, 15)).toBe(false);
  });

  it('tests ellipse containment', () => {
    const shape: SelectionShape = { kind: 'ellipse', x: 0, y: 0, width: 20, height: 10 };
    expect(selectionContains(shape, 10, 5)).toBe(true);
    expect(selectionContains(shape, 1, 1)).toBe(false);
    expect(selectionContains(shape, 19, 9)).toBe(false);
  });

  it('tests polygon containment with ray casting', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon(points, 5, 5)).toBe(true);
    expect(pointInPolygon(points, 15, 5)).toBe(false);
    expect(pointInPolygon(points, -1, 5)).toBe(false);
  });

  it('detects empty selections', () => {
    expect(selectionIsEmpty(null)).toBe(true);
    expect(selectionIsEmpty({ kind: 'rect', x: 0, y: 0, width: 0, height: 10 })).toBe(true);
    expect(selectionIsEmpty({ kind: 'polygon', points: [{ x: 0, y: 0 }] })).toBe(true);
    expect(selectionIsEmpty({ kind: 'rect', x: 0, y: 0, width: 2, height: 2 })).toBe(false);
  });
});
