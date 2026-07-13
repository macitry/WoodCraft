import {
  useState,
  type FC,
} from 'react';
import { useModelStore } from '../store/modelStore';
import type { Component } from '../types/furniture';

/**
 * Left-side panel showing the furniture component tree.
 *
 * Displays a hierarchical view of all parts:
 *   ├── 桌面 (Tabletop)
 *   ├── 左前腿 (Front Left Leg)
 *   ├── 右前腿 (Front Right Leg)
 *   └── ...
 *
 * Parts can be clicked to select them (highlights in 3D viewer)
 * and toggled for visibility.
 */
const FurnitureTree: FC = () => {
  const model = useModelStore((s) => s.model);
  const selectedComponentId = useModelStore((s) => s.selectedComponentId);
  const selectComponent = useModelStore((s) => s.selectComponent);
  const setComponentVisibility = useModelStore((s) => s.setComponentVisibility);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  if (!model) {
    return (
      <div className="p-4 text-neutral-500 text-sm">
        <p className="text-xs uppercase tracking-wider text-neutral-600 mb-3">
          Components
        </p>
        <p>No model loaded.</p>
      </div>
    );
  }

  // Group parts by type
  const groups = new Map<string, Component[]>();
  for (const c of model.components) {
    const type = c.partType || 'other';
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(c);
  }

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  const groupLabels: Record<string, string> = {
    tabletop: '桌面 (Tabletop)',
    leg: '桌腿 (Legs)',
    beam: '横梁 (Beams)',
    shelf: '搁板 (Shelves)',
  };

  const typeIcons: Record<string, string> = {
    tabletop: '▣',
    leg: '▯',
    beam: '━',
    shelf: '▬',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Components
        </p>
        <h3 className="text-sm font-medium text-white mt-0.5 truncate">
          {model.name}
        </h3>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2">
        {Array.from(groups.entries()).map(([groupType, parts]) => {
          const isCollapsed = collapsedGroups[groupType] || false;
          return (
            <div key={groupType}>
              {/* Group header */}
              <button
                className="w-full flex items-center gap-2 px-4 py-1.5 text-sm
                  text-neutral-400 hover:text-white hover:bg-neutral-800/50
                  transition-colors cursor-pointer"
                onClick={() => toggleGroup(groupType)}
              >
                <span className="text-[10px] transition-transform duration-200"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                >
                  ▼
                </span>
                <span className="text-xs">{typeIcons[groupType] || '●'}</span>
                <span className="text-neutral-300">
                  {groupLabels[groupType] || groupType}
                </span>
                <span className="text-neutral-600 text-xs ml-auto">
                  {parts.length}
                </span>
              </button>

              {/* Part items */}
              {!isCollapsed &&
                parts.map((part) => {
                  const isSelected = selectedComponentId === part.id;
                  return (
                    <button
                      key={part.id}
                      className={`w-full flex items-center gap-3 pl-10 pr-4 py-1.5 text-sm
                        transition-colors cursor-pointer
                        ${isSelected
                          ? 'bg-wood-500/10 text-wood-300 border-r-2 border-wood-500'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-800/30'
                        }`}
                      onClick={() =>
                        selectComponent(
                          isSelected ? null : part.id,
                        )
                      }
                    >
                      {/* Visibility toggle */}
                      <span
                        className="text-xs cursor-pointer hover:opacity-80"
                        onClick={(e) => {
                          e.stopPropagation();
                          setComponentVisibility(part.id, !part.visible);
                        }}
                        title={part.visible ? 'Hide' : 'Show'}
                      >
                        {part.visible ? '👁' : '👁‍🗨'}
                      </span>

                      <span className="truncate">{part.name}</span>

                      {part.material && (
                        <span className="text-[10px] text-neutral-600 ml-auto">
                          {part.material}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FurnitureTree;
