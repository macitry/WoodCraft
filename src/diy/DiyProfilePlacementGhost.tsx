import { useDiyStore, ROOT_PROFILE_LENGTH } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';

const M = 0.001;

/** Same tint as the child-profile ghost — one "not placed yet" colour. */
const GHOST_COLOR = '#44ffaa';

/**
 * Translucent green profile standing on the ground plane under the pointer,
 * shown while a profile is in hand.
 *
 * The root profile used to be the one part with no preview at all: it arrived on
 * a dropped drag, so the browser's own drag image was the only thing under the
 * cursor, and the drop position was not known until the drop. A click commits
 * what the ghost is already showing, so the ghost has to show it.
 *
 * Both the height and the position come from the same constants `addRootProfile`
 * uses (`ROOT_PROFILE_LENGTH`, and the ghost's own stored `position` handed over
 * verbatim), so the box cannot promise a post the click does not build.
 */
const DiyProfilePlacementGhost: React.FC = () => {
  const ghostProfile = useDiyStore((s) => s.ghostProfile);
  const hand = useDiyStore((s) => s.hand);

  if (hand?.kind !== 'profile' || !ghostProfile) return null;

  const dimM = PROFILE_DIMS[ghostProfile.size] * M;
  const lenM = ROOT_PROFILE_LENGTH * M;
  const size: [number, number, number] =
    ghostProfile.direction === 'X' ? [lenM, dimM, dimM] :
    ghostProfile.direction === 'Y' ? [dimM, lenM, dimM] :
    [dimM, dimM, lenM];

  return (
    <group
      position={[
        M * ghostProfile.position.x,
        M * ghostProfile.position.y,
        M * ghostProfile.position.z,
      ]}
    >
      <mesh renderOrder={999}>
        <boxGeometry args={size} />
        <meshBasicMaterial color={GHOST_COLOR} transparent opacity={0.25} depthTest />
      </mesh>
      <mesh renderOrder={999}>
        <boxGeometry args={size} />
        <meshBasicMaterial color={GHOST_COLOR} wireframe transparent opacity={0.7} depthTest />
      </mesh>
    </group>
  );
};

export default DiyProfilePlacementGhost;
