import { useMemo } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { buildScrewGroup } from './DiyScrewGeometry';
import { SCREW_DEFAULT_LENGTH } from '../types/furniture';

const M = 0.001;

/**
 * Translucent green screw shown on the hovered profile face while dragging a
 * screw from the sidebar over the 3D viewport. Renders nothing when no drag
 * is active or no valid face is under the cursor.
 */
const DiyScrewPlacementGhost: React.FC = () => {
  const ghostScrew = useDiyStore((s) => s.ghostScrew);
  const isDraggingScrew = useDiyStore((s) => s.isDraggingScrew);

  const group = useMemo(() => {
    if (!ghostScrew) return null;
    return buildScrewGroup(
      ghostScrew.size,
      SCREW_DEFAULT_LENGTH[ghostScrew.size],
      { color: '#44ff88', opacity: 0.4 },
    );
  }, [ghostScrew]);

  if (!isDraggingScrew || !ghostScrew || !group) return null;

  return (
    <group
      position={[M * ghostScrew.position.x, M * ghostScrew.position.y, M * ghostScrew.position.z]}
      rotation={[
        THREE.MathUtils.degToRad(ghostScrew.rotation.roll),
        THREE.MathUtils.degToRad(ghostScrew.rotation.pitch),
        THREE.MathUtils.degToRad(ghostScrew.rotation.yaw),
      ]}
      renderOrder={999}
    >
      <primitive object={group} scale={M} />
    </group>
  );
};

export default DiyScrewPlacementGhost;
