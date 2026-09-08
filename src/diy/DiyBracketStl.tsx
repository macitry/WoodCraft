import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import type * as THREE from 'three';

const M = 0.001;
export const BRACKET_STL = '/Cast_Corner_Bracket.stl';

/**
 * Normalise a (loaded, un-scaled) STL geometry into scene metres so that its
 * largest axis extent maps to `sizeMm` (the cube edge of the bracket mount).
 *
 * `centering` selects which axes get centred on 0:
 *   - scene mounting (z only): keep the raw x/y spine at the origin so the two
 *     mounting faces stay flush on the x=0 / y=0 planes; centre the plate-depth
 *     axis z so the bracket is balanced on the face.
 *   - preview/modal ({x,y,z}): centre everything for an upright, balanced look.
 *
 * Returns a cloned, transformed geometry (never mutates the loader cache).
 */
export function useConnectorGeometry(
  geom: THREE.BufferGeometry,
  sizeMm: number,
  center: { x: boolean; y: boolean; z: boolean },
): THREE.BufferGeometry {
  const s = M * sizeMm;
  return useMemo(() => {
    const g = geom.clone();
    const pos = g.getAttribute('position');

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const refScale = ext > 0 ? s / ext : 1;

    const cx = center.x ? (minX + maxX) / 2 : 0;
    const cy = center.y ? (minY + maxY) / 2 : 0;
    const cz = center.z ? (minZ + maxZ) / 2 : 0;

    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        (pos.getX(i) - cx) * refScale,
        (pos.getY(i) - cy) * refScale,
        (pos.getZ(i) - cz) * refScale,
      );
    }
    pos.needsUpdate = true;
    return g;
  }, [geom, s, center.x, center.y, center.z]);
}

/**
 * Generic connector mesh: loads the connector's own STL (`url`) and renders it
 * mounted to the DIY convention (spine kept at origin, z centred, ext -> size).
 */
export const ConnectorStl: React.FC<{
  url: string;
  size: number;
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
}> = ({ url, size, color = '#707070', opacity = 1, metalness = 0.9, roughness = 0.25 }) => {
  const geom = useLoader(STLLoader, url);
  const geometry = useConnectorGeometry(geom, size, { x: false, y: false, z: true });

  return (
    <mesh geometry={geometry}>
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

/**
 * The built-in corner-bracket STL, mounted on its spine and scaled to `size` mm.
 *
 * The STL's two mounting faces are the flat -X and -Y surfaces at x=0 / y=0
 * (the spine). Keeping the raw x/y origin centres that spine at the group's
 * local origin, so placing the group at a joint corner with the mounting
 * rotation maps the plates flush onto the two extrusion faces.
 */
export const CornerBracketStl: React.FC<{
  size: number;
  color?: string;
  opacity?: number;
  metalness?: number;
}> = ({ size, color = '#707070', opacity = 1, metalness = 0.9 }) => (
  <ConnectorStl
    url={BRACKET_STL}
    size={size}
    color={color}
    opacity={opacity}
    metalness={metalness}
  />
);

export default CornerBracketStl;
