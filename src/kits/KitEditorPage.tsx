import { useEffect, useMemo, type FC } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import KitEditorScene from './KitEditorScene';
import PartPropertyPanel from './PartPropertyPanel';
import { ACCESSORY_KITS, accessoryKitById, jointFasteners } from '../utils/accessoryKits';
import type { LocalFastener } from '../utils/accessoryKits';
import { connectorByStlUrl } from '../diy/connectors';
import { DEFAULT_BRACKET_STL_URL } from '../types/furniture';
import { kitLayoutKey, useKitLayoutStore } from '../store/kitLayoutStore';

/** Kits that produce per-joint geometry, and so have parts to move. */
const JOINT_KITS = ACCESSORY_KITS.filter((k) => k.scope === 'joint');

/** `已微调` is per PART, not per kit: only the touched pieces carry a badge. */
const isEdited = (f: LocalFastener, removed: boolean): boolean =>
  f.added === true || removed;

/**
 * Per-part fine tuning for an accessory kit — a full page rather than a modal,
 * because it is a 3D editing surface with a parts list beside it.
 *
 * Scope: the edits belong to the KIT'S DEFINITION, keyed by the connector's hole
 * pattern, so every joint in either mode follows at once. The page previews at
 * the identity scale (a connector rendered at `size = extMm`), so the numbers in
 * the panel are the catalog numbers — no conversion anywhere.
 *
 * Reached as `/kits?kit=<id>&stl=<connector stl>`; the connector scopes which
 * layout is being edited.
 */
