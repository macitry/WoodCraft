import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS, SCREW_HEAD_DIMS, SCREW_DEFAULT_LENGTH } from '../types/furniture';
import type { DiyBracket, DiyProfile, DiyScrew, ScrewSize } from '../types/furniture';
import { CONNECTORS, connectorById } from './connectors';
import { accessoryKitById, jointFasteners, specSummary } from '../utils/accessoryKits';
import { useKitLayoutFor } from '../store/kitLayoutStore';
import type { DiyKitInstance } from '../types/furniture';

/** Right-side property panel for DIY: shows selected profile or bracket details. */
const DiyPropertyPanel: React.FC = () => {
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const selectedBracketId = useDiyStore((s) => s.selectedBracketId);
  const selectedScrewId = useDiyStore((s) => s.selectedScrewId);
  const selectedKitId = useDiyStore((s) => s.selectedKitId);
  const profiles = useDiyStore((s) => s.profiles);
  const brackets = useDiyStore((s) => s.brackets);
  const screws = useDiyStore((s) => s.screws);
  const kitInstances = useDiyStore((s) => s.kitInstances);
  const mode = useDiyStore((s) => s.mode);
  const setMode = useDiyStore((s) => s.setMode);

  const profile = profiles.find((p) => p.id === selectedProfileId);
  const bracket = brackets.find((b) => b.id === selectedBracketId);
  const screw = screws.find((s) => s.id === selectedScrewId);
  const kit = kitInstances.find((k) => k.id === selectedKitId);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Properties
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!profile && !bracket && !screw && !kit && (
          <div className="text-neutral-600 text-xs">
            <p className="mb-3">Click a profile, bracket or screw to edit.</p>
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

        {/* Screw properties */}
        {screw && <ScrewProps screw={screw} />}

        {/* Accessory-kit properties */}
        {kit && <KitProps instance={kit} />}
      </div>
    </div>
  );
};

/**
 * Accessory-kit editor.
 *
 * Nothing here is typed in: a kit is a binding record, so the listed hardware —
 * count included — is DERIVED from the bracket's connector plus the layout the
 * /kits page writes (see jointFasteners / specSummary). That derivation is what
 * keeps the count here, the count drawn in 3D and the count in the BOM in
 * agreement. The mutations are the display toggles, deleting the kit, and the
 * link to the per-part editing page.
 */
