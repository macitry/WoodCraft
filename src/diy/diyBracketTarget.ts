import * as THREE from 'three';
import type { DiyBracket, DiyProfile } from '../types/furniture';
import { computeCornerHints, bracketAtHint } from './diyCornerGeometry';
import type { CornerHint } from './diyCornerGeometry';

const M = 0.001;

/** How near the pointer has to be to a joint, in screen pixels. */
const CORNER_PICK_PX = 30;

/** The canvas box a pointer position is measured against, in client pixels. */
export interface ViewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// `computeCornerHints` is O(profiles²) and the pointer calls it on every move,
// while the profiles array is a stable reference that only changes when the
// assembly does. Cache on that identity rather than on a timer.
let cachedProfiles: DiyProfile[] | null = null;
let cachedHints: CornerHint[] = [];

/** Every joint in the assembly, whether or not something is bolted to it. */
export function allCornerHints(profiles: DiyProfile[]): CornerHint[] {
  if (profiles !== cachedProfiles) {
    cachedProfiles = profiles;
    cachedHints = computeCornerHints(profiles);
  }
  return cachedHints;
}

/** Every joint in the assembly that has no bracket on it. */
export function freeCornerHints(profiles: DiyProfile[], brackets: DiyBracket[]): CornerHint[] {
  const hits = allCornerHints(profiles);
  const placed = brackets.filter((b) => b.enabled);
  if (placed.length === 0) return cachedHints;
  // `bracketAtHint` is the same "occupied" test the store's placement guard
  // uses, so a corner can never be offered as free and then refused as taken.
  return hits.filter((h) => !bracketAtHint(placed, h));
}

/**
 * Which joint the pointer is over, by projecting the joints and comparing in
 * screen space — the pointer is a 2D instrument and the joints are what the user
 * can actually see, so this asks the question the user is asking.
 *
 * The previous version of this file cast the ray at a plane through the average
 * profile height and then looked for a profile ENDPOINT within 15 mm of the hit.
 * Measured on the assembly `probe_diy_place.cjs` uses — a 3030 post with a 3030
 * rail butting into its side — that plane sits at y = 157.5 mm while every
 * endpoint is at y ∈ {0, 30, 600}, so the nearest one is 127 mm away and the
 * lookup could not succeed ANYWHERE in the viewport. The ghost it was supposed
 * to drive never appeared, and the drag-era placement path that depended on it
 * was dead for every real assembly, not just this one.
 *
 * Returns null when no joint is within reach — the pointer is over a bare
 * stretch of profile, not a joint, and there is nothing there to place.
 */
export function cornerHintUnderPointer(
  hints: CornerHint[],
  camera: THREE.Camera,
  rect: ViewRect,
  clientX: number,
  clientY: number,
): CornerHint | null {
  let best: CornerHint | null = null;
  let bestDist = CORNER_PICK_PX;
  const v = new THREE.Vector3();
  for (const h of hints) {
    v.set(h.position.x * M, h.position.y * M, h.position.z * M).project(camera);
    // z > 1 is at or behind the camera; projecting it would fold the point onto
    // the far side of the screen, where it would compete with real joints.
    if (v.z > 1) continue;
    const px = rect.left + (v.x * 0.5 + 0.5) * rect.width;
    const py = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
    const d = Math.hypot(px - clientX, py - clientY);
    if (d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}
