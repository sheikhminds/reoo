/**
 * Selection model. A selection is a single geometric shape (rectangle,
 * ellipse or lasso polygon) stored in document coordinates. Storing the shape
 * (instead of a raster mask) keeps marching ants crisp at every zoom level and
 * makes the project file small. A mask is rasterized on demand for clipping.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SelectionShape =
  | ({ kind: 'rect' } & Rect)
  | ({ kind: 'ellipse' } & Rect)
  | { kind: 'polygon'; points: Point[] };

export function normalizeRect(rect: Rect): Rect {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  return { x, y, width, height };
}

export function selectionBounds(shape: SelectionShape): Rect {
  if (shape.kind === 'polygon') {
    if (shape.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of shape.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  return normalizeRect(shape);
}

export function selectionContains(shape: SelectionShape, x: number, y: number): boolean {
  if (shape.kind === 'rect') {
    const r = normalizeRect(shape);
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  }
  if (shape.kind === 'ellipse') {
    const r = normalizeRect(shape);
    const rx = r.width / 2;
    const ry = r.height / 2;
    if (rx === 0 || ry === 0) return false;
    const dx = (x - (r.x + rx)) / rx;
    const dy = (y - (r.y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return pointInPolygon(shape.points, x, y);
}

/** Ray casting. The polygon is implicitly closed. */
export function pointInPolygon(points: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function selectionIsEmpty(shape: SelectionShape | null): boolean {
  if (!shape) return true;
  const b = selectionBounds(shape);
  if (shape.kind === 'polygon' && shape.points.length < 3) return true;
  return b.width < 1 || b.height < 1;
}

/** Build a Path2D in document coordinates. Browser only. */
export function selectionPath(shape: SelectionShape): Path2D {
  const path = new Path2D();
  if (shape.kind === 'rect') {
    const r = normalizeRect(shape);
    path.rect(r.x, r.y, r.width, r.height);
  } else if (shape.kind === 'ellipse') {
    const r = normalizeRect(shape);
    path.ellipse(
      r.x + r.width / 2,
      r.y + r.height / 2,
      r.width / 2,
      r.height / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else if (shape.points.length > 0) {
    path.moveTo(shape.points[0].x, shape.points[0].y);
    for (let i = 1; i < shape.points.length; i++) {
      path.lineTo(shape.points[i].x, shape.points[i].y);
    }
    path.closePath();
  }
  return path;
}

/**
 * Rasterize a selection into an alpha mask the size of the document.
 * Returns null when there is nothing selected.
 */
export function rasterizeSelection(
  shape: SelectionShape | null,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (!shape || selectionIsEmpty(shape) || width <= 0 || height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fill(selectionPath(shape));
  return canvas;
}
