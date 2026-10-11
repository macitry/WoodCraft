import { useMemo } from 'react';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';
import { getFacePlane } from './diyFacePlane';

const M = 0.001;

const GHOST_COLOR = '#44ffaa';

/**
 * The ghost never takes a pointer event.
 *
 * It used to own a full invisible plane over the parent face, offset 1 mm out
 * so the ray stopped on the plane before the profile, and it snapped and
 * confirmed on that. The gesture is now "hover the selected profile's face",
 * and the pointer has to stay recognisably over the PROFILE for that to mean
 * anything — so the plane is gone and this is a picture of where the child
 * would land. `DiyProfileRenderer` computes that position from its own hit on
 * the profile, using the same face-plane helpers.
 */
const noRaycast = () => null;

const DiyPlacingGhost: React.FC = () => {
  const placingProfile = useDiyStore((s) => s.placingProfile);
  const profiles = useDiyStore((s) => s.profiles);
  const movingPart = useDiyStore((s) => s.movingPart);
  const selId = useDiyStore((s) => s.selectedProfileId);

  const parent = placingProfile ? profiles.find((p) => p.id === placingProfile.parentId) : null;
  const dim = placingProfile ? (PROFILE_DIMS[placingProfile.size] ?? 30) : 30;
  const fp = useMemo(
    () => (parent && placingProfile ? getFacePlane(parent, placingProfile.face, dim) : null),
    [parent, placingProfile, dim],
  );

  // A move-drag owns the pointer. The profile under it is the part being moved,
  // not a face offering to grow anything, and a green box tracking along with
  // the drag would read as a second thing about to happen.
  if (!placingProfile || !parent || !fp || movingPart) return null;
  // The ghost is an offer made by the SELECTED profile and by nothing else.
  // Selection can be moved from the property panel without the pointer ever
  // leaving the old bar, which would otherwise leave this drawing on a profile
  // the user is no longer working with.
  if (placingProfile.parentId !== selId) return null;

  const faceToDir: Record<string, string> = {
    '+X': 'X', '-X': 'X', '+Y': 'Y', '-Y': 'Y', '+Z': 'Z', '-Z': 'Z',
  };
  const childDir = faceToDir[placingProfile.face] ?? 'Y';
  const ghostLen = 0.1; // show 100mm of the new profile
  const ghostDim = dim * M;

  const ghostSize: [number, number, number] =
    childDir === 'X' ? [ghostLen, ghostDim, ghostDim] :
    childDir === 'Y' ? [ghostDim, ghostLen, ghostDim] :
    [ghostDim, ghostDim, ghostLen];

  // Offset ghost outward by half the ghost length along the face normal,
  // so its inner end sits flush against the parent face.
  const halfLenM = ghostLen / 2;
  const ghostPos: [number, number, number] = [
    placingProfile.position.x * M + fp.normal.x * halfLenM,
    placingProfile.position.y * M + fp.normal.y * halfLenM,
    placingProfile.position.z * M + fp.normal.z * halfLenM,
  ];

  return (
    <group position={ghostPos}>
      <mesh renderOrder={11} raycast={noRaycast}>
        <boxGeometry args={ghostSize} />
        <meshBasicMaterial
          color={GHOST_COLOR}
          transparent
          opacity={0.28}
          depthTest
        />
      </mesh>
      <mesh renderOrder={12} raycast={noRaycast}>
        <boxGeometry args={ghostSize} />
        <meshBasicMaterial
          color={GHOST_COLOR}
          wireframe
          transparent
          opacity={0.7}
          depthTest
        />
      </mesh>
    </group>
  );
};

export default DiyPlacingGhost;
