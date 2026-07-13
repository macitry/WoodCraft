import { mockMaterials } from '../mock/exampleModel';
import type { FC } from 'react';

/**
 * Material preview palette for future use.
 *
 * Displays available materials (oak, walnut, plywood, aluminum, etc.)
 * as selectable swatches with name, density, and color preview.
 *
 * Currently read-only — material application to parts will be
 * integrated with the backend model generation pipeline.
 */
const MaterialSelector: FC = () => {
  const groups = new Map<string, typeof mockMaterials>();
  for (const m of mockMaterials) {
    if (!groups.has(m.category)) groups.set(m.category, []);
    groups.get(m.category)!.push(m);
  }

  return (
    <div className="p-4">
      <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-3">
        Materials
      </p>

      {Array.from(groups.entries()).map(([category, materials]) => (
        <div key={category} className="mb-4">
          <p className="text-[10px] uppercase tracking-wider text-neutral-600 mb-2">
            {category}
          </p>
          <div className="space-y-1.5">
            {materials.map((mat) => (
              <button
                key={mat.id}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md
                  border border-neutral-800 hover:border-neutral-600
                  transition-colors cursor-pointer"
              >
                {/* Color swatch */}
                <div
                  className="w-6 h-6 rounded-md border border-neutral-700 flex-shrink-0"
                  style={{ backgroundColor: mat.color }}
                />
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm text-neutral-300 truncate">
                    {mat.name}
                  </div>
                  {mat.density && (
                    <div className="text-[10px] text-neutral-600">
                      {mat.density} kg/m³
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MaterialSelector;
