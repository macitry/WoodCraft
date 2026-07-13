import { useRef } from 'react';
import { useModelStore } from '../store/modelStore';
import type { ViewPreset } from '../types/furniture';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import CameraController from './CameraController';
import Lighting from './Lighting';
import ModelLoader from './ModelLoader';

interface SceneProps {
  viewPreset: ViewPreset;
  onControlsReady?: (controls: OrbitControlsImpl) => void;
}

/**
 * The 3D scene — sets up canvas contents:
 * - Lighting
 * - Camera with orbit controls
 * - Model geometry
 * - Grid / environment
 */
const Scene: React.FC<SceneProps> = ({ viewPreset, onControlsReady }) => {
  const model = useModelStore((s) => s.model);
  const isLoading = useModelStore((s) => s.isLoading);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Notify parent when controls are ready
  const handleControlsMounted = (controls: OrbitControlsImpl | null) => {
    if (controls && onControlsReady) {
      controlsRef.current = controls;
      onControlsReady(controls);
    }
  };

  // Empty state
  if (!model && !isLoading) {
    return (
      <>
        <color attach="background" args={['#1a1a2e']} />
        <ambientLight intensity={0.3} />
      </>
    );
  }

  // Loading state
  if (isLoading || !model) {
    return (
      <>
        <color attach="background" args={['#1a1a2e']} />
        <ambientLight intensity={0.3} />
      </>
    );
  }

  return (
    <>
      {/* Ambient background gradient override for the canvas */}
      <color attach="background" args={['#1a1a2e']} />

      <Lighting />

      <CameraController
        viewPreset={viewPreset}
        controlsRef={controlsRef}
        onMounted={handleControlsMounted}
      />

      {/* Subtle grid for spatial reference */}
      <gridHelper
        args={[8, 20, '#303050', '#202035']}
        position={[0, -0.005, 0]}
      />

      <ModelLoader model={model} />
    </>
  );
};

export default Scene;
