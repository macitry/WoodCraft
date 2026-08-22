import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DiyViewer from './DiyViewer';
import DiyProfileLibrary from '../components/DiyProfileLibrary';
import DiyPropertyPanel from './DiyPropertyPanel';
import DiyStructureTree from './DiyStructureTree';
import BracketEditModal from './BracketEditModal';
import { useDiyStore } from '../store/diyStore';
import { useModelStore } from '../store/modelStore';

const DiyPage: React.FC = () => {
  const navigate = useNavigate();
  const profiles = useDiyStore((s) => s.profiles);
  const brackets = useDiyStore((s) => s.brackets);
  const totalLength = profiles.reduce((sum, p) => sum + p.length, 0);
  const mode = useDiyStore((s) => s.mode);
  const bracketFaceA = useDiyStore((s) => s.bracketFaceA);
  const startBracketFacePicking = useDiyStore((s) => s.startBracketFacePicking);
  const cancelBracketFacePicking = useDiyStore((s) => s.cancelBracketFacePicking);
  const isPickingFaces = mode === 'placing_bracket_faces';
  const [projectName, setProjectName] = useState('未命名');
  const [showTree, setShowTree] = useState(true);

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
        <button
          onClick={() => setShowTree((v) => !v)}
          className={`px-3 py-1 text-xs rounded transition-colors cursor-pointer ${
            showTree
              ? 'bg-wood-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:text-white'
          }`}
          title="显示/隐藏左侧结构树"
        >
          结构树
        </button>
        <button
          onClick={() => (isPickingFaces ? cancelBracketFacePicking() : startBracketFacePicking())}
          className={`px-3 py-1 text-xs rounded transition-colors cursor-pointer ${
            isPickingFaces
              ? 'bg-amber-500 text-black'
              : 'bg-neutral-800 text-neutral-400 hover:text-white'
          }`}
          title="依次点选两个相互垂直的型材面来放置角码(或双击任意型材面直接开始)"
        >
          角码 · 两面对齐
        </button>
        <button className="px-3 py-1 text-xs rounded bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer">
          Save
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — Structure tree + Profile Library */}
        <aside className="w-56 flex-shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-y-auto">
          {showTree && <DiyStructureTree />}
          <DiyProfileLibrary />
        </aside>

        {/* Center — 3D Viewer */}
        <main className="flex-1 relative">
          <DiyViewer />
          <DiyErrorOverlay />
          {isPickingFaces && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="px-4 py-2 rounded-lg bg-amber-500/90 text-black text-sm font-medium shadow-lg">
                {bracketFaceA
                  ? '已选第 1 面(绿色标记) — 再点选第 2 个垂直的型材面 · Esc 取消'
                  : '点选第 1 个角码安装面(或双击任意型材面直接开始) · Esc 取消'}
              </div>
            </div>
          )}
        </main>

        {/* Right — Property Panel */}
        <aside className="w-64 flex-shrink-0 border-l border-neutral-800 bg-neutral-950 overflow-y-auto">
          <DiyPropertyPanel />
        </aside>
      </div>
      <BracketEditModal />
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
