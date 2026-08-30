// ============================================================
// Corner-hint geometry — pure, UI-free.
//
// Shared by the DIY editor (preview ghost brackets) and the main
// frame editor (auto-placed brackets). No React / zustand imports
// here so a store can call it without dragging in the DIY UI.
// ============================================================

import { PROFILE_DIMS } from '../types/furniture';
import type { DiyProfile } from '../types/furniture';
import * as THREE from 'three';
import { jointFitInfo, cornerBracketFits } from './diyJointGeometry';

const COPLANAR_MARGIN = 2; // mm — faces within this distance are on the same plane

export interface CornerHint {
  position: { x: number; y: number; z: number }; // mm
  size: number;
  profileIdA: string;
  profileIdB: string;
  /** Outward normals (unit) of the two extrusion faces the bracket mounts on. */
  faceA: { x: number; y: number; z: number };
  faceB: { x: number; y: number; z: number };
}

/** A rectangular face of a profile in world coordinates (mm). */
interface ProfileFace {
  center: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };  // unit, points outward
  u: { x: number; y: number; z: number };        // first tangent, unit
  v: { x: number; y: number; z: number };        // second tangent, unit
  halfU: number;
  halfV: number;
  profileId: string;
  size: number;
}

const X_DIR = { x: 1, y: 0, z: 0 };
const Y_DIR = { x: 0, y: 1, z: 0 };
const Z_DIR = { x: 0, y: 0, z: 1 };

function neg(v: { x: number; y: number; z: number }) {
  return { x: -v.x, y: -v.y, z: -v.z };
}

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len(v: { x: number; y: number; z: number }) {
  return Math.hypot(v.x, v.y, v.z);
}

