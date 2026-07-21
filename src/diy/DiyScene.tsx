import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useDiyStore } from '../store/diyStore';
import Lighting from '../viewer/Lighting';
import DiyProfileRenderer from './DiyProfileRenderer';
import DiyStretchGizmo from './DiyStretchGizmo';
import DiyBracketRenderer from './DiyBracketRenderer';

interface DiySceneProps {
  onCameraReady: (cam: THREE.PerspectiveCamera) => void;
}

const DiyScene: React.FC<DiySceneProps> = ({ onCameraReady }) => {
  const camera = useThree((s) => s.camera);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const setControlsRef = useDiyStore((s) => s.setControlsRef);

  useEffect(() => {
    setControlsRef(controlsRef as React.MutableRefObject<OrbitControlsImpl | null>);
  }, [setControlsRef, controlsRef]);

  useRef(() => {
    onCameraReady(camera as THREE.PerspectiveCamera);
  }).current?.();

  return (
    <>
      <color attach="background" args={['#1a1a2e']} />
      <Lighting />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.2}
        maxDistance={20}
        maxPolarAngle={Math.PI * 0.55}
        target={[0, 0.5, 0]}
      />

      {/* Ground grid */}
      <gridHelper args={[10, 20, '#303050', '#202035']} position={[0, -0.005, 0]} />
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial transparent opacity={0.2} />
      </mesh>

      <DiyProfileRenderer />
      <DiyBracketRenderer />
      <DiyStretchGizmo />
    </>
  );
};

export default DiyScene;
