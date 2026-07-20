import { useState, useCallback, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import FurnitureViewer from '../viewer/FurnitureViewer';
import TabletopPlan from '../components/TabletopPlan';
import Toolbar from '../components/Toolbar';
import FurnitureTree from '../components/FurnitureTree';
import ParameterPanel from '../components/ParameterPanel';
import MaterialSelector from '../components/MaterialSelector';
import BracketEditor from '../components/BracketEditor';
import ModelInfo from '../components/ModelInfo';
import DiyPage from '../diy/DiyPage';
import { useModelStore } from '../store/modelStore';
import type { ViewPreset } from '../types/furniture';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type ViewMode = '3d' | 'plan';

/** Main home page — template-based furniture configurator. */
const HomePage: React.FC = () => {
  const [viewPreset, setViewPreset] = useState<ViewPreset>('perspective');
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const loadModelFromApi = useModelStore((s) => s.loadModelFromApi);

  useEffect(() => {
    loadModelFromApi();
  }, [loadModelFromApi]);

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
          <div className="flex-1 overflow-y-auto">
            <ParameterPanel />
            <div className="border-t border-neutral-800">
              <MaterialSelector />
            </div>
          </div>
          <div className="border-t border-neutral-800 max-h-80 overflow-y-auto">
            <BracketEditor />
          </div>
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
    </Routes>
  );
};

export default App;
