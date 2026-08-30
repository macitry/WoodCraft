import { useState, type FC } from 'react';
import { useModelStore } from '../store/modelStore';
import type { BracketInstance } from '../types/furniture';

const BracketEditor: FC = () => {
  const brackets = useModelStore((s) => s.brackets);
  const selectedBracketId = useModelStore((s) => s.selectedBracketId);
  const selectBracket = useModelStore((s) => s.selectBracket);
  const updateBracket = useModelStore((s) => s.updateBracket);
  const removeBracket = useModelStore((s) => s.removeBracket);
  const addBracket = useModelStore((s) => s.addBracket);
  const resetBracketsToDefault = useModelStore((s) => s.resetBracketsToDefault);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = () => {
    const idx = brackets.length;
    addBracket({
      id: `bracket_user_${Date.now()}`,
      name: `角铁-手动#${idx + 1}`,
      position: { x: 0, y: 750, z: 0 },
      rotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedParts: [],
      enabled: true,
      size: 30,
    });
  };

  const handleDuplicate = (b: BracketInstance) => {
    addBracket({ ...b, id: `bracket_user_${Date.now()}`, name: `${b.name} (copy)`, position: { ...b.position }, rotation: { ...b.rotation }, connectedParts: [...b.connectedParts] });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Corner Brackets</p>
          <p className="text-[10px] text-neutral-600 mt-0.5">{brackets.length} bracket(s)</p>
        </div>
        <div className="flex gap-1">
          <button onClick={handleAdd} className="px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer" title="Add bracket">+ Add</button>
          <button onClick={resetBracketsToDefault} className="px-2 py-1 text-xs rounded bg-amber-900/40 hover:bg-amber-900/70 text-amber-300 transition-colors cursor-pointer" title="按接头算法重新生成角码(覆盖手动调整)">⚡ 自动</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {brackets.length === 0 && <div className="p-4 text-neutral-600 text-xs text-center">No brackets. Ctrl+Click two faces.</div>}
        {brackets.map((bracket) => (
          <BracketRow
            key={bracket.id}
            bracket={bracket}
            isSelected={selectedBracketId === bracket.id}
            isExpanded={expandedId === bracket.id}
            onSelect={() => { selectBracket(selectedBracketId === bracket.id ? null : bracket.id); setExpandedId(expandedId === bracket.id ? null : bracket.id); }}
            onToggle={() => updateBracket(bracket.id, { enabled: !bracket.enabled })}
            onUpdate={(p) => updateBracket(bracket.id, p)}
            onDuplicate={() => handleDuplicate(bracket)}
            onRemove={() => removeBracket(bracket.id)}
          />
        ))}
      </div>
    </div>
  );
};

