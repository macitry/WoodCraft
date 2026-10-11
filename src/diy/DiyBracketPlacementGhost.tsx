import { useMemo } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';

const M = 0.001;

/**
 * Semi-transparent wireframe cube shown at the nearest snap target while a
 * connector or a kit is in hand.
 *
 * Renders nothing when nothing is held, or when the pointer is not over a valid
 * snap target.
 */
const DiyBracketPlacementGhost: React.FC = () => {
  const ghostBracket = useDiyStore((s) => s.ghostBracket);
  const hand = useDiyStore((s) => s.hand);
  const holdingBracket = hand?.kind === 'connector' || hand?.kind === 'kit';

  const geometry = useMemo(() => {
    if (!ghostBracket) return null;
    const s = M * ghostBracket.size;
    return new THREE.BoxGeometry(s, s, s);
  }, [ghostBracket]);

  if (!holdingBracket || !ghostBracket || !geometry) return null;

  const pos: [number, number, number] = [
    M * ghostBracket.position.x,
    M * ghostBracket.position.y,
    M * ghostBracket.position.z,
  ];

  return (
    <group position={pos} renderOrder={999}>
      {/* Filled semi-transparent cube */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#44ff88"
          transparent
          opacity={0.25}
          depthTest
        />
      </mesh>
      {/* Wireframe outline */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#44ff88"
          wireframe
          transparent
          opacity={0.7}
          depthTest
        />
      </mesh>
    </group>
  );
};

export default DiyBracketPlacementGhost;
