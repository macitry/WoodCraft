import { useRef, useState, useEffect, useCallback } from 'react';
import { useModelStore, injectVirtualComponents } from '../store/modelStore';
import { autoGenerateBrackets } from '../diy/mainBracketAuto';
import { mockTemplates } from '../mock/exampleModel';
import { templateDescription, templateName } from '../i18n/names';
import { parseTabletopDxf } from '../utils/dxfImport';
import { generateTabletopDxf, dxfShapeToDxf } from '../utils/dxfExport';
import BomPreviewModal from './BomPreviewModal';
import AppHeader from './AppHeader';
import { downloadFile } from '../utils/download';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/dict';
import { SCENES, sceneById, type SceneId } from '../viewer/scenes';
import type { ViewPreset } from '../types/furniture';
import type { ViewMode } from '../app/App';

/** The scene menu's entries, in the order they are shown: 「关」 first, then the
 *  registry. Derived from `SCENES` rather than written out again, so a scene
 *  added to the viewer appears here — with its own note — without a second
 *  list to keep in step. */
const SCENE_CHOICES: { id: SceneId | null; noteKey: DictKey }[] = [
  { id: null, noteKey: 'scene.offNote' },
  ...SCENES.map((s) => ({ id: s.id as SceneId | null, noteKey: s.noteKey })),
];

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
  const t = useT();
  const loadModelFromApi = useModelStore((s) => s.loadModelFromApi);
  const model = useModelStore((s) => s.model);
  const isLoading = useModelStore((s) => s.isLoading);
  const sceneId = useModelStore((s) => s.sceneId);
  const setSceneId = useModelStore((s) => s.setSceneId);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  const sceneLabel = (id: SceneId | null) => {
    const def = sceneById(id);
    return def ? t(def.labelKey) : t('scene.off');
  };

  // Close menus on outside click — one listener, both menus. A click on either
  // menu's button is outside the other's ref, so this closes whichever was open
  // without either menu needing to know the other exists.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setTemplateMenuOpen(false);
      }
      if (sceneRef.current && !sceneRef.current.contains(target)) {
        setSceneMenuOpen(false);
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
        const updatedModel = { ...model, components: updated };
        // Template switch is a structural change — regenerate the auto brackets
        // so the new joints (e.g. cross beams) get their connectors immediately.
        const freshBrackets = autoGenerateBrackets(
          updatedModel,
          useModelStore.getState().currentParams,
        );
        useModelStore.setState({
          model: updatedModel,
          brackets: freshBrackets,
          defaultBracketCount: freshBrackets.length,
          selectedBracketId: null,
        });
      } else {
        loadModelFromApi();
      }
    },
    [loadModelFromApi],
  );

  const viewPresets: { id: ViewPreset; label: string; icon: string }[] = [
    { id: 'front', label: t('view.front'), icon: '⊡' },
    { id: 'top', label: t('view.top'), icon: '⊟' },
    { id: 'side', label: t('view.side'), icon: '⊞' },
    { id: 'perspective', label: t('view.perspective'), icon: '◈' },
  ];

  return (
    <>
    {/* Logo, the DIY/组合 destinations and the language switch all live in the
        shared header now; this page owns only the controls below. */}
    <AppHeader
      active="home"
      left={
      <div className="relative" ref={menuRef}>
        <button
          data-template-menu
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md
            bg-neutral-900 border border-neutral-700 text-neutral-300
            hover:border-neutral-600 hover:text-white transition-colors cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
          disabled={isLoading}
        >
          <span className="text-xs">📐</span>
          {(() => {
            const cur = mockTemplates.find(
              (tpl) => tpl.id === useModelStore.getState().currentParams.templateId,
            );
            return cur ? templateName(cur.id, cur.name ?? cur.id) : t('home.selectTemplate');
          })()}
          <span className="text-neutral-600 text-[10px] ml-1">▼</span>
        </button>

        {templateMenuOpen && (
          <div
            className="absolute top-full mt-1 left-0 w-64 bg-neutral-900 border border-neutral-700
            rounded-lg shadow-xl z-[100] overflow-hidden"
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-600">
              {t('home.templates')}
            </div>
            {mockTemplates.map((tpl) => (
              <button
                key={tpl.id}
                data-template={tpl.id}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-neutral-800
                  transition-colors cursor-pointer flex items-start gap-3"
                onClick={() => handleTemplateSelect(tpl.id)}
              >
                <span className="text-lg mt-0.5">🪑</span>
                <div>
                  <div className="text-white text-sm">{templateName(tpl.id, tpl.name)}</div>
                  <div className="text-neutral-500 text-xs mt-0.5">
                    {templateDescription(tpl.id, tpl.description ?? '')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      }
      right={
      <>

      {/* 3D / Plan view toggle */}
      {model && (
        <div className="flex items-center rounded-md bg-neutral-900 border border-neutral-700 overflow-hidden">
          <button
            data-view-mode="3d"
            className={`px-3 py-1.5 text-xs transition-colors cursor-pointer ${
              viewMode === '3d'
                ? 'bg-wood-600 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
            onClick={() => onViewMode('3d')}
          >
            {t('view.3d')}
          </button>
          <button
            data-view-mode="plan"
            className={`px-3 py-1.5 text-xs transition-colors cursor-pointer ${
              viewMode === 'plan'
                ? 'bg-wood-600 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
            onClick={() => onViewMode('plan')}
          >
            {t('view.plan')}
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

      {/* Scene picker. Sits with the camera presets because it is the same kind
          of thing — how the desk is being looked at, not what the desk is.

          A menu rather than a toggle, and the reason is the point of the whole
          feature: the value of four rooms is being able to SEE them against one
          another, and a cycle button makes that a stroll through the set rather
          than a choice. 「关」 is an entry in the same list, not a separate
          switch, because off is one of the things you can pick. */}
      {model && viewMode === '3d' && (
        <div className="relative" ref={sceneRef}>
          <button
            data-scene-menu
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md
              transition-colors cursor-pointer
              ${sceneId
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
              }`}
            onClick={() => setSceneMenuOpen(!sceneMenuOpen)}
            title={t('scene.hint')}
          >
            {t('scene.label')}
            <span className="text-neutral-400">{sceneLabel(sceneId)}</span>
            <span className="text-neutral-600 text-[10px]">▼</span>
          </button>

          {sceneMenuOpen && (
            <div
              className="absolute top-full mt-1 right-0 w-60 bg-neutral-900 border border-neutral-700
              rounded-lg shadow-xl z-[100] overflow-hidden"
            >
              {SCENE_CHOICES.map((choice) => (
                <button
                  key={choice.id ?? 'off'}
                  data-scene={choice.id ?? 'off'}
                  className={`w-full px-3 py-2 text-left hover:bg-neutral-800
                    transition-colors cursor-pointer
                    ${choice.id === sceneId ? 'bg-neutral-800/60' : ''}`}
                  onClick={() => {
                    setSceneId(choice.id);
                    setSceneMenuOpen(false);
                  }}
                >
                  <div className={`text-sm ${choice.id === sceneId ? 'text-white' : 'text-neutral-300'}`}>
                    {sceneLabel(choice.id)}
                  </div>
                  <div className="text-neutral-500 text-xs mt-0.5">{t(choice.noteKey)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="w-px h-6 bg-neutral-800" />

      {/* DXF Import */}
      <label
        className="px-3 py-1.5 text-xs rounded-md text-neutral-400
          hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
        title={t('home.importDxfHint')}
      >
        📐 {t('home.importDxf')}
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
              alert(t('home.dxfImportFailed') + (err as Error).message);
            }
          }}
        />
      </label>
      {/* Export DXF */}
      <button
        className="px-3 py-1.5 text-xs rounded-md text-neutral-400
          hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
        title={t('home.exportDxfHint')}
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
      {/* Export BOM — opens the preview modal (CSV export lives inside) */}
      <button
        className="px-3 py-1.5 text-xs rounded-md text-neutral-400
          hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
        title={t('home.bomHint')}
        onClick={() => setShowBom(true)}
      >
        📋 BOM
      </button>
      {/* Clear DXF */}
      <button
        className="px-3 py-1.5 text-xs rounded-md text-neutral-500
          hover:text-neutral-300 hover:bg-neutral-900 transition-colors cursor-pointer"
        title={t('home.clearDxfHint')}
        onClick={() => useModelStore.getState().setDxfTabletop(null)}
      >
        ↺
      </button>
      </>
      }
    />
    {showBom && <BomPreviewModal onClose={() => setShowBom(false)} />}
    </>
  );
};

export default Toolbar;
