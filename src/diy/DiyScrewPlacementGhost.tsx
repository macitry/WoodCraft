import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { ScrewMesh } from './FastenerStl';
import { defaultScrewLength } from './fastenerDims';

const M = 0.001;

/**
 * Translucent green screw shown on the profile face under the pointer while a
 * screw is in hand. Renders nothing when no screw is held, or when no valid
 * face is under the cursor.
 */
const DiyScrewPlacementGhost: React.FC = () => {
  const ghostScrew = useDiyStore((s) => s.ghostScrew);
  const hand = useDiyStore((s) => s.hand);

  if (hand?.kind !== 'screw' || !ghostScrew) return null;

  // The standard and the size come from the picked card; the length is the
  // default — the same two expressions the store uses when it actually creates
  // the screw, so the ghost cannot promise something else than the click
  // produces. See `placeScrew`.
  const family = ghostScrew.family;

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
