import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';

const M = 0.001;
const BRACKET_STL = '/Cast_Corner_Bracket.stl';

/**
 * The corner-bracket STL, centered on its spine and scaled to `size` mm.
 *
 * The STL's two mounting faces are the flat -X and -Y surfaces at x=0 / y=0
 * (the spine). Centering on the raw origin keeps that spine at the group's
 * local origin, so placing the group at a joint corner with the mounting
 * rotation maps the plates flush onto the two extrusion faces.
 */
export const CornerBracketStl: React.FC<{
  size: number;
  color?: string;
  opacity?: number;
  metalness?: number;
}> = ({ size, color = '#707070', opacity = 1, metalness = 0.9 }) => {
  const geom = useLoader(STLLoader, BRACKET_STL);
  const s = M * size;

  const cloned = useMemo(() => {
    const g = geom.clone();
    const pos = g.getAttribute('position');

    // BBox over the raw mesh so we can center on the spine (raw origin).
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const refScale = ext > 0 ? s / ext : 1;

    // Center the spine (raw origin) on the mesh origin; keep z centered so the
    // bracket is vertically balanced on the face. This is the alignment that
    // makes the mounting faces sit flush on the joint corner.
    const cx = 0, cy = 0, cz = (minZ + maxZ) / 2;
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
  }, [geom, s]);

  return (
    <mesh geometry={cloned}>
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={0.25}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
};

export default CornerBracketStl;
