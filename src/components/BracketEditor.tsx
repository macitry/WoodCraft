import { useState, type FC } from 'react';
import { useModelStore } from '../store/modelStore';
import type { BracketInstance } from '../types/furniture';

/**
 * Corner bracket editor panel.
 *
 * - Lists all bracket instances with their transforms
 * - Each bracket: name, position (X/Y/Z mm), rotation (Roll/Pitch/Yaw deg)
 * - Add / Duplicate / Delete / Reset buttons
 * - Select a bracket to highlight it in the 3D view
 */
const BracketEditor: FC = () => {
  const brackets = useModelStore((s) => s.brackets);
  const selectedBracketId = useModelStore((s) => s.selectedBracketId);
  const selectBracket = useModelStore((s) => s.selectBracket);
  const updateBracket = useModelStore((s) => s.updateBracket);
  const removeBracket = useModelStore((s) => s.removeBracket);
  const addBracket = useModelStore((s) => s.addBracket);
  const resetBracketsToDefault = useModelStore((s) => s.resetBracketsToDefault);
  const placementMode = useModelStore((s) => s.placementMode);
  const togglePlacementMode = useModelStore((s) => s.togglePlacementMode);
  const mateState = useModelStore((s) => s.mateState);
  const mateBracketId = useModelStore((s) => s.mateBracketId);
  const startMate = useModelStore((s) => s.startMate);
  const cancelMate = useModelStore((s) => s.cancelMate);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = () => {
    const idx = brackets.length;
    const newBracket: BracketInstance = {
      id: `bracket_user_${Date.now()}`,
      name: `角铁-手动#${idx + 1}`,
      position: { x: 0, y: 750, z: 0 },
      rotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedParts: [],
      enabled: true,
    };
    addBracket(newBracket);
    setExpandedId(newBracket.id);
  };

  const handleDuplicate = (bracket: BracketInstance) => {
    const dup: BracketInstance = {
      ...bracket,
      id: `bracket_user_${Date.now()}`,
      name: `${bracket.name} (copy)`,
      position: { ...bracket.position },
      rotation: { ...bracket.rotation },
      connectedParts: [...bracket.connectedParts],
    };
    addBracket(dup);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
            Corner Brackets
          </p>
          <p className="text-[10px] text-neutral-600 mt-0.5">
            {brackets.length} bracket(s)
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleAdd}
            className="px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
            title="Add bracket"
          >
            + Add
          </button>
          <button
            onClick={togglePlacementMode}
            className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
              placementMode
                ? 'bg-green-700 text-green-200 animate-pulse'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
            }`}
            title="Snap to surface: click on 3D model to place bracket"
          >
            🎯
          </button>
          <button
            onClick={resetBracketsToDefault}
            className="px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 transition-colors cursor-pointer"
            title="Reset to default brackets"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Bracket list */}
      <div className="flex-1 overflow-y-auto">
        {brackets.length === 0 && (
          <div className="p-4 text-neutral-600 text-xs text-center">
            No brackets. Click "+ Add" to create one.
          </div>
        )}

        {brackets.map((bracket) => {
          const isSelected = selectedBracketId === bracket.id;
          const isExpanded = expandedId === bracket.id;

          return (
            <div
              key={bracket.id}
              className={`border-b border-neutral-800/50 ${
                isSelected ? 'bg-wood-500/10' : ''
              }`}
            >
              {/* Row header */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-800/30 transition-colors cursor-pointer"
                onClick={() => {
                  selectBracket(isSelected ? null : bracket.id);
                  setExpandedId(isExpanded ? null : bracket.id);
                }}
              >
                {/* Enable/disable toggle */}
                <span
                  className="text-xs cursor-pointer hover:opacity-80 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateBracket(bracket.id, { enabled: !bracket.enabled });
                  }}
                  title={bracket.enabled ? 'Disable' : 'Enable'}
                >
                  {bracket.enabled ? '👁' : '👁‍🗨'}
                </span>

                <span className="text-xs text-wood-400 flex-shrink-0">└┘</span>
                <span
                  className={`text-sm truncate flex-1 ${
                    isSelected ? 'text-wood-300' : 'text-neutral-300'
                  }`}
                >
                  {bracket.name}
                </span>

                <span
                  className="text-[10px] transition-transform duration-200 text-neutral-600"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  ▼
                </span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-3 space-y-2">
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-neutral-500">Name</label>
                    <input
                      type="text"
                      value={bracket.name}
                      onChange={(e) => updateBracket(bracket.id, { name: e.target.value })}
                      className="w-full px-2 py-1 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200
                        focus:border-wood-600 focus:outline-none"
                    />
                  </div>

                  {/* Position */}
                  <div>
                    <label className="text-[10px] text-neutral-500 block mb-1">
                      Position (mm)
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <div key={axis} className="flex items-center gap-1">
                          <span className="text-[10px] text-neutral-600 w-3 text-right">
                            {axis.toUpperCase()}
                          </span>
                          <input
                            type="number"
                            value={Math.round(bracket.position[axis])}
                            onChange={(e) =>
                              updateBracket(bracket.id, {
                                position: {
                                  ...bracket.position,
                                  [axis]: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200
                              focus:border-wood-600 focus:outline-none text-right tabular-nums"
                            step={1}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rotation */}
                  <div>
                    <label className="text-[10px] text-neutral-500 block mb-1">
                      Rotation (degrees)
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {([
                        { key: 'roll' as const, label: 'R' },
                        { key: 'pitch' as const, label: 'P' },
                        { key: 'yaw' as const, label: 'Y' },
                      ]).map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="text-[10px] text-neutral-600 w-3 text-right">
                            {label}
                          </span>
                          <input
                            type="number"
                            value={Math.round(bracket.rotation[key])}
                            onChange={(e) =>
                              updateBracket(bracket.id, {
                                rotation: {
                                  ...bracket.rotation,
                                  [key]: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200
                              focus:border-wood-600 focus:outline-none text-right tabular-nums"
                            step={1}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Connected parts */}
                  <div>
                    <label className="text-[10px] text-neutral-500 block mb-1">
                      Connected Parts
                    </label>
                    <input
                      type="text"
                      value={bracket.connectedParts.join(', ')}
                      onChange={(e) =>
                        updateBracket(bracket.id, {
                          connectedParts: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g. leg_front_left, beam_front"
                      className="w-full px-2 py-1 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200
                        focus:border-wood-600 focus:outline-none"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 pt-1 flex-wrap">
                    <button
                      onClick={() => {
                        if (mateState !== 'idle' && mateBracketId === bracket.id) {
                          cancelMate();
                        } else {
                          startMate(bracket.id);
                          setExpandedId(null);
                        }
                      }}
                      className={`px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer ${
                        mateState !== 'idle' && mateBracketId === bracket.id
                          ? 'bg-yellow-700 text-yellow-200'
                          : 'bg-blue-900/40 hover:bg-blue-900/70 text-blue-400'
                      }`}
                    >
                      {mateState !== 'idle' && mateBracketId === bracket.id ? '✕ Cancel Mate' : '⚓ Mate'}
                    </button>
                    <button
                      onClick={() => handleDuplicate(bracket)}
                      className="px-2 py-0.5 text-[10px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 transition-colors cursor-pointer"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => removeBracket(bracket.id)}
                      className="px-2 py-0.5 text-[10px] rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BracketEditor;
