import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModelStore, injectVirtualComponents } from '../store/modelStore';
import { mockTemplates } from '../mock/exampleModel';
import { parseTabletopDxf } from '../utils/dxfImport';
import { generateTabletopDxf, dxfShapeToDxf } from '../utils/dxfExport';
import { computeBom, bomToCsv } from '../utils/bomExport';
import type { ViewPreset } from '../types/furniture';
import type { ViewMode } from '../app/App';

interface ToolbarProps {
  onViewPreset: (preset: ViewPreset) => void;
  currentPreset: ViewPreset;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onViewPreset,
  currentPreset,
  viewMode,
  onViewMode,
}) => {
  const navigate = useNavigate();
  const loadModelFromApi = useModelStore((s) => s.loadModelFromApi);
  const loadMockModel = useModelStore((s) => s.loadMockModel);
  const model = useModelStore((s) => s.model);
  const isLoading = useModelStore((s) => s.isLoading);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTemplateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      setTemplateMenuOpen(false);
      const defaults: Record<string, { insetRatioX: number; insetRatioZ: number; crossBeamHeightRatio: number }> = {
        'basic-desk': { insetRatioX: 0, insetRatioZ: 0, crossBeamHeightRatio: 0.5 },
        'inset-desk': { insetRatioX: 0.05, insetRatioZ: 0.10, crossBeamHeightRatio: 0.5 },
        'cross-beam-desk': { insetRatioX: 0, insetRatioZ: 0, crossBeamHeightRatio: 0.3 },
        'side-cross-desk': { insetRatioX: 0, insetRatioZ: 0, crossBeamHeightRatio: 0.3 },
      };
      const d = defaults[templateId] || { insetRatioX: 0, insetRatioZ: 0, crossBeamHeightRatio: 0.5 };
      useModelStore.setState((s) => ({
        currentParams: { ...s.currentParams, templateId, ...d },
      }));

      // All desk templates share the same YAML — just update components, no API call
      const { model } = useModelStore.getState();
      if (model) {
        const updated = injectVirtualComponents(
          model.components.filter((c) => !c.id.startsWith('cross_beam') && !c.id.startsWith('bracket_')),
          templateId,
        );
        useModelStore.setState({ model: { ...model, components: updated } });
      } else {
        loadModelFromApi();
      }
    },
    [loadModelFromApi],
  );

  const viewPresets: { id: ViewPreset; label: string; icon: string }[] = [
    { id: 'front', label: 'Front', icon: '⊡' },
    { id: 'top', label: 'Top', icon: '⊟' },
    { id: 'side', label: 'Side', icon: '⊞' },
    { id: 'perspective', label: '3D', icon: '◈' },
  ];

  return (
    <div className="h-12 px-4 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-sm flex-shrink-0 relative z-50">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-8 h-8 rounded-lg bg-wood-600 flex items-center justify-center text-white font-bold text-sm">
          W
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">
          WoodCraft
        </span>
      </div>

      <div className="w-px h-6 bg-neutral-800" />

      {/* DIY link */}
      <button
        onClick={() => navigate('/diy')}
        className="px-3 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-wood-400 hover:text-wood-300 transition-colors cursor-pointer font-medium"
      >
        🔧 DIY
      </button>

      <div className="w-px h-6 bg-neutral-800" />

      {/* Template selector */}
      <div className="relative" ref={menuRef}>
        <button
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md
            bg-neutral-900 border border-neutral-700 text-neutral-300
            hover:border-neutral-600 hover:text-white transition-colors cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
          disabled={isLoading}
        >
          <span className="text-xs">📐</span>
          {mockTemplates.find((t) => t.id === useModelStore.getState().currentParams.templateId)?.name || 'Select Template'}
          <span className="text-neutral-600 text-[10px] ml-1">▼</span>
        </button>

        {templateMenuOpen && (
          <div
            className="absolute top-full mt-1 left-0 w-64 bg-neutral-900 border border-neutral-700
            rounded-lg shadow-xl z-[100] overflow-hidden"
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-600">
              Furniture Templates
            </div>
            {mockTemplates.map((t) => (
              <button
                key={t.id}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-neutral-800
                  transition-colors cursor-pointer flex items-start gap-3"
                onClick={() => handleTemplateSelect(t.id)}
              >
                <span className="text-lg mt-0.5">🪑</span>
                <div>
                  <div className="text-white text-sm">{t.name}</div>
                  <div className="text-neutral-500 text-xs mt-0.5">
                    {t.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* 3D / Plan view toggle */}
      {model && (
        <div className="flex items-center rounded-md bg-neutral-900 border border-neutral-700 overflow-hidden">
          <button
            className={`px-3 py-1.5 text-xs transition-colors cursor-pointer ${
              viewMode === '3d'
                ? 'bg-wood-600 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
            onClick={() => onViewMode('3d')}
          >
            3D
          </button>
          <button
            className={`px-3 py-1.5 text-xs transition-colors cursor-pointer ${
              viewMode === 'plan'
                ? 'bg-wood-600 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
            onClick={() => onViewMode('plan')}
          >
            Plan
          </button>
        </div>
      )}

      {/* View presets */}
      {model && viewMode === '3d' && (
        <div className="flex items-center gap-0.5">
          {viewPresets.map((preset) => (
            <button
              key={preset.id}
              className={`px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer
                ${currentPreset === preset.id
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
                }`}
              onClick={() => onViewPreset(preset.id)}
              title={preset.label}
            >
              <span className="mr-1">{preset.icon}</span>
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <div className="w-px h-6 bg-neutral-800" />

      {/* DXF Import */}
      <label
        className="px-3 py-1.5 text-xs rounded-md text-neutral-400
          hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
        title="Import DXF tabletop"
      >
        📐 Import DXF
        <input
          type="file"
          accept=".dxf"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const buf = await file.arrayBuffer();
              const shape = parseTabletopDxf(buf);
              useModelStore.getState().setDxfTabletop(shape);
              console.log('[DXF] Imported:', shape.bounds.width, 'x', shape.bounds.depth, 'mm,',
                shape.holes.length, 'holes');
              // Reset file input so the same file can be re-imported
              (e.target as HTMLInputElement).value = '';
            } catch (err) {
              console.error('[DXF] Import failed:', err);
              alert('DXF import failed: ' + (err as Error).message);
            }
          }}
        />
      </label>
      {/* Export DXF */}
      <button
        className="px-3 py-1.5 text-xs rounded-md text-neutral-400
          hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
        title="Export tabletop as DXF"
        onClick={() => {
          const store = useModelStore.getState();
          const model = store.model;
          if (!model) return;
          let dxf: string;
          if (store.dxfTabletop) {
            dxf = dxfShapeToDxf(store.dxfTabletop);
          } else {
            const w = model.parameters.find((p) => p.id === 'width')?.value ?? 1200;
            const d = model.parameters.find((p) => p.id === 'depth')?.value ?? 600;
            dxf = generateTabletopDxf(w, d, store.holes);
          }
          downloadFile(`tabletop_${model.id}.dxf`, dxf, 'application/dxf');
        }}
      >
        📤 DXF
      </button>
      {/* Export BOM */}
      <button
        className="px-3 py-1.5 text-xs rounded-md text-neutral-400
          hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
        title="Export BOM as CSV"
        onClick={() => {
          const model = useModelStore.getState().model;
          if (!model) return;
          const bom = computeBom(model);
          const csv = bomToCsv(bom);
          downloadFile(`bom_${model.id}.csv`, csv, 'text/csv');
        }}
      >
        📋 BOM
      </button>
      {/* Clear DXF */}
      <button
        className="px-3 py-1.5 text-xs rounded-md text-neutral-500
          hover:text-neutral-300 hover:bg-neutral-900 transition-colors cursor-pointer"
        title="Clear imported DXF"
        onClick={() => useModelStore.getState().setDxfTabletop(null)}
      >
        ↺
      </button>
    </div>
  );
};

/** Trigger a file download in the browser. */
function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default Toolbar;
