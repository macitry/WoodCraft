import { useMemo } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';

const M = 0.001;

/**
 * Green disc on the first picked face while placing a bracket by two faces,
 * so the user can see that pick 1 registered before picking face 2.
 */
const DiyBracketFaceMarker: React.FC = () => {
  const pick = useDiyStore((s) => s.bracketFaceA);

  const [pos, quat] = useMemo(() => {
    if (!pick) return [null, null] as const;
    const p = new THREE.Vector3(pick.hit.x * M, pick.hit.y * M, pick.hit.z * M);
    const n = new THREE.Vector3(pick.normal.x, pick.normal.y, pick.normal.z);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    return [p, q] as const;
  }, [pick]);

  if (!pick || !pos || !quat) return null;

  return (
    <mesh position={pos} quaternion={quat} renderOrder={12}>
      <circleGeometry args={[0.012, 24]} />
      <meshBasicMaterial color="#44ffaa" transparent opacity={0.95} depthTest={false} />
    </mesh>
  );
};

export default DiyBracketFaceMarker;