const KitEditorPage: FC = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();

  // A frame-scope kit (桌板固定) budgets screws for a whole tabletop and derives
  // no geometry at all, so there is nothing here to move. Refuse it and say so
  // rather than opening a page that can never show a part.
  const requested = accessoryKitById(search.get('kit'));
  const refusedFrame = requested !== null && requested.scope !== 'joint';
  const kit = requested && requested.scope === 'joint' ? requested : JOINT_KITS[0];

  const requestedStl = search.get('stl');
  const stlUrl = requestedStl || DEFAULT_BRACKET_STL_URL;
  const cc = connectorByStlUrl(stlUrl);

  const setEditingKey = useKitLayoutStore((s) => s.setEditingKey);
  const selectPart = useKitLayoutStore((s) => s.selectPart);
  const selectedPartKey = useKitLayoutStore((s) => s.selectedPartKey);
  const resetKit = useKitLayoutStore((s) => s.resetKit);

  const setKey = kitLayoutKey(kit.id, cc.stlUrl);
  // Subscribed to the stored reference (or the null primitive) — building an
  // object here would loop React 18's useSyncExternalStore.
  const layout = useKitLayoutStore((s) => s.layouts[setKey] ?? null);

  useEffect(() => {
    setEditingKey(setKey);
  }, [setKey, setEditingKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape backs out one step at a time: drop the selection, then leave.
      if (useKitLayoutStore.getState().selectedPartKey) selectPart(null);
      else navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, selectPart]);

  const fasteners = useMemo(
    () => jointFasteners(kit, cc.stlUrl, 1, layout),
    [kit, cc.stlUrl, layout],
  );
  // The SAME derivation with no layout: where each seat sits and what it carries
  // before any edit. The panel needs both, because every stored value is a delta
  // against this — and a hand-added part has no seat here at all, which is
  // exactly how the panel tells the two kinds apart.
  const presets = useMemo(() => jointFasteners(kit, cc.stlUrl, 1, null), [kit, cc.stlUrl]);
  const baseByKey = useMemo(
    () => new Map(presets.map((f) => [f.key, [...f.position] as [number, number, number]])),
    [presets],
  );
  const baseSpecByKey = useMemo(() => new Map(presets.map((f) => [f.key, f.spec])), [presets]);
  const edits = layout?.parts ?? {};

  // The list and the 3D draw DIFFERENT sets, on purpose. `jointFasteners` drops a
  // hidden part outright (that is what keeps 3D === CSV), so listing its own
  // output would make a hidden part unreachable — gone from the list, gone from
  // the panel, and no way back short of `恢复整套默认`. The list is therefore the
  // union: every seat that CAN carry a part, plus whatever was added by hand.
  const drawnByKey = useMemo(() => new Map(fasteners.map((f) => [f.key, f])), [fasteners]);
  const listRows = useMemo(() => {
    const rows = presets.map((f) => drawnByKey.get(f.key) ?? f);
    for (const f of fasteners) if (f.added) rows.push(f);
    return rows;
  }, [presets, fasteners, drawnByKey]);
  const hiddenCount = listRows.length - fasteners.length;
  const panelPart = listRows.find((f) => f.key === selectedPartKey);

  return (
    <div className="w-screen h-screen flex flex-col bg-neutral-950 overflow-hidden">
      {/* Header */}
      <div className="h-12 px-4 flex items-center gap-3 border-b border-neutral-800 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="px-2 py-1 text-xs rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          ← Home
        </button>
        <div className="w-px h-5 bg-neutral-700" />
        <span className="text-sm font-semibold text-white">配件微调</span>
        <span className="text-xs text-neutral-500">{kit.name}</span>
        <div className="flex-1" />
        <span className="text-xs text-neutral-500 tabular-nums">
          共 {fasteners.length} 件 · 3D / 清单 / 导出同源
          {hiddenCount > 0 && <span className="text-amber-500/80"> · 另有 {hiddenCount} 件已隐藏</span>}
        </span>
        <button
          onClick={() => resetKit(setKey)}
          disabled={layout === null}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            layout === null
              ? 'bg-neutral-900 text-neutral-600 cursor-not-allowed'
              : 'bg-neutral-800 text-neutral-300 hover:text-white cursor-pointer'
          }`}
          title={layout === null ? '这套组合尚未改动' : '清除本组合的全部微调，回到预设'}
        >
          恢复整套默认
        </button>
      </div>

      {refusedFrame && (
        <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-600/40 text-[11px] text-amber-300">
          「{requested?.name}」按整块桌板计价，不产生可放置的零件 —— 已切换到可微调的组合。
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left — kit + parts */}
        <aside className="w-72 flex-shrink-0 flex flex-col border-r border-neutral-800 overflow-hidden">
          <div className="p-3 border-b border-neutral-800">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">配件组合</p>
            <div className="mt-2 space-y-1">
              {JOINT_KITS.map((k) => (
                <button
                  key={k.id}
                  data-kit={k.id}
                  onClick={() => navigate(`/kits?kit=${k.id}&stl=${encodeURIComponent(cc.stlUrl)}`)}
                  className={`w-full px-2 py-1.5 text-left text-xs rounded border transition-colors cursor-pointer ${
                    k.id === kit.id
                      ? 'border-wood-600 bg-wood-500/15 text-wood-200'
                      : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <span className="block font-medium">{k.name}</span>
                  <span className="block text-[10px] text-neutral-500 mt-0.5">{k.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 py-2 border-b border-neutral-800">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">连接件</p>
            <p className="text-[11px] text-neutral-300 mt-1">
              {cc.label} · {cc.dim}
            </p>
            <p className="text-[10px] text-neutral-600 mt-0.5 leading-snug">
              微调按「孔位表」区分，孔位表由连接件尺寸决定 —— 尺寸相同的连接件共用同一份微调。
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
              零件 <span className="text-neutral-600 normal-case">（{listRows.length}）</span>
            </p>
            <div className="mt-2 space-y-0.5">
              {listRows.map((f) => {
                const edit = edits[f.key];
                const removed = edit?.removed === true;
                const on = f.key === selectedPartKey;
                return (
                  <button
                    key={f.key}
                    data-part={f.key}
                    data-hidden={removed ? 'true' : undefined}
                    onClick={() => selectPart(on ? null : f.key)}
                    className={`w-full px-2 py-1 text-left text-[11px] rounded border transition-colors cursor-pointer ${
                      on
                        ? 'border-wood-600 bg-wood-500/15 text-wood-100'
                        : removed
                          ? 'border-neutral-800 text-neutral-600 line-through'
                          : 'border-transparent text-neutral-300 hover:border-neutral-700'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span className="truncate">{f.spec.name}</span>
                      {(isEdited(f, removed) || removed) && (
                        <span className="ml-auto flex-shrink-0 text-[9px] text-amber-500/90">
                          {removed ? '已隐藏' : '已微调'}
                        </span>
                      )}
                    </span>
                    <span className="block text-[9px] text-neutral-600 tabular-nums">
                      {f.position.map((v) => v.toFixed(1)).join(', ')} mm
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center — 3D */}
        <main className="flex-1 relative">
          <KitEditorScene
            kit={kit}
            stlUrl={cc.stlUrl}
            layout={layout}
            selectedPartKey={selectedPartKey}
            onSelect={selectPart}
            baseByKey={baseByKey}
            setKey={setKey}
          />
          <div className="absolute top-3 left-3 pointer-events-none px-3 py-2 rounded-lg bg-black/55 backdrop-blur-sm text-[10px] text-neutral-400 leading-relaxed">
            <p>拖动旋转 · 滚轮缩放 · 右键平移</p>
            <p>点选零件可在右侧查看</p>
            <p className="text-neutral-500 mt-0.5">Esc 取消选中，再按返回</p>
          </div>
        </main>

        {/* Right — the selected part */}
        <aside className="w-64 flex-shrink-0 border-l border-neutral-800 overflow-y-auto p-3">
          {(() => {
            const fastener = panelPart;
            if (!fastener) {
              return (
                <p className="text-[11px] text-neutral-600 leading-snug">
                  未选中零件。点 3D 中的一颗，或左侧清单里的一行。
                </p>
              );
            }
            const extra = layout?.extra.find((e) => `extra:${e.id}` === fastener.key);
            return (
              <PartPropertyPanel
                // Remounted whenever the part or its drawn value changes, which is
                // what reseeds the number drafts: typing is unaffected (the store
                // only moves on blur/Enter), but a DRAG lands in the boxes.
                key={`${fastener.key}|${fastener.position.join(',')}|${fastener.spec.name}`}
                setKey={setKey}
                fastener={fastener}
                base={baseByKey.get(fastener.key) ?? [0, 0, 0]}
                baseSpec={baseSpecByKey.get(fastener.key) ?? fastener.spec}
                edit={edits[fastener.key]}
                extra={extra}
              />
            );
          })()}
        </aside>
      </div>
    </div>
  );
};

export default KitEditorPage;
