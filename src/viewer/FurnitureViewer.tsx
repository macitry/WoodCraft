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
  const placementMode = useModelStore((s) => s.placementMode);
  const mateState = useModelStore((s) => s.mateState);

  const matePrompt = mateState === 'selecting_source_face'
    ? '⚓ Mate Step 1/2: Click on the BRACKET surface (select face to mate)'
    : mateState === 'selecting_target_face'
    ? '⚓ Mate Step 2/2: Click on the TARGET part surface (where to attach)'
    : null;

  return (
    <div className="w-full h-full relative bg-[#1a1a2e]">
      {/* Empty state */}
      {!model && !isLoading && <EmptyState />}

      {/* Loading overlay */}
      {isLoading && <LoadingOverlay />}

      {/* Snap mode indicator */}
      {placementMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="px-4 py-1.5 rounded-full bg-green-800/80 border border-green-600 text-green-300 text-xs backdrop-blur-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Snap Mode — click on a part surface to place bracket
          </div>
        </div>
      )}

      {/* Mate mode indicator */}
      {matePrompt && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="px-4 py-1.5 rounded-full bg-yellow-800/80 border border-yellow-600 text-yellow-200 text-xs backdrop-blur-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            {matePrompt}
          </div>
        </div>
      )}

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
