import * as THREE from 'three';
import type { DiyProfile, DiyScrewGhost, ScrewSize } from '../types/furniture';
import { PROFILE_DIMS } from '../types/furniture';

const M = 0.001;

const tmpHit = new THREE.Vector3();
const _probe = new THREE.Vector3();

/**
 * Raycast a drag ray against every profile's axis-aligned OBB and return the
 * nearest face hit as a screw ghost — origin on the face plane, +Z oriented
 * INTO the profile (shaft direction).
 *
 * Returns null when the ray misses all profiles.
 */
export function raycastScrewTarget(
  ray: THREE.Ray,
  profiles: DiyProfile[],
  size: ScrewSize,
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

    best = {
      position: {
        x: Math.round(tmpHit.x * 1000),
        y: Math.round(tmpHit.y * 1000),
        z: Math.round(tmpHit.z * 1000),
      },
      rotation: {
        roll: THREE.MathUtils.radToDeg(e.x),
        pitch: THREE.MathUtils.radToDeg(e.y),
        yaw: THREE.MathUtils.radToDeg(e.z),
      },
      size,
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
