import { useState, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModelStore } from '../store/modelStore';
import type { BracketInstance } from '../types/furniture';
import { DEFAULT_BRACKET_STL_URL, bracketStlUrl } from '../types/furniture';
import { connectorByStlUrl } from '../diy/connectors';
import {
  ACCESSORY_KITS,
  accessoryKitById,
  kitFitReason,
  kitScheduleFor,
  jointFasteners,
  layoutFor,
  specSummary,
  type AccessoryKit,
} from '../utils/accessoryKits';
import { useKitLayoutStore } from '../store/kitLayoutStore';
import { useT } from '../i18n';
import {
  connectorLabel,
  hardwareName,
  kitDesc,
  kitName,
  kitOps,
} from '../i18n/names';

const BracketEditor: FC = () => {
  const t = useT();
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
      name: t('panel.bracketManual', { n: idx + 1 }),
      position: { x: 0, y: 750, z: 0 },
      rotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedParts: [],
      enabled: true,
      size: 30,
    });
  };

  const handleDuplicate = (b: BracketInstance) => {
    // The suffix is new DATA derived at the moment of the copy, not a label that
    // follows the language: a bracket duplicated in Chinese keeps the name it was
    // given. That is the same rule as the DIY project name.
    addBracket({ ...b, id: `bracket_user_${Date.now()}`, name: `${b.name}${t('panel.copySuffix')}`, position: { ...b.position }, rotation: { ...b.rotation }, connectedParts: [...b.connectedParts] });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">{t('panel.cornerBrackets')}</p>
          <p className="text-[10px] text-neutral-600 mt-0.5">{t('panel.bracketCount', { n: brackets.length })}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={handleAdd} className="px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer" title={t('panel.addBracketHint')}>{t('panel.addBracket')}</button>
          <button onClick={resetBracketsToDefault} className="px-2 py-1 text-xs rounded bg-amber-900/40 hover:bg-amber-900/70 text-amber-300 transition-colors cursor-pointer" title={t('panel.autoRegenHint')}>{t('panel.autoRegen')}</button>
        </div>
      </div>

      <AccessoryKitPanel />

      <div className="flex-1 overflow-y-auto">
        {brackets.length === 0 && <div className="p-4 text-neutral-600 text-xs text-center">{t('panel.noBrackets')}</div>}
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

/** Profile cross-section from the template param ('3030' → 30). */
function profileSizeOf(profile: string): number {
  return Number(profile.slice(0, 2)) || 30;
}

/**
 * Picks the fastener set applied to every corner joint. The kit is the only
 * thing stored — the actual hardware is derived from it plus the bracket set,
 * so the quantities below are what the 3D view and the BOM will both show.
 */
const AccessoryKitPanel: FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const activeKitId = useModelStore((s) => s.activeKitId);
  const setAccessoryKit = useModelStore((s) => s.setAccessoryKit);
  const showFasteners = useModelStore((s) => s.showFasteners);
  const setShowFasteners = useModelStore((s) => s.setShowFasteners);
  const showInternalFasteners = useModelStore((s) => s.showInternalFasteners);
  const setShowInternalFasteners = useModelStore((s) => s.setShowInternalFasteners);
  const brackets = useModelStore((s) => s.brackets);
  const profile = useModelStore((s) => s.currentParams.profile);

  const profileSize = profileSizeOf(profile);
  const enabled = brackets.filter((b) => b.enabled);
  const kit = accessoryKitById(activeKitId);
  // Subscribed, not read once: without this the panel would keep printing the
  // preset hardware after a per-part edit retyped, removed or added something.
  const layouts = useKitLayoutStore((s) => s.layouts);
  // Frame-scope kits are budgeted per assembly and resolve to their own lines
  // whatever the joint list says; for joint-scope kits each bracket is counted
  // through the connector it is actually drawn with (see jointGroups below).
  const lines = kitScheduleFor(kit, enabled.map(bracketStlUrl), layouts);

  // One entry per distinct connector in play, each described through its own
  // hole pattern. The old `enabled[0]?.stlUrl` representative was a single
  // number for the whole desk, which is false the moment a model mixes
  // connectors — and it resolved every joint through one pattern, so edits
  // keyed on another would have gone unreported.
  const jointGroups = (() => {
    if (!kit || kit.scope === 'frame') return [];
    const count = new Map<string, number>();
    for (const b of enabled) {
      const key = bracketStlUrl(b);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    // Nothing enabled: still describe ONE joint on the default pattern, so the
    // amber "no bracket" warning below has something to sit under.
    if (count.size === 0) count.set(DEFAULT_BRACKET_STL_URL, 0);
    return [...count].map(([stl, n]) => ({
      stl,
      n,
      cc: connectorByStlUrl(stl),
      edited: layoutFor(layouts, kit.id, stl) !== null,
      parts: specSummary(kit, stl, layoutFor(layouts, kit.id, stl)),
    }));
  })();

  // What the SELECTED kit will actually seat per joint, per connector in play.
  //
  // The card subtitle is the kit's RATING (`boltsPerJoint`), and the bracket can
  // seat fewer: the default bracket is an angle with ONE mount per leg, so the
  // 4-bolt kit places 2. Printing the rating in that card would contradict the
  // breakdown line two rows below it, in the same panel — the panel and the 3D
  // disagreeing about a count, which is the one thing this panel exists not to do.
  // Rendered as a range when the connectors disagree, because a mixed model has no
  // single per-joint number and averaging one would be another small lie.
  const seatedRange = (k: AccessoryKit): [number, number] | null => {
    if (k.scope !== 'joint' || k.id !== activeKitId) return null;
    const seats = jointGroups
      .filter((g) => g.n > 0)
      .map((g) => jointFasteners(k, g.stl, 1, layoutFor(layouts, k.id, g.stl)).filter((f) => f.role === 'bolt').length);
    return seats.length ? [Math.min(...seats), Math.max(...seats)] : null;
  };

  // Null while the effective count IS the rating — the common case, and the card
  // must not gain a parenthetical for it.
  const seatedLabel = (k: AccessoryKit, range: [number, number] | null): string | null => {
    if (!range) return null;
    const [lo, hi] = range;
    if (lo === k.boltsPerJoint && hi === k.boltsPerJoint) return null;
    return lo === hi
      ? t('panel.seatedExact', { n: lo, r: k.boltsPerJoint })
      : t('panel.seatedRange', { lo, hi, r: k.boltsPerJoint });
  };

  return (
    <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">{t('panel.kits')}</p>
        {kit && (
          <span className="text-[10px] text-neutral-500 tabular-nums">
            {lines.map((l) => `×${l.qty}`).join(' + ') || '—'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1 mt-2">
        <button
          data-kit="__none__"
          onClick={() => setAccessoryKit(null)}
          title={t('panel.noKitTitle')}
          className={`px-2 py-1.5 text-left text-[10px] rounded border transition-colors cursor-pointer ${
            activeKitId === null
              ? 'border-wood-600 bg-wood-500/15 text-wood-200'
              : 'border-neutral-700 text-neutral-400 hover:border-neutral-600'
          }`}
        >
          <span className="block font-medium">{t('panel.noKit')}</span>
          <span className="block text-neutral-600 mt-0.5">{t('panel.noKitHint')}</span>
        </button>

        {ACCESSORY_KITS.map((k) => {
          const fit = kitFitReason(k, profileSize);
          const on = activeKitId === k.id;
          return (
            <button
              key={k.id}
              data-kit={k.id}
              disabled={fit !== null}
              onClick={() => setAccessoryKit(on ? null : k.id)}
              title={fit ?? kitDesc(k)}
              className={`px-2 py-1.5 text-left text-[10px] rounded border transition-colors ${
                fit !== null
                  ? 'border-neutral-800 text-neutral-600 cursor-not-allowed'
                  : on
                    ? 'border-wood-600 bg-wood-500/15 text-wood-200 cursor-pointer'
                    : 'border-neutral-700 text-neutral-400 hover:border-neutral-600 cursor-pointer'
              }`}
            >
              <span className="block font-medium">{kitName(k)}</span>
              <span className="block text-neutral-600 mt-0.5 leading-tight">
                {fit ??
                  (k.scope === 'frame'
                    ? t('panel.perFrame', { n: k.perFrame ?? 0 })
                    : seatedLabel(k, seatedRange(k))
                      ?? t('panel.boltsPerJoint', { n: k.boltsPerJoint }))}
              </span>
            </button>
          );
        })}
      </div>

      {kit && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] text-neutral-500 leading-snug">
            {kit.scope === 'frame'
              ? t('panel.frameOnly', { name: hardwareName(kit.bolt) })
              : jointGroups
                  .map(
                    (g) =>
                      // Counts and specs come from the same derivation the 3D and
                      // the BOM use, so a retyped or deleted part shows up here
                      // rather than leaving a preset figure behind.
                      t('panel.jointParts', {
                        parts: g.parts
                          .map((l) =>
                            t('panel.partQty', { qty: l.qty, name: hardwareName(l.spec) }),
                          )
                          .join(' + '),
                      }) + (g.n > 0 ? t('panel.jointCount', { n: g.n }) : ''),
                  )
                  .join(t('panel.jointSeparator'))}
          </p>
          {kit.scope === 'joint' && enabled.length === 0 && (
            <p className="text-[10px] text-amber-500/80">
              {t('panel.noEnabledBrackets')}
            </p>
          )}

          {/* Door to the per-part editing page. One button per connector in
              play, because a tweak belongs to a (kit, hole pattern) pair: a
              model mixing two connector sizes has two independent sets of
              tweaks, and a single button would quietly edit only one of them.
              Frame-scope kits get no button — they derive no geometry at all,
              so the page would have nothing to place. */}
          {kit.scope === 'joint' && (
            <div className="flex flex-wrap gap-1 pt-1">
              {jointGroups.map((g) => (
                <button
                  key={g.stl}
                  data-kit-edit={g.stl}
                  onClick={() => navigate(`/kits?kit=${kit.id}&stl=${encodeURIComponent(g.stl)}`)}
                  title={t('panel.tweakHint', {
                    connector: connectorLabel(g.cc),
                    parts: g.parts
                      .map((l) => t('panel.partQty', { qty: l.qty, name: hardwareName(l.spec) }))
                      .join(' + '),
                  })}
                  className="px-2 py-1 text-[10px] rounded border border-neutral-700 text-neutral-300 hover:border-wood-600 hover:text-wood-200 transition-colors cursor-pointer"
                >
                  {t('panel.tweakParts')}{jointGroups.length > 1 ? ` (${g.cc.dim})` : ''}
                  {g.edited && <span className="ml-1 text-amber-500/90">{t('common.tweaked')}</span>}
                </button>
              ))}
            </div>
          )}
          {kitOps(kit).map((op) => (
            <p key={op} className="text-[10px] text-amber-500/80">⚙ {op}</p>
          ))}
          {kit.scope === 'joint' && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
              <label className="flex items-center gap-1 text-[10px] text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFasteners}
                  onChange={(e) => setShowFasteners(e.target.checked)}
                  className="accent-wood-600"
                />
                {t('panel.showFasteners')}
              </label>
              <label
                className={`flex items-center gap-1 text-[10px] cursor-pointer ${
                  showFasteners ? 'text-neutral-400' : 'text-neutral-700'
                }`}
                title={t('panel.showInternalHint')}
              >
                <input
                  type="checkbox"
                  checked={showInternalFasteners}
                  disabled={!showFasteners}
                  onChange={(e) => setShowInternalFasteners(e.target.checked)}
                  className="accent-wood-600"
                />
                {t('panel.showInternal')}
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Single bracket row with expandable edit fields.
 *
 *  `isMateActive` / `onMate` were declared here and passed by nobody — a
 *  leftover from the 配对 workflow, and a standing `tsc` error since the call
 *  site stopped providing them. Removed rather than defaulted: a prop that no
 *  caller can set is not an optional prop, it is a description of a feature
 *  that is not in this component. */
const BracketRow: FC<{
  bracket: BracketInstance;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onUpdate: (patch: Partial<BracketInstance>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}> = ({ bracket, isSelected, isExpanded, onSelect, onToggle, onUpdate, onDuplicate, onRemove }) => {
  const t = useT();
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
        <span className="text-xs cursor-pointer hover:opacity-80 flex-shrink-0" onClick={(e) => { e.stopPropagation(); onToggle(); }} title={bracket.enabled ? t('panel.disable') : t('panel.enable')}>{bracket.enabled ? '👁' : '👁‍🗨'}</span>
        <span className="text-xs text-wood-400 flex-shrink-0">└┘</span>
        <span className={`text-sm truncate flex-1 ${isSelected ? 'text-wood-300' : 'text-neutral-300'}`}>{bracket.name}</span>
        <span className="text-[10px] text-neutral-600">{bracket.size}mm</span>
        <span className="text-[10px] transition-transform duration-200 text-neutral-600" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Name */}
          <InputRow label={t('panel.name')} value={localName} onChange={setLocalName} onBlur={commit} />

          {/* Position */}
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">{t('panel.position')}</label>
            <div className="grid grid-cols-3 gap-1">
              {(['x','y','z'] as const).map((ax) => (
                <NumInput key={ax} label={ax.toUpperCase()} value={localPos[ax]} onChange={(v) => setLocalPos({ ...localPos, [ax]: v })} onBlur={commit} />
              ))}
            </div>
          </div>

          {/* Rotation */}
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">{t('panel.rotation')}</label>
            <div className="grid grid-cols-3 gap-1">
              {(['roll','pitch','yaw'] as const).map((r) => (
                <NumInput key={r} label={r[0].toUpperCase()} value={localRot[r]} onChange={(v) => setLocalRot({ ...localRot, [r]: v })} onBlur={commit} />
              ))}
            </div>
          </div>

          {/* Connected parts */}
          <InputRow label={t('panel.connectedParts')} value={localParts} onChange={setLocalParts} onBlur={commit} placeholder={t('panel.connectedPartsHint')} />

          {/* STL model — swap this bracket's connector model (leave empty for default) */}
          <InputRow label={t('panel.stlModel')} value={localStl} onChange={setLocalStl} onBlur={commit} placeholder={t('panel.stlModelHint')} />

          {/* Actions */}
          <div className="flex gap-1 pt-1 flex-wrap">
            <button onClick={onDuplicate} className="px-2 py-0.5 text-[10px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 transition-colors cursor-pointer">{t('common.duplicate')}</button>
            <button onClick={onRemove} className="px-2 py-0.5 text-[10px] rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer">{t('common.delete')}</button>
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
