import * as THREE from 'three';
import type { DiyProfile, FaceDir } from '../types/furniture';

/**
 * The plane of one face of a profile, and the two tangents that span it.
 *
 * Extracted from `DiyPlacingGhost` when child placement stopped being a
 * Shift+click and became a hover. Two components need the same geometry now:
 * the renderer, which turns the pointer's hit point into the child's position,
 * and the ghost, which draws the child where that position is. They have to
 * agree to the millimetre, so they share one implementation rather than one
 * calling the other's convention.
 */

const M = 0.001;

export interface FacePlane {
  centre: THREE.Vector3;      // world metres
  normal: THREE.Vector3;       // unit, world
  u: THREE.Vector3;            // first tangent, unit
  v: THREE.Vector3;            // second tangent, unit
  halfU: number;               // half-extent along u (metres)
  halfV: number;               // half-extent along v (metres)
  quaternion: THREE.Quaternion; // rotation to orient XY plane → face
}

const AXES = {
  X: { idx: 0, vec: new THREE.Vector3(1, 0, 0) },
  Y: { idx: 1, vec: new THREE.Vector3(0, 1, 0) },
  Z: { idx: 2, vec: new THREE.Vector3(0, 0, 1) },
} as const;

export function getFacePlane(profile: DiyProfile, face: FaceDir, dim: number): FacePlane {
  const L = profile.length * M; // length in metres
  const D = dim * M;            // cross-section in metres
  const dir = profile.direction as 'X' | 'Y' | 'Z';
  const sgn = face.startsWith('+') ? 1 : -1;
  const faceAxis = face[1] as 'X' | 'Y' | 'Z';

  // Normal = face direction
  const normal = AXES[faceAxis].vec.clone().multiplyScalar(sgn);

  // Centre of the profile in metres
  const cx = profile.position.x * M;
  const cy = profile.position.y * M;
  const cz = profile.position.z * M;

  // Face centre
  const centre = new THREE.Vector3(cx, cy, cz);
  if (faceAxis === dir) {
    // End face: centre shifts by ±L/2 along the profile axis
    centre.addScaledVector(normal, L / 2);
  } else {
    // Side face: centre shifts by ±D/2 along the face normal
    centre.addScaledVector(normal, D / 2);
  }

  // Tangents — the two axes NOT parallel to the face normal
  const allAxes = ['X', 'Y', 'Z'] as const;
  const otherAxes = allAxes.filter((a) => a !== faceAxis);

  const uAxis = otherAxes[0];
  const vAxis = otherAxes[1];
  const u = AXES[uAxis].vec.clone();
  const v = AXES[vAxis].vec.clone();

  // Extents along each tangent
  const uIsDir = uAxis === dir;
  const vIsDir = vAxis === dir;
  const halfU = uIsDir ? L / 2 : D / 2;
  const halfV = vIsDir ? L / 2 : D / 2;

  // Orient the plane so its width (local X) runs along fp.u and its height
  // (local Y) along fp.v. setFromUnitVectors only fixes the normal — on a side
  // face the plane's long axis would then land on a short axis of the profile,
  // covering just a narrow strip of the face, so the ghost gets stuck as soon
  // as the pointer leaves that strip.
  const basis = new THREE.Matrix4().makeBasis(u, v, normal);
  // (u, v, normal) can be left-handed on a minus face — flip v so the basis is
  // a proper rotation and the extracted quaternion is valid.
  if (basis.determinant() < 0) basis.makeBasis(u, v.clone().negate(), normal);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);

  return { centre, normal, u, v, halfU, halfV, quaternion };
}

export type FreeAxis = 'u' | 'v' | 'both';

/** Clamp + snap a world-space point to the face plane (10 mm grid).
 *  `freeAxis` controls which tangent(s) are free to move; the other is locked to 0. */
export function snapToFace(pWorld: THREE.Vector3, fp: FacePlane, freeAxis: FreeAxis): THREE.Vector3 {
  const rel = pWorld.clone().sub(fp.centre);
  let u = rel.dot(fp.u);
  let v = rel.dot(fp.v);
  const margin = 0.005;

  if (freeAxis === 'u') {
    u = THREE.MathUtils.clamp(u, -fp.halfU + margin, fp.halfU - margin);
    u = Math.round(u / 0.01) * 0.01;
    v = 0;
  } else if (freeAxis === 'v') {
    u = 0;
    v = THREE.MathUtils.clamp(v, -fp.halfV + margin, fp.halfV - margin);
    v = Math.round(v / 0.01) * 0.01;
  } else {
    u = THREE.MathUtils.clamp(u, -fp.halfU + margin, fp.halfU - margin);
    v = THREE.MathUtils.clamp(v, -fp.halfV + margin, fp.halfV - margin);
    u = Math.round(u / 0.01) * 0.01;
    v = Math.round(v / 0.01) * 0.01;
  }
  return fp.centre.clone().addScaledVector(fp.u, u).addScaledVector(fp.v, v);
}

/** Determine which tangent axis on the face is parallel to the parent profile direction. */
export function getFreeAxis(fp: FacePlane, parentDir: 'X' | 'Y' | 'Z'): FreeAxis {
  const pv = AXES[parentDir].vec;
  const uDot = Math.abs(fp.u.dot(pv));
  const vDot = Math.abs(fp.v.dot(pv));
  const THRESH = 0.99;
  if (uDot > THRESH) return 'u';
  if (vDot > THRESH) return 'v';
  return 'both'; // end face — neither tangent aligns with parent direction
}
