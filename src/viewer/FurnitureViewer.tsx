import { Canvas } from '@react-three/fiber';
import Scene from './Scene';
import { useModelStore } from '../store/modelStore';
import ProgressBar from '../components/ProgressBar';
import type { ViewPreset } from '../types/furniture';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface FurnitureViewerProps {
  viewPreset: ViewPreset;
  onControlsReady?: (controls: OrbitControlsImpl) => void;
}

/**
 * The main 3D viewer container.
 *
 * Wraps the Three.js canvas powered by @react-three/fiber.
 * Provides the viewport for furniture visualization with
 * orbit controls, PBR lighting, and shadows.
 */
const FurnitureViewer: React.FC<FurnitureViewerProps> = ({
  viewPreset,
  onControlsReady,
}) => {
  const model = useModelStore((s) => s.model);
  const isLoading = useModelStore((s) => s.isLoading);

  return (
    <div className="w-full h-full relative bg-[#1a1a2e]">
      {/* Empty state */}
      {!model && !isLoading && <EmptyState />}

      {/* Loading overlay */}
      {isLoading && <LoadingOverlay />}

      <Canvas
        shadows="soft"
        gl={{
          antialias: true,
          toneMapping: 3,
          toneMappingExposure: 1.0,
          outputColorSpace: 'srgb',
        }}
        camera={{
          position: [3, 2, 4],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene viewPreset={viewPreset} onControlsReady={onControlsReady} />
      </Canvas>
    </div>
  );
};

/** Shown when no model is loaded. */
const EmptyState: React.FC = () => {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="text-center">
        <div className="text-6xl mb-4">🪑</div>
        <p className="text-lg text-neutral-500">
          Select a furniture template to begin
        </p>
        <p className="text-sm mt-2 text-neutral-600">
          Choose a template from the top toolbar
        </p>
      </div>
    </div>
  );
};

/** Shown while model is generating. Shows progress bar from server. */
const LoadingOverlay: React.FC = () => {
  const progress = useModelStore((s) => s.progress);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="text-center">
        {progress ? (
          <ProgressBar progress={progress} />
        ) : (
          <>
            <div className="w-12 h-12 border-2 border-wood-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-neutral-400">Generating model...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default FurnitureViewer;
