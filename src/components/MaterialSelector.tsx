import { useState } from 'react';
import { mockMaterials } from '../mock/exampleModel';
import type { FC } from 'react';

/**
 * Material palette with category tabs.
 *
 * Each category (wood, metal, etc.) is a tab. Click a tab to show
 * only that category's materials as selectable swatches.
 */
const MaterialSelector: FC = () => {
  // Group by category
  const groups = new Map<string, typeof mockMaterials>();
  for (const m of mockMaterials) {
    if (!groups.has(m.category)) groups.set(m.category, []);
    groups.get(m.category)!.push(m);
  }
  const categories = Array.from(groups.keys()).sort();

  const [activeTab, setActiveTab] = useState(categories[0]);

  const categoryLabels: Record<string, string> = {
    wood: 'Wood',
    metal: 'Metal',
  };

  return (
    <div className="p-4">
      <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-2">
        Materials
      </p>

      {/* Tabs */}
      <div className="flex border-b border-neutral-700 mb-3">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer
              ${activeTab === cat
                ? 'text-wood-300 border-b-2 border-wood-500 -mb-px'
                : 'text-neutral-500 hover:text-neutral-300 border-b-2 border-transparent'
              }`}
            onClick={() => setActiveTab(cat)}
          >
            {categoryLabels[cat] || cat}
            <span className="ml-1.5 text-[10px] text-neutral-600">
              {groups.get(cat)?.length ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="max-h-48 overflow-y-auto space-y-1.5">
        {(groups.get(activeTab) || []).map((mat) => (
          <button
            key={mat.id}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md
              border border-neutral-800 hover:border-neutral-600
              transition-colors cursor-pointer text-left"
          >
            <div
              className="w-6 h-6 rounded-md border border-neutral-700 flex-shrink-0"
              style={{ backgroundColor: mat.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-neutral-300 truncate">{mat.name}</div>
              {mat.density && (
                <div className="text-[10px] text-neutral-600">
                  {mat.density.toLocaleString()} kg/m³
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MaterialSelector;
