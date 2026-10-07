import { useMemo, useState } from 'react';
import { useDiyStore } from '../store/diyStore';
import type { DiyProfile } from '../types/furniture';
import { accessoryKitById } from '../utils/accessoryKits';
import { useT } from '../i18n';
import { kitName } from '../i18n/names';

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
  const t = useT();
  const profiles = useDiyStore((s) => s.profiles);
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const selectProfile = useDiyStore((s) => s.selectProfile);
  const kitInstances = useDiyStore((s) => s.kitInstances);
  const selectedKitId = useDiyStore((s) => s.selectedKitId);
  const selectKit = useDiyStore((s) => s.selectKit);
  const removeKitInstance = useDiyStore((s) => s.removeKitInstance);
  const brackets = useDiyStore((s) => s.brackets);

  // 角码-N uses the bracket's index in the append-only array — the same
  // numbering the user sees nowhere else, which is exactly why it is written
  // down here rather than derived from the kit.
  const kitRows = useMemo(() => {
    const idx = new Map(brackets.map((b, i) => [b.id, i + 1]));
    return kitInstances.map((k) => {
      const kit = accessoryKitById(k.kitId);
      return {
        id: k.id,
        bracketId: k.bracketId,
        label: t('diy.kitRow', { n: idx.get(k.bracketId) ?? '?' }),
        name: kit ? kitName(kit) : k.kitId,
      };
    });
    // `t` is a dependency so the row text follows a language flip — the lookup
    // helpers read the live language rather than a value captured in the memo.
  }, [kitInstances, brackets, t]);

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
          <span className="truncate">{t('diy.profileRow', { n: p.seq })}</span>
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
    <div className="flex flex-col h-full">
      {profiles.length === 0 ? (
        <div className="px-4 py-3 text-xs text-neutral-600">
          {t('diy.noProfiles')}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {roots.map((r) => renderNode(r, 0))}
        </div>
      )}

      {/* 组合 — a PARALLEL section, deliberately not folded into the profile
          hierarchy: a kit belongs to a corner joint, not to a profile. */}
      {kitRows.length > 0 && (
        <div className="flex-shrink-0 max-h-56 overflow-y-auto border-t border-neutral-800 py-1">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-neutral-600">
            {t('diy.kitsSection')}
          </div>
          {kitRows.map(({ id, bracketId, label, name }) => (
            <div
              key={id}
              data-diy-kit-row={id}
              className={`flex items-center gap-1 pr-2 py-1 text-sm cursor-pointer transition-colors ${
                selectedKitId === id
                  ? 'bg-wood-500/10 text-wood-300 border-r-2 border-wood-500'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/30'
              }`}
              style={{ paddingLeft: 20 }}
              onClick={() => selectKit(id)}
              title={name}
            >
              <span className="truncate">{label}</span>
              <span className="text-[10px] text-neutral-600 truncate flex-shrink">
                {name}
              </span>
              <button
                className="ml-auto flex-shrink-0 text-[11px] text-neutral-600 hover:text-red-400 transition-colors cursor-pointer"
                title={t('diy.deleteKit')}
                onClick={(e) => {
                  e.stopPropagation();
                  removeKitInstance(id);
                }}
              >
                ✕
              </button>
              {/* bracketId is the binding target — kept in the DOM so the E2E can
                  assert the instance still points at a live bracket. */}
              <span className="hidden" data-diy-kit-bracket={bracketId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DiyStructureTree;
