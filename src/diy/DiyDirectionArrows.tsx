import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import type { AxisDir, FaceDir } from '../types/furniture';

const M = 0.001;

/** Map face direction to which axes are perpendicular (allowed growth). */
function getPerpendicularDirs(face: FaceDir): { dir: AxisDir; sign: number }[] {
  const faceAxis = face[1] as 'X' | 'Y' | 'Z'; // e.g. '+Y' → 'Y'
  const faceSign = face.startsWith('+') ? 1 : -1;
  const allAxes: AxisDir[] = ['X', 'Y', 'Z'];
  const perpAxes = allAxes.filter((a) => a !== faceAxis);

  const result: { dir: AxisDir; sign: number }[] = [];
  for (const axis of perpAxes) {
    result.push({ dir: axis, sign: 1 });
    result.push({ dir: axis, sign: -1 });
  }
  // Also include the face normal direction (outward growth)
  result.push({ dir: faceAxis, sign: faceSign });
  return result;
}

const DIR_COLORS: Record<string, string> = {
  'X+': '#ff4444', 'X-': '#cc3333',
  'Y+': '#44ff44', 'Y-': '#33cc33',
  'Z+': '#4444ff', 'Z-': '#3333cc',
};

const DiyDirectionArrows: React.FC = () => {
  const mode = useDiyStore((s) => s.mode);
  const attachParentId = useDiyStore((s) => s.attachParentId);
  const attachFace = useDiyStore((s) => s.attachFace);
  const attachHitPos = useDiyStore((s) => s.attachHitPos);
  const profiles = useDiyStore((s) => s.profiles);
  const addChildProfile = useDiyStore((s) => s.addChildProfile);
  const clearAttach = useDiyStore((s) => s.clearAttach);

  if (mode !== 'selecting_direction' || !attachFace || !attachHitPos || !attachParentId) return null;

  const parent = profiles.find((p) => p.id === attachParentId);
  if (!parent) return null;

  const size = parent.profileSize;
  const arrowLen = 0.06;
  const dirs = getPerpendicularDirs(attachFace);

  return (
    <group position={[M * attachHitPos.x, M * attachHitPos.y, M * attachHitPos.z]}>
      {dirs.map(({ dir, sign }) => {
        const key = `${dir}${sign > 0 ? '+' : '-'}`;
        const color = DIR_COLORS[key] || '#ffffff';
        const axIdx = dir === 'X' ? 0 : dir === 'Y' ? 1 : 2;
        const endVec = new THREE.Vector3();
        endVec.setComponent(axIdx, sign * arrowLen);

        return (
          <group key={key}>
            <mesh
              position={[endVec.x / 2, endVec.y / 2, endVec.z / 2]}
              onClick={(e) => { e.stopPropagation(); addChildProfile(size); }}
            >
              <cylinderGeometry args={[0.003, 0.003, arrowLen, 8]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <mesh
              position={[endVec.x, endVec.y, endVec.z]}
              onClick={(e) => { e.stopPropagation(); addChildProfile(size); }}
            >
              <coneGeometry args={[0.01, 0.025, 8]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        );
      })}

      {/* Cancel sphere (red, below) */}
      <mesh position={[0, -0.04, 0]} onClick={(e) => { e.stopPropagation(); clearAttach(); }}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
    </group>
  );
};

export default DiyDirectionArrows;
