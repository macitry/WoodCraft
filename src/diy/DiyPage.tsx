import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DiyViewer from './DiyViewer';
import DiyProfileLibrary from '../components/DiyProfileLibrary';
import DiyPropertyPanel from './DiyPropertyPanel';
import { useDiyStore } from '../store/diyStore';
import { useModelStore } from '../store/modelStore';

const DiyPage: React.FC = () => {
  const navigate = useNavigate();
  const profiles = useDiyStore((s) => s.profiles);
  const brackets = useDiyStore((s) => s.brackets);
  const totalLength = profiles.reduce((sum, p) => sum + p.length, 0);
  const [projectName, setProjectName] = useState('未命名');

  return (
    <div className="w-screen h-screen flex flex-col bg-neutral-950 overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-12 px-4 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="px-2 py-1 text-xs rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          ← Home
        </button>
        <div className="w-px h-5 bg-neutral-700" />
        <span className="text-sm font-semibold text-white">
          DIY Builder
        </span>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="px-2 py-0.5 text-sm bg-transparent border border-neutral-700 rounded text-neutral-300 focus:border-wood-600 focus:outline-none w-36"
        />
        <div className="flex-1" />
        <span className="text-xs text-neutral-500">
          型材: {profiles.length} | 角码: {brackets.length} | 总长: {(totalLength / 1000).toFixed(1)}m
        </span>
        <button className="px-3 py-1 text-xs rounded bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer">
          Save
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — Profile Library */}
        <aside className="w-56 flex-shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-y-auto">
          <DiyProfileLibrary />
        </aside>

        {/* Center — 3D Viewer */}
        <main className="flex-1 relative">
          <DiyViewer />
          <DiyErrorOverlay />
        </main>

        {/* Right — Property Panel */}
        <aside className="w-64 flex-shrink-0 border-l border-neutral-800 bg-neutral-950 overflow-y-auto">
          <DiyPropertyPanel />
        </aside>
      </div>
    </div>
  );
};

const DiyErrorOverlay: React.FC = () => {
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

export default DiyPage;
