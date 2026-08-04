import { useMemo } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';

const M = 0.001;

/**
 * Semi-transparent wireframe cube shown at the nearest corner snap point
 * while the user drags a bracket from the sidebar over the 3D viewport.
 *
 * Renders nothing when no drag is active or no valid snap target.
 */
const DiyBracketPlacementGhost: React.FC = () => {
  const ghostBracket = useDiyStore((s) => s.ghostBracket);
  const isDraggingBracket = useDiyStore((s) => s.isDraggingBracket);

  const geometry = useMemo(() => {
    if (!ghostBracket) return null;
    const s = M * ghostBracket.size;
    return new THREE.BoxGeometry(s, s, s);
  }, [ghostBracket]);

  if (!isDraggingBracket || !ghostBracket || !geometry) return null;

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
