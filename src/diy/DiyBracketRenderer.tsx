import { useMemo, Suspense } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';

const BRACKET_STL = '/Cast_Corner_Bracket.stl';
const M = 0.001;

/** Renders user-placed brackets in the DIY scene. */
const DiyBracketRenderer: React.FC = () => {
  const brackets = useDiyStore((s) => s.brackets);
  const selectedBracketId = useDiyStore((s) => s.selectedBracketId);
  const selectBracket = useDiyStore((s) => s.selectBracket);

  return (
    <group>
      {brackets
        .filter((b) => b.enabled)
        .map((b) => (
          <Suspense key={b.id} fallback={null}>
            <BracketMesh
              bracket={b}
              isSelected={selectedBracketId === b.id}
              onClick={() => selectBracket(b.id === selectedBracketId ? null : b.id)}
            />
          </Suspense>
        ))}
    </group>
  );
};

const BracketMesh: React.FC<{
  bracket: { id: string; position: { x: number; y: number; z: number }; rotation: { roll: number; pitch: number; yaw: number } };
  isSelected: boolean;
  onClick: () => void;
}> = ({ bracket, isSelected, onClick }) => {
  const geom = useLoader(STLLoader, BRACKET_STL);
  const cloned = useMemo(() => geom.clone(), [geom]);

  return (
    <mesh
      geometry={cloned}
      position={[M * bracket.position.x, M * bracket.position.y, M * bracket.position.z]}
      rotation={[
        THREE.MathUtils.degToRad(bracket.rotation.roll),
        THREE.MathUtils.degToRad(bracket.rotation.pitch),
        THREE.MathUtils.degToRad(bracket.rotation.yaw),
      ]}
      scale={[M, M, M]}
      castShadow
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <meshStandardMaterial
        color="#707070"
        metalness={0.9}
        roughness={0.25}
        emissive={isSelected ? '#ffffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.15 : 0}
      />
    </mesh>
  );
};

export default DiyBracketRenderer;
