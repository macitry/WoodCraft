import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import KitEditorScene from './KitEditorScene';
import PartPropertyPanel from './PartPropertyPanel';
import AppHeader from '../components/AppHeader';
import { useT } from '../i18n';
import { connectorLabel, hardwareName, kitDesc, kitName } from '../i18n/names';
import type { KitKey } from '../i18n/dict/kit';
import {
  ACCESSORY_KITS,
  SCREW_SERIES,
  accessoryKitById,
  countersunkScrew,
  holePatternFor,
  holePatternSignature,
  jointFasteners,
  socketScrew,
  tNutName,
} from '../utils/accessoryKits';
import type { HardwareKind, LocalFastener } from '../utils/accessoryKits';
import { CONNECTORS, connectorByStlUrl } from '../diy/connectors';
import { DEFAULT_BRACKET_STL_URL } from '../types/furniture';
import type { ScrewSize } from '../types/furniture';
import { DEFAULT_SCREW_FAMILY, defaultScrewLength } from '../diy/fastenerDims';
import { kitLayoutKey, useKitLayoutStore } from '../store/kitLayoutStore';

/** Kits that produce per-joint geometry, and so have parts to move. */
const JOINT_KITS = ACCESSORY_KITS.filter((k) => k.scope === 'joint');

/** `已微调` is per PART, not per kit: only the touched pieces carry a badge. */
const isEdited = (f: LocalFastener, removed: boolean): boolean =>
  f.added === true || removed;

/** What a hand-added part can be. T-nut included: a joint with a tapped profile
 *  still needs the bolt, and a tapped hole drilled in the wrong slot is exactly
 *  the kind of thing this page exists to avoid.
 *
 * One entry per KIND, not per screw family: an added screw starts on the app's
 * default standard and its family is picked in the panel like any other part —
 * a second row of near-identical buttons here would only duplicate that. */
const ADDABLE: { kind: HardwareKind; labelKey: KitKey }[] = [
  { kind: 'socket_screw', labelKey: 'kit.addSocketScrew' },
  { kind: 'countersunk_screw', labelKey: 'kit.addCountersunkScrew' },
  { kind: 't_nut', labelKey: 'kit.addTNut' },
];

const SIZES: ScrewSize[] = ['M4', 'M5', 'M6'];

/**
 * Which extrusion the preview may be drawn with.
 *
 * `2020` is deliberately absent even though `PROFILE_DIMS` knows it, and it is
 * NOT a mesh limitation any more — `public/profiles/profile_2020.stl` is a real
 * 4-slot extrusion like the other two. It is `minProfileSize: 30` on every joint
 * kit: `kitFitReason` rejects a 20 mm profile, so previewing one would draw an
 * assembly the app itself says is not allowed. Anything not listed here falls back
 * to `3030`, hand-typed `?profile=2020` included.
 *
 * PREVIEW ONLY. This value must never reach `jointFasteners`, `kitLayoutKey` or
 * the store — it changes what the bars look like and nothing else. The e2e
 * asserts that by loading the same page at two sizes and diffing every number.
 */
const OFFERED_PROFILES = ['3030', '4040'] as const;
const DEFAULT_PROFILE = '3030';

const offeredProfile = (raw: string | null): string =>
  raw && (OFFERED_PROFILES as readonly string[]).includes(raw) ? raw : DEFAULT_PROFILE;

/** The spec a hand-added part is created with: the catalog's default part for the
 *  chosen kind and size, so the new part is real hardware from the first frame
 *  and only ever gets re-specced to another real one in the panel. */
const specFor = (kind: HardwareKind, size: ScrewSize) =>
  kind === 't_nut'
    ? // A nut's slot series is not a function of its thread size, so it takes
      // the series the presets use rather than one invented from `size`.
      { kind, name: tNutName(size, SCREW_SERIES), size }
    : kind === 'countersunk_screw'
      ? countersunkScrew(size, defaultScrewLength('countersunk', size))
      : socketScrew(DEFAULT_SCREW_FAMILY, size, defaultScrewLength(DEFAULT_SCREW_FAMILY, size));

