import { useState } from 'react';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';
import type { DiyBracket, DiyProfile } from '../types/furniture';

/** Right-side property panel for DIY: shows selected profile or bracket details. */
const DiyPropertyPanel: React.FC = () => {
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const selectedBracketId = useDiyStore((s) => s.selectedBracketId);
  const profiles = useDiyStore((s) => s.profiles);
  const brackets = useDiyStore((s) => s.brackets);
  const mode = useDiyStore((s) => s.mode);
  const setMode = useDiyStore((s) => s.setMode);

  const profile = profiles.find((p) => p.id === selectedProfileId);
  const bracket = brackets.find((b) => b.id === selectedBracketId);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Properties
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!profile && !bracket && (
          <div className="text-neutral-600 text-xs">
            <p className="mb-3">Click a profile or bracket to edit.</p>
            <p className="mb-1">Mode: <span className="text-neutral-400">{mode}</span></p>
            {mode === 'stretching' && (
              <div className="mt-2 p-2 rounded bg-blue-900/30 border border-blue-800 text-blue-300 text-xs">
                Stretch: scroll mouse wheel or use the gizmo handles
              </div>
            )}
            {mode === 'selecting_direction' && (
              <div className="mt-2 p-2 rounded bg-yellow-900/30 border border-yellow-800 text-yellow-300 text-xs">
                Click a direction arrow to grow a new profile
              </div>
            )}
          </div>
        )}

        {/* Profile properties */}
        {profile && <ProfileProps profile={profile} />}

        {/* Bracket properties */}
        {bracket && <BracketProps bracket={bracket} />}
      </div>
    </div>
  );
};

/** Profile property editor. */
const ProfileProps: React.FC<{ profile: DiyProfile }> = ({ profile }) => {
  const removeProfile = useDiyStore((s) => s.removeProfile);
  const updateProfileLength = useDiyStore((s) => s.updateProfileLength);
  const dim = PROFILE_DIMS[profile.profileSize];

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-white font-medium">{profile.profileSize} Profile</h4>

      <div className="space-y-2 text-xs text-neutral-400">
        <div className="flex justify-between">
          <span>ID</span>
          <span className="text-neutral-300 font-mono text-[10px]">{profile.id.slice(-8)}</span>
        </div>
        <div className="flex justify-between">
          <span>Cross-section</span>
          <span className="text-neutral-300">{dim}×{dim}mm</span>
        </div>
        <div className="flex justify-between">
          <span>Length</span>
          <input
            type="number"
            value={profile.length}
            onChange={(e) => updateProfileLength(profile.id, Number(e.target.value))}
            className="w-20 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-right tabular-nums focus:border-wood-600 focus:outline-none"
            min={20}
            step={10}
          />
        </div>
        <div className="flex justify-between">
          <span>Direction</span>
          <span className="text-neutral-300">{profile.direction}</span>
        </div>
        <div className="flex justify-between">
          <span>Position</span>
          <span className="text-neutral-300 font-mono text-[10px]">
            ({profile.position.x}, {profile.position.y}, {profile.position.z})
          </span>
        </div>
        {profile.parentId && (
          <div className="flex justify-between">
            <span>Parent</span>
            <span className="text-neutral-300 font-mono text-[10px]">{profile.parentId.slice(-8)}</span>
          </div>
        )}
      </div>

      <button
        onClick={() => removeProfile(profile.id)}
        className="w-full px-3 py-1.5 text-xs rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer"
      >
        Delete (with children)
      </button>
    </div>
  );
};

/** Bracket property editor. Uses local state, commits on blur/Enter. */
const BracketProps: React.FC<{ bracket: DiyBracket }> = ({ bracket }) => {
  const updateBracket = useDiyStore((s) => s.updateBracket);
  const removeBracket = useDiyStore((s) => s.removeBracket);

  const [localPos, setLocalPos] = useState({ ...bracket.position });
  const [localRot, setLocalRot] = useState({ ...bracket.rotation });
  const [localId, setLocalId] = useState(bracket.id);
  if (bracket.id !== localId) {
    setLocalId(bracket.id);
    setLocalPos({ ...bracket.position });
    setLocalRot({ ...bracket.rotation });
  }

  const commit = () => {
    updateBracket(bracket.id, { position: localPos, rotation: localRot });
    console.log('[Bracket DIY] Updated:', bracket.id.slice(-6), 'pos:', localPos, 'rot:', localRot);
  };

  const inputClass = "w-20 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-right tabular-nums focus:border-wood-600 focus:outline-none";

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-white font-medium">Bracket</h4>
      <div className="space-y-2 text-xs">
        {(['x','y','z'] as const).map((ax) => (
          <div key={ax} className="flex justify-between items-center">
            <span className="text-neutral-400">Position {ax.toUpperCase()}</span>
            <input type="number" value={Math.round(localPos[ax])} onChange={(e) => setLocalPos({ ...localPos, [ax]: Number(e.target.value) || 0 })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={inputClass} step={1} />
          </div>
        ))}
        {(['roll','pitch','yaw'] as const).map((r) => (
          <div key={r} className="flex justify-between items-center">
            <span className="text-neutral-400">Rotation {r}</span>
            <input type="number" value={Math.round(localRot[r])} onChange={(e) => setLocalRot({ ...localRot, [r]: Number(e.target.value) || 0 })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={inputClass} step={1} />
          </div>
        ))}
      </div>
      <button onClick={() => removeBracket(bracket.id)} className="w-full px-3 py-1.5 text-xs rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer">
        Delete Bracket
      </button>
    </div>
  );
};

export default DiyPropertyPanel;
