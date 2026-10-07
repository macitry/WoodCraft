import { useModelStore } from '../store/modelStore';
import { useT } from '../i18n';
import { paramName } from '../i18n/names';

/**
 * Right-side panel for editing furniture parameters.
 *
 * Users modify dimensions like width, depth, and height.
 * Changes trigger model regeneration via the store.
 *
 * Parameter LABELS are not literals here: they arrive on the model from the
 * API (`param.name`), so they are looked up by id through `names.ts` with the
 * served string as the fallback. The panel must therefore also call `useT()`
 * itself — `paramName` is a plain function and has no way to know the language
 * changed.
 */
const ParameterPanel: React.FC = () => {
  const t = useT();
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
          {t('panel.parameters')}
        </p>
        <p>{t('common.noModel')}</p>
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
          {t('panel.parameters')}
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
                {paramName(param.id, param.name)}
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

        {/* No profile selector and no board-material row here. Both used to be
            three buttons with hover styling, a pointer cursor and NO onClick —
            controls that lie, on the panel the user reads first. The board row
            was worse than dead: it offered plywood/mdf/oak, which neither
            matches the four boards the app actually has (oak/walnut/plank/ply)
            nor includes MDF, a material no board in this app is made of. The two
            real controls already exist and are the only ones that should — the
            profile picker on the kits page, and MaterialSelector below. */}

        {/* Inset ratio sliders — only for inset-desk */}
        {useModelStore.getState().currentParams.templateId === 'inset-desk' && (
        <div className="pt-2 border-t border-neutral-800 space-y-4">
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
            {t('panel.frameInset')}
          </p>
          {[
            { id: 'insetRatioX', label: t('panel.insetX'), value: insetX },
            { id: 'insetRatioZ', label: t('panel.insetZ'), value: insetZ },
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
              {t('panel.crossBeamHeight')}
            </p>
            <div className="flex items-center justify-between">
              <label className="text-sm text-neutral-300">{t('panel.crossBeamHeight')}</label>
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
              <span>{t('panel.ground')}</span>
              <span>{t('panel.legTop')}</span>
            </div>
          </div>
        )}

      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="px-4 py-2 border-t border-neutral-800">
          <div className="flex items-center gap-2 text-xs text-wood-400">
            <div className="w-3 h-3 border border-wood-400 border-t-transparent rounded-full animate-spin" />
            {t('panel.updating')}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParameterPanel;