/** Single bracket row with expandable edit fields. */
const BracketRow: FC<{
  bracket: BracketInstance;
  isSelected: boolean;
  isExpanded: boolean;
  isMateActive: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onUpdate: (patch: Partial<BracketInstance>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMate: () => void;
}> = ({ bracket, isSelected, isExpanded, onSelect, onToggle, onUpdate, onDuplicate, onRemove }) => {
  // Local editing state — only commit on blur
  const [localName, setLocalName] = useState(bracket.name);
  const [localPos, setLocalPos] = useState({ ...bracket.position });
  const [localRot, setLocalRot] = useState({ ...bracket.rotation });
  const [localParts, setLocalParts] = useState(bracket.connectedParts.join(', '));
  const [localStl, setLocalStl] = useState(bracket.stlUrl ?? '');

  // Sync from store when the bracket's committed data changes externally.
  // The auto-regenerator reuses the same bracket ids across regenerations, so
  // keying on id alone would leave stale positions/rotations in the edit panel
  // (e.g. after ⚡ 自动 or a template switch). Compare a data signature instead.
  const dataKey = JSON.stringify([
    bracket.id, bracket.name, bracket.position, bracket.rotation,
    bracket.connectedParts, bracket.stlUrl ?? '',
  ]);
  const [prevKey, setPrevKey] = useState(dataKey);
  if (dataKey !== prevKey) {
    setPrevKey(dataKey);
    setLocalName(bracket.name);
    setLocalPos({ ...bracket.position });
    setLocalRot({ ...bracket.rotation });
    setLocalParts(bracket.connectedParts.join(', '));
    setLocalStl(bracket.stlUrl ?? '');
  }

  const commit = () => {
    onUpdate({
      name: localName,
      position: localPos,
      rotation: localRot,
      connectedParts: localParts.split(',').map((s) => s.trim()).filter(Boolean),
      stlUrl: localStl.trim() || undefined,
    });
    console.log('[Bracket] Updated:', bracket.id.slice(-6),
      'pos:', localPos, 'rot:', localRot,
      'faces:', localParts);
  };

  return (
    <div className={`border-b border-neutral-800/50 ${isSelected ? 'bg-wood-500/10' : ''}`}>
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-800/30 transition-colors cursor-pointer" onClick={onSelect}>
        <span className="text-xs cursor-pointer hover:opacity-80 flex-shrink-0" onClick={(e) => { e.stopPropagation(); onToggle(); }} title={bracket.enabled ? 'Disable' : 'Enable'}>{bracket.enabled ? '👁' : '👁‍🗨'}</span>
        <span className="text-xs text-wood-400 flex-shrink-0">└┘</span>
        <span className={`text-sm truncate flex-1 ${isSelected ? 'text-wood-300' : 'text-neutral-300'}`}>{bracket.name}</span>
        <span className="text-[10px] text-neutral-600">{bracket.size}mm</span>
        <span className="text-[10px] transition-transform duration-200 text-neutral-600" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Name */}
          <InputRow label="Name" value={localName} onChange={setLocalName} onBlur={commit} />

          {/* Position */}
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Position (mm)</label>
            <div className="grid grid-cols-3 gap-1">
              {(['x','y','z'] as const).map((ax) => (
                <NumInput key={ax} label={ax.toUpperCase()} value={localPos[ax]} onChange={(v) => setLocalPos({ ...localPos, [ax]: v })} onBlur={commit} />
              ))}
            </div>
          </div>

          {/* Rotation */}
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Rotation (deg)</label>
            <div className="grid grid-cols-3 gap-1">
              {(['roll','pitch','yaw'] as const).map((r) => (
                <NumInput key={r} label={r[0].toUpperCase()} value={localRot[r]} onChange={(v) => setLocalRot({ ...localRot, [r]: v })} onBlur={commit} />
              ))}
            </div>
          </div>

          {/* Connected parts */}
          <InputRow label="Connected Parts" value={localParts} onChange={setLocalParts} onBlur={commit} placeholder="e.g. leg_front_left, beam_front" />

          {/* STL model — swap this bracket's connector model (leave empty for default) */}
          <InputRow label="STL Model (stlUrl)" value={localStl} onChange={setLocalStl} onBlur={commit} placeholder="/Cast_Corner_Bracket.stl" />

          {/* Actions */}
          <div className="flex gap-1 pt-1 flex-wrap">
            <button onClick={onDuplicate} className="px-2 py-0.5 text-[10px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 transition-colors cursor-pointer">Duplicate</button>
            <button onClick={onRemove} className="px-2 py-0.5 text-[10px] rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
};

const InputRow: FC<{ label: string; value: string; onChange: (v: string) => void; onBlur: () => void; placeholder?: string }> = ({ label, value, onChange, onBlur, placeholder }) => (
  <div className="space-y-1">
    <label className="text-[10px] text-neutral-500">{label}</label>
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }} placeholder={placeholder} className="w-full px-2 py-1 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 focus:border-wood-600 focus:outline-none" />
  </div>
);

const NumInput: FC<{ label: string; value: number; onChange: (v: number) => void; onBlur: () => void }> = ({ label, value, onChange, onBlur }) => (
  <div className="flex items-center gap-1">
    <span className="text-[10px] text-neutral-600 w-3 text-right">{label}</span>
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} onBlur={onBlur} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-full px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 focus:border-wood-600 focus:outline-none text-right tabular-nums" step={1} />
  </div>
);

export default BracketEditor;
