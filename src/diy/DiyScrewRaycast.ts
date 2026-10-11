import * as THREE from 'three';
import type { DiyProfile, DiyScrewGhost, ScrewSize } from '../types/furniture';
import type { ScrewFamily } from './fasteners';
import { PROFILE_DIMS } from '../types/furniture';

const M = 0.001;

const tmpHit = new THREE.Vector3();
const _probe = new THREE.Vector3();

/**
 * Raycast a drag ray against every profile's axis-aligned OBB and return the
 * nearest face hit as a screw ghost — origin on the face plane and on the bar's
 * centreline, +Z oriented INTO the profile (shaft direction).
 *
 * Returns null when the ray misses all profiles.
 *
 * `family` (which standard) is a parameter rather than something the caller
 * stamps on afterwards because it is part of the ghost's identity, not a
 * rendering choice: one size spans up to four standards, so a ghost carrying a
 * size alone would be free to disagree with the card that produced it — exactly
 * what the library's family-grouped cards must not do.
 */
export function raycastScrewTarget(
  ray: THREE.Ray,
  profiles: DiyProfile[],
  size: ScrewSize,
  family: ScrewFamily,
): DiyScrewGhost | null {
  let best: DiyScrewGhost | null = null;
  let bestDist = Infinity;

  for (const p of profiles) {
    const dim = PROFILE_DIMS[p.profileSize] ?? 30;
    // Half-extents in metres, aligned to the profile axis.
    const l = (M * Math.max(10, p.length)) / 2;
    const d = (M * dim) / 2;
    const hx = p.direction === 'X' ? l : d;
    const hy = p.direction === 'Y' ? l : d;
    const hz = p.direction === 'Z' ? l : d;
    const cx = M * p.position.x;
    const cy = M * p.position.y;
    const cz = M * p.position.z;

    const box = new THREE.Box3(
      new THREE.Vector3(cx - hx, cy - hy, cz - hz),
      new THREE.Vector3(cx + hx, cy + hy, cz + hz),
    );

    tmpHit.set(0, 0, 0);
    if (!ray.intersectBox(box, tmpHit)) continue;
    const dist = tmpHit.distanceToSquared(ray.origin);
    if (dist >= bestDist) continue;

    const outward = faceNormal(box, tmpHit);
    const inward = new THREE.Vector3(-outward.x, -outward.y, -outward.z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      inward,
    );
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');

    // Seat the screw on the profile's CENTRELINE.
    //
    // Of the three coordinates of the hit point, one is the face itself (the
    // outward axis — always ±half the section, that is what makes it a face) and
    // one runs along the bar (the profile's own axis). Those two ARE the screw's
    // position and are kept. The third is the one that lets a screw sit anywhere
    // across the face — 4 mm from one edge on this click and 11 mm from the other
    // on the next — and it is thrown away in favour of the bar's centre.
    //
    // So a screw is a point on the centreline, on one face of one profile: the
    // pointer picks the bar and the face, this function picks the seat, and the
    // only thing left to choose afterwards is how far along the bar it sits —
    // which is exactly the one degree of freedom `useDiyMoveDrag` slides.
    const outwardAxis = outward.x !== 0 ? 0 : outward.y !== 0 ? 1 : 2;
    const profileAxis = p.direction === 'X' ? 0 : p.direction === 'Y' ? 1 : 2;
    const seat = [tmpHit.x, tmpHit.y, tmpHit.z];
    const centre = [cx, cy, cz];
    for (let i = 0; i < 3; i++) {
      if (i === outwardAxis || i === profileAxis) continue;
      seat[i] = centre[i];
    }

    best = {
      position: {
        x: Math.round(seat[0] * 1000),
        y: Math.round(seat[1] * 1000),
        z: Math.round(seat[2] * 1000),
      },
      rotation: {
        roll: THREE.MathUtils.radToDeg(e.x),
        pitch: THREE.MathUtils.radToDeg(e.y),
        yaw: THREE.MathUtils.radToDeg(e.z),
      },
      size,
      family,
      profileId: p.id,
    };
    bestDist = dist;
  }

  return best;
}

/** Outward unit normal of the box face the hit point lies on. */
function faceNormal(box: THREE.Box3, hit: THREE.Vector3): THREE.Vector3 {
  const eps = M; // 1mm tolerance
  _probe.copy(hit);
  if (Math.abs(_probe.x - box.max.x) < eps) return new THREE.Vector3(1, 0, 0);
  if (Math.abs(_probe.x - box.min.x) < eps) return new THREE.Vector3(-1, 0, 0);
  if (Math.abs(_probe.y - box.max.y) < eps) return new THREE.Vector3(0, 1, 0);
  if (Math.abs(_probe.y - box.min.y) < eps) return new THREE.Vector3(0, -1, 0);
  if (Math.abs(_probe.z - box.max.z) < eps) return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 0, -1);
}