/**
 * Per-part fine tuning for an accessory kit — a full page rather than a modal,
 * because it is a 3D editing surface with a parts list beside it.
 *
 * Scope: the edits belong to the KIT'S DEFINITION, keyed by the connector's hole
 * pattern, so every joint in either mode follows at once. The page previews at
 * the identity scale (a connector rendered at `size = extMm`), so the numbers in
 * the panel are the catalog numbers — no conversion anywhere.
 *
 * Reached as `/kits?kit=<id>&stl=<connector stl>`; the connector scopes which
 * layout is being edited.
 */
const KitEditorPage: FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  // A frame-scope kit (桌板固定) budgets screws for a whole tabletop and derives
  // no geometry at all, so there is nothing here to move. Refuse it and say so
  // rather than opening a page that can never show a part.
  const requested = accessoryKitById(search.get('kit'));
  const refusedFrame = requested !== null && requested.scope !== 'joint';
  const kit = requested && requested.scope === 'joint' ? requested : JOINT_KITS[0];

  const requestedStl = search.get('stl');
  const stlUrl = requestedStl || DEFAULT_BRACKET_STL_URL;
  const cc = connectorByStlUrl(stlUrl);

  // Preview-only, and validated at the boundary: `KitEditorScene` guards its own
  // `PROFILE_DIMS` lookup, but `runMm` is anchored on 3030 and a bogus value must
  // not be able to move it.
  const profile = offeredProfile(search.get('profile'));

  /** Every in-page move between kits or hole patterns keeps the chosen
   *  extrusion. Built here rather than spelled out at each `navigate` so a new
   *  navigation cannot quietly drop it — at the time of writing there are two. */
  const editorUrl = (kitId: string, connectorStl: string) =>
    `/kits?kit=${kitId}&stl=${encodeURIComponent(connectorStl)}&profile=${profile}`;

  const setEditingKey = useKitLayoutStore((s) => s.setEditingKey);
  const selectPart = useKitLayoutStore((s) => s.selectPart);
  const selectedPartKey = useKitLayoutStore((s) => s.selectedPartKey);
  const resetKit = useKitLayoutStore((s) => s.resetKit);

  const setKey = kitLayoutKey(kit.id, cc.stlUrl);
  // Subscribed to the stored reference (or the null primitive) — building an
  // object here would loop React 18's useSyncExternalStore. The whole map is
  // subscribed too, for the per-pattern 「已微调」 badges: it is one stored
  // object whose identity only changes when an edit lands.
  const layout = useKitLayoutStore((s) => s.layouts[setKey] ?? null);
  const layouts = useKitLayoutStore((s) => s.layouts);

  // Connectors that hole-to-hole identical share one layout, so the honest unit
  // to offer is the PATTERN, not the connector: `holePatternFor` reads only
  // `extMm`, and the catalog has several sizes with matching extents. Editing
  // the pattern is what actually happens; naming the connector is just how the
  // user gets there. CONNECTORS already lists the cast bracket first.
  const cSig = holePatternSignature(holePatternFor(cc.stlUrl));
  const patternGroups = useMemo(() => {
    const bySig = new Map<string, typeof CONNECTORS>();
    for (const c of CONNECTORS) {
      const sig = holePatternSignature(holePatternFor(c.stlUrl));
      const list = bySig.get(sig);
      if (list) list.push(c);
      else bySig.set(sig, [c]);
    }
    return [...bySig].map(([sig, list]) => ({
      sig,
      list,
      edited: layouts[kitLayoutKey(kit.id, list[0].stlUrl)] != null,
    }));
  }, [kit.id, layouts]);

  useEffect(() => {
    setEditingKey(setKey);
  }, [setKey, setEditingKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape backs out one step at a time: drop the selection, then leave.
      if (useKitLayoutStore.getState().selectedPartKey) selectPart(null);
      else navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, selectPart]);

  const fasteners = useMemo(
    () => jointFasteners(kit, cc.stlUrl, 1, layout),
    [kit, cc.stlUrl, layout],
  );
  // The SAME derivation with no layout: where each seat sits and what it carries
  // before any edit. The panel needs both, because every stored value is a delta
  // against this — and a hand-added part has no seat here at all, which is
  // exactly how the panel tells the two kinds apart.
  const presets = useMemo(() => jointFasteners(kit, cc.stlUrl, 1, null), [kit, cc.stlUrl]);
  const baseByKey = useMemo(
    () => new Map(presets.map((f) => [f.key, [...f.position] as [number, number, number]])),
    [presets],
  );
  const baseSpecByKey = useMemo(() => new Map(presets.map((f) => [f.key, f.spec])), [presets]);
  const edits = layout?.parts ?? {};

  // The list and the 3D draw DIFFERENT sets, on purpose. `jointFasteners` drops a
  // hidden part outright (that is what keeps 3D === CSV), so listing its own
  // output would make a hidden part unreachable — gone from the list, gone from
  // the panel, and no way back short of `恢复整套默认`. The list is therefore the
  // union: every seat that CAN carry a part, plus whatever was added by hand.
  const drawnByKey = useMemo(() => new Map(fasteners.map((f) => [f.key, f])), [fasteners]);
  const listRows = useMemo(() => {
    const rows = presets.map((f) => drawnByKey.get(f.key) ?? f);
    for (const f of fasteners) if (f.added) rows.push(f);
    return rows;
  }, [presets, fasteners, drawnByKey]);
  const hiddenCount = listRows.length - fasteners.length;
  const panelPart = listRows.find((f) => f.key === selectedPartKey);

  const [adding, setAdding] = useState(false);
  const [addKind, setAddKind] = useState<HardwareKind>('socket_screw');
  const [addSize, setAddSize] = useState<ScrewSize>('M6');
  const addPart = useKitLayoutStore((s) => s.addPart);

  // A hand-added part lands where the selected one is — "one more of these" is
  // the common case — and is selected on arrival, so the gizmo is already up and
  // it can be dragged clear. With nothing selected it lands on the first seat.
  const handleAdd = () => {
    const host = panelPart ?? presets[0];
    const position = host
      ? ([...host.position] as [number, number, number])
      : ([cc.extMm / 2, cc.extMm / 2, 0] as [number, number, number]);
    // The store keeps an added part's rotation in DEGREES (see ExtraPart); the
    // drawn fastener carries radians, so it converts back the same way the
    // property panel's rotation fields do.
    const rotation = host
      ? (host.rotation.map((r) => (r * 180) / Math.PI) as [number, number, number])
      : ([0, 0, 0] as [number, number, number]);
    const key = addPart(setKey, specFor(addKind, addSize), position, rotation);
    selectPart(key);
    setAdding(false);
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-neutral-950 overflow-hidden">
      <AppHeader
        active="kits"
        left={<span className="text-sm font-semibold text-white">{kitName(kit)}</span>}
        right={
          <>
            <span className="text-xs text-neutral-500 tabular-nums">
              {t('kit.count', { n: fasteners.length })}
              {hiddenCount > 0 && (
                <span className="text-amber-500/80"> {t('kit.hiddenCount', { n: hiddenCount })}</span>
              )}
            </span>
            <button
              onClick={() => resetKit(setKey)}
              disabled={layout === null}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                layout === null
                  ? 'bg-neutral-900 text-neutral-600 cursor-not-allowed'
                  : 'bg-neutral-800 text-neutral-300 hover:text-white cursor-pointer'
              }`}
              title={layout === null ? t('kit.resetAllNone') : t('kit.resetAllHint')}
            >
              {t('kit.resetAll')}
            </button>
          </>
        }
        banner={
          refusedFrame && (
            <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-600/40 text-[11px] text-amber-300">
              {t('kit.frameRefused', { name: kitName(requested ?? kit) })}
            </div>
          )
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left — kit + parts */}
        <aside className="w-72 flex-shrink-0 flex flex-col border-r border-neutral-800 overflow-hidden">
          <div className="p-3 border-b border-neutral-800">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">{t('kit.library')}</p>
            <div className="mt-2 space-y-1">
              {ACCESSORY_KITS.map((k) => {
                const editable = k.scope === 'joint';
                // Listed, but not a destination: a frame-scope kit prices a whole
                // tabletop and derives no geometry, so there is nothing here to
                // tune. Making it clickable would produce a false state — the URL
                // would say `tabletop-fix` while the highlighted kit, the scene
                // and the parts list all stayed on the fallback. The reason is
                // written on the row instead, where the question gets asked.
                return (
                  <button
                    key={k.id}
                    data-kit={k.id}
                    data-editable={editable ? 'true' : 'false'}
                    disabled={!editable}
                    onClick={editable ? () => navigate(editorUrl(k.id, cc.stlUrl)) : undefined}
                    className={`w-full px-2 py-1.5 text-left text-xs rounded border transition-colors ${
                      !editable
                        ? 'border-neutral-800/60 text-neutral-600 cursor-not-allowed'
                        : k.id === kit.id
                          ? 'border-wood-600 bg-wood-500/15 text-wood-200 cursor-pointer'
                          : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 cursor-pointer'
                    }`}
                  >
                    <span className="block font-medium">{kitName(k)}</span>
                    <span className="block text-[10px] text-neutral-500 mt-0.5">
                      {editable ? kitDesc(k) : t('kit.frameNotEditable')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-3 py-2 border-b border-neutral-800">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">{t('kit.holeTable')}</p>
            <p className="text-[11px] text-neutral-300 mt-1">
              {connectorLabel(cc)} · {cc.dim}
            </p>
            <p className="text-[10px] text-neutral-600 mt-0.5 leading-snug">
              {t('kit.holeTableNote')}
            </p>
            <div className="mt-1.5 space-y-0.5">
              {patternGroups.map((g) => {
                const on = g.sig === cSig;
                return (
                  <button
                    key={g.sig}
                    data-pattern={g.sig}
                    onClick={() => navigate(editorUrl(kit.id, g.list[0].stlUrl))}
                    title={g.list.map((c) => `${connectorLabel(c)} (${c.dim})`).join(' / ')}
                    className={`w-full px-2 py-1 text-left text-[10px] rounded border transition-colors cursor-pointer ${
                      on
                        ? 'border-wood-600 bg-wood-500/15 text-wood-200'
                        : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span className="truncate tabular-nums">
                        {g.list.map((c) => c.dim).join(' / ')}
                      </span>
                      {g.list.length > 1 && (
                        <span className="flex-shrink-0 text-neutral-600">{t('kit.sharedCount', { n: g.list.length })}</span>
                      )}
                      {g.edited && (
                        <span className="ml-auto flex-shrink-0 text-amber-500/90">{t('common.tweaked')}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-3 py-2 border-b border-neutral-800">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">{t('kit.profile')}</p>
            <div className="mt-1.5 flex gap-1">
              {OFFERED_PROFILES.map((size) => (
                <button
                  key={size}
                  data-profile={size}
                  onClick={() => navigate(editorUrl(kit.id, cc.stlUrl))}
                  aria-pressed={size === profile}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors cursor-pointer tabular-nums ${
                    size === profile
                      ? 'border-wood-600 bg-wood-500/15 text-wood-200'
                      : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-600 mt-1 leading-snug">
              {t('kit.profileNote')}
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
              {t('kit.parts')} <span className="text-neutral-600 normal-case">{t('kit.partsCount', { n: listRows.length })}</span>
            </p>
            <div className="mt-2 space-y-0.5">
              {listRows.map((f) => {
                const edit = edits[f.key];
                const removed = edit?.removed === true;
                const on = f.key === selectedPartKey;
                return (
                  <button
                    key={f.key}
                    data-part={f.key}
                    data-hidden={removed ? 'true' : undefined}
                    onClick={() => selectPart(on ? null : f.key)}
                    className={`w-full px-2 py-1 text-left text-[11px] rounded border transition-colors cursor-pointer ${
                      on
                        ? 'border-wood-600 bg-wood-500/15 text-wood-100'
                        : removed
                          ? 'border-neutral-800 text-neutral-600 line-through'
                          : 'border-transparent text-neutral-300 hover:border-neutral-700'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span className="truncate">{hardwareName(f.spec)}</span>
                      {(isEdited(f, removed) || removed) && (
                        <span className="ml-auto flex-shrink-0 text-[9px] text-amber-500/90">
                          {removed ? t('common.hidden') : t('common.tweaked')}
                        </span>
                      )}
                    </span>
                    <span className="block text-[9px] text-neutral-600 tabular-nums">
                      {f.position.map((v) => v.toFixed(1)).join(', ')} mm
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Hand-added hardware. It has no seat, so the store keeps its
                position as an absolute value rather than a delta — see
                PartPropertyPanel. */}
            <div className="mt-3 pt-2 border-t border-neutral-800">
              <button
                data-add-toggle
                onClick={() => setAdding((v) => !v)}
                className="w-full px-2 py-1.5 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:border-wood-600 hover:text-wood-200 transition-colors cursor-pointer"
              >
                {t('kit.addPart')}
              </button>
              {adding && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {ADDABLE.map((a) => (
                      <button
                        key={a.kind}
                        data-add-kind={a.kind}
                        onClick={() => setAddKind(a.kind)}
                        className={`px-2 py-1 text-[10px] rounded transition-colors cursor-pointer ${
                          a.kind === addKind
                            ? 'bg-wood-600 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {t(a.labelKey)}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {SIZES.map((sz) => (
                      <button
                        key={sz}
                        data-add-size={sz}
                        onClick={() => setAddSize(sz)}
                        className={`px-2 py-1 text-[10px] rounded transition-colors cursor-pointer ${
                          sz === addSize
                            ? 'bg-wood-600 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                  <button
                    data-add-confirm
                    onClick={handleAdd}
                    className="w-full px-2 py-1.5 text-[11px] rounded bg-wood-600 hover:bg-wood-500 text-white transition-colors cursor-pointer"
                  >
                    {panelPart ? t('kit.addAtPart', { name: hardwareName(panelPart.spec) }) : t('kit.addAtFirst')}
                  </button>
                  <p data-add-preview className="text-[10px] text-neutral-600 leading-snug">
                    {t('kit.addHint')}
                    {hardwareName(specFor(addKind, addSize))} · {t('kit.addTotal', { n: listRows.length + 1 })}
                  </p>
                </div>
              )}

              {/* The scope of a tweak, stated where the tweaks are made. The
                  parts are positions and quantities — no hole is cut in any
                  model and the connector's own STL is untouched, so a shop
                  building from this still drills from the drawing. */}
              <p className="mt-2 text-[10px] text-neutral-600 leading-snug">
                {t('kit.tweakScopeNote')}
              </p>
            </div>
          </div>
        </aside>

        {/* Center — 3D */}
        <main className="flex-1 relative">
          <KitEditorScene
            kit={kit}
            stlUrl={cc.stlUrl}
            profileSize={profile}
            layout={layout}
            selectedPartKey={selectedPartKey}
            onSelect={selectPart}
            baseByKey={baseByKey}
            setKey={setKey}
          />
          <div className="absolute top-3 left-3 pointer-events-none px-3 py-2 rounded-lg bg-black/55 backdrop-blur-sm text-[10px] text-neutral-400 leading-relaxed">
            <p>{t('view.orbitHint')}</p>
            <p>{t('kit.pickHint')}</p>
            <p className="text-neutral-500 mt-0.5">{t('kit.escHint')}</p>
          </div>
        </main>

        {/* Right — the selected part */}
        <aside className="w-64 flex-shrink-0 border-l border-neutral-800 overflow-y-auto p-3">
          {(() => {
            const fastener = panelPart;
            if (!fastener) {
              return (
                <p className="text-[11px] text-neutral-600 leading-snug">
                  {t('kit.nothingSelected')}
                </p>
              );
            }
            const extra = layout?.extra.find((e) => `extra:${e.id}` === fastener.key);
            return (
              <PartPropertyPanel
                // Remounted whenever the part or its drawn value changes, which is
                // what reseeds the number drafts: typing is unaffected (the store
                // only moves on blur/Enter), but a DRAG lands in the boxes.
                key={`${fastener.key}|${fastener.position.join(',')}|${fastener.spec.name}`}
                setKey={setKey}
                fastener={fastener}
                base={baseByKey.get(fastener.key) ?? [0, 0, 0]}
                baseSpec={baseSpecByKey.get(fastener.key) ?? fastener.spec}
                edit={edits[fastener.key]}
                extra={extra}
              />
            );
          })()}
        </aside>
      </div>
    </div>
  );
};

export default KitEditorPage;
