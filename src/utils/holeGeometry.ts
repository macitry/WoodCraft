// ---------------------------------------------------------------------------
// Shared hole geometry (pure TS / three, no React).
//
// Single source of truth for building / sampling the OUTLINE of every cutout
// shape (circle, rounded-rect, stadium "slot"). Consumers:
//   - 3D cutout:  buildHolePath(hole)  → THREE.Path pushed into shape.holes
//   - DXF export: sampleHolePerimeterCCW(hole)
//   - Plan SVG render + world bounds: sampleHolePerimeterCCW / holeWorldBounds
//
// Winding convention
//   The board outer Shape is CCW; THREE.ExtrudeGeometry removes holes that are
//   wound OPPOSITE the outer contour, so every hole Path below is CW (same as
//   the previous absarc(..., true) circle). Rotation about the hole centre
//   preserves winding, and since all arcs are circular we can rotate an arc by
//   rotating its centre and adding θ to its angles.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { TabletopHole } from '../types/furniture';

// ---------------------------------------------------------------------------
// Segment model — local mm, hole centred at (0,0), angle 0, CW traversal.
// A 'line' target is an absolute point; an 'arc' is a circular arc starting at
// the previous vertex (its a0 always equals the polar angle of the join).
// ---------------------------------------------------------------------------

export type HoleSeg =
  | { k: 'line'; x: number; y: number }
  | { k: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; cw: boolean };

interface LocalContour {
  /** Point to seed the traversal (== end of the last segment). */
  seed: { x: number; y: number };
  segs: HoleSeg[];
}

const TAU = Math.PI * 2;

/**
 * Signed angular travel of an arc, in the arc's direction.
 *
 * Segments are authored with geometric (possibly wrapped) endpoints, so we pick
 * the representative of `a1 - a0` that matches the travel direction:
 *   cw   → a signed value in (-2π, 0]
 *   !cw  → a signed value in [0, 2π)
 * A full-circle arc is authored as a difference of ±2π and is detected before
 * the wrap so it keeps a full turn instead of collapsing to 0.
 */
function signedSpan(a0: number, a1: number, cw: boolean): number {
  const d = a1 - a0;
  // Full circle (|d| == 2π). Keep the full turn, signed by direction.
  if (d > TAU - 1e-6) return cw ? -TAU : TAU;
  if (d < -TAU + 1e-6) return cw ? -TAU : TAU;
  if (cw) {
    let v = d;
    while (v > 0) v -= TAU;
    while (v <= -TAU) v += TAU;
    return v;
  }
  let v = d;
  while (v < 0) v += TAU;
  while (v >= TAU) v -= TAU;
  return v;
}

function clampRectCr(width: number, height: number, cornerRadius: number): number {
  return Math.max(0, Math.min(cornerRadius, Math.min(width, height) / 2));
}