function norm(v: { x: number; y: number; z: number }) {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function sub(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function axisVec(dir: DiyProfile['direction']) {
  return dir === 'X' ? X_DIR : dir === 'Y' ? Y_DIR : Z_DIR;
}

/** Get all 6 faces of a profile in world coordinates (mm). */
function getProfileFaces(p: DiyProfile): ProfileFace[] {
  const D = PROFILE_DIMS[p.profileSize] ?? 30;
  const L = p.length;
  const halfL = L / 2;
  const halfD = D / 2;
  const c = p.position;
  const faces: ProfileFace[] = [];

  // Direction unit vectors based on profile direction
  const dirVec = axisVec(p.direction);
  const otherAxes = (['x', 'y', 'z'] as const).filter((a) =>
    a !== p.direction.toLowerCase()) as ('x' | 'y' | 'z')[];
  const uAxis = otherAxes[0];
  const vAxis = otherAxes[1];
  const uVec = uAxis === 'x' ? X_DIR : uAxis === 'y' ? Y_DIR : Z_DIR;
  const vVec = vAxis === 'x' ? X_DIR : vAxis === 'y' ? Y_DIR : Z_DIR;

  // Two end faces (±direction)
  for (const sgn of [-1, 1]) {
    const normal = sgn > 0 ? dirVec : neg(dirVec);
    const center = {
      x: c.x + normal.x * halfL,
      y: c.y + normal.y * halfL,
      z: c.z + normal.z * halfL,
    };
    faces.push({ center, normal, u: uVec, v: vVec, halfU: halfD, halfV: halfD, profileId: p.id, size: D });
  }

  // Four side faces (±uAxis, ±vAxis)
  for (const sideAxis of [uAxis, vAxis]) {
    const sideVec = sideAxis === 'x' ? X_DIR : sideAxis === 'y' ? Y_DIR : Z_DIR;
    for (const sgn of [-1, 1]) {
      const normal = sgn > 0 ? sideVec : neg(sideVec);
      const center = {
        x: c.x + normal.x * halfD,
        y: c.y + normal.y * halfD,
        z: c.z + normal.z * halfD,
      };
      // Tangents: one is the direction axis (full length), the other is the remaining axis
      const tangentLong = dirVec;
      const tangentShort = sideAxis === uAxis ? vVec : uVec;
      faces.push({
        center, normal,
        u: tangentLong, v: tangentShort,
        halfU: halfL, halfV: halfD,
        profileId: p.id, size: D,
      });
    }
  }

  return faces;
}

/**
 * Project a 3D point onto the face's 2D coordinate system.
 * Returns (u, v) coordinates in mm relative to the face center.
 */
function projectToFace(
  point: { x: number; y: number; z: number },
  face: ProfileFace,
): { u: number; v: number } {
  const rel = sub(point, face.center);
  return { u: dot(rel, face.u), v: dot(rel, face.v) };
}

/** Convert face 2D coordinates back to a 3D point. */
function faceToWorld(uv: { u: number; v: number }, face: ProfileFace) {
  return {
    x: face.center.x + uv.u * face.u.x + uv.v * face.v.x,
    y: face.center.y + uv.u * face.u.y + uv.v * face.v.y,
    z: face.center.z + uv.u * face.u.z + uv.v * face.v.z,
  };
}

/**
 * Find corners where two profiles share a face region, together with the two
 * extrusion-face normals a corner bracket would mount on there.
 *
 * Checks all 6×6 face pairs — when two opposite faces are coplanar and their
 * rectangles overlap, the bracket mounts centered on that joint (the two
 * mounting faces are perpendicular), with `cornerBracketFits` filtering joints
 * whose mounting faces are too narrow — e.g. a joint at a profile end where a
 * plate would visibly stick out past the profile.
 */
export function computeCornerHints(profiles: DiyProfile[]): CornerHint[] {
  if (profiles.length < 2) return [];

  const hints: CornerHint[] = [];
  const allFaces = profiles.map((p) => getProfileFaces(p));

  for (let ai = 0; ai < profiles.length; ai++) {
    for (let bi = ai + 1; bi < profiles.length; bi++) {
      // Skip parallel profiles — they don't form corners
      if (profiles[ai].direction === profiles[bi].direction) continue;

      const facesA = allFaces[ai];
      const facesB = allFaces[bi];
      const dA = axisVec(profiles[ai].direction);
      const dB = axisVec(profiles[bi].direction);

      for (const fa of facesA) {
        for (const fb of facesB) {
          // Faces must be on the same plane and face opposite directions
          if (dot(fa.normal, fb.normal) > -0.99) continue;
          const dist = Math.abs(dot(sub(fa.center, fb.center), fa.normal));
          if (dist > COPLANAR_MARGIN) continue;

          // Faces are coplanar and opposite — compute intersection rectangle
          // Project fb's corners onto fa's 2D system
          const fbCorners = [
            projectToFace(faceToWorld({ u: -fb.halfU, v: -fb.halfV }, fb), fa),
            projectToFace(faceToWorld({ u: fb.halfU, v: -fb.halfV }, fb), fa),
            projectToFace(faceToWorld({ u: fb.halfU, v: fb.halfV }, fb), fa),
            projectToFace(faceToWorld({ u: -fb.halfU, v: fb.halfV }, fb), fa),
          ];

          const fbUMin = Math.min(...fbCorners.map((c) => c.u));
          const fbUMax = Math.max(...fbCorners.map((c) => c.u));
          const fbVMin = Math.min(...fbCorners.map((c) => c.v));
          const fbVMax = Math.max(...fbCorners.map((c) => c.v));

          // fa's own bounds in its coordinate system
          const faUMin = -fa.halfU, faUMax = fa.halfU;
          const faVMin = -fa.halfV, faVMax = fa.halfV;

          // Intersection
          const u0 = Math.max(faUMin, fbUMin);
          const u1 = Math.min(faUMax, fbUMax);
          const v0 = Math.max(faVMin, fbVMin);
          const v1 = Math.min(faVMax, fbVMax);

          if (u0 >= u1 || v0 >= v1) continue; // no overlap

          // CENTERED placements — the same rule as the manual two-face
          // double-click: a bracket mounting on two perpendicular faces sits
          // at the midpoint of their overlap along the corner line, NOT at the
          // rectangle corners. This keeps the preview exactly on top of what
          // the user places by hand.
          const size = Math.max(fa.size, fb.size);
          const contactNormal = fa.normal;
          const sideProfile = Math.abs(dot(dA, contactNormal)) < 0.01
            ? 0
            : Math.abs(dot(dB, contactNormal)) < 0.01
              ? 1
              : -1;

          if (sideProfile >= 0) {
            // Butt/corner joint: one contact face is a SIDE face (the one the
            // other profile's end butts against). Mount on that side face ×
            // the other profile's two perpendicular side faces (± its axis).
            const Ps = sideProfile === 0 ? profiles[ai] : profiles[bi];
            const Pe = sideProfile === 0 ? profiles[bi] : profiles[ai];
            const n0 = sideProfile === 0 ? fa.normal : fb.normal;
            const u = axisVec(Ps.direction);
            for (const sgn of [-1, 1]) {
              const nB = { x: sgn * u.x, y: sgn * u.y, z: sgn * u.z };
              const fit = jointFitInfo(Ps, n0, Pe, nB);
              // Skip a joint whose mounting faces are too narrow for the bracket —
              // the preview would visibly stick out past the profile.
              if (!fit || !cornerBracketFits(fit, size)) continue;
              const pos = fit.position;
              hints.push({
                position: { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) },
                size,
                profileIdA: profiles[ai].id,
                profileIdB: profiles[bi].id,
                faceA: n0,
                faceB: nB,
              });
            }
          } else {
            // Crossing joint (both contact faces are side faces): the two
            // diagonal side-face pairs, each centered on its corner line.
            const nP = norm(cross(contactNormal, dA));
            const nQ = norm(cross(contactNormal, dB));
            for (const sgn of [-1, 1]) {
              const nA = { x: sgn * nP.x, y: sgn * nP.y, z: sgn * nP.z };
              const nB = { x: sgn * nQ.x, y: sgn * nQ.y, z: sgn * nQ.z };
              const fit = jointFitInfo(profiles[ai], nA, profiles[bi], nB);
              if (!fit || !cornerBracketFits(fit, size)) continue;
              const pos = fit.position;
              hints.push({
                position: { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) },
                size,
                profileIdA: profiles[ai].id,
                profileIdB: profiles[bi].id,
                faceA: nA,
                faceB: nB,
              });
            }
          }
        }
      }
    }
  }

  return hints;
}