const KitProps: React.FC<{ instance: DiyKitInstance }> = ({ instance }) => {
  const navigate = useNavigate();
  const removeKitInstance = useDiyStore((s) => s.removeKitInstance);
  const showFasteners = useDiyStore((s) => s.showKitFasteners);
  const showNuts = useDiyStore((s) => s.showKitNuts);
  const setShowFasteners = useDiyStore((s) => s.setShowKitFasteners);
  const setShowNuts = useDiyStore((s) => s.setShowKitNuts);
  const bracket = useDiyStore((s) => s.brackets.find((b) => b.id === instance.bracketId));

  const kit = accessoryKitById(instance.kitId);
  if (!kit) return <div className="text-xs text-neutral-500">未知组合：{instance.kitId}</div>;

  const cc = connectorById(bracket?.connectorId);
  const layout = useKitLayoutFor(instance.kitId, cc.stlUrl);
  const fasteners = jointFasteners(kit, cc.stlUrl, bracket ? bracket.size / cc.extMm : 1, layout);
  const drawn = fasteners.filter((f) => !f.internal);
  const internal = fasteners.filter((f) => f.internal);

  return (
    <div className="space-y-3" data-diy-kit-panel={instance.id}>
      <Section label="配件组合">
        <Row label="组合">{kit.name}</Row>
        <Row label="作用域">{kit.scope === 'frame' ? '整桌' : '每处角码'}</Row>
        <Row label="约束">≥ {kit.minProfileSize}mm 型材</Row>
      </Section>

      <Section label="派生零件">
        {specSummary(kit, cc.stlUrl, layout).map((line) => (
          <Row key={line.spec.name} label={line.spec.name}>
            ×{line.qty}
          </Row>
        ))}
        <p className="text-[10px] text-neutral-600 pt-1">
          数量由角码孔位自动得出
        </p>
        {/* Frame-scope kits derive no geometry, so there is nothing to tune.
            No fit check here on purpose: the instance already exists, so the
            profile it was bound to passed `kitFitReason` — and if the profile
            has since been resized, the derived parts are still what is drawn
            and still worth adjusting. */}
        {kit.scope === 'joint' && (
          <button
            data-kit-edit={instance.id}
            onClick={() => navigate(`/kits?kit=${kit.id}&stl=${encodeURIComponent(cc.stlUrl)}`)}
            className="mt-1 px-2 py-1 text-[10px] rounded border border-neutral-700 text-neutral-300 hover:border-wood-600 hover:text-wood-200 transition-colors cursor-pointer"
          >
            微调零件…
            {layout !== null && <span className="ml-1 text-amber-500/90">已微调</span>}
          </button>
        )}
      </Section>

      {kit.ops.length > 0 && (
        <Section label="加工要求">
          <ul className="text-[11px] text-amber-500/90 space-y-0.5">
            {kit.ops.map((op) => (
              <li key={op}>· {op}</li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="accent-wood-500"
            checked={showFasteners}
            onChange={(e) => setShowFasteners(e.target.checked)}
          />
          <span className="text-neutral-400">显示紧固件（{drawn.length}）</span>
        </label>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="accent-wood-500"
            checked={showNuts}
            onChange={(e) => setShowNuts(e.target.checked)}
          />
          <span className="text-neutral-400">槽内螺母透视（{internal.length}）</span>
        </label>
      </div>

      <button
        onClick={() => removeKitInstance(instance.id)}
        className="w-full px-3 py-1.5 rounded text-xs border border-red-900/60 text-red-400
          hover:bg-red-900/20 transition-colors cursor-pointer"
      >
        删除组合
      </button>
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

/** Bracket property editor with anchor offset. */
const BracketProps: React.FC<{ bracket: DiyBracket }> = ({ bracket }) => {
  const updateBracket = useDiyStore((s) => s.updateBracket);
  const removeBracket = useDiyStore((s) => s.removeBracket);
  const openBracketEditor = useDiyStore((s) => s.openBracketEditor);

  const [local, setLocal] = useState({
    pos: { ...bracket.position },
    rot: { ...bracket.rotation },
    aPos: { ...bracket.anchorPosition },
    aRot: { ...bracket.anchorRotation },
  });
  const [localId, setLocalId] = useState(bracket.id);
  if (bracket.id !== localId) {
    setLocalId(bracket.id);
    setLocal({ pos: { ...bracket.position }, rot: { ...bracket.rotation }, aPos: { ...bracket.anchorPosition }, aRot: { ...bracket.anchorRotation } });
  }

  const commit = () => {
    updateBracket(bracket.id, { position: local.pos, rotation: local.rot, anchorPosition: local.aPos, anchorRotation: local.aRot });
    console.log('[Bracket DIY]', bracket.id.slice(-6), 'pos:', local.pos, 'rot:', local.rot, 'anchor:', local.aPos, local.aRot);
  };

  const cls = "w-20 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-right tabular-nums focus:border-wood-600 focus:outline-none";

  const cc = connectorById(bracket.connectorId);

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-white font-medium cursor-pointer" onDoubleClick={() => openBracketEditor(bracket.id)} title="Double-click to edit in isolation">{cc.label}</h4>

      <Section label="Model">
        <Row label="Connector">
          <select
            value={bracket.connectorId}
            onChange={(e) => updateBracket(bracket.id, { connectorId: e.target.value })}
            className="w-full px-1.5 py-1 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 focus:border-wood-600 focus:outline-none cursor-pointer"
          >
            {CONNECTORS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.dim}
              </option>
            ))}
          </select>
        </Row>
        <div className="text-[10px] text-neutral-500 px-1">
          {cc.kind === 'cast'
            ? 'Built-in cast corner bracket'
            : `${cc.desc} · 3D from MayTec 角码`}
        </div>
      </Section>

      <Section label="World Position">
        {(['x','y','z'] as const).map((ax) => (
          <Row key={ax} label={ax.toUpperCase()}>
            <input type="number" value={Math.round(local.pos[ax])} onChange={(e) => setLocal({ ...local, pos: { ...local.pos, [ax]: Number(e.target.value) || 0 } })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={cls} step={1} />
          </Row>
        ))}
      </Section>

      <Section label="World Rotation (°)">
        {(['roll','pitch','yaw'] as const).map((r) => (
          <Row key={r} label={r}>
            <input type="number" value={Math.round(local.rot[r])} onChange={(e) => setLocal({ ...local, rot: { ...local.rot, [r]: Number(e.target.value) || 0 } })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={cls} step={1} />
          </Row>
        ))}
      </Section>

      <Section label="Anchor Offset (mm)">
        {(['x','y','z'] as const).map((ax) => (
          <Row key={ax} label={ax.toUpperCase()}>
            <input type="number" value={Math.round(local.aPos[ax])} onChange={(e) => setLocal({ ...local, aPos: { ...local.aPos, [ax]: Number(e.target.value) || 0 } })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={cls} step={1} />
          </Row>
        ))}
      </Section>

      <Section label="Anchor Rotation (°)">
        {(['roll','pitch','yaw'] as const).map((r) => (
          <Row key={r} label={r}>
            <input type="number" value={Math.round(local.aRot[r])} onChange={(e) => setLocal({ ...local, aRot: { ...local.aRot, [r]: Number(e.target.value) || 0 } })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={cls} step={1} />
          </Row>
        ))}
      </Section>

      <button onClick={() => useDiyStore.getState().openBracketEditor(bracket.id)} className="w-full px-3 py-1.5 text-xs rounded bg-blue-900/40 hover:bg-blue-900/70 text-blue-400 transition-colors cursor-pointer">
        Edit in Isolation
      </button>
      <button onClick={() => removeBracket(bracket.id)} className="w-full px-3 py-1.5 text-xs rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer">
        Delete Bracket
      </button>
    </div>
  );
};

/** Screw property editor: spec, length, world pose, STL entry point. */
const SCREW_SIZES: ScrewSize[] = ['M4', 'M5', 'M6'];

const ScrewProps: React.FC<{ screw: DiyScrew }> = ({ screw }) => {
  const updateScrew = useDiyStore((s) => s.updateScrew);
  const removeScrew = useDiyStore((s) => s.removeScrew);

  const [local, setLocal] = useState({
    pos: { ...screw.position },
    rot: { ...screw.rotation },
  });
  const [localId, setLocalId] = useState(screw.id);
  if (screw.id !== localId) {
    setLocalId(screw.id);
    setLocal({ pos: { ...screw.position }, rot: { ...screw.rotation } });
  }

  const commit = () => {
    updateScrew(screw.id, { position: local.pos, rotation: local.rot });
  };

  const { headD, headH } = SCREW_HEAD_DIMS[screw.size];
  const cls = "w-20 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-right tabular-nums focus:border-wood-600 focus:outline-none";

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-white font-medium">Screw</h4>

      <Section label="规格 Size">
        <div className="flex gap-1">
          {SCREW_SIZES.map((sz) => (
            <button
              key={sz}
              onClick={() =>
                updateScrew(screw.id, {
                  size: sz,
                  // Keep the default total length aligned with the new size when
                  // the user hasn't customized it yet.
                  length:
                    screw.length === SCREW_DEFAULT_LENGTH[screw.size]
                      ? SCREW_DEFAULT_LENGTH[sz]
                      : screw.length,
                })
              }
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                screw.size === sz
                  ? 'bg-wood-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {sz}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-neutral-500">
          头径 {headD}mm · 头高 {headH}mm
        </p>
      </Section>

      <Section label="总长 Length (mm)">
        <Row label="Length">
          <input
            type="number"
            value={screw.length}
            min={6}
            step={1}
            onChange={(e) =>
              updateScrew(screw.id, { length: Math.max(6, Number(e.target.value) || 6) })
            }
            className={cls}
          />
        </Row>
      </Section>

      <Section label="World Position (mm)">
        {(['x', 'y', 'z'] as const).map((ax) => (
          <Row key={ax} label={ax.toUpperCase()}>
            <input
              type="number"
              value={Math.round(local.pos[ax])}
              onChange={(e) => setLocal({ ...local, pos: { ...local.pos, [ax]: Number(e.target.value) || 0 } })}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className={cls}
              step={1}
            />
          </Row>
        ))}
      </Section>

      <Section label="World Rotation (°)">
        {(['roll', 'pitch', 'yaw'] as const).map((r) => (
          <Row key={r} label={r}>
            <input
              type="number"
              value={Math.round(local.rot[r])}
              onChange={(e) => setLocal({ ...local, rot: { ...local.rot, [r]: Number(e.target.value) || 0 } })}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className={cls}
              step={1}
            />
          </Row>
        ))}
      </Section>

      <Section label="STL 模型 (入口)">
        <input
          type="text"
          value={screw.stlUrl ?? ''}
          placeholder="/screw.stl (可选)"
          onChange={(e) => updateScrew(screw.id, { stlUrl: e.target.value.trim() || undefined })}
          className="w-full px-1.5 py-0.5 text-[10px] bg-neutral-900 border border-neutral-700 rounded text-neutral-300 focus:border-wood-600 focus:outline-none"
        />
        <p className="text-[10px] text-neutral-500">留空用程序化几何,填写则加载 STL 模型</p>
      </Section>

      <button
        onClick={() => removeScrew(screw.id)}
        className="w-full px-3 py-1.5 text-xs rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer"
      >
        Delete Screw
      </button>
    </div>
  );
};

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <p className="text-[10px] text-neutral-500 uppercase">{label}</p>
    <div className="space-y-1">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between items-center">
    <span className="text-neutral-400 text-xs">{label}</span>
    {children}
  </div>
);

export default DiyPropertyPanel;
