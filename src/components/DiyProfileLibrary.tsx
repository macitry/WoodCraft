import { useDiyStore } from '../store/diyStore';
import type { ProfileSize } from '../types/furniture';
import { PROFILE_DIMS } from '../types/furniture';

const SIZES: { id: ProfileSize; label: string; color: string; desc: string }[] = [
  { id: '2020', label: '2020', color: '#8a8a8a', desc: '20×20mm' },
  { id: '3030', label: '3030', color: '#a0a0a0', desc: '30×30mm' },
  { id: '4040', label: '4040', color: '#b8b8b8', desc: '40×40mm' },
];

const DiyProfileLibrary: React.FC = () => {

  const handleDragStart = (e: React.DragEvent, size: ProfileSize) => {
    e.dataTransfer.setData('application/diy-profile', size);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Profile Library
        </p>
        <p className="text-[10px] text-neutral-600 mt-0.5">
          Drag a profile into the scene
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {SIZES.map((s) => (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => handleDragStart(e, s.id)}
            className="flex items-center gap-3 p-3 rounded-lg border border-neutral-800
              hover:border-neutral-600 bg-neutral-900/50 cursor-grab active:cursor-grabbing
              transition-colors group"
          >
            {/* Cross-section preview */}
            <div
              className="w-10 h-10 rounded flex-shrink-0 border-2 flex items-center justify-center text-[8px] font-mono"
              style={{
                borderColor: s.color,
                backgroundColor: s.color + '20',
                color: s.color,
              }}
            >
              {PROFILE_DIMS[s.id]}²
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-neutral-200 group-hover:text-white font-medium">
                {s.label}
              </div>
              <div className="text-[10px] text-neutral-500">{s.desc}</div>
            </div>
            <span className="text-neutral-700 text-xs">⠿</span>
          </div>
        ))}

        {/* Connectors */}
        <div className="pt-3 border-t border-neutral-800">
          <p className="px-3 text-xs uppercase tracking-wider text-neutral-500 font-medium mb-2">
            Connectors
          </p>
          <ConnectorItem
            label="Corner Bracket"
            desc="Cast L-bracket"
            icon="└┘"
          />
        </div>

        {/* Help */}
        <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
          <p><span className="text-neutral-400">Drag</span> profile → place root</p>
          <p><span className="text-neutral-400">Shift+Click</span> face → grow new</p>
          <p><span className="text-neutral-400">Drag</span> arrow → stretch</p>
          <p><span className="text-neutral-400">Double-click</span> face → purple target</p>
          <p><span className="text-neutral-400">Shift+Click</span> face → grow new</p>
          <p><span className="text-neutral-400">Drag</span> arrow → stretch</p>
        </div>
      </div>
    </div>
  );
};

const ConnectorItem: React.FC<{ label: string; desc: string; icon: string }> = ({ label, desc, icon }) => {
  return (
    <div className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-700 bg-neutral-900/50 text-neutral-300 text-left">
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[10px] text-neutral-500">{desc}</div>
      </div>
    </div>
  );
};

export default DiyProfileLibrary;
