import { useRef, useState, useEffect, useCallback } from 'react';
import { useModelStore } from '../store/modelStore';
import { mockTemplates } from '../mock/exampleModel';
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
      if (templateId === 'basic-desk') {
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
    <div className="h-12 px-4 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-sm flex-shrink-0">
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
          {model ? model.name : 'Select Template'}
          <span className="text-neutral-600 text-[10px] ml-1">▼</span>
        </button>

        {templateMenuOpen && (
          <div
            className="absolute top-full mt-1 left-0 w-64 bg-neutral-900 border border-neutral-700
            rounded-lg shadow-xl z-50 overflow-hidden"
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

      {/* Future: Import / Save buttons */}
      <button
        className="px-3 py-1.5 text-xs rounded-md text-neutral-500
          hover:text-neutral-300 hover:bg-neutral-900 transition-colors cursor-pointer"
        title="Import — coming soon"
      >
        Import
      </button>
      <button
        className="px-3 py-1.5 text-xs rounded-md text-neutral-500
          hover:text-neutral-300 hover:bg-neutral-900 transition-colors cursor-pointer"
        title="Save — coming soon"
      >
        Save
      </button>
    </div>
  );
};

export default Toolbar;
