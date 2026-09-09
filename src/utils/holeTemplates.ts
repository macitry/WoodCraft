// ---------------------------------------------------------------------------
// Common tabletop cutout templates — preset batches of holes you can drop onto
// the current board in the plan editor as "managed" holes.
//
// Layout convention (board frame, mm): origin at board centre, X right, Y front
// (rear edge at y = -d/2). A template hole is authored as FIXED GEOMETRY +
// PER-AXIS EDGE ANCHOR (no x/y): its resolved coordinate is derived from the
// anchor and the current board size, and it is re-resolved whenever the user
// resizes the board (see reflowAnchoredHoles). Holes added by hand carry no
// anchors and keep absolute coordinates.
//
// No React / Node dependencies — pure data + geometry helpers.
// ---------------------------------------------------------------------------

import type { AxisAnchor, TabletopHole } from '../types/furniture';
import { holeWorldBounds, nextHoleId } from './holeGeometry';

/** A template cutout: fixed geometry + X/Y edge anchors (coordinate derived). */
export type HoleSpec =
  | { type: 'circle'; radius: number; anchorX: AxisAnchor; anchorY: AxisAnchor }
  | { type: 'rect'; width: number; height: number; cornerRadius: number; anchorX: AxisAnchor; anchorY: AxisAnchor }
  | { type: 'slot'; length: number; width: number; angle?: number; anchorX: AxisAnchor; anchorY: AxisAnchor };

export interface HoleTemplate {
  id: string;
  name: string;
  /** One-line description shown in the menu (also used for the disabled reason). */
  description: string;
  /** Board must be at least this big for the template to fit (mm). */
  minWidth: number;
  minDepth: number;
  /** The cutouts (geometry + edge anchors) — size-independent. */
  build(): HoleSpec[];
}

/** Board edge an axis can reference. 'front' is the plan's +Y edge (display top). */
export type EdgeRef = 'left' | 'right' | 'front' | 'rear';

function edgeSign(edge: EdgeRef): -1 | 1 {
  return edge === 'left' || edge === 'rear' ? -1 : 1;
}

/** Anchor shorthand: stay put when the board resizes (template centred axes). */
export const absAnchor = (): AxisAnchor => ({ mode: 'abs' });
/** Anchor shorthand: keep the centre `value` mm inboard of the given edge. */
export const mmAnchor = (edge: EdgeRef, value: number): AxisAnchor => ({
  mode: 'mm',
  sign: edgeSign(edge),
  value,
});
/** Anchor shorthand: keep the centre `value` × board dimension inboard of the edge. */
export const pctAnchor = (edge: EdgeRef, value: number): AxisAnchor => ({
  mode: 'pct',
  sign: edgeSign(edge),
  value,
});

// ---------------------------------------------------------------------------
// Anchor math
// ---------------------------------------------------------------------------

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
// pct fractions are small (0..1) — keep 6 decimals so mm resolution stays intact.
function r6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** Resolve one axis anchor to a board-frame coordinate.
 *  `prev` is the current coordinate, used only for `abs` (stays where placed).
 *  An offset is measured INBOARD FROM an edge across the whole board dimension —
 *  e.g. 270 mm from the rear edge of a 500-deep board lands at y = +20 (past the
 *  centre). It is clamped to [0, full] so the centre can never leave the slab. */
export function axisCoordFromAnchor(a: AxisAnchor, prev: number, half: number, full: number): number {
  if (a.mode === 'abs') return prev;
  const off = a.mode === 'mm' ? a.value : a.value * full;
  const clamped = Math.min(Math.max(off, 0), full);
  return a.sign * (half - clamped);
}

/** Derive an edge anchor from a coordinate for the given axis extent.
 *  The nearest edge is whichever half the coordinate sits in; a centre coord
 *  (~0) becomes `abs` (both edges are equally far → symmetric ⇒ stays put). */
export function anchorFromCoord(c: number, half: number, full: number, want: 'mm' | 'pct'): AxisAnchor {
  if (Math.abs(c) <= 0.5) return { mode: 'abs' };
  const sign: -1 | 1 = c >= 0 ? 1 : -1;
  const off = Math.max(half - Math.abs(c), 0);
  return want === 'mm'
    ? { mode: 'mm', sign, value: r2(off) }
    : { mode: 'pct', sign, value: r6(off / full) };
}

/** Re-derive an axis anchor after that axis' coordinate was moved (drag / numeric
 *  / arrow keys). `abs` stays `abs` — moving a "绝对不动" axis just parks it at a
 *  new fixed spot. mm/pct keep their mode and re-pick the nearest edge, falling
 *  to `abs` if the hole was dragged onto the centre. */
export function reanchorFromCoord(
  prev: AxisAnchor | undefined,
  c: number,
  half: number,
  full: number,
): AxisAnchor | undefined {
  if (!prev || prev.mode === 'abs') return prev;
  return anchorFromCoord(c, half, full, prev.mode);
}

/** Re-resolve every anchored hole to a new board size (silent — never a history
 *  step). Returns the SAME array when nothing moved so callers can skip a write. */
