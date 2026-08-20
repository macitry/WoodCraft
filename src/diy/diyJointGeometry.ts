import { PROFILE_DIMS } from '../types/furniture';
import type { DiyProfile } from '../types/furniture';

/** 3D vector in the assembly frame (mm). */
export interface Vec3 { x: number; y: number; z: number; }

/**
 * A rectangular face of a profile in world coordinates (mm), expressed in a
 * local 2D basis (u, v) so intervals along a line can be computed cheaply.
 */
export interface FaceRect {
  center: Vec3;
  u: Vec3;         // first tangent (unit)
  v: Vec3;         // second tangent (unit)
  halfU: number;
  halfV: number;
}

const AXIS_UNIT: Record<'x' | 'y' | 'z', Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

const dot3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len3 = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm3 = (a: Vec3): Vec3 => {
  const l = len3(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Rebuild the rectangular face of a profile from its outward normal (mm). */
export function faceRect(profile: DiyProfile, normal: Vec3): FaceRect {
  const dim = PROFILE_DIMS[profile.profileSize] ?? 30;
  const L = profile.length, D = dim;
  const c = profile.position;
  const dir = profile.direction.toLowerCase() as 'x' | 'y' | 'z';
  const abs = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  const ax = (['x', 'y', 'z'] as const)[abs.indexOf(Math.max(...abs))];
  const sign = normal[ax] > 0 ? 1 : -1;
  const normalVec: Vec3 = {
    x: ax === 'x' ? sign : 0, y: ax === 'y' ? sign : 0, z: ax === 'z' ? sign : 0,
  };
  const others = (['x', 'y', 'z'] as const).filter((a) => a !== ax);

  if (ax === dir) {
    // End face — tangents are the two cross-section axes.
    return {
      center: {
        x: c.x + normalVec.x * (L / 2),
        y: c.y + normalVec.y * (L / 2),
        z: c.z + normalVec.z * (L / 2),
      },
      u: AXIS_UNIT[others[0]], v: AXIS_UNIT[others[1]],
      halfU: D / 2, halfV: D / 2,
    };
  }
  // Side face — one tangent is the (long) profile axis, the other is the
  // remaining cross-section axis.
  const longAxis = dir;
  const shortAxis = others.find((a) => a !== longAxis) ?? others[0];
  return {
    center: {
      x: c.x + normalVec.x * (D / 2),
      y: c.y + normalVec.y * (D / 2),
      z: c.z + normalVec.z * (D / 2),
    },
    u: AXIS_UNIT[longAxis], v: AXIS_UNIT[shortAxis],
    halfU: L / 2, halfV: D / 2,
  };
}

/**
 * CENTERED joint position for a bracket mounting on two perpendicular faces.
 *
 * The bracket spine sits on the line L where the two face planes meet. L cuts
 * each face rectangle in an interval; the joint is the overlap of those two
 * intervals, and this returns its midpoint — independent of where the mouse
 * was clicked. Returns null when the faces don't actually overlap along L.
 */
export function centeredJointPosition(
  pa: DiyProfile,
  nA: Vec3,
  pb: DiyProfile,
  nB: Vec3,
): Vec3 | null {
  const ra = faceRect(pa, nA);
  const rb = faceRect(pb, nB);
  const n1 = nA, n2 = nB;

  // Base point of L = point closest to origin on both planes (planes are
  // axis-aligned so n1,n2 are exactly orthogonal here). Direction = n1×n2.
  const c1 = dot3(ra.center, n1);
  const c2 = dot3(rb.center, n2);
  const p0 = {
    x: c1 * n1.x + c2 * n2.x,
    y: c1 * n1.y + c2 * n2.y,
    z: c1 * n1.z + c2 * n2.z,
  };
  let d = cross3(n1, n2);
  const dLen = len3(d);
  if (dLen < 1e-6) return null;
  d = norm3(d);

  // Interval of L that lies inside a face rectangle, else null (disjoint).
  const lineInterval = (rect: FaceRect): [number, number] | null => {
    let t0 = -Infinity, t1 = Infinity;
    for (const [tan, half] of [[rect.u, rect.halfU], [rect.v, rect.halfV]] as const) {
      const alpha = dot3(sub3(p0, rect.center), tan);
      const beta = dot3(d, tan);
      if (Math.abs(beta) < 1e-9) {
        if (Math.abs(alpha) > half + 1e-6) return null; // line parallel & outside
      } else {
        const lo = (-half - alpha) / beta;
        const hi = (half - alpha) / beta;
        t0 = Math.max(t0, Math.min(lo, hi));
        t1 = Math.min(t1, Math.max(lo, hi));
      }
    }
    if (t0 > t1) return null;
    return [t0, t1];
  };

  const iA = lineInterval(ra);
  const iB = lineInterval(rb);
  if (!iA || !iB) return null;
  const t0 = Math.max(iA[0], iB[0]);
  const t1 = Math.min(iA[1], iB[1]);
  if (t0 > t1 + 1e-6) return null;

  const tc = (t0 + t1) / 2; // midpoint of the two-face overlap = joint center
  return {
    x: p0.x + d.x * tc,
    y: p0.y + d.y * tc,
    z: p0.z + d.z * tc,
  };
}
