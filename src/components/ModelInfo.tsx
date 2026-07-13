import { useModelStore } from '../store/modelStore';
import type { Component } from '../types/furniture';

/**
 * Bottom info bar showing details about the currently selected component.
 * Displays material, dimensions, and mass information.
 */
const ModelInfo: React.FC = () => {
  const model = useModelStore((s) => s.model);
  const selectedComponentId = useModelStore((s) => s.selectedComponentId);

  if (!model) return null;

  const selectedPart: Component | undefined = selectedComponentId
    ? model.components.find((c) => c.id === selectedComponentId)
    : undefined;

  const width = model.parameters.find((p) => p.id === 'width')?.value || 1200;
  const depth = model.parameters.find((p) => p.id === 'depth')?.value || 600;
  const height = model.parameters.find((p) => p.id === 'height')?.value || 750;

  return (
    <div className="h-10 px-4 flex items-center gap-6 text-xs border-t border-neutral-800 bg-neutral-900/80 backdrop-blur-sm">
      {/* Model overview */}
      <div className="flex items-center gap-4 text-neutral-400">
        <span>
          {width} × {depth} × {height} mm
        </span>
        <span className="text-neutral-700">|</span>
        <span>
          {model.components.length} parts
        </span>
      </div>

      {/* Selected part info */}
      <div className="flex-1" />

      {selectedPart ? (
        <div className="flex items-center gap-4 text-neutral-300">
          <span className="text-neutral-600">Selected:</span>
          <span className="text-wood-400 font-medium">{selectedPart.name}</span>
          {selectedPart.material && (
            <>
              <span className="text-neutral-700">|</span>
              <span className="text-neutral-400">
                {selectedPart.material}
              </span>
            </>
          )}
          {selectedPart.partType && (
            <>
              <span className="text-neutral-700">|</span>
              <span className="text-neutral-500">{selectedPart.partType}</span>
            </>
          )}
          <button
            className="text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer"
            onClick={() => useModelStore.getState().selectComponent(null)}
          >
            ✕
          </button>
        </div>
      ) : (
        <span className="text-neutral-600 text-xs">
          Click a part in the 3D view or component tree to inspect
        </span>
      )}
    </div>
  );
};

export default ModelInfo;