export function reflowAnchoredHoles(holes: TabletopHole[], width: number, depth: number): TabletopHole[] {
  const halfW = width / 2;
  const halfD = depth / 2;
  let changed = false;
  const next = holes.map((h) => {
    if (!h.anchorX && !h.anchorY) return h;
    const x = h.anchorX ? axisCoordFromAnchor(h.anchorX, h.x, halfW, width) : h.x;
    const y = h.anchorY ? axisCoordFromAnchor(h.anchorY, h.y, halfD, depth) : h.y;
    if (x === h.x && y === h.y) return h;
    changed = true;
    return { ...h, x, y };
  });
  return changed ? next : holes;
}

// ---------------------------------------------------------------------------
// The built-in templates
// ---------------------------------------------------------------------------

export const HOLE_TEMPLATES: HoleTemplate[] = [
  // 1) 走线 / 理线 — rear trough + two corner cable grommets.
  {
    id: 'rear-cable',
    name: '后沿理线 · 经典',
    description: '桌后集中走线：中央 360×28 走线槽 + 两角 Ø60 电源/数据线孔',
    minWidth: 1000,
    minDepth: 500,
    build: () => [
      // Central rear trough: slot centre 69 mm inboard of the rear edge.
      { type: 'slot', length: 360, width: 28, angle: 0, anchorX: absAnchor(), anchorY: mmAnchor('rear', 69) },
      // Two Ø60 round grommets near the rear corners (85 mm in from side edge).
      { type: 'circle', radius: 30, anchorX: mmAnchor('left', 85), anchorY: mmAnchor('rear', 95) },
      { type: 'circle', radius: 30, anchorX: mmAnchor('right', 85), anchorY: mmAnchor('rear', 95) },
    ],
  },
  // 2) 安装 / 电源 — centre rear grommet/monitor-arm hole + front power box.
  {
    id: 'grommet-desk',
    name: '显示器穿孔 · 电源线盒',
    description: '中央 Ø85 穿线/夹持孔 + 前中部 108×60 圆角电源线盒开口',
    minWidth: 800,
    minDepth: 500,
    build: () => [
      // Ø85 rear-centre: monitor-arm grommet mount / main cable pass-through.
      { type: 'circle', radius: 42.5, anchorX: absAnchor(), anchorY: mmAnchor('rear', 85) },
      // Front-centre rounded power/data grommet opening, 110 mm inboard of front.
      { type: 'rect', width: 108, height: 60, cornerRadius: 8, anchorX: absAnchor(), anchorY: mmAnchor('front', 110) },
    ],
  },
  // 3) 通风 / 功能 — mirrored rear slot clusters.
  {
    id: 'rear-vents',
    name: '对称散热腰孔',
    description: '后部左右对称各 3 条竖向散热腰孔（90°）',
    minWidth: 900,
    minDepth: 500,
    build: () => {
      const rows = [150, 270, 390];
      const out: HoleSpec[] = [];
      for (const edge of ['left', 'right'] as const) {
        for (const oy of rows) {
          out.push({ type: 'slot', length: 90, width: 14, angle: 90, anchorX: mmAnchor(edge, 160), anchorY: mmAnchor('rear', oy) });
        }
      }
      return out;
    },
  },
];

/** Why this template can't be applied at the given board size, or null if it fits. */
export function templateFitReason(tpl: HoleTemplate, width: number, depth: number): string | null {
  if (width >= tpl.minWidth && depth >= tpl.minDepth) return null;
  return `板面需 ≥${tpl.minWidth}×${tpl.minDepth}mm（当前 ${width}×${depth}）`;
}

/**
 * Every cutout must sit entirely inside the board inset by `inset` mm from each
 * edge (rotation-safe via world bounds). This is the last-resort guard used
 * before an insert; per-hole sizes are fixed so small boards are normally
 * stopped earlier by `templateFitReason`.
 */
export function holesFitBoard(holes: TabletopHole[], width: number, depth: number, inset = 35): boolean {
  const halfW = width / 2 - inset;
  const halfD = depth / 2 - inset;
  for (const h of holes) {
    const b = holeWorldBounds(h);
    if (b.minX < -halfW || b.maxX > halfW || b.minY < -halfD || b.maxY > halfD) return false;
  }
  return true;
}

/** Materialise a template into anchored holes with fresh ids and coordinates
 *  resolved for the current board size. Call only at insert time. */
export function resolveTemplateHoles(tpl: HoleTemplate, width: number, depth: number): TabletopHole[] {
  const halfW = width / 2;
  const halfD = depth / 2;
  return tpl.build().map((spec) => {
    const id = nextHoleId();
    const x = axisCoordFromAnchor(spec.anchorX, 0, halfW, width);
    const y = axisCoordFromAnchor(spec.anchorY, 0, halfD, depth);
    const anchored = { anchorX: spec.anchorX, anchorY: spec.anchorY };
    if (spec.type === 'circle') {
      return { id, type: 'circle', x, y, radius: spec.radius, ...anchored };
    }
    if (spec.type === 'rect') {
      return { id, type: 'rect', x, y, width: spec.width, height: spec.height, cornerRadius: spec.cornerRadius, ...anchored };
    }
    return {
      id, type: 'slot', x, y, length: spec.length, width: spec.width,
      ...(spec.angle !== undefined ? { angle: spec.angle } : {}),
      ...anchored,
    };
  });
}
