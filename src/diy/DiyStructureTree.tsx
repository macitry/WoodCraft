import { useMemo, useState } from 'react';
import { useDiyStore } from '../store/diyStore';
import type { DiyProfile } from '../types/furniture';

/**
 * Left-sidebar structure tree for the DIY builder.
 *
 * Shows the profile hierarchy (roots = parentId null, children nested) with
 * stable "型材-N" numbering from the per-profile `seq` (numbers never change
 * when profiles are deleted). Clicking a node selects the profile — the 3D
 * view highlights it and the right property panel shows its details, because
 * both read the shared selectedProfileId state. Brackets are intentionally not
 * part of the profile tree.
 */
const DiyStructureTree: React.FC = () => {
  const profiles = useDiyStore((s) => s.profiles);
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const selectProfile = useDiyStore((s) => s.selectProfile);

  // Parent-id → sorted children (by seq), plus the sorted root list.
  const { roots, childrenMap } = useMemo(() => {
    const byParent = new Map<string | null, DiyProfile[]>();
    for (const p of profiles) {
      const list = byParent.get(p.parentId) ?? [];
      list.push(p);
      byParent.set(p.parentId, list);
    }
    const bySeq = (a: DiyProfile, b: DiyProfile) => a.seq - b.seq;
    for (const list of byParent.values()) list.sort(bySeq);
    return { roots: (byParent.get(null) ?? []).sort(bySeq), childrenMap: byParent };
  }, [profiles]);

  // Collapsed parent ids (subtree expansion state, per-session only).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (p: DiyProfile, depth: number) => {
    const kids = childrenMap.get(p.id) ?? [];
    const isCollapsed = collapsed.has(p.id);
    const isSelected = selectedProfileId === p.id;
    return (
      <div key={p.id}>
        <div
          className={`flex items-center gap-1 pr-2 py-1 text-sm cursor-pointer transition-colors ${
            isSelected
              ? 'bg-wood-500/10 text-wood-300 border-r-2 border-wood-500'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/30'
          }`}
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => selectProfile(p.id)}
          title={`${p.profileSize}·${p.direction} · ${p.length}mm`}
        >
          {/* Collapse chevron — leaf nodes keep the slot for alignment */}
          <button
            className="w-3 flex-shrink-0 text-[9px] text-neutral-600 hover:text-neutral-300 transition-transform duration-200 cursor-pointer"
            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            onClick={(e) => {
              e.stopPropagation();
              if (kids.length > 0) toggleCollapsed(p.id);
            }}
          >
            {kids.length > 0 ? '▼' : ''}
          </button>
          <span className="truncate">型材-{p.seq}</span>
          <span className="text-[10px] text-neutral-600 flex-shrink-0">
            {p.profileSize}·{p.direction}
          </span>
          <span className="text-[10px] text-neutral-700 ml-auto flex-shrink-0">
            {p.length}mm
          </span>
        </div>
        {!isCollapsed && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col border-b border-neutral-800">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-neutral-800">
        <span className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          结构树
        </span>
        <span className="text-xs text-neutral-600">{profiles.length}</span>
      </div>
      {profiles.length === 0 ? (
        <div className="px-4 py-3 text-xs text-neutral-600">
          暂无型材 — 从下方型材库拖入
        </div>
      ) : (
        <div className="py-1">{roots.map((r) => renderNode(r, 0))}</div>
      )}
    </div>
  );
};

export default DiyStructureTree;
