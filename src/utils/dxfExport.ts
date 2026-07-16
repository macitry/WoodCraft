/**
 * DXF export utility — generates a DXF R12 file from the current tabletop shape.
 *
 * Supports:
 *   - Default rectangular tabletop (with optional holes from the hole editor)
 *   - DXF-imported custom shape (round-trip export)
 *
 * DXF R12 format: https://www.autodesk.com/techpubs/autocad/acadr14/dxf/
 */

import type { TabletopHole } from '../types/furniture';
import type { DxfTabletopShape, ContourPoint } from './dxfImport';

/**
 * Generate a DXF file (R12/LWPolyline) for a rectangular tabletop with holes.
 */
export function generateTabletopDxf(
  width: number,      // mm
  depth: number,       // mm
  holes: TabletopHole[],
): string {
  const hw = width / 2;
  const hd = depth / 2;

  const outline: ContourPoint[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];

  const holeContours: ContourPoint[][] = holes.map((h) => {
    const pts: ContourPoint[] = [];
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      pts.push({ x: h.x + h.radius * Math.cos(a), y: h.y + h.radius * Math.sin(a) });
    }
    return pts;
  });

  return buildDxf(outline, holeContours);
}

/**
 * Generate a DXF file from a DXF-imported shape (round-trip).
 */
export function dxfShapeToDxf(shape: DxfTabletopShape): string {
  return buildDxf(shape.outline, shape.holes);
}

/**
 * Build a minimal DXF R12 string from outline + hole contours.
 * All coordinates in mm.
 */
function buildDxf(outline: ContourPoint[], holes: ContourPoint[][]): string {
  const lines: string[] = [];

  // ---- HEADER ----
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1009'); // R12
  lines.push('9', '$INSBASE', '10', '0.0', '20', '0.0', '30', '0.0');
  lines.push('9', '$EXTMIN', '10', `${minX(outline)}`, '20', `${minY(outline)}`, '30', '0.0');
  lines.push('9', '$EXTMAX', '10', `${maxX(outline)}`, '20', `${maxY(outline)}`, '30', '0.0');
  lines.push('0', 'ENDSEC');

  // ---- TABLES (minimal) ----
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '1');
  lines.push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // ---- BLOCKS ----
  lines.push('0', 'SECTION', '2', 'BLOCKS');
  lines.push('0', 'ENDSEC');

  // ---- ENTITIES ----
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // Outer outline as LWPOLYLINE
  lines.push('0', 'LWPOLYLINE');
  lines.push('8', '0');
  lines.push('90', `${outline.length}`);
  lines.push('70', '1'); // closed
  lines.push('43', '0.0');
  for (const p of outline) {
    lines.push('10', fmt(p.x), '20', fmt(p.y));
  }

  // Holes as CIRCLE or LWPOLYLINE
  for (const hole of holes) {
    if (hole.length > 8) {
      // Polygonal hole → LWPOLYLINE
      lines.push('0', 'LWPOLYLINE');
      lines.push('8', '0');
      lines.push('90', `${hole.length}`);
      lines.push('70', '1');
      lines.push('43', '0.0');
      for (const p of hole) {
        lines.push('10', fmt(p.x), '20', fmt(p.y));
      }
    } else {
      // Simple circle
      const cx = hole.reduce((s, p) => s + p.x, 0) / hole.length;
      const cy = hole.reduce((s, p) => s + p.y, 0) / hole.length;
      const r = Math.sqrt((hole[0].x - cx) ** 2 + (hole[0].y - cy) ** 2);
      lines.push('0', 'CIRCLE');
      lines.push('8', '0');
      lines.push('10', fmt(cx), '20', fmt(cy), '30', '0.0');
      lines.push('40', fmt(r));
    }
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\r\n');
}

// ---- helpers ----

function minX(pts: ContourPoint[]): number { return Math.min(...pts.map((p) => p.x)); }
function maxX(pts: ContourPoint[]): number { return Math.max(...pts.map((p) => p.x)); }
function minY(pts: ContourPoint[]): number { return Math.min(...pts.map((p) => p.y)); }
function maxY(pts: ContourPoint[]): number { return Math.max(...pts.map((p) => p.y)); }
function fmt(v: number): string { return v.toFixed(4); }
