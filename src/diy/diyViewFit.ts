import * as THREE from 'three';
import { PROFILE_DIMS } from '../types/furniture';
import type { DiyProfile, ViewPreset } from '../types/furniture';

/**
 * Where the camera goes for each of the four standard views.
 *
 * A DIRECTION, not a position: the distance is computed per assembly below. The
 * Configurator's `PRESET_POSITIONS` hard-codes positions five metres out, which
 * is right for one desk and wrong for everything else — the free-form builder
 * opens empty and can end up with a two-metre frame or a single post, and a
 * fixed distance either fills the screen with one rail or leaves the assembly a
 * speck.
 *
 * `top` is tilted a hair off vertical on purpose: a camera looking exactly along
 * its own up vector is the one input `lookAt` cannot resolve, and the result is
 * a view that flickers between two arbitrarily rolled orientations.
 */
const DIR: Record<ViewPreset, [number, number, number]> = {
  front: [0, 0, 1],
  top: [0, 1, 0.02],
  side: [1, 0, 0],
  perspective: [0.6, 0.5, 1],
};

/** Must equal the Canvas camera's fov — a fit computed for a different lens is
 *  not a fit. `DiyViewer` is the one place the camera is declared. */
const FOV_DEG = 50;

/** Padding around the assembly, so its silhouette does not touch the edges: at
 *  1.15 the fit leaves roughly a fifteenth of the frame clear on each side. */
const MARGIN = 1.15;

/** Floor on the distance. A box with no extent in two of three axes (one post,
 *  seen end-on) fits at a distance of nearly zero, which puts the near plane
 *  inside the profile and the camera inside the metal. */
const MIN_FIT = 0.6;

/** Half the section, in metres, that a profile occupies across its own axis. */
const HALF_SECTION = (size: DiyProfile['profileSize']) => PROFILE_DIMS[size] / 2000;

const DEFAULT_POS: [number, number, number] = [3, 2.5, 5];
const DEFAULT_TARGET: [number, number, number] = [0, 0.5, 0];

/**
 * The farthest the box reaches along an axis — the support function of a box,
 * which is what makes one formula fit all four presets.
 *
 * `half` is the box's half-extents and `axis` a unit direction; the sum of the
 * projections is how far a corner sticking out in that direction lies. Taking
 * the box's own extremes per axis instead would assume the camera looks down
 * one of them, which is false for the perspective view.
 */
const support = (half: THREE.Vector3, axis: THREE.Vector3) =>
  Math.abs(half.x * axis.x) + Math.abs(half.y * axis.y) + Math.abs(half.z * axis.z);

/** The assembly's bounding box in metres, or null when there is nothing to frame. */
function assemblyBox(profiles: DiyProfile[]): { center: THREE.Vector3; half: THREE.Vector3 } | null {
  if (profiles.length === 0) return null;

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const p of profiles) {
    const axis = p.direction.toLowerCase();
    for (const ax of ['x', 'y', 'z'] as const) {
      // Along its own axis a profile is as long as its length; across it, only
      // as wide as its section. Getting this backwards would make every post a
      // 2-metre cube.
      const half = axis === ax ? p.length / 2000 : HALF_SECTION(p.profileSize);
      const c = p.position[ax] / 1000;
      min[ax] = Math.min(min[ax], c - half);
      max[ax] = Math.max(max[ax], c + half);
    }
  }

  return {
    center: min.clone().add(max).multiplyScalar(0.5),
    half: max.clone().sub(min).multiplyScalar(0.5),
  };
}

/**
 * Camera position and orbit target for a standard view of the current assembly.
 *
 * The distance is the one that just contains the box in BOTH directions of the
 * frame: a wide short assembly is limited by the horizontal field and a tall one
 * by the vertical, and taking the larger of the two is what stops either from
 * running off the edge. The horizontal one depends on the canvas aspect, which is
 * why it is an argument and not a constant.
 *
 * Falls back to the view the scene opens on when there is nothing to frame — an
 * empty builder asked for 前视 should look like it did a moment ago, not snap to
 * the origin at whatever distance the arithmetic gives for a zero-sized box.
 */
export function fitPreset(
  preset: ViewPreset,
  profiles: DiyProfile[],
  aspect: number,
): { pos: [number, number, number]; target: [number, number, number] } {
  const box = assemblyBox(profiles);
  if (!box) return { pos: [...DEFAULT_POS], target: [...DEFAULT_TARGET] };

  const dir = new THREE.Vector3(...DIR[preset]).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  // Looking straight down (or up) the world up vector there is no "up" left to
  // build the frame from; any perpendicular will do, and this one keeps the
  // plan view reading as a plan.
  const upRef = Math.abs(dir.dot(worldUp)) > 0.99 ? new THREE.Vector3(0, 0, 1) : worldUp;
  const right = new THREE.Vector3().crossVectors(upRef, dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, right).normalize();

  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV_DEG) / 2);
  // Guarded: a pane that is momentarily zero-wide (mid-resize) would otherwise
  // ask for an infinite distance.
  const tanH = tanV * Math.max(aspect, 1e-3);

  // The distance a corner at the FRONT of the box needs, not at its centre:
  // a corner closer to the camera by `depth` subtends more than the same corner
  // would at the target plane, so the whole box's half-depth along the view has
  // to be added to the distance. Without it, looking down the short axis of a
  // tall assembly pushes its near corners off the top and bottom — exactly the
  // plan view of a table, where the camera sits a box-height above the middle
  // and the corners of the top face are half as far away as the target.
  const depth = support(box.half, dir);
  const dist = (depth + Math.max(
    support(box.half, up) / tanV,
    support(box.half, right) / tanH,
  )) * MARGIN;

  // No ceiling is applied: OrbitControls already clamps the radius to its own
  // maxDistance (20 m) on the next update, and a second limit here could only
  // disagree with it.
  const d = Math.max(dist, MIN_FIT);
  return {
    pos: [
      box.center.x + dir.x * d,
      box.center.y + dir.y * d,
      box.center.z + dir.z * d,
    ],
    target: [box.center.x, box.center.y, box.center.z],
  };
}
