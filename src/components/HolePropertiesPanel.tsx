import { useEffect, useState } from 'react';
import type { TabletopHole, HolePatch, AxisAnchor } from '../types/furniture';
import {
  useModelStore,
  captureHoleSnapshot,
  commitHoleEdit,
} from '../store/modelStore';
import { anchorFromCoord, axisCoordFromAnchor } from '../utils/holeTemplates';

// ---------------------------------------------------------------------------
// Right-sidebar panel shown while a hole is selected (plan or 3d mode).
// Replaces the product-params stack; 完成 / clicking empty restores it.
// Numeric fields commit on Enter / blur — one undo step per commit.
//
// A template-inserted (managed) hole carries edge anchors on X/Y: instead of raw
// coordinates it is edited through per-axis anchor rules ("绝对不动 / 固定到边 /
// 等比例") that keep the hole glued to a board edge while the tabletop is resized.
// ---------------------------------------------------------------------------

const SHAPE_LABEL: Record<TabletopHole['type'], string> = {
  circle: '圆孔',
  rect: '方孔 · 圆角',
  slot: '腰孔',
};

const SHAPE_DESC: Record<TabletopHole['type'], string> = {
  circle: '直径可调，无需角度',
  rect: '圆角半径 0 = 直角方孔',
  slot: '两端半圆，长度 ≥ 宽度',
};

interface FieldMeta {
  key: string;
  label: string;
  min: number;
  step: number;
  hint?: string;
}

const SHAPE_FIELDS: Record<TabletopHole['type'], FieldMeta[]> = {
  circle: [{ key: 'radius', label: '半径', min: 5, step: 1 }],
  rect: [
    { key: 'width', label: '宽', min: 5, step: 1 },
    { key: 'height', label: '高', min: 5, step: 1 },
    { key: 'cornerRadius', label: '圆角半径', min: 0, step: 1, hint: '0 = 直角' },
  ],
  slot: [
    { key: 'length', label: '长', min: 10, step: 1 },
    { key: 'width', label: '宽', min: 5, step: 1 },
  ],
};

/** Round-trip numbers to a friendly display (0.1 mm precision). */
const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

/** One labelled numeric input; commits on Enter/blur, resyncs on external change. */
const NumField: React.FC<{
  label: string;
  value: number;
  min: number;
  step: number;
  hint?: string;
  onCommit: (v: number) => void;
}> = ({ label, value, min, step, hint, onCommit }) => {
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    setText(fmt(value));
  }, [value]);

  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && v !== value) onCommit(v);
    else setText(fmt(value));
  };

  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] text-neutral-400">{label}</span>
        {hint && <span className="text-[9px] text-neutral-600">{hint}</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmt(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-full mt-0.5 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200
          focus:border-wood-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none"
      />
    </label>
  );
};

// ---------------------------------------------------------------------------
// Per-axis edge-anchor editor (only shown for anchored / template holes).
// ---------------------------------------------------------------------------

type AxisKey = 'x' | 'y';

const AXIS_LABEL: Record<AxisKey, string> = { x: 'X · 宽方向', y: 'Y · 深方向' };
const coordKeyFor = (ax: AxisKey): 'x' | 'y' => ax;
const anchorKeyFor = (ax: AxisKey): 'anchorX' | 'anchorY' => (ax === 'x' ? 'anchorX' : 'anchorY');
const edgeLabel = (ax: AxisKey, sign: -1 | 1) =>
  ax === 'x' ? (sign > 0 ? '右沿' : '左沿') : sign > 0 ? '前沿' : '后沿';
const clampCoord = (v: number, half: number) => Math.max(-half, Math.min(half, v));

/** Anchor of a chosen mode for a coordinate. A centre coord has no nearer edge
 *  (would collapse to abs) — pin it to the +edge at a full half offset so it
 *  still reads as centred until the board actually resizes. */
function anchorForMode(c: number, half: number, full: number, mode: 'mm' | 'pct'): AxisAnchor {
  const from = anchorFromCoord(c, half, full, mode);
  if (from.mode !== 'abs') return from;
  return mode === 'mm'
    ? { mode: 'mm', sign: 1, value: half }
    : { mode: 'pct', sign: 1, value: 0.5 };
}

