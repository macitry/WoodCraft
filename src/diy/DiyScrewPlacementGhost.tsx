import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { ScrewMesh } from './FastenerStl';
import { DEFAULT_SCREW_FAMILY, defaultScrewLength } from './fastenerDims';

const M = 0.001;

/**
 * Translucent green screw shown on the hovered profile face while dragging a
 * screw from the sidebar over the 3D viewport. Renders nothing when no drag
 * is active or no valid face is under the cursor.
 */
const DiyScrewPlacementGhost: React.FC = () => {
  const ghostScrew = useDiyStore((s) => s.ghostScrew);
  const isDraggingScrew = useDiyStore((s) => s.isDraggingScrew);

  if (!isDraggingScrew || !ghostScrew) return null;

  // The drag payload carries a SIZE only, so a dropped screw starts on the
  // default standard at the default length — the same two expressions the store
  // uses when it actually creates the screw, so the ghost cannot promise
  // something else than the drop produces.
  const family = DEFAULT_SCREW_FAMILY;

  return (
    <group
      position={[M * ghostScrew.position.x, M * ghostScrew.position.y, M * ghostScrew.position.z]}
      rotation={[
        THREE.MathUtils.degToRad(ghostScrew.rotation.roll),
        THREE.MathUtils.degToRad(ghostScrew.rotation.pitch),
        THREE.MathUtils.degToRad(ghostScrew.rotation.yaw),
      ]}
      scale={M}
    >
      {/* `renderOrder` on the MESH, not on this group: three sorts the objects it
          draws, and a Group is not one of them — the old prop here never reached
          the screw's triangles and only claimed to. */}
      <ScrewMesh
        family={family}
        size={ghostScrew.size}
        length={defaultScrewLength(family, ghostScrew.size)}
        color="#44ff88"
        opacity={0.4}
        renderOrder={999}
      />
    </group>
  );
};

export default DiyScrewPlacementGhost;
