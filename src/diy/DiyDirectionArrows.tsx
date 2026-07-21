import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useDiyStore } from '../store/diyStore';
import type { AxisDir, FaceDir } from '../types/furniture';

const M = 0.001;

/** Axes perpendicular to a face direction. */
function perpAxes(face: FaceDir): { dir: AxisDir; sign: number; label: string }[] {
  const fa = face[1] as AxisDir;
  const fs = face.startsWith('+') ? 1 : -1;
  const all: AxisDir[] = ['X', 'Y', 'Z'];
  const result: { dir: AxisDir; sign: number; label: string }[] = [];
  for (const a of all) {
    if (a === fa) continue;
    result.push({ dir: a, sign: 1, label: `+${a}` });
    result.push({ dir: a, sign: -1, label: `-${a}` });
  }
  return result;
}

const COLORS: Record<string, string> = {
  '+X': '#ff6666', '-X': '#cc4444',
  '+Y': '#66ff66', '-Y': '#44cc44',
  '+Z': '#6666ff', '-Z': '#4444cc',
};

const DiyDirectionArrows: React.FC = () => {
  const mode = useDiyStore((s) => s.mode);
  const parentId = useDiyStore((s) => s.attachParentId);
  const face = useDiyStore((s) => s.attachFace);
  const hitPos = useDiyStore((s) => s.attachHitPos);
  const profiles = useDiyStore((s) => s.profiles);
  const addChild = useDiyStore((s) => s.addChildProfile);
  const clear = useDiyStore((s) => s.clearAttach);

  if (mode !== 'selecting_direction' || !face || !hitPos || !parentId) return null;
  const parent = profiles.find((p) => p.id === parentId);
  if (!parent) return null;

  const dirs = perpAxes(face);
  const arrowLen = 0.05;

  return (
    <group position={[M * hitPos.x, M * hitPos.y, M * hitPos.z]}>
      {/* Label */}
      <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div className="bg-neutral-900/90 border border-neutral-600 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap">
          Pick growth direction
        </div>
      </Html>

      {dirs.map(({ dir, sign, label }) => {
        const axI = dir === 'X' ? 0 : dir === 'Y' ? 1 : 2;
        const color = COLORS[`${sign > 0 ? '+' : '-'}${dir}`] || '#fff';
        const end = new THREE.Vector3();
        end.setComponent(axI, sign * arrowLen);

        return (
          <group key={label}>
            <mesh
              position={[end.x / 2, end.y / 2, end.z / 2]}
              onClick={(e) => { e.stopPropagation(); addChild(parent.profileSize); }}
            >
              <cylinderGeometry args={[0.003, 0.003, arrowLen, 8]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <mesh
              position={[end.x, end.y, end.z]}
              onClick={(e) => { e.stopPropagation(); addChild(parent.profileSize); }}
            >
              <coneGeometry args={[0.01, 0.025, 8]} />
              <meshBasicMaterial color={color} />
            </mesh>
            {/* Direction label above arrow */}
            <Html position={[end.x * 1.4, end.y * 1.4, end.z * 1.4]} center distanceFactor={15} style={{ pointerEvents: 'none' }}>
              <span className="text-[8px] text-neutral-400">{label}</span>
            </Html>
          </group>
        );
      })}

      {/* Cancel button */}
      <mesh position={[0, -0.04, 0]} onClick={(e) => { e.stopPropagation(); clear(); }}>
        <sphereGeometry args={[0.014, 16, 16]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
    </group>
  );
};

export default DiyDirectionArrows;