/**
 * Nearest corner hint to a position (mm), within `maxDist`, else null.
 *
 * Threshold must cover the whole joint footprint: hints sit at the centered
 * overlap positions (top/bottom of the contact region), while a click/drop can
 * be up to the square edge (30 mm) away.
 */
export function findCornerAt(
  profiles: DiyProfile[],
  position: { x: number; y: number; z: number },
  maxDist = 40,
): CornerHint | null {
  let best: CornerHint | null = null;
  let bestDist = maxDist;
  for (const h of computeCornerHints(profiles)) {
    const d = Math.hypot(
      h.position.x - position.x,
      h.position.y - position.y,
      h.position.z - position.z,
    );
    if (d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
}

/**
 * Euler (radians, XYZ) that maps the bracket's plate axes onto the two
 * mounting normals: R·(1,0,0)=faceA, R·(0,1,0)=faceB — the same rotation the
 * backend computes for a placed bracket, so the preview matches the drop.
 */
export function eulerFromNormals(
  faceA: { x: number; y: number; z: number },
  faceB: { x: number; y: number; z: number },
) {
  const x = new THREE.Vector3(faceA.x, faceA.y, faceA.z);
  const y = new THREE.Vector3(faceB.x, faceB.y, faceB.z);
  const z = new THREE.Vector3().crossVectors(x, y);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
}
