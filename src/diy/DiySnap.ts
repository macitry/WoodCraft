import * as THREE from 'three';
import type { DiyProfile } from '../types/furniture';
import { PROFILE_DIMS } from '../types/furniture';

const M = 0.001;
const SNAP_THRESHOLD = 0.015; // meters (~15mm)

export interface SnapResult {
  type: 'face' | 'edge' | 'midpoint' | 'endpoint';
  point: THREE.Vector3;
  profileId: string;
  distance: number;
}

/**
 * Find the nearest snap target for a 3D point among all profiles (excluding `excludeId`).
 * Optionally filter by snap types (e.g. only ['endpoint'] for corner snapping).
 * Returns null if no snap target within threshold.
 */
export function findNearestSnap(
  point: THREE.Vector3,
  profiles: DiyProfile[],
  excludeId: string | null,
  types?: SnapResult['type'][],
): SnapResult | null {
  let best: SnapResult | null = null;
  let bestDist = SNAP_THRESHOLD;
  const typeSet = types ? new Set(types) : null;

  for (const p of profiles) {
    if (p.id === excludeId) continue;
    const snaps = getSnapPoints(p);
    for (const s of snaps) {
      if (typeSet && !typeSet.has(s.type)) continue;
      const dist = point.distanceTo(s.point);
      if (dist < bestDist) {
        bestDist = dist;
        best = { ...s, distance: dist, profileId: p.id };
      }
    }
  }

  return best;
}

/**
 * Get all snap points for a profile: 6 face centers, 12 edge midpoints, 8 endpoints.
 */
function getSnapPoints(profile: DiyProfile): { type: SnapResult['type']; point: THREE.Vector3 }[] {
  const dim = PROFILE_DIMS[profile.profileSize];
  const w = profile.direction === 'X' ? profile.length : dim;
  const h = profile.direction === 'Y' ? profile.length : dim;
  const d = profile.direction === 'Z' ? profile.length : dim;
  const wx = profile.direction === 'X' ? profile.length * M : dim * M;
  const wy = profile.direction === 'Y' ? profile.length * M : dim * M;
  const wz = profile.direction === 'Z' ? profile.length * M : dim * M;

  const cx = profile.position.x * M;
  const cy = profile.position.y * M;
  const cz = profile.position.z * M;
  const hw = wx / 2, hh = wy / 2, hd = wz / 2;

  const points: { type: SnapResult['type']; point: THREE.Vector3 }[] = [];

  // 6 face centers
  points.push({ type: 'face', point: new THREE.Vector3(cx + hw, cy, cz) });
  points.push({ type: 'face', point: new THREE.Vector3(cx - hw, cy, cz) });
  points.push({ type: 'face', point: new THREE.Vector3(cx, cy + hh, cz) });
  points.push({ type: 'face', point: new THREE.Vector3(cx, cy - hh, cz) });
  points.push({ type: 'face', point: new THREE.Vector3(cx, cy, cz + hd) });
  points.push({ type: 'face', point: new THREE.Vector3(cx, cy, cz - hd) });

  // 12 edge midpoints
  for (const signX of [-1, 1]) {
    for (const signY of [-1, 1]) {
      points.push({ type: 'midpoint', point: new THREE.Vector3(cx + signX * hw, cy + signY * hh, cz) });
    }
    for (const signZ of [-1, 1]) {
      points.push({ type: 'midpoint', point: new THREE.Vector3(cx + signX * hw, cy, cz + signZ * hd) });
    }
  }
  for (const signY of [-1, 1]) {
    for (const signZ of [-1, 1]) {
      points.push({ type: 'midpoint', point: new THREE.Vector3(cx, cy + signY * hh, cz + signZ * hd) });
    }
  }

  // 8 endpoints (corners)
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        points.push({ type: 'endpoint', point: new THREE.Vector3(cx + sx * hw, cy + sy * hh, cz + sz * hd) });
      }
    }
  }

  return points;
}

/**
 * Convert a snap result to a small visual sphere position.
 */
export function snapToVisual(snap: SnapResult): { position: [number, number, number]; color: string } {
  const colors: Record<string, string> = {
    face: '#44aaff',
    edge: '#44ff44',
    midpoint: '#ffaa44',
    endpoint: '#ff44ff',
  };
  return {
    position: [snap.point.x, snap.point.y, snap.point.z],
    color: colors[snap.type] || '#ffffff',
  };
}
