import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';

const M = 0.001;

/** Profile size → the extrusion mesh served from `public/profiles/`.
 *
 *  Note the three files share nothing but this table: the meshes are modelled at
 *  different origins and even extrude along opposite ends of Z (3030/4040 run
 *  −Z, 2020 runs +Z, and none of them is centred). `ProfileStl`'s bounding-box
 *  re-centring below is the only thing that makes them interchangeable — which
 *  is why it is done here rather than baked into the STLs. */
export const PROFILE_STL_URLS: Record<string, string> = {
  '2020': '/profiles/profile_2020.stl',
  '3030': '/profiles/profile_3030.stl',
  '4040': '/profiles/profile_4040.stl',
};

/** Z-up → Y-up. A module constant because it never varies with the props —
 *  the original built it fresh on every render, which is per-frame garbage in
 *  a scene that re-renders on every pointermove of a drag. */
const Z_UP_TO_Y_UP = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'),
);

export interface ProfileStlProps {
  profileSize: string;
  /** Extrusion length in mm. */
  length: number;
  direction: string;
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
}

/**
 * STL model of the actual aluminium extrusion profile.
 *
 * Renders a bare `<mesh>` centred on the parent's origin along ALL THREE axes —
 * including the extrusion axis, so the bar spans ±length/2 rather than 0…length.
 * A caller that needs the bar to start at a particular face must position it
 * itself (see `KitEditorScene`'s profile group).
 *
 * ⚠ The transform below is what face picking *would* read: `getFaceInfo` in
 * `DiyProfileRenderer` recovers face names and millimetre hit points by rotating
 * the raycaster's `face.normal` through the hit object's own `matrixWorld`, so
 * perturbing this rotation/scale composition moves every reported face with it.
 *
 * It presently reads something else. `ProfileMesh` wraps this in a highlight box
 * padded 0.25 mm per side that fully encloses the model, and a ray from outside
 * always stops on that box first — so `e.object` is the box, never this mesh.
 * Measured, not assumed: `probe_diy_face_pick.cjs` double-clicks a known face
 * and the hit lands at 15.250 mm on the padded plane rather than 15.0 mm on the
 * profile. Treat this as latent rather than live, and re-run that probe after
 * touching either the transform or the box's padding.
 */
export const ProfileStl: React.FC<ProfileStlProps> = ({
  profileSize,
  length,
  direction,
  color = '#a0a0a0',
  opacity = 1,
  metalness = 0.7,
  roughness = 0.35,
}) => {
  const url = PROFILE_STL_URLS[profileSize] || PROFILE_STL_URLS['3030'];
  const geom = useLoader(STLLoader, url);
  // The cross-section needs no rescaling: the mesh is modelled in millimetres,
  // so a uniform `M` on x and y already yields the profile's real size. The
  // original also computed `dim = PROFILE_DIMS[profileSize] ?? 30` here without
  // ever reading it — dropped rather than carried along.
  const lenM = M * Math.max(10, length);

  const cloned = useMemo(() => {
    const g = geom.clone();
    // Center vertices
    const pos = g.getAttribute('position');
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz);
    }
    pos.needsUpdate = true;
    return g;
  }, [geom]);

  // Scale: mm→m, and stretch Z axis to match user length (ref=1000mm)
  const scaleZ = lenM / (1000 * M);
  const scale: [number, number, number] = [M, M, M * scaleZ];

  // Coordinate conversion Z-up → Y-up, then to direction
  const dirQ = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          direction === 'Z' ? Math.PI / 2 : 0,
          0,
          direction === 'X' ? -Math.PI / 2 : 0,
          'YXZ',
        ),
      ),
    [direction],
  );
  const finalE = useMemo(
    () => new THREE.Euler().setFromQuaternion(dirQ.clone().multiply(Z_UP_TO_Y_UP), 'YXZ'),
    [dirQ],
  );

  return (
    <mesh geometry={cloned} rotation={[finalE.x, finalE.y, finalE.z]} scale={scale}>
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
};