/** CW local contour (mm) for a hole centred at origin, angle 0. */
export function localContourCW(hole: TabletopHole): LocalContour {
  if (hole.type === 'circle') {
    const r = hole.radius;
    return {
      seed: { x: r, y: 0 },
      segs: [{ k: 'arc', cx: 0, cy: 0, r, a0: 0, a1: TAU, cw: true }],
    };
  }
  if (hole.type === 'slot') {
    const r = Math.max(0, Math.min(hole.width, hole.length) / 2);
    const a = Math.max(0, hole.length / 2 - r);
    return {
      seed: { x: -a, y: r },
      segs: [
        { k: 'line', x: a, y: r },
        { k: 'arc', cx: a, cy: 0, r, a0: Math.PI / 2, a1: -Math.PI / 2, cw: true },
        { k: 'line', x: -a, y: -r },
        { k: 'arc', cx: -a, cy: 0, r, a0: -Math.PI / 2, a1: Math.PI / 2, cw: true },
      ],
    };
  }
  // rect (rounded / sharp)
  const hw = hole.width / 2;
  const hy = hole.height / 2;
  const cr = clampRectCr(hole.width, hole.height, hole.cornerRadius);
  if (cr <= 1e-6) {
    return {
      seed: { x: -hw, y: hy },
      segs: [
        { k: 'line', x: hw, y: hy },
        { k: 'line', x: hw, y: -hy },
        { k: 'line', x: -hw, y: -hy },
      ],
    };
  }
  const seed = { x: -hw + cr, y: hy };
  return {
    seed,
    segs: [
      { k: 'line', x: hw - cr, y: hy },
      { k: 'arc', cx: hw - cr, cy: hy - cr, r: cr, a0: Math.PI / 2, a1: 0, cw: true },
      { k: 'line', x: hw, y: -hy + cr },
      { k: 'arc', cx: hw - cr, cy: -hy + cr, r: cr, a0: 0, a1: -Math.PI / 2, cw: true },
      { k: 'line', x: -hw + cr, y: -hy },
      { k: 'arc', cx: -hw + cr, cy: -hy + cr, r: cr, a0: -Math.PI / 2, a1: -Math.PI, cw: true },
      { k: 'line', x: -hw, y: hy - cr },
      { k: 'arc', cx: -hw + cr, cy: hy - cr, r: cr, a0: -Math.PI, a1: Math.PI / 2, cw: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3D Path (METERS). Rotation applied to arc centres + angles; winding stays CW.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** THREE.Path (metres, CW) for the hole, ready to push into a CCW outer shape. */
export function buildHolePath(hole: TabletopHole): THREE.Path {
  const θ = (hole.angle ?? 0) * DEG;
  const cx = hole.x;
  const cy = hole.y;
  const R = (x: number, y: number): THREE.Vector2 => {
    const rx = x * Math.cos(θ) - y * Math.sin(θ);
    const ry = x * Math.sin(θ) + y * Math.cos(θ);
    return new THREE.Vector2((rx + cx) / 1000, (ry + cy) / 1000);
  };

  const { seed, segs } = localContourCW(hole);
  const p = new THREE.Path();
  const s0 = R(seed.x, seed.y);
  p.moveTo(s0.x, s0.y);
  for (const seg of segs) {
    if (seg.k === 'line') {
      const q = R(seg.x, seg.y);
      p.lineTo(q.x, q.y);
    } else {
      const c = R(seg.cx, seg.cy);
      p.absarc(c.x, c.y, seg.r / 1000, seg.a0 + θ, seg.a1 + θ, seg.cw);
    }
  }
  p.closePath();
  return p;
}

// ---------------------------------------------------------------------------
// World-space sampling (mm). CW walk then reversed → CCW polygon.
// ---------------------------------------------------------------------------

export interface SampleOptions {
  /** Maximum chord error in mm (default 0.1). */
  chordError?: number;
  /** Hard cap on points per arc (default 128). */
  maxPerArc?: number;
}

function sampleArcPoints(
  seg: Extract<HoleSeg, { k: 'arc' }>,
  opts: Required<SampleOptions>,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const signed = signedSpan(seg.a0, seg.a1, seg.cw);
  const r = seg.r;
  if (Math.abs(signed) < 1e-9 || r <= 0) {
    return out;
  }
  const err = opts.chordError;
  const stepAngle = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - err / r)));
  const n = Math.max(2, Math.min(opts.maxPerArc, Math.ceil(Math.abs(signed) / Math.max(stepAngle, 1e-6))));
  for (let i = 1; i <= n; i++) {
    const ang = seg.a0 + (i / n) * signed;
    out.push({ x: seg.cx + r * Math.cos(ang), y: seg.cy + r * Math.sin(ang) });
  }
  return out;
}

/** Hole outline as a CCW polygon in board-frame mm (world, already rotated+translated). */
export function sampleHolePerimeterCCW(
  hole: TabletopHole,
  opts?: SampleOptions,
): { x: number; y: number }[] {
  const o: Required<SampleOptions> = { chordError: 0.1, maxPerArc: 128, ...opts };
  const θ = (hole.angle ?? 0) * DEG;
  const cosT = Math.cos(θ);
  const sinT = Math.sin(θ);
  const toWorld = (lx: number, ly: number) => {
    const rx = lx * cosT - ly * sinT;
    const ry = lx * sinT + ly * cosT;
    return { x: rx + hole.x, y: ry + hole.y };
  };

  const { seed, segs } = localContourCW(hole);
  const cw: { x: number; y: number }[] = [toWorld(seed.x, seed.y)];
  for (const seg of segs) {
    if (seg.k === 'line') {
      cw.push(toWorld(seg.x, seg.y));
    } else {
      for (const p of sampleArcPoints(seg, o)) cw.push(toWorld(p.x, p.y));
    }
  }
  // CW → CCW by reversal (closed polygon; order flip = winding flip).
  cw.reverse();
  return cw;
}

/** Axis-aligned world bounds (mm) of the hole — rotation safe. */
export function holeWorldBounds(hole: TabletopHole): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const pts = sampleHolePerimeterCCW(hole, { maxPerArc: 96 });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Feature points of a hole in world mm, for measure/alignment snapping:
 * the centre plus the outline points tangent to the four axes (left/right/
 * back/front, i.e. minX/maxX/minY/maxY). Rotation-safe because it walks the
 * sampled outline. Straight sides are only represented by their endpoints in
 * the sample, so an axis-aligned flat face contributes its corners.
 */
export function holeFeaturePoints(hole: TabletopHole): { x: number; y: number }[] {
  // Denser than the render/DXF sample (chordError 0.1) so the axis-extreme that
  // snapping magnetises to tracks the true tangent of an arc within ~0.2 mm,
  // not the nearest coarse vertex. Only used for anchor search (memoised), so
  // the extra points are not a per-frame cost.
  const pts = sampleHolePerimeterCCW(hole, { chordError: 0.0005, maxPerArc: 4096 });
  const out: { x: number; y: number }[] = [{ x: hole.x, y: hole.y }];
  if (pts.length === 0) return out;
  const arg = (key: 'x' | 'y', dir: 1 | -1): number => {
    let best = 0;
    let bv = pts[0][key] * dir;
    for (let i = 1; i < pts.length; i++) {
      const v = pts[i][key] * dir;
      if (v > bv) {
        bv = v;
        best = i;
      }
    }
    return best;
  };
  for (const [key, dir] of [
    ['x', -1],
    ['x', 1],
    ['y', -1],
    ['y', 1],
  ] as const) {
    out.push(pts[arg(key, dir)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Identity / defaults
// ---------------------------------------------------------------------------

let _holeIdCounter = 0;

/** Unique, collision-free-within-session hole id (same scheme as TabletopPlan). */
export function nextHoleId(): string {
  _holeIdCounter += 1;
  return `hole_${_holeIdCounter}`;
}

/** Default geometry used when a shape tool is selected (mm). */
export const DEFAULT_HOLE_SIZES = {
  circle: { radius: 30 },
  rect: { width: 80, height: 60, cornerRadius: 10 },
  slot: { length: 80, width: 20 },
} as const;

export type HoleShapeType = TabletopHole['type'];

/** Build a default-size hole of the given type centred at board-frame (x,y). */
export function makeDefaultHole(type: HoleShapeType, x: number, y: number): TabletopHole {
  if (type === 'circle') return { id: nextHoleId(), type, x, y, radius: DEFAULT_HOLE_SIZES.circle.radius };
  if (type === 'rect') return { id: nextHoleId(), type, x, y, ...DEFAULT_HOLE_SIZES.rect };
  return { id: nextHoleId(), type, x, y, ...DEFAULT_HOLE_SIZES.slot };
}
