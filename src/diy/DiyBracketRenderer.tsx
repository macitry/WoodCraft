import { useMemo, Suspense, useEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';

const M = 0.001;
const BRACKET_STL = '/Cast_Corner_Bracket.stl';

/** Wireframe cube showing exact bracket boundary */
const BracketWireframe: React.FC<{ size: number; isSelected: boolean }> = ({ size, isSelected }) => {
  const s = M * size;
  return (
    <mesh renderOrder={1}>
      <boxGeometry args={[s, s, s]} />
      <meshBasicMaterial
        color={isSelected ? '#88ccff' : '#4488aa'}
        wireframe
        transparent
        opacity={isSelected ? 0.6 : 0.3}
        depthTest
      />
    </mesh>
  );
};

/** Real cast corner bracket STL, scaled to match size. */
const BracketStl: React.FC<{ size: number }> = ({ size }) => {
  const geom = useLoader(STLLoader, BRACKET_STL);
  const s = M * size;

  const cloned = useMemo(() => {
    const g = geom.clone();
    // Center the mesh
    const pos = g.getAttribute('position');
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const refScale = ext > 0 ? s / ext : 1;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (pos.getX(i) - cx) * refScale, (pos.getY(i) - cy) * refScale, (pos.getZ(i) - cz) * refScale);
    }
    pos.needsUpdate = true;
    return g;
  }, [geom, s]);

  return (
    <mesh geometry={cloned}>
      <meshStandardMaterial color="#707070" metalness={0.9} roughness={0.25} />
    </mesh>
  );
};

const DiyBracketRenderer: React.FC = () => {
  const brackets = useDiyStore((s) => s.brackets);
  const selectedBracketId = useDiyStore((s) => s.selectedBracketId);
  const selectBracket = useDiyStore((s) => s.selectBracket);
  const bracketFace1 = useDiyStore((s) => s.bracketFace1);

  // Log when selected bracket changes
  useEffect(() => {
    if (!selectedBracketId) return;
    const b = brackets.find((x) => x.id === selectedBracketId);
    if (b) {
      console.log('[Bracket Selected]', b.id.slice(-6),
        'pos:', b.position, 'rot:', b.rotation,
        'anchor:', b.anchorPosition, b.anchorRotation,
        'faces:', b.connectedProfiles.map((p) => p.slice(-6)));
    }
  }, [selectedBracketId, brackets]);

  return (
    <group>
      {brackets
        .filter((b) => b.enabled)
        .map((b) => {
          const isSel = b.id === selectedBracketId;
          return (
            <group
              key={b.id}
              position={[M * b.position.x, M * b.position.y, M * b.position.z]}
              rotation={[
                THREE.MathUtils.degToRad(b.rotation.roll),
                THREE.MathUtils.degToRad(b.rotation.pitch),
                THREE.MathUtils.degToRad(b.rotation.yaw),
              ]}
              onClick={(e) => { e.stopPropagation(); selectBracket(isSel ? null : b.id); }}
            >
              {/* Anchor offset: local transform inside world transform */}
              <group
                position={[M * b.anchorPosition.x, M * b.anchorPosition.y, M * b.anchorPosition.z]}
                rotation={[
                  THREE.MathUtils.degToRad(b.anchorRotation.roll),
                  THREE.MathUtils.degToRad(b.anchorRotation.pitch),
                  THREE.MathUtils.degToRad(b.anchorRotation.yaw),
                ]}
              >
                <BracketWireframe size={b.size} isSelected={isSel} />
                <Suspense fallback={null}>
                  <BracketStl size={b.size} />
                </Suspense>
              </group>
            </group>
          );
        })}

    </group>
  );
};

export default DiyBracketRenderer;
