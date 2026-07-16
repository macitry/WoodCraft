import { useModelStore } from '../store/modelStore';

/**
 * Right-side panel for editing furniture parameters.
 *
 * Users modify dimensions like width, depth, and height.
 * Changes trigger model regeneration via the store.
 */
const ParameterPanel: React.FC = () => {
  const model = useModelStore((s) => s.model);
  const isLoading = useModelStore((s) => s.isLoading);
  const updateParameter = useModelStore((s) => s.updateParameter);
  const updateLayoutParam = useModelStore((s) => s.updateLayoutParam);
  const insetX = useModelStore((s) => s.currentParams.insetRatioX);
  const insetZ = useModelStore((s) => s.currentParams.insetRatioZ);
  const crossBeamRatio = useModelStore((s) => s.currentParams.crossBeamHeightRatio);

  if (!model) {
    return (
      <div className="p-4 text-neutral-500 text-sm">
        <p className="text-xs uppercase tracking-wider text-neutral-600 mb-3">
          Parameters
        </p>
        <p>No model loaded.</p>
      </div>
    );
  }

  const handleChange = (paramId: string, value: number) => {
    updateParameter(paramId, value);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Parameters
        </p>
        <h3 className="text-sm font-medium text-white mt-0.5 truncate">
          {model.name}
        </h3>
      </div>

      {/* Parameter sliders */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {model.parameters.map((param) => (
          <div key={param.id} className="space-y-2">
            {/* Label + value */}
            <div className="flex items-center justify-between">
              <label
                htmlFor={`param-${param.id}`}
                className="text-sm text-neutral-300"
              >
                {param.name}
              </label>
              <span className="text-sm font-mono text-white tabular-nums">
                {param.value}
                <span className="text-neutral-500 ml-0.5">{param.unit}</span>
              </span>
            </div>

            {/* Slider */}
            <input
              id={`param-${param.id}`}
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              value={param.value}
              onChange={(e) => handleChange(param.id, Number(e.target.value))}
              disabled={isLoading}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer
                accent-wood-500
                disabled:opacity-40 disabled:cursor-not-allowed
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-wood-400
                [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:transition-transform
                [&::-webkit-slider-thumb]:hover:scale-110"
            />

            {/* Min / Max labels */}
            <div className="flex justify-between text-[10px] text-neutral-600">
              <span>
                {param.min} {param.unit}
              </span>
              <span>
                {param.max} {param.unit}
              </span>
            </div>
          </div>
        ))}

        {/* Profile selector */}
        <div className="pt-2 border-t border-neutral-800">
          <label className="text-sm text-neutral-300 block mb-2">
            Profile
          </label>
          <div className="grid grid-cols-3 gap-2">
            {['2020', '3030', '4040'].map((profile) => (
              <button
                key={profile}
                className="px-3 py-2 text-xs rounded-md border border-neutral-700
                  text-neutral-300 hover:border-wood-600 hover:text-white
                  transition-colors cursor-pointer"
              >
                {profile}
              </button>
            ))}
          </div>
        </div>

        {/* Inset ratio sliders — only for inset-desk */}
        {useModelStore.getState().currentParams.templateId === 'inset-desk' && (
        <div className="pt-2 border-t border-neutral-800 space-y-4">
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
            Frame Inset
          </p>
          {[
            { id: 'insetRatioX', label: '宽边内缩', value: insetX },
            { id: 'insetRatioZ', label: '深边内缩', value: insetZ },
          ].map((s) => (
            <div key={s.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-neutral-300">{s.label}</label>
                <span className="text-sm font-mono text-white tabular-nums">
                  {(s.value * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={s.value}
                onChange={(e) => updateLayoutParam(s.id, Number(e.target.value))}
                className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer
                  accent-wood-500
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-wood-400
                  [&::-webkit-slider-thumb]:shadow-md"
              />
              <div className="flex justify-between text-[10px] text-neutral-600">
                <span>0%</span>
                <span>50%</span>
              </div>
            </div>
          ))}
        </div>
        )}

        {/* Cross beam height — only for templates with hasCrossBeams */}
        {['cross-beam-desk', 'side-cross-desk'].includes(useModelStore.getState().currentParams.templateId) && (
          <div className="pt-2 border-t border-neutral-800 space-y-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
              Cross Beam Height
            </p>
            <div className="flex items-center justify-between">
              <label className="text-sm text-neutral-300">加强横梁高度</label>
              <span className="text-sm font-mono text-white tabular-nums">
                {Math.round(crossBeamRatio * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={crossBeamRatio}
              onChange={(e) => updateLayoutParam('crossBeamHeightRatio', Number(e.target.value))}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer
                accent-wood-500
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-wood-400
                [&::-webkit-slider-thumb]:shadow-md"
            />
            <div className="flex justify-between text-[10px] text-neutral-600">
              <span>0% (地面)</span>
              <span>100% (桌腿顶)</span>
            </div>
          </div>
        )}

        {/* Board material */}
        <div>
          <label className="text-sm text-neutral-300 block mb-2">
            Board Material
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'plywood', label: 'Plywood' },
              { id: 'mdf', label: 'MDF' },
              { id: 'oak', label: 'Oak' },
            ].map((mat) => (
              <button
                key={mat.id}
                className="px-3 py-2 text-xs rounded-md border border-neutral-700
                  text-neutral-300 hover:border-wood-600 hover:text-white
                  transition-colors cursor-pointer"
              >
                {mat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="px-4 py-2 border-t border-neutral-800">
          <div className="flex items-center gap-2 text-xs text-wood-400">
            <div className="w-3 h-3 border border-wood-400 border-t-transparent rounded-full animate-spin" />
            Updating model...
          </div>
        </div>
      )}
    </div>
  );
};

export default ParameterPanel;
