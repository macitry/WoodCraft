// ---------------------------------------------------------------------------
// Measured hardware dimensions, for the panels and the business layer.
//
// A separate module from FastenerStl.tsx on purpose: utils/accessoryKits is pure
// data + geometry helpers (no React, no three), and it is loaded by the verify
// script and the BOM export. Importing the mesh components from there would drag
// three.js into both.
//
// Every number here is READ OFF the baked part rather than declared. A hand-kept
// table of head diameters drifts the moment the bake changes, and the drift is
// invisible: the panel prints 10 mm, the drawn head is 8 mm, nothing errors.
// ---------------------------------------------------------------------------

import type { ScrewSize } from '../types/furniture';
import { findScrew, screwLengths, type BakedScrew, type ScrewFamily } from './fasteners';

/** The catalog default length for (family, size) — re-exported so the panels and
 *  the stores import their table lookups from one place. */
export { defaultScrewLength } from './fasteners';

/**
 * The family a screw falls back to when nothing says otherwise: DIN 7984, the
 * thin head. Two reasons it is not DIN 912 (the more common 圆柱头 in a workshop):
 * the corner-tapped preset taps its profile end face only 15 mm deep, so the bolt
 * has to land at 14 — and 7984's M6 stocks 12 and 14, while 912's M6 jumps 12 → 16
 * with nothing in between, so a 912 preset would bottom out in its own tapped
 * hole. And a thin head is what the old procedural screws were: keeping it means a
 * layout saved before this table existed still draws the same shaft, since
 * `length` moved from "total" to "nominal".
 */
export const DEFAULT_SCREW_FAMILY: SocketFamily = 'din7984';

/**
 * Screw families whose head stands PROUD of the mating plane — every catalog
 * family but countersunk. The default below is one of these: a countersunk head
 * sinks BELOW the surface, so it is a different kind of part rather than a
 * fallback for a cap screw.
 */
export type SocketFamily = Exclude<ScrewFamily, 'countersunk'>;

export interface ScrewDims {
  /** The catalog part these numbers describe. */
  part: BakedScrew;
  /** Head diameter (mm) — the widest circle of the part as baked. */
  headD: number;
  /** How far the head stands PROUD of the mating plane (mm). 0 for a countersunk
   *  head, which is sunk BELOW it — a real difference, not a rounding artefact,
   *  so a panel should print 沉头 rather than 头高 0. */
  headH: number;
}

export function screwDims(family: ScrewFamily, size: ScrewSize, length: number): ScrewDims {
  const part = findScrew(family, size, length);
  return {
    part,
    headD: part.boxMm.max[0] - part.boxMm.min[0],
    headH: Math.max(0, -part.boxMm.min[2]),
  };
}

const mm1 = (v: number) => Number(v.toFixed(1));

/**
 * The head, described for a panel. Countersunk heads are called out by NAME
 * rather than printed as 头高 0mm: a zero there reads as a missing measurement,
 * while what it actually means is that the head ends up below the surface.
 */
export function headText(d: ScrewDims): string {
  if (d.headH <= 0.05) return `头径 ${mm1(d.headD)}mm · 沉头（头部低于安装面）`;
  return `头径 ${mm1(d.headD)}mm · 头高 ${mm1(d.headH)}mm`;
}

/** Shortest / longest nominal length the catalog holds for (family, size). */
export function minScrewLength(family: ScrewFamily, size: ScrewSize): number {
  const lens = screwLengths(family, size);
  return lens.length ? lens[0] : 0;
}
export function maxScrewLength(family: ScrewFamily, size: ScrewSize): number {
  const lens = screwLengths(family, size);
  return lens.length ? lens[lens.length - 1] : 0;
}

/**
 * The nearest nominal length the catalog holds for (family, size).
 *
 * A spec's length has to BE a catalog length, because that number is what the
 * part name, the property panel and the CSV all print. A free-form 17 mm would
 * name a part nobody can buy, and the renderer (which snaps at draw time) would
 * draw an 18 mm one — the exported BOM describing something other than the 3D.
 * Snapping here, at the only door into the spec, keeps the two in agreement.
 *
 * Unknown (family, size) pairs return `length` untouched rather than 0: a caller
 * with no catalog to snap against should keep what it has.
 *
 * A tie goes to the SHORTER nominal: DIN 912's M6 jumps 12 → 16, so a 14 mm spec
 * moved onto it lands mid-gap. Either is "nearest", but the shorter one is the
 * one that cannot bottom out in a hole that fit the longer — the failure mode
 * that leaves the head standing off the bracket.
 */
export function snapScrewLength(family: ScrewFamily, size: ScrewSize, length: number): number {
  const lens = screwLengths(family, size);
  if (!lens.length) return Math.round(length);
  return lens.reduce((best, l) => (Math.abs(l - length) < Math.abs(best - length) ? l : best), lens[0]);
}
