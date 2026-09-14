import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DiyViewer from './DiyViewer';
import DiyProfileLibrary from '../components/DiyProfileLibrary';
import DiyPropertyPanel from './DiyPropertyPanel';
import DiyStructureTree from './DiyStructureTree';
import BracketEditModal from './BracketEditModal';
import { useDiyStore } from '../store/diyStore';
import { useModelStore } from '../store/modelStore';
import { bomToCsv, bomToText } from '../utils/bomExport';
import { computeDiyBom, diyOps, diyBomName } from '../utils/diyBom';
import { downloadFile } from '../utils/download';

const LEFT_W_KEY = 'diy.leftW';
const LEFT_W_DEFAULT = 300;
const LEFT_W_MIN = 240;
const LEFT_W_MAX = 440;
const clampLeftW = (v: number) => Math.min(LEFT_W_MAX, Math.max(LEFT_W_MIN, v));

const DiyPage: React.FC = () => {
  const navigate = useNavigate();
  const profiles = useDiyStore((s) => s.profiles);
  const brackets = useDiyStore((s) => s.brackets);
  const screws = useDiyStore((s) => s.screws);
  const totalLength = profiles.reduce((sum, p) => sum + p.length, 0);
  const mode = useDiyStore((s) => s.mode);
  const bracketFaceA = useDiyStore((s) => s.bracketFaceA);
  const startBracketFacePicking = useDiyStore((s) => s.startBracketFacePicking);
  const cancelBracketFacePicking = useDiyStore((s) => s.cancelBracketFacePicking);
  const isPickingFaces = mode === 'placing_bracket_faces';
  const [projectName, setProjectName] = useState('未命名');
  // Left column: only one panel at a time (结构树 | 元件库), resizable width.
  const [leftTab, setLeftTab] = useState<'structure' | 'library'>(
    profiles.length > 0 ? 'structure' : 'library',
  );
  const [leftW, setLeftW] = useState<number>(() => {
    const raw = Number(localStorage.getItem(LEFT_W_KEY));
    return Number.isFinite(raw) && raw > 0 ? clampLeftW(raw) : LEFT_W_DEFAULT;
  });
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(LEFT_W_KEY, String(leftW));
  }, [leftW]);

  useEffect(() => {
    document.body.style.cursor = resizing ? 'col-resize' : '';
    document.body.style.userSelect = resizing ? 'none' : '';
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing]);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    resizeRef.current = { x: e.clientX, w: leftW };
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
  };
  const onResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = resizeRef.current;
    if (!d) return;
    setLeftW(clampLeftW(d.w + e.clientX - d.x));
  };
  const endResize = () => {
    resizeRef.current = null;
    setResizing(false);
  };

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
          型材: {profiles.length} | 角码: {brackets.length} | 螺丝: {screws.length} | 总长: {(totalLength / 1000).toFixed(1)}m
        </span>
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
        <DiyExportButton />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — single panel (结构树 | 元件库), draggable width */}
        <aside
          className="relative flex flex-col flex-shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-950"
          style={{ width: leftW, userSelect: resizing ? 'none' : undefined }}
        >
          <div className="flex flex-shrink-0 border-b border-neutral-800 p-2 gap-1">
            {(['structure', 'library'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setLeftTab(t)}
                className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                  leftTab === t
                    ? 'bg-wood-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {t === 'structure' ? '结构树' : '元件库'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {leftTab === 'structure' ? <DiyStructureTree /> : <DiyProfileLibrary />}
          </div>
          {/* Width resize handle */}
          <div
            className="absolute inset-y-0 right-0 w-1.5 z-20 cursor-col-resize hover:bg-wood-500/40"
            onPointerDown={startResize}
            onPointerMove={onResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
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

/**
 * DIY parts-list export. Replaces the old dead "Save" button, which had no
 * handler at all — the free-form builder's one real export gap.
 *
 * Rows come from computeDiyBom and are written by the SAME csv/text writers the
 * main configurator uses, so the two modes' files have identical columns and a
 * trailing 加工要求 block.
 */
const DiyExportButton: React.FC = () => {
  const profiles = useDiyStore((s) => s.profiles);
  const brackets = useDiyStore((s) => s.brackets);
  const screws = useDiyStore((s) => s.screws);
  const kitInstances = useDiyStore((s) => s.kitInstances);
  const [open, setOpen] = useState(false);

  const rows = useMemo(
    () => computeDiyBom(profiles, brackets, screws, kitInstances),
    [profiles, brackets, screws, kitInstances],
  );
  const ops = useMemo(() => diyOps(kitInstances), [kitInstances]);

  const run = (kind: 'csv' | 'txt') => {
    const stem = diyBomName();
    if (kind === 'csv') {
      // U+FEFF so Excel reads the Chinese headers as UTF-8 (same as the main
      // configurator's export).
      downloadFile(`${stem}.csv`, `﻿${bomToCsv(rows, ops)}`, 'text/csv;charset=utf-8');
    } else {
      downloadFile(`${stem}.txt`, bomToText(rows, ops), 'text/plain;charset=utf-8');
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={rows.length === 0}
        className={`px-3 py-1 text-xs rounded transition-colors ${
          rows.length === 0
            ? 'bg-neutral-900 text-neutral-600 cursor-not-allowed'
            : 'bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer'
        }`}
        title={rows.length === 0 ? '暂无零件可导出' : `共 ${rows.length} 行`}
      >
        导出 BOM
      </button>
      {open && rows.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-40 py-1 rounded-md border border-neutral-700 bg-neutral-900 shadow-xl">
            <button
              onClick={() => run('csv')}
              className="w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              CSV（含加工要求）
            </button>
            <button
              onClick={() => run('txt')}
              className="w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              文本清单
            </button>
          </div>
        </>
      )}
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
