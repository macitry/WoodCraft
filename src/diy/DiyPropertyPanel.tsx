import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS, PROFILE_SIZES } from '../types/furniture';
import type { DiyBracket, DiyProfile, DiyScrew, ProfileSize, ScrewSize } from '../types/furniture';
import { CONNECTORS, connectorById } from './connectors';
import {
  DEFAULT_SCREW_FAMILY,
  headText,
  screwDims,
  snapScrewLength,
} from './fastenerDims';
import { screwFamiliesFor, screwLengths } from './fasteners';
import {
  JOINT_KITS,
  SCREW_FAMILIES,
  accessoryKitById,
  jointFasteners,
  kitFitReason,
  specSummary,
} from '../utils/accessoryKits';
import { useKitLayoutFor } from '../store/kitLayoutStore';
import type { DiyKitInstance } from '../types/furniture';
import { useT, hasKey } from '../i18n';
import { connectorLabel, connectorDesc, kitName, kitDesc, kitOps, hardwareName } from '../i18n/names';

/** Right-side property panel for DIY: shows selected profile or bracket details. */
const DiyPropertyPanel: React.FC = () => {
  const t = useT();
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const selectedBracketId = useDiyStore((s) => s.selectedBracketId);
  const selectedScrewId = useDiyStore((s) => s.selectedScrewId);
  const selectedKitId = useDiyStore((s) => s.selectedKitId);
  const profiles = useDiyStore((s) => s.profiles);
  const brackets = useDiyStore((s) => s.brackets);
  const screws = useDiyStore((s) => s.screws);
  const kitInstances = useDiyStore((s) => s.kitInstances);
  const mode = useDiyStore((s) => s.mode);
  // The mode readout is a live enum value; translated through a dynamic key so
  // an unrecognised future mode still falls back to its own name.
  const modeKey = `diy.mode.${mode}`;

  const profile = profiles.find((p) => p.id === selectedProfileId);
  const bracket = brackets.find((b) => b.id === selectedBracketId);
  const screw = screws.find((s) => s.id === selectedScrewId);
  const kit = kitInstances.find((k) => k.id === selectedKitId);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          {t('diy.properties')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!profile && !bracket && !screw && !kit && (
          <div className="text-neutral-600 text-xs">
            <p className="mb-3">{t('diy.noSelectionHint')}</p>
            <p className="mb-1">{t('diy.mode')}<span className="text-neutral-400">{hasKey(modeKey) ? t(modeKey) : mode}</span></p>
            {mode === 'stretching' && (
              <div className="mt-2 p-2 rounded bg-blue-900/30 border border-blue-800 text-blue-300 text-xs">
                {t('diy.stretchHint')}
              </div>
            )}
            {mode === 'selecting_direction' && (
              <div className="mt-2 p-2 rounded bg-yellow-900/30 border border-yellow-800 text-yellow-300 text-xs">
                {t('diy.growHint')}
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
  const t = useT();
  const navigate = useNavigate();
  const removeKitInstance = useDiyStore((s) => s.removeKitInstance);
  const showFasteners = useDiyStore((s) => s.showKitFasteners);
  const showNuts = useDiyStore((s) => s.showKitNuts);
  const setShowFasteners = useDiyStore((s) => s.setShowKitFasteners);
  const setShowNuts = useDiyStore((s) => s.setShowKitNuts);
  const bracket = useDiyStore((s) => s.brackets.find((b) => b.id === instance.bracketId));

  const cc = connectorById(bracket?.connectorId);
  // Both of these are read BEFORE the early return below, which the hook ordering
  // forces: a hook behind a condition moves position when the condition flips, and
  // flipping is exactly what an unknown kit id does — a saved model that names a
  // kit this build no longer ships renders the fallback first, then crashes on the
  // next render. The lookup itself is happy with an id it knows nothing about.
  const layout = useKitLayoutFor(instance.kitId, cc.stlUrl);
  const kit = accessoryKitById(instance.kitId);
  if (!kit) return <div className="text-xs text-neutral-500">{t('diy.unknownKit', { id: instance.kitId })}</div>;

  const fasteners = jointFasteners(kit, cc.stlUrl, bracket ? bracket.size / cc.extMm : 1, layout);
  const drawn = fasteners.filter((f) => !f.internal);
  const internal = fasteners.filter((f) => f.internal);
  const ops = kitOps(kit);

  return (
    <div className="space-y-3" data-diy-kit-panel={instance.id}>
      <Section label={t('diy.kitSection')}>
        <Row label={t('diy.kitLabel')}>{kitName(kit)}</Row>
        <Row label={t('diy.scopeLabel')}>{kit.scope === 'frame' ? t('diy.scopeFrame') : t('diy.scopeJoint')}</Row>
        <Row label={t('diy.constraintLabel')}>{t('diy.minProfile', { mm: kit.minProfileSize })}</Row>
      </Section>

      <Section label={t('diy.derivedParts')}>
        {specSummary(kit, cc.stlUrl, layout).map((line) => (
          // The key stays the raw stored name — it identifies the line — while
          // the LABEL goes through `hardwareName`, because a spec built at
          // module load froze its name in whichever language was current then.
          <Row key={line.spec.name} label={hardwareName(line.spec)}>
            ×{line.qty}
          </Row>
        ))}
        <p className="text-[10px] text-neutral-600 pt-1">
          {t('diy.qtyDerived')}
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
            {t('diy.tuneParts')}
            {layout !== null && <span className="ml-1 text-amber-500/90">{t('common.tweaked')}</span>}
          </button>
        )}
      </Section>

      {ops.length > 0 && (
        <Section label={t('diy.routing')}>
          <ul className="text-[11px] text-amber-500/90 space-y-0.5">
            {ops.map((op, i) => (
              <li key={i}>· {op}</li>
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
          <span className="text-neutral-400">{t('diy.showFasteners', { n: drawn.length })}</span>
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
          <span className="text-neutral-400">{t('diy.showNuts', { n: internal.length })}</span>
        </label>
      </div>

      <button
        onClick={() => removeKitInstance(instance.id)}
        className="w-full px-3 py-1.5 rounded text-xs border border-red-900/60 text-red-400
          hover:bg-red-900/20 transition-colors cursor-pointer"
      >
        {t('diy.deleteKit')}
      </button>
    </div>
  );
};

/** Profile property editor. */
const ProfileProps: React.FC<{ profile: DiyProfile }> = ({ profile }) => {
  const t = useT();
  const removeProfile = useDiyStore((s) => s.removeProfile);
  const updateProfileLength = useDiyStore((s) => s.updateProfileLength);
  const updateProfileSize = useDiyStore((s) => s.updateProfileSize);

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-white font-medium">{t('diy.profileHeading', { size: profile.profileSize })}</h4>

      <div className="space-y-2 text-xs text-neutral-400">
        <div className="flex justify-between">
          <span>ID</span>
          <span className="text-neutral-300 font-mono text-[10px]">{profile.id.slice(-8)}</span>
        </div>
        {/* The cross-section used to be a read-only "{dim}×{dim}mm", which made
            the one property people actually want to change the only one they
            could not. Changing it affects this profile alone — children keep
            their own size, though the ones bolted to a side face do ride
            outward with it (see `updateProfileSize`). */}
        <div className="flex justify-between items-center">
          <span>{t('diy.crossSection')}</span>
          <select
            value={profile.profileSize}
            onChange={(e) => updateProfileSize(profile.id, e.target.value as ProfileSize)}
            data-diy-profile-size={profile.id}
            className="w-24 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 focus:border-wood-600 focus:outline-none cursor-pointer"
          >
            {PROFILE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} · {PROFILE_DIMS[s]}×{PROFILE_DIMS[s]}mm
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-between">
          <span>{t('diy.length')}</span>
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
          <span>{t('diy.direction')}</span>
          <span className="text-neutral-300">{profile.direction}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('diy.position')}</span>
          <span className="text-neutral-300 font-mono text-[10px]">
            ({profile.position.x}, {profile.position.y}, {profile.position.z})
          </span>
        </div>
        {profile.parentId && (
          <div className="flex justify-between">
            <span>{t('diy.parent')}</span>
            <span className="text-neutral-300 font-mono text-[10px]">{profile.parentId.slice(-8)}</span>
          </div>
        )}
      </div>

      <button
        onClick={() => removeProfile(profile.id)}
        className="w-full px-3 py-1.5 text-xs rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer"
      >
        {t('diy.deleteWithChildren')}
      </button>
    </div>
  );
};

/** Bracket property editor with anchor offset. */
const BracketProps: React.FC<{ bracket: DiyBracket }> = ({ bracket }) => {
  const t = useT();
  const updateBracket = useDiyStore((s) => s.updateBracket);
  const removeBracket = useDiyStore((s) => s.removeBracket);
  const openBracketEditor = useDiyStore((s) => s.openBracketEditor);
  // The kit bound to THIS bracket (at most one — see `bindKit`). `find` returns
  // the instance object itself, so the reference is stable while the array is.
  const boundKit = useDiyStore((s) => s.kitInstances.find((k) => k.bracketId === bracket.id));
  const bindKit = useDiyStore((s) => s.bindKit);
  const removeKitInstance = useDiyStore((s) => s.removeKitInstance);
  const selectBracket = useDiyStore((s) => s.selectBracket);
  const [kitListOpen, setKitListOpen] = useState(false);

  const [local, setLocal] = useState({
    pos: { ...bracket.position },
    rot: { ...bracket.rotation },
    aPos: { ...bracket.anchorPosition },
    aRot: { ...bracket.anchorRotation },
  });
  // The panel keeps its own copy of the numbers so a keystroke is never clobbered
  // mid-edit. Something outside can now move a bracket while its panel is open:
  // `updateProfileSize` re-fits every `auto` bracket standing on the resized
  // geometry. A stale copy is not merely cosmetic here, because `commit` writes
  // ALL FOUR groups back on blur — so blurring any field would push the
  // pre-resize pose back over the re-fit and silently undo it.
  //
  // Our own writes are told apart from anyone else's by object identity: `commit`
  // hands the store the very objects held in `local`, and the store's map returns
  // `b` itself for brackets it did not touch, so a *changed* identity means
  // someone else wrote these numbers.
  const seen = useRef({
    pos: bracket.position, rot: bracket.rotation,
    aPos: bracket.anchorPosition, aRot: bracket.anchorRotation,
  });
  const movedOutside =
    seen.current.pos !== bracket.position || seen.current.rot !== bracket.rotation ||
    seen.current.aPos !== bracket.anchorPosition || seen.current.aRot !== bracket.anchorRotation;
  seen.current = {
    pos: bracket.position, rot: bracket.rotation,
    aPos: bracket.anchorPosition, aRot: bracket.anchorRotation,
  };

  const [localId, setLocalId] = useState(bracket.id);
  if (bracket.id !== localId || movedOutside) {
    setLocalId(bracket.id);
    setLocal({ pos: { ...bracket.position }, rot: { ...bracket.rotation }, aPos: { ...bracket.anchorPosition }, aRot: { ...bracket.anchorRotation } });
    // Also drop the kit list: this component is reused across selections, so an
    // open list would stay open over the NEXT bracket's panel — and its toggle
    // button, mid-click, would then close a list the user never opened.
    setKitListOpen(false);
  }

  const commit = () => {
    // `commit` runs on BLUR, so it fires for a field the user merely clicked into
    // and left. That must not count as an edit: `auto: false` below is the user
    // taking the numbers over, and clicking a field is not that — it would also
    // stop the bracket following a later profile resize for no reason.
    const same3 = (a: Record<string, number>, b: Record<string, number>) =>
      Object.keys(b).every((k) => a[k] === b[k]);
    if (
      same3(local.pos, bracket.position) && same3(local.rot, bracket.rotation) &&
      same3(local.aPos, bracket.anchorPosition) && same3(local.aRot, bracket.anchorRotation)
    ) return;

    // `auto: false` — these numbers are now the user's, so a later profile
    // resize must not re-derive them and quietly undo the edit.
    updateBracket(bracket.id, {
      position: local.pos, rotation: local.rot, anchorPosition: local.aPos, anchorRotation: local.aRot, auto: false,
    });
    console.log('[Bracket DIY]', bracket.id.slice(-6), 'pos:', local.pos, 'rot:', local.rot, 'anchor:', local.aPos, local.aRot);
  };

  const cls = "w-20 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-right tabular-nums focus:border-wood-600 focus:outline-none";

  const cc = connectorById(bracket.connectorId);
  const boundKitDef = boundKit ? accessoryKitById(boundKit.kitId) : null;
  const boundFitReason = boundKitDef ? kitFitReason(boundKitDef, bracket.size) : null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-white font-medium cursor-pointer" onDoubleClick={() => openBracketEditor(bracket.id)} title={t('diy.dblClickHint')}>{connectorLabel(cc)}</h4>

      <Section label={t('diy.model')}>
        <Row label={t('diy.connector')}>
          <select
            value={bracket.connectorId}
            onChange={(e) => updateBracket(bracket.id, { connectorId: e.target.value })}
            className="w-full px-1.5 py-1 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 focus:border-wood-600 focus:outline-none cursor-pointer"
          >
            {CONNECTORS.map((c) => (
              <option key={c.id} value={c.id}>
                {connectorLabel(c)} · {c.dim}
              </option>
            ))}
          </select>
        </Row>
        <div className="text-[10px] text-neutral-500 px-1">
          {cc.kind === 'cast'
            ? t('diy.builtinCast')
            : `${connectorDesc(cc)}${t('diy.fromMayTec')}`}
        </div>
      </Section>

      {/* The kit that hangs on this bracket. It was only reachable before by
          dragging a card onto the corner from the 元件库 tab — which meant you
          had to already know the corner was a valid drop target, and there was
          no way to change your mind afterwards except through the structure
          tree. Both facts are why this lives in the bracket's own panel.
          The fit check is against the BRACKET's size (the seats are its holes),
          so a 2020 bracket greys out every kit the catalog ships. */}
      <Section label={t('diy.kitSection')}>
        {boundKit ? (
          <>
            <Row label={t('diy.kitLabel')}>
              {boundKitDef ? kitName(boundKitDef) : t('diy.unknownKit', { id: boundKit.kitId })}
            </Row>
            {/* Warn, never unbind: shrinking the profile under a kit is the
                user's own edit, and silently deleting their hardware would be
                losing data behind their back. */}
            {boundFitReason && (
              <div data-diy-kit-warn={bracket.id} className="text-[10px] text-amber-500/90 px-1">{boundFitReason}</div>
            )}
            <button
              data-diy-remove-kit={bracket.id}
              onClick={() => removeKitInstance(boundKit.id)}
              className="mt-1 w-full px-2 py-1 text-[10px] rounded border border-neutral-700 text-neutral-300 hover:border-red-700 hover:text-red-300 transition-colors cursor-pointer"
            >
              {t('diy.removeKit')}
            </button>
          </>
        ) : (
          <div className="text-[10px] text-neutral-600 px-1">{t('diy.noKit')}</div>
        )}

        <button
          data-diy-add-kit={bracket.id}
          onClick={() => setKitListOpen((v) => !v)}
          className="mt-1 w-full px-2 py-1 text-[10px] rounded border border-neutral-700 text-neutral-300 hover:border-wood-600 hover:text-wood-200 transition-colors cursor-pointer"
        >
          {t('diy.addKit')}
        </button>

        {kitListOpen && (
          <div className="mt-1 space-y-1">
            {/* Same rule the store enforces by REPLACING rather than adding —
                said up front, because the button's label cannot show it. */}
            <p className="text-[10px] text-neutral-600 px-1">{t('diy.kitOnePerJoint')}</p>
            {JOINT_KITS.map((k) => {
              const reason = kitFitReason(k, bracket.size);
              const blocked = reason !== null;
              return (
                <button
                  key={k.id}
                  data-diy-kit-choice={k.id}
                  data-diy-kit-blocked={blocked ? '1' : '0'}
                  disabled={blocked}
                  title={reason ?? kitDesc(k)}
                  onClick={() => {
                    bindKit(k.id, bracket.id);
                    // `bindKit` selects the kit it just bound, which would swap
                    // this panel out for the kit panel mid-click. Put the
                    // selection back on the bracket: the user is editing a
                    // bracket and the result is what they want to look at.
                    selectBracket(bracket.id);
                    setKitListOpen(false);
                  }}
                  className={`w-full px-2 py-1 text-left text-[11px] rounded border transition-colors
                    ${
                      blocked
                        ? 'border-neutral-800/50 text-neutral-600 cursor-not-allowed'
                        : 'border-neutral-800 text-neutral-300 hover:border-wood-600 hover:text-wood-100 cursor-pointer'
                    }`}
                >
                  {kitName(k)}
                  <span className="ml-1 text-neutral-500">×{k.boltsPerJoint}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section label={t('diy.worldPos')}>
        {(['x','y','z'] as const).map((ax) => (
          <Row key={ax} label={ax.toUpperCase()}>
            <input type="number" value={Math.round(local.pos[ax])} onChange={(e) => setLocal({ ...local, pos: { ...local.pos, [ax]: Number(e.target.value) || 0 } })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={cls} step={1} />
          </Row>
        ))}
      </Section>

      <Section label={t('diy.worldRotDeg')}>
        {(['roll','pitch','yaw'] as const).map((r) => (
          <Row key={r} label={r}>
            <input type="number" value={Math.round(local.rot[r])} onChange={(e) => setLocal({ ...local, rot: { ...local.rot, [r]: Number(e.target.value) || 0 } })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={cls} step={1} />
          </Row>
        ))}
      </Section>

      <Section label={t('diy.anchorOffsetMm')}>
        {(['x','y','z'] as const).map((ax) => (
          <Row key={ax} label={ax.toUpperCase()}>
            <input type="number" value={Math.round(local.aPos[ax])} onChange={(e) => setLocal({ ...local, aPos: { ...local.aPos, [ax]: Number(e.target.value) || 0 } })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={cls} step={1} />
          </Row>
        ))}
      </Section>

      <Section label={t('diy.anchorRotDeg')}>
        {(['roll','pitch','yaw'] as const).map((r) => (
          <Row key={r} label={r}>
            <input type="number" value={Math.round(local.aRot[r])} onChange={(e) => setLocal({ ...local, aRot: { ...local.aRot, [r]: Number(e.target.value) || 0 } })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={cls} step={1} />
          </Row>
        ))}
      </Section>

      <button onClick={() => useDiyStore.getState().openBracketEditor(bracket.id)} className="w-full px-3 py-1.5 text-xs rounded bg-blue-900/40 hover:bg-blue-900/70 text-blue-400 transition-colors cursor-pointer">
        {t('diy.editIsolation')}
      </button>
      <button onClick={() => removeBracket(bracket.id)} className="w-full px-3 py-1.5 text-xs rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer">
        {t('diy.deleteBracket')}
      </button>
    </div>
  );
};

/** Screw property editor: spec, length, world pose, STL entry point. */
const SCREW_SIZES: ScrewSize[] = ['M4', 'M5', 'M6'];

const ScrewProps: React.FC<{ screw: DiyScrew }> = ({ screw }) => {
  const t = useT();
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

  const family = screw.family ?? DEFAULT_SCREW_FAMILY;
  const dims = screwDims(family, screw.size, screw.length);
  const lengths = screwLengths(family, screw.size);
  const cls = "w-20 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-right tabular-nums focus:border-wood-600 focus:outline-none";

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-white font-medium">{t('diy.screwHeading')}</h4>

      <Section label={t('diy.specSize')}>
        <div className="flex gap-1">
          {SCREW_SIZES.map((sz) => (
            <button
              key={sz}
              onClick={() =>
                updateScrew(screw.id, {
                  size: sz,
                  // The length has to survive the change: keep it when the new
                  // size holds it, otherwise take the nearest one it does (see
                  // snapScrewLength) rather than naming a part that isn't sold.
                  length: snapScrewLength(family, sz, screw.length),
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
      </Section>

      {/* Which standard the screw is. The catalog's own families, per size: DIN
          912 covers M6 only, so the row is built from the table rather than from
          a fixed list of three. */}
      <Section label={t('diy.stdFamily')}>
        <div className="flex gap-1">
          {screwFamiliesFor(screw.size).map((f) => (
            <button
              key={f}
              title={SCREW_FAMILIES[f].std}
              onClick={() =>
                updateScrew(screw.id, {
                  family: f,
                  length: snapScrewLength(f, screw.size, screw.length),
                })
              }
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                family === f
                  ? 'bg-wood-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {SCREW_FAMILIES[f].short}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-neutral-500">{headText(dims)}</p>
      </Section>

      <Section label={t('diy.lengthMm')}>
        <Row label={t('diy.length')}>
          {/* A SELECT, not a number box: `length` names a catalog part, and the
              BOM prints it verbatim. A hand-typed 17 would print a part that
              does not exist and draw the 18 the renderer snapped to. */}
          <select
            value={screw.length}
            onChange={(e) => updateScrew(screw.id, { length: Number(e.target.value) })}
            className={`${cls} cursor-pointer`}
          >
            {!lengths.includes(screw.length) && (
              <option value={screw.length}>{t('diy.noCatalogLength', { n: screw.length })}</option>
            )}
            {lengths.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </Row>
      </Section>

      <Section label={t('diy.worldPosMm')}>
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

      <Section label={t('diy.worldRotDeg')}>
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

      <button
        onClick={() => removeScrew(screw.id)}
        className="w-full px-3 py-1.5 text-xs rounded bg-red-900/30 hover:bg-red-900/60 text-red-400 transition-colors cursor-pointer"
      >
        {t('diy.deleteScrew')}
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
