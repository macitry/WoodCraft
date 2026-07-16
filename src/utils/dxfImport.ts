/**
 * DXF import utility for WoodCraft tabletop shapes.
 *
 * Parses a DXF file and extracts:
 *   - A single outer contour (the tabletop outline)
 *   - Inner contours / circles (holes)
 *
 * All coordinates are returned in millimeters (same as DXF units).
 */

import DxfParser, { type DxfEntity } from 'dxf-parser';

export interface ContourPoint {
  x: number;
  y: number;
}

export interface DxfTabletopShape {
  /** Outer boundary of the tabletop (counterclockwise). */
  outline: ContourPoint[];
  /** Hole contours (clockwise, closed). Each hole is a separate array. */
  holes: ContourPoint[][];
  /** Bounding box in mm. */
  bounds: {
    minX: number; minY: number;
    maxX: number; maxY: number;
    width: number; depth: number;
  };
}

/**
 * Parse a DXF file buffer and extract the tabletop shape.
 *
 * Strategy:
 *   1. Collect all LWPOLYLINE / POLYLINE entities → closed or open contours.
 *   2. Collect all CIRCLE entities → convert to polygonal holes.
 *   3. The largest-area closed contour is the outer outline.
 *   4. All other closed contours (smaller polylines + circles) are holes.
 */
export function parseTabletopDxf(buffer: ArrayBuffer): DxfTabletopShape {
  const text = new TextDecoder().decode(buffer);
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);

  const contours: { points: ContourPoint[]; area: number }[] = [];
  const rawCircles: { cx: number; cy: number; r: number }[] = [];

  for (const entity of dxf.entities) {
    const pts = extractPolylinePoints(entity);
    if (pts && pts.length >= 3 && isClosed(entity)) {
      contours.push({ points: pts, area: polygonArea(pts) });
    } else if (entity.type === 'CIRCLE') {
      rawCircles.push({
        cx: (entity as Record<string, number>).cx ?? 0,
        cy: (entity as Record<string, number>).cy ?? 0,
        r: (entity as Record<string, number>).r ?? 0,
      });
    }
  }

  if (contours.length === 0) {
    throw new Error('No closed contours found in DXF. The tabletop needs at least one closed polyline.');
  }

  // Largest contour = outer outline
  contours.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const outline = ensureCounterClockwise(contours[0].points);

  // Remaining closed contours + circles → holes
  const holes: ContourPoint[][] = [];
  for (let i = 1; i < contours.length; i++) {
    holes.push(ensureClockwise(contours[i].points));
  }
  for (const c of rawCircles) {
    holes.push(circleToPolygon(c.cx, c.cy, c.r, 48));
  }

  // Compute bounding box from outline
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const bounds = {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };

  return {
    outline,
    holes,
    bounds: {
      ...bounds,
      width: bounds.maxX - bounds.minX,
      depth: bounds.maxY - bounds.minY,
    },
  };
}

// ---- helpers ----

function extractPolylinePoints(entity: DxfEntity): ContourPoint[] | null {
  const e = entity as Record<string, unknown>;
  if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
    const verts = (e.vertices as Array<{ x: number; y: number }>) ?? [];
    if (verts.length > 0) return verts.map((v) => ({ x: v.x, y: v.y }));
  }
  return null;
}

function isClosed(entity: DxfEntity): boolean {
  const e = entity as Record<string, unknown>;
  if (entity.type === 'LWPOLYLINE') return (e.closed ?? e.shape ?? false) === true;
  if (entity.type === 'POLYLINE') return (e.closed ?? false) === true;
  return false;
}

/** Signed area (positive = CCW, negative = CW). */
function polygonArea(pts: ContourPoint[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

function ensureCounterClockwise(pts: ContourPoint[]): ContourPoint[] {
  return polygonArea(pts) < 0 ? pts.slice().reverse() : pts;
}

function ensureClockwise(pts: ContourPoint[]): ContourPoint[] {
  return polygonArea(pts) > 0 ? pts.slice().reverse() : pts;
}

function circleToPolygon(cx: number, cy: number, r: number, segments: number): ContourPoint[] {
  const pts: ContourPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}