const AxisAnchorEditor: React.FC<{
  axis: AxisKey;
  anchor: AxisAnchor;
  coord: number;
  half: number;
  full: number;
  onPatch: (patch: HolePatch) => void;
}> = ({ axis, anchor, coord, half, full, onPatch }) => {
  const aKey = anchorKeyFor(axis);
  const cKey = coordKeyFor(axis);
  const mode = anchor.mode;
  const refEdge = mode === 'abs' ? null : edgeLabel(axis, anchor.sign);
  const isPct = mode === 'pct';
  // mm/pct show the offset; abs shows the raw coordinate (no rule to carry).
  const displayValue = mode === 'abs' ? coord : isPct ? anchor.value * 100 : anchor.value;

  const chooseMode = (m: AxisAnchor['mode']) => {
    if (m === mode) return;
    if (m === 'abs') {
      onPatch({ [aKey]: { mode: 'abs' } } as HolePatch); // keeps current spot, stops tracking
      return;
    }
    // Convert in place — the hole does not move until the next board resize.
    onPatch({ [aKey]: anchorForMode(coord, half, full, m) } as HolePatch);
  };

  const commit = (raw: number) => {
    if (mode === 'abs') {
      // Editing the fixed coordinate of an abs axis.
      onPatch({ [cKey]: clampCoord(raw, half) } as HolePatch);
      return;
    }
    // Editing the mm / % offset → move the hole to the new distance right now.
    const next: AxisAnchor =
      mode === 'mm'
        ? { mode: 'mm', sign: anchor.sign, value: Math.max(0, raw) }
        : { mode: 'pct', sign: anchor.sign, value: Math.max(0, raw / 100) };
    const nc = axisCoordFromAnchor(next, coord, half, full);
    onPatch({ [cKey]: nc, [aKey]: next } as HolePatch);
  };

  const coordReadout = `当前 ${axis.toUpperCase()}${coord >= 0 ? '+' : ''}${Math.round(coord)}mm`;

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-2 space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-neutral-300">{AXIS_LABEL[axis]}</span>
        <span className="text-[9px] text-neutral-500">{mode === 'abs' ? '固定坐标' : `参考 ${refEdge}（自动最近边）`}</span>
      </div>
      <div className="flex items-center gap-1">
        {(['abs', 'mm', 'pct'] as const).map((m) => (
          <button
            key={m}
            onClick={() => chooseMode(m)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
              mode === m ? 'bg-wood-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            {m === 'abs' ? '不动' : m === 'mm' ? '固定' : '比例'}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-neutral-600 font-mono">{coordReadout}</span>
      </div>
      <NumField
        label={
          mode === 'abs'
            ? `坐标 ${axis.toUpperCase()} (mm)`
            : isPct
              ? `距${refEdge} 比例 (%)`
              : `距${refEdge} (mm)`
        }
        value={displayValue}
        min={mode === 'abs' ? -half : 0}
        step={isPct ? 0.1 : 1}
        onCommit={commit}
      />
      <p className="text-[9px] text-neutral-600 leading-snug">
        {mode === 'abs'
          ? '改桌板尺寸时该轴保持此坐标不动。'
          : `改桌板尺寸时孔心与${refEdge}的距离固定为${isPct ? `${Math.round(displayValue * 10) / 10}%` : `${Math.round(displayValue)}mm`}。`}
        {'拖动或按方向键后会自动吸附到最近边。'}
      </p>
    </div>
  );
};

const HolePropertiesPanel: React.FC = () => {
  const hole = useModelStore((s) => s.holes.find((h) => h.id === s.selectedHoleId));
  const currentParams = useModelStore((s) => s.currentParams);
  const updateHole = useModelStore((s) => s.updateHole);
  const removeHole = useModelStore((s) => s.removeHole);
  const duplicateHole = useModelStore((s) => s.duplicateHole);
  const selectHole = useModelStore((s) => s.selectHole);

  if (!hole) return null;

  const halfW = currentParams.width / 2;
  const halfD = currentParams.depth / 2;
  const width = currentParams.width;
  const depth = currentParams.depth;
  const valueOf = (key: string) =>
    (hole as unknown as Record<string, number | undefined>)[key] ?? 0;
  const managed = !!(hole.anchorX || hole.anchorY);

  const applyPatch = (patch: HolePatch) => {
    const before = captureHoleSnapshot();
    updateHole(hole.id, patch);
    commitHoleEdit(before);
  };

  const commitField = (key: string, min: number) => (raw: number) => {
    let v = Math.max(min, raw);
    if (key === 'x') v = Math.min(halfW, Math.max(-halfW, v));
    if (key === 'y') v = Math.min(halfD, Math.max(-halfD, v));
    applyPatch({ [key]: v } as HolePatch);
  };

  const remove = () => {
    const before = captureHoleSnapshot();
    removeHole(hole.id);
    commitHoleEdit(before);
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Banner explaining why the product params are hidden */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20">
        <span className="flex-1 text-[11px] text-amber-200/90">正在编辑孔洞</span>
        <button
          onClick={() => selectHole(null)}
          className="px-2 py-0.5 rounded text-[11px] bg-wood-600 text-white hover:bg-wood-500 transition-colors cursor-pointer"
        >
          完成
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
            开孔属性
          </h3>
          <span className="text-[10px] text-wood-300 font-medium">{SHAPE_LABEL[hole.type]}</span>
        </div>
        <p className="text-[10px] text-neutral-600 mt-0.5">{SHAPE_DESC[hole.type]}</p>
      </div>

      {managed ? (
        <>
          <div className="px-3 pb-3 border-b border-neutral-800">
            <div className="text-[11px] text-neutral-400 mb-1.5">边缘锚定 · 随桌板尺寸</div>
            <div className="grid grid-cols-2 gap-2">
              <AxisAnchorEditor
                axis="x"
                anchor={hole.anchorX ?? { mode: 'abs' }}
                coord={hole.x}
                half={halfW}
                full={width}
                onPatch={applyPatch}
              />
              <AxisAnchorEditor
                axis="y"
                anchor={hole.anchorY ?? { mode: 'abs' }}
                coord={hole.y}
                half={halfD}
                full={depth}
                onPatch={applyPatch}
              />
            </div>
          </div>

          <div className="px-3 pb-3 border-b border-neutral-800 pt-3">
            <div className="text-[11px] text-neutral-400 mb-1.5">尺寸</div>
            <div className="grid grid-cols-2 gap-2">
              {SHAPE_FIELDS[hole.type].map((f) => (
                <NumField
                  key={f.key}
                  label={f.label}
                  value={valueOf(f.key)}
                  min={f.min}
                  step={f.step}
                  hint={f.hint}
                  onCommit={commitField(f.key, f.min)}
                />
              ))}
              {hole.type !== 'circle' && (
                <NumField label="角度 °" value={valueOf('angle')} min={-360} step={15} onCommit={commitField('angle', -360)} />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="px-3 pb-2 grid grid-cols-2 gap-2">
            <NumField label="X" value={valueOf('x')} min={-halfW} step={1} onCommit={commitField('x', -halfW)} />
            <NumField label="Y" value={valueOf('y')} min={-halfD} step={1} onCommit={commitField('y', -halfD)} />
            {hole.type !== 'circle' && (
              <NumField label="角度 °" value={valueOf('angle')} min={-360} step={15} onCommit={commitField('angle', -360)} />
            )}
          </div>

          <div className="px-3 pb-3 border-b border-neutral-800">
            <div className="text-[11px] text-neutral-400 mb-1.5">尺寸</div>
            <div className="grid grid-cols-2 gap-2">
              {SHAPE_FIELDS[hole.type].map((f) => (
                <NumField
                  key={f.key}
                  label={f.label}
                  value={valueOf(f.key)}
                  min={f.min}
                  step={f.step}
                  hint={f.hint}
                  onCommit={commitField(f.key, f.min)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="px-3 py-2 space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => duplicateHole(hole.id)}
            className="px-2 py-1.5 rounded text-xs bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            ⧉ 复制
          </button>
          <button
            onClick={remove}
            className="px-2 py-1.5 rounded text-xs bg-red-900/60 text-red-200 hover:bg-red-800/70 transition-colors cursor-pointer"
          >
            删除
          </button>
        </div>
        <p className="text-[10px] text-neutral-600 pt-1 leading-relaxed">
          {managed
            ? '输入后按 Enter / 失焦即应用（计入一步撤销）。'
            : '输入后按 Enter / 失焦即应用（计入一步撤销）。'}
          <br />
          面板外点空白或按 Esc 也可返回产品参数。
        </p>
      </div>
    </div>
  );
};

export default HolePropertiesPanel;
