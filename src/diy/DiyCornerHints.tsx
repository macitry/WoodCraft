import { useMemo } from 'react';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';
import type { DiyProfile } from '../types/furniture';

const M = 0.001;
const COPLANAR_MARGIN = 2; // mm — faces within this distance are on the same plane

interface Hint {
  position: { x: number; y: number; z: number }; // mm
  size: number;
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

function sub(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
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
  const dirVec = p.direction === 'X' ? X_DIR : p.direction === 'Y' ? Y_DIR : Z_DIR;
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
 * Find corners where two profiles share a face region.
 * Checks all 6×6 face pairs — when two opposite faces are coplanar
 * and their rectangles overlap, the overlap's 4 corners are bracket positions.
 */
function findMeaningfulCorners(profiles: DiyProfile[]): Hint[] {
  if (profiles.length < 2) return [];

  const hints: Hint[] = [];
  const allFaces = profiles.map((p) => getProfileFaces(p));

  for (let ai = 0; ai < profiles.length; ai++) {
    for (let bi = ai + 1; bi < profiles.length; bi++) {
      // Skip parallel profiles — they don't form corners
      if (profiles[ai].direction === profiles[bi].direction) continue;

      const facesA = allFaces[ai];
      const facesB = allFaces[bi];

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

          // The 4 corners of the overlap rectangle
          const corners = [
            faceToWorld({ u: u0, v: v0 }, fa),
            faceToWorld({ u: u1, v: v0 }, fa),
            faceToWorld({ u: u1, v: v1 }, fa),
            faceToWorld({ u: u0, v: v1 }, fa),
          ];

          const size = Math.max(fa.size, fb.size);
          for (const corner of corners) {
            hints.push({
              position: { x: Math.round(corner.x), y: Math.round(corner.y), z: Math.round(corner.z) },
              size,
            });
          }
        }
      }
    }
  }

  return hints;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DiyCornerHints: React.FC = () => {
  const showCornerHints = useDiyStore((s) => s.showCornerHints);
  const profiles = useDiyStore((s) => s.profiles);

  const hints = useMemo(
    () => (showCornerHints ? findMeaningfulCorners(profiles) : []),
    [showCornerHints, profiles],
  );

  if (hints.length === 0) return null;

  return (
    <group>
      {hints.map((h, i) => {
        const s = h.size * M;
        return (
          <mesh
            key={i}
            position={[h.position.x * M, h.position.y * M, h.position.z * M]}
            renderOrder={5}
          >
            <boxGeometry args={[s, s, s]} />
            <meshBasicMaterial
              color="#ff8844"
              wireframe
              transparent
              opacity={0.6}
              depthTest={false}
            />
          </mesh>
        );
      })}
    </group>
  );
};

export default DiyCornerHints;
