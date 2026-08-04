import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';
import type { DiyProfile, FaceDir } from '../types/furniture';

const M = 0.001;

// ---------------------------------------------------------------------------
// Face geometry helpers
// ---------------------------------------------------------------------------

interface FacePlane {
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

function getFacePlane(profile: DiyProfile, face: FaceDir, dim: number): FacePlane {
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

  // Quaternion to rotate default XY plane (normal +Z) to the face
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal,
  );

  return { centre, normal, u, v, halfU, halfV, quaternion };
}

/** Clamp + snap a world-space point to the face plane grid (10 mm). */
function snapToFace(pWorld: THREE.Vector3, fp: FacePlane): THREE.Vector3 {
  const rel = pWorld.clone().sub(fp.centre);
  let u = rel.dot(fp.u);
  let v = rel.dot(fp.v);
  // Clamp to face bounds (with 5mm margin from edge)
  const margin = 0.005;
  u = THREE.MathUtils.clamp(u, -fp.halfU + margin, fp.halfU - margin);
  v = THREE.MathUtils.clamp(v, -fp.halfV + margin, fp.halfV - margin);
  // Snap to 10 mm grid
  u = Math.round(u / 0.01) * 0.01;
  v = Math.round(v / 0.01) * 0.01;
  return fp.centre.clone().addScaledVector(fp.u, u).addScaledVector(fp.v, v);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GHOST_COLOR = '#44ffaa';

const DiyPlacingGhost: React.FC = () => {
  const placingProfile = useDiyStore((s) => s.placingProfile);
  const profiles = useDiyStore((s) => s.profiles);
  const updatePlacingPosition = useDiyStore((s) => s.updatePlacingPosition);
  const confirmPlacingProfile = useDiyStore((s) => s.confirmPlacingProfile);
  const cancelPlacing = useDiyStore((s) => s.cancelPlacing);

  // Derived data (non-hook — safe before early return)
  const parent = placingProfile ? profiles.find((p) => p.id === placingProfile.parentId) : null;
  const dim = placingProfile ? (PROFILE_DIMS[placingProfile.size] ?? 30) : 30;
  const fp = useMemo(
    () => (parent && placingProfile ? getFacePlane(parent, placingProfile.face, dim) : null),
    [parent, placingProfile, dim],
  );

  // ---- hooks (always called in the same order) ----

  // Escape → cancel
  useEffect(() => {
    if (!placingProfile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelPlacing();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placingProfile, cancelPlacing]);

  const handlePointerMove = useCallback(
    (e: any) => {
      if (!fp) return;
      const pWorld = e.point as THREE.Vector3;
      const snapped = snapToFace(pWorld, fp);
      updatePlacingPosition({
        x: Math.round(snapped.x * 1000),
        y: Math.round(snapped.y * 1000),
        z: Math.round(snapped.z * 1000),
      });
    },
    [fp, updatePlacingPosition],
  );

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      confirmPlacingProfile();
    },
    [confirmPlacingProfile],
  );

  // ---- early return after all hooks ----
  if (!placingProfile || !parent || !fp) return null;

  const faceToDir: Record<string, string> = {
    '+X': 'X', '-X': 'X', '+Y': 'Y', '-Y': 'Y', '+Z': 'Z', '-Z': 'Z',
  };
  const childDir = faceToDir[placingProfile.face] ?? 'Y';
  const ghostLen = 0.1; // show 100mm of the new profile
  const ghostDim = dim * M;

  const ghostSize: [number, number, number] =
    childDir === 'X' ? [ghostLen, ghostDim, ghostDim] :
    childDir === 'Y' ? [ghostDim, ghostLen, ghostDim] :
    [ghostDim, ghostDim, ghostLen];

  const ghostPos: [number, number, number] = [
    placingProfile.position.x * M,
    placingProfile.position.y * M,
    placingProfile.position.z * M,
  ];

  const planeW = fp.halfU * 2;
  const planeH = fp.halfV * 2;

  return (
    <group>
      {/* Invisible raycast target — offset 1mm outward from face to catch events first */}
      <mesh
        position={fp.centre.clone().addScaledVector(fp.normal, 0.001)}
        quaternion={fp.quaternion}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        renderOrder={10}
      >
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Ghost profile at the placing position */}
      <group position={ghostPos}>
        <mesh renderOrder={11}>
          <boxGeometry args={ghostSize} />
          <meshBasicMaterial
            color={GHOST_COLOR}
            transparent
            opacity={0.28}
            depthTest
          />
        </mesh>
        <mesh renderOrder={12}>
          <boxGeometry args={ghostSize} />
          <meshBasicMaterial
            color={GHOST_COLOR}
            wireframe
            transparent
            opacity={0.7}
            depthTest
          />
        </mesh>
      </group>
    </group>
  );
};

export default DiyPlacingGhost;
