import { useState, useCallback, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import FurnitureViewer from '../viewer/FurnitureViewer';
import TabletopPlan from '../components/TabletopPlan';
import Toolbar from '../components/Toolbar';
import FurnitureTree from '../components/FurnitureTree';
import ParameterPanel from '../components/ParameterPanel';
import MaterialSelector from '../components/MaterialSelector';
import BracketEditor from '../components/BracketEditor';
import HolePropertiesPanel from '../components/HolePropertiesPanel';
import ModelInfo from '../components/ModelInfo';
import DiyPage from '../diy/DiyPage';
import KitEditorPage from '../kits/KitEditorPage';
import { useModelStore } from '../store/modelStore';
import type { ViewPreset } from '../types/furniture';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type ViewMode = '3d' | 'plan';

/** Uploaded boards are read from IndexedDB exactly once per session.
 *
 *  Module scope, not component state: `HomePage` unmounts on every route change
 *  (see the guard below) and `StrictMode` double-invokes effects in development,
 *  so a per-component flag would re-run the read on each of those. Re-running is
 *  not fatal — `registerBoard` hands back the descriptor it already made for an
 *  id, which is what keeps the object URLs from being revoked under the store's
 *  feet — but the read is a megabyte of blobs and there is no reason to do it
 *  four times. */
let boardsHydrated = false;

/** Main home page — template-based furniture configurator. */
const HomePage: React.FC = () => {
  const [viewPreset, setViewPreset] = useState<ViewPreset>('perspective');
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const loadModelFromApi = useModelStore((s) => s.loadModelFromApi);

  useEffect(() => {
    // Load once per session. HomePage unmounts on every route change, so without
    // this guard navigating away and back (e.g. to /kits) would re-fetch and have
    // `loadModelFromApi` replace `brackets` wholesale — discarding manually placed
    // brackets and changing the count every BOM quantity is derived from.
    // The Toolbar's template switcher calls loadModelFromApi directly when a
    // reload IS wanted; `isLoading` also nets StrictMode's double-invoke.
    const { model, isLoading } = useModelStore.getState();
    if (model || isLoading) return;
    loadModelFromApi();
  }, [loadModelFromApi]);

  useEffect(() => {
    if (boardsHydrated) return;
    boardsHydrated = true;
    // Never awaited and never able to reject: a browser that will not give us
    // IndexedDB costs the user their uploads and nothing else — this render
    // already happened with the built-in four boards.
    void useModelStore.getState().hydrateCustomBoards();
  }, []);

  const handleViewPreset = useCallback((preset: ViewPreset) => {
    setViewPreset(preset);
  }, []);

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const [_controls, setControls] = useState<OrbitControlsImpl | null>(null);
  const handleControlsReady = useCallback((controls: OrbitControlsImpl) => {
    setControls(controls);
  }, []);

  // Dev-only, same convention as `__wcDiyCamera` / `__wcKitEditorCamera`: this is
  // the third place the kit hardware is mounted, and its camera is the only one
  // that cannot be reached from a published scene (the other two publish theirs
  // straight out of `useThree`). Without it a headless test can count what is
  // mounted here but cannot look at it, and a direct camera write is undone every
  // frame by the damping controller — the handle is the only way to aim.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcMainControls?: unknown };
    w.__wcMainControls = _controls;
    return () => {
      delete w.__wcMainControls;
    };
  }, [_controls]);

  // When a hole is selected the right sidebar becomes its property editor
  // (selected state lives in the store so it survives plan↔3d switching).
  const editingHoleId = useModelStore((s) =>
    s.selectedHoleId && s.holes.some((h) => h.id === s.selectedHoleId)
      ? s.selectedHoleId
      : null,
  );

  return (
    <div className="w-screen h-screen flex flex-col bg-neutral-950 overflow-hidden">
      <Toolbar
        onViewPreset={handleViewPreset}
        currentPreset={viewPreset}
        viewMode={viewMode}
        onViewMode={handleViewMode}
      />

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 flex-shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-y-auto">
          <FurnitureTree />
        </aside>

        <main className="flex-1 relative">
          {viewMode === '3d' ? (
            <FurnitureViewer viewPreset={viewPreset} onControlsReady={handleControlsReady} />
          ) : (
            <TabletopPlan />
          )}
          <ErrorOverlay />
        </main>

        <aside className="w-72 flex-shrink-0 border-l border-neutral-800 bg-neutral-950 flex flex-col overflow-hidden">
          {editingHoleId ? (
            <HolePropertiesPanel />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <ParameterPanel />
                <div className="border-t border-neutral-800">
                  <MaterialSelector />
                </div>
              </div>
              <div className="border-t border-neutral-800 max-h-[30rem] overflow-y-auto">
                <BracketEditor />
              </div>
            </>
          )}
        </aside>
      </div>

      <ModelInfo />
    </div>
  );
};

const ErrorOverlay: React.FC = () => {
  const error = useModelStore((s) => s.error);
  const setError = useModelStore((s) => s.setError);
  if (!error) return null;
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-900/90 border border-red-700 text-red-200 text-sm shadow-lg backdrop-blur-sm">
        <span>⚠</span>
        <span>{error}</span>
        <button className="ml-2 text-red-400 hover:text-red-200 transition-colors cursor-pointer" onClick={() => setError(null)}>✕</button>
      </div>
    </div>
  );
};

/** Root app with routing. */
const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/diy" element={<DiyPage />} />
      <Route path="/kits" element={<KitEditorPage />} />
    </Routes>
  );
};

export default App;
