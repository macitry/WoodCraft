import { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import ProfileStlPreview from './ProfileStlPreview';
import { ScrewMesh, TNutMesh } from '../diy/FastenerStl';
import { DEFAULT_SCREW_FAMILY, defaultScrewLength } from '../diy/fastenerDims';
import { screwFamiliesFor, screwLengths } from '../diy/fasteners';
import type { ScrewFamily } from '../diy/fasteners';
import { CONNECTORS, connectorById } from '../diy/connectors';
import type { DiyConnector } from '../diy/connectors';
import type { DiyHand, ProfileSize, ScrewSize } from '../types/furniture';
import { DEFAULT_BRACKET_STL_URL, PROFILE_DIMS } from '../types/furniture';
import {
  JOINT_KITS,
  SCREW_FAMILIES,
  SCREW_SERIES,
  accessoryKitById,
  jointFasteners,
  kitFitReason,
  layoutFor,
  specSummary,
} from '../utils/accessoryKits';
import type { AccessoryKit, HardwareSpec, KitLayoutMap } from '../utils/accessoryKits';
import { useKitLayoutFor, useKitLayoutStore } from '../store/kitLayoutStore';
import { useT, hasKey } from '../i18n';
import {
  connectorLabel,
  connectorDesc,
  hardwareName,
  kitName,
  kitDesc,
  screwFamilyLabel,
} from '../i18n/names';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SIZES: { id: ProfileSize; label: string; color: string; desc: string }[] = [
  { id: '2020', label: '2020', color: '#8a8a8a', desc: '20×20mm' },
  { id: '3030', label: '3030', color: '#a0a0a0', desc: '30×30mm' },
  { id: '4040', label: '4040', color: '#b8b8b8', desc: '40×40mm' },
];

/** Card chip glyph per connector material kind. */
const KIND_ICON: Record<DiyConnector['kind'], string> = {
  cast: '└┘',
  alu: '└┘',
  pa: '⊿',
  steel: '⌐',
  // Die-cast zinc, the same └┘ shape as the cast aluminium brackets it sits beside
  // — a cover IS an angle from the outside, which is the entire point of one.
  zinc: '└┘',
};

/** One card per (standard, thread size) the catalog actually holds — the drag
 *  payload carries both, so a card in the 沉头 group drops a countersunk screw.
 *
 *  Grouped by standard rather than listed as three sizes, because
 *  「M4 / M5 / M6」 describes the app's *parameter*, not its shelf: the catalog's
 *  smallest family (DIN 912) holds one size and its largest holds thirty-three
 *  lengths, and a single M6 card said neither. The length is still picked after
 *  placing, in the property panel, which is where the full run of lengths lives —
 *  the card states which one that will be (`diy.screwCardLengths`) rather than
 *  leaving it to be discovered.
 *
 *  Derived from `screwFamiliesFor` rather than written out, so this list cannot
 *  outlive the catalog it describes: a standard that gains or loses a thread size
 *  moves here on its own, and one the app holds none of disappears instead of
 *  rendering a header over nothing. */
const SCREW_SIZES: { id: ScrewSize; label: string }[] = [
  { id: 'M4', label: 'M4' },
  { id: 'M5', label: 'M5' },
  { id: 'M6', label: 'M6' },
];

/** The standards, in the catalog's own order.
 *
 *  Recovered rather than retyped: `screwFamiliesFor` filters a fixed order list,
 *  so whichever thread size spans the most standards hands back their order — the
 *  widest row IS the catalog's. Same order as the property panel's standard row,
 *  which asks the same function. */
const SCREW_FAMILY_ORDER = SCREW_SIZES.map((s) => screwFamiliesFor(s.id)).reduce(
  (widest, row) => (row.length > widest.length ? row : widest),
);

const SCREW_GROUPS = SCREW_FAMILY_ORDER.map((family) => ({
  family,
  sizes: SCREW_SIZES.filter((s) => screwFamiliesFor(s.id).includes(family)),
})).filter((g) => g.sizes.length > 0);

/** One hovered-id string identifies every card in this pane, screw cards
 *  included — so a screw card's is its pair, and the reader below turns it back
 *  into a part. Built through one pair of functions so the two directions cannot
 *  drift. */
const screwCardId = (family: ScrewFamily, size: ScrewSize) => `${family}|${size}`;
const screwFromCardId = (id: string | null): { family: ScrewFamily; size: ScrewSize } | null => {
  const [family, size] = (id ?? '').split('|');
  const known = SCREW_GROUPS.some(
    (g) => g.family === family && g.sizes.some((s) => s.id === size),
  );
  return known ? { family: family as ScrewFamily, size: size as ScrewSize } : null;
};

type TabId = 'profiles' | 'connectors' | 'screws' | 'kits';

/**
 * Kits offered in the DIY builder: the joint-scope ones, from the shared list.
 *
 * A frame-scope kit (桌板固定) budgets screws for a whole tabletop and the DIY
 * builder has no tabletop, so binding one to a corner would invent screws that
 * belong to nothing. The main configurator, which does have a tabletop, offers
 * all four. The bracket's property panel offers the same joint-scope list, which
 * is why the filter itself lives in `accessoryKits.ts` now.
 */
const DIY_KITS = JOINT_KITS;

/**
 * The part names a kit card advertises, after the user's edits.
 *
 * Derived through specSummary rather than kitParts: the latter is the PRESET
 * list, so it would keep naming a spec the user has since replaced and keep
 * counting a part they deleted. Resolved against DEFAULT_BRACKET_STL_URL
 * because a catalog card has no bracket bound to it yet — which is the same
 * connector RotatingKitMesh previews, so the thumbnail, the caption and the
 * card cannot disagree with each other.
 */
const kitLineNames = (kitId: string, layouts: KitLayoutMap | null): string[] =>
  specSummary(
    accessoryKitById(kitId),
    DEFAULT_BRACKET_STL_URL,
    layoutFor(layouts, kitId, DEFAULT_BRACKET_STL_URL),
  ).map((line) => hardwareName(line.spec));

// ---------------------------------------------------------------------------
// Rotating 3D bracket preview
// ---------------------------------------------------------------------------

/**
 * Auto-rotating connector mesh (runs inside a Canvas). Loads the connector's
 * own STL, re-centred and scaled so its largest extent spans `target` (12 mm).
 */
const RotatingConnectorMesh: React.FC<{ url: string; color: string }> = ({ url, color }) => {
  const groupRef = useRef<THREE.Group>(null);
  const geom = useLoader(STLLoader, url);

  const processed = useMemo(() => {
    const g = geom.clone();
    const pos = g.getAttribute('position');
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const target = 0.012;
    const sc = extent > 0 ? target / extent : 1;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (pos.getX(i) - cx) * sc, (pos.getY(i) - cy) * sc, (pos.getZ(i) - cz) * sc);
    }
    pos.needsUpdate = true;
    return g;
  }, [geom]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.65;
    groupRef.current.rotation.x = Math.sin(groupRef.current.rotation.y * 2.3) * 0.16;
    groupRef.current.rotation.z = Math.cos(groupRef.current.rotation.y * 1.7) * 0.09;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={processed}>
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.38} />
      </mesh>
    </group>
  );
};

/** Small 3D canvas showing the hovered connector model, auto-rotating. */
const Bracket3DPreview: React.FC<{ connector: DiyConnector }> = ({ connector }) => (
  <Canvas
    camera={{ position: [0, 0.005, 0.038], fov: 35, near: 0.001, far: 0.3 }}
    style={{ width: '100%', height: '100%', background: '#f5f5f5', borderRadius: 4 }}
    gl={{ antialias: true }}
  >
    <gridHelper args={[0.06, 12, '#cccccc', '#e8e8e8']} position={[0, -0.008, 0]} />
    <ambientLight intensity={0.5} />
    <directionalLight position={[1.5, 2.5, 2]} intensity={0.7} />
    <directionalLight position={[-1, -0.5, -1]} intensity={0.2} />
    <Suspense fallback={null}>
      <RotatingConnectorMesh url={connector.stlUrl} color={connector.color} />
    </Suspense>
  </Canvas>
);

/** Auto-rotating screw mesh — rendered INSIDE the preview Canvas.
 *
 *  It draws the standard too, not just the size: with the cards grouped, a
 *  preview showing a DIN 7984 while the hovered card says 沉头 would be the one
 *  thing on screen contradicting the card. */
const RotatingScrewMesh: React.FC<{ size: ScrewSize; family: ScrewFamily }> = ({ size, family }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.65;
  });

  return (
    <group ref={groupRef} scale={0.001}>
      <ScrewMesh
        family={family}
        size={size}
        length={defaultScrewLength(family, size)}
      />
    </group>
  );
};

/** Small 3D canvas showing the screw, auto-rotating. */
const Screw3DPreview: React.FC<{ size: ScrewSize; family: ScrewFamily }> = ({ size, family }) => (
  <Canvas
    camera={{ position: [0, 0.006, 0.045], fov: 35, near: 0.001, far: 0.3 }}
    style={{ width: '100%', height: '100%', background: '#f5f5f5', borderRadius: 4 }}
    gl={{ antialias: true }}
  >
    <gridHelper args={[0.06, 12, '#cccccc', '#e8e8e8']} position={[0, -0.01, 0]} />
    <ambientLight intensity={0.5} />
    <directionalLight position={[1.5, 2.5, 2]} intensity={0.7} />
    <directionalLight position={[-1, -0.5, -1]} intensity={0.2} />
    <Suspense fallback={null}>
      <RotatingScrewMesh size={size} family={family} />
    </Suspense>
  </Canvas>
);

// ---------------------------------------------------------------------------
// Rotating accessory-kit preview
// ---------------------------------------------------------------------------

/** Cast bracket centre (mm) — the preview orbits about it so the corner stays put. */
const KIT_ORBIT_CX = 9.5;
const KIT_ORBIT_CY = 9.5;

/** Hardware mesh for one spec, in the bracket-local mm frame. */
const HardwareMesh: React.FC<{ spec: HardwareSpec }> = ({ spec }) => {
  const size = spec.size ?? 'M6';
  return spec.kind === 't_nut' ? (
    <TNutMesh size={size} series={SCREW_SERIES} color="#b08d57" />
  ) : (
    <ScrewMesh
      family={spec.family ?? DEFAULT_SCREW_FAMILY}
      size={size}
      length={spec.length ?? 0}
      // Steel for every screw, as the BOM's material column says: the brass tone
      // belonged to the 木螺钉 this replaced.
      color="#c8c8c8"
    />
  );
};

/**
 * The kit's hardware on a ghosted cast bracket, auto-rotating. Fasteners are
 * placed at exactly the bracket-local seats the renderers use, so this preview
 * is the same geometry the 3D scene will show — including the T-nuts.
 */
const RotatingKitMesh: React.FC<{ kit: AccessoryKit }> = ({ kit }) => {
  const groupRef = useRef<THREE.Group>(null);
  // The preview stands in for a cast bracket, so it resolves through that
  // connector's pattern — the same lookup the real scene does. Showing the
  // PRESET here would promise parts the user would not get after editing.
  const layout = useKitLayoutFor(kit.id, DEFAULT_BRACKET_STL_URL);
  const items = useMemo(
    () => jointFasteners(kit, DEFAULT_BRACKET_STL_URL, 1, layout),
    [kit, layout],
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.65;
    groupRef.current.rotation.x = Math.sin(groupRef.current.rotation.y * 2.3) * 0.16;
  });

  return (
    <group ref={groupRef} scale={0.001}>
      <group position={[-KIT_ORBIT_CX, -KIT_ORBIT_CY, 0]}>
        {/* Ghosted plate so the fasteners read as "on a bracket". */}
        <mesh position={[KIT_ORBIT_CX, KIT_ORBIT_CY, 0]}>
          <boxGeometry args={[21, 21, 17]} />
          <meshStandardMaterial color="#707070" wireframe transparent opacity={0.22} />
        </mesh>
        {items.map((f, i) => (
          <group
            key={`${f.spec.kind}-${i}`}
            position={f.position}
            rotation={f.rotation as unknown as [number, number, number]}
          >
            <HardwareMesh spec={f.spec} />
          </group>
        ))}
      </group>
    </group>
  );
};

/** Small 3D canvas for a kit. */
const Kit3DPreview: React.FC<{ kit: AccessoryKit }> = ({ kit }) => {
  return (
    <Canvas
      camera={{ position: [0, 0.005, 0.042], fov: 35, near: 0.001, far: 0.3 }}
      style={{ width: '100%', height: '100%', background: '#f5f5f5', borderRadius: 4 }}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[1.5, 2.5, 2]} intensity={0.8} />
      <directionalLight position={[-1, -0.5, -1]} intensity={0.25} />
      <RotatingKitMesh kit={kit} />
    </Canvas>
  );
};

// ---------------------------------------------------------------------------
// Library panel component
// ---------------------------------------------------------------------------

const DiyProfileLibrary: React.FC = () => {
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabId>('profiles');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const setShowCornerHints = useDiyStore((s) => s.setShowCornerHints);
  // Preview defaults: follow the hovered card; when idle show the currently
  // selected item of the active tab's type, else that tab's first entry.
  // These selectors return a scalar so the strip doesn't re-render on every
  // scene mutation (drag/stretch only change the arrays, not these values).
  const selProfileSize = useDiyStore(
    (s) => s.profiles.find((p) => p.id === s.selectedProfileId)?.profileSize ?? null,
  );
  const selConnectorId = useDiyStore(
    (s) => s.brackets.find((b) => b.id === s.selectedBracketId)?.connectorId ?? null,
  );
  const selScrewSize = useDiyStore(
    (s) => s.screws.find((sc) => sc.id === s.selectedScrewId)?.size ?? null,
  );
  const selScrewFamily = useDiyStore(
    (s) => s.screws.find((sc) => sc.id === s.selectedScrewId)?.family ?? null,
  );
  // Cross-section the fit gate is judged against: the selected bracket's size
  // if one is selected, else the selected profile's. 0 = nothing selected, and
  // then no kit is greyed out (we have nothing to judge against).
  const selBracketSize = useDiyStore(
    (s) => s.brackets.find((b) => b.id === s.selectedBracketId)?.size ?? null,
  );
  // The part the next scene-click will place. Holding is not a mode — it does
  // not change what the pointer does, only which part the ghosts place, and a
  // click on the scene is the only thing that consumes it.
  const hand = useDiyStore((s) => s.hand);
  const pickUpHand = useDiyStore((s) => s.pickUpHand);
  // The connector the next bracket will be built from — the last one chosen or
  // placed. It outlives the hand on purpose (see `lastConnectorId` in the store),
  // so this stays highlighted after a placement: the card is the answer to
  // "which one am I placing", not only to "what am I holding".
  const lastConnectorId = useDiyStore((s) => s.lastConnectorId);

  /** True while this card's part is the one in hand. */
  const isHeld = (h: DiyHand): boolean => {
    if (!hand) return false;
    switch (h.kind) {
      case 'profile': return hand.kind === 'profile' && hand.size === h.size;
      case 'connector': return hand.kind === 'connector' && hand.connectorId === h.connectorId;
      case 'screw':
        return hand.kind === 'screw' && hand.size === h.size && hand.family === h.family;
      case 'kit': return hand.kind === 'kit' && hand.kitId === h.kitId;
    }
  };

  /**
   * Card chrome. All four tabs share one treatment now: picking a part is the
   * same gesture everywhere, so it has to look the same everywhere. Before this
   * only the connector card had a held state, because only it could be armed.
   *
   * The argument is "is this card the one in play", which for connectors is
   * wider than "is it in hand" — see the `current` flag at the call site.
   */
  const cardClass = (held: boolean) =>
    `flex items-center gap-3 p-3 rounded-lg border bg-neutral-900/50 cursor-pointer
     transition-colors group
     ${held
       ? 'border-wood-500 ring-1 ring-wood-500/40'
       : 'border-neutral-800 hover:border-neutral-600'
     }`;

  /** The corner badge: an invitation to pick up, a tick once in hand. */
  const cardBadge = (held: boolean) => (
    <span className={`text-xs ${held ? 'text-wood-400' : 'text-neutral-700'}`}>
      {held ? '✓' : '+'}
    </span>
  );

  const handleMouseEnter = (id: string) => setHoveredId(id);

  const handleMouseLeave = () => setHoveredId(null);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'profiles', label: t('diy.tabProfiles') },
    { id: 'connectors', label: t('diy.tabConnectors') },
    { id: 'screws', label: t('diy.tabScrews') },
    { id: 'kits', label: t('diy.tabKits') },
  ];

  // Subscribed, not read once: the cards below list parts, and a card that kept
  // showing preset hardware after an edit would disagree with both the rotating
  // preview above it and the property panel on the other side of the screen.
  // The whole map rather than useKitLayoutFor because this renders every kit.
  const layouts = useKitLayoutStore((s) => s.layouts);

  // Resolved models for the inline preview strip.
  const previewProfileSize: ProfileSize =
    SIZES.find((x) => x.id === hoveredId)?.id ?? selProfileSize ?? SIZES[0].id;
  const previewConnector = connectorById(
    CONNECTORS.find((c) => c.id === hoveredId)?.id ?? selConnectorId ?? CONNECTORS[0].id,
  );
  // A screw card identifies itself as `family|size` — the size alone is
  // ambiguous now that three standards hold an M6, and the strip has to draw the
  // one the card is offering.
  const hoveredScrew = screwFromCardId(hoveredId);
  const previewScrewSize: ScrewSize = hoveredScrew?.size ?? selScrewSize ?? SCREW_SIZES[0].id;
  const previewScrewFamily: ScrewFamily =
    hoveredScrew?.family ?? selScrewFamily ?? DEFAULT_SCREW_FAMILY;
  const previewKit =
    DIY_KITS.find((k) => k.id === hoveredId) ?? DIY_KITS[0];
  // Cross-section the Kits tab greys cards against; null = nothing selected.
  const fitMm: number | null =
    selBracketSize ?? (selProfileSize ? PROFILE_DIMS[selProfileSize] : null);
  const captionDim = PROFILE_DIMS[previewProfileSize];
  const previewCaption =
    activeTab === 'profiles'
      ? t('diy.captionProfile', { size: previewProfileSize, dim: captionDim })
      : activeTab === 'connectors'
        ? `${connectorLabel(previewConnector)} · ${previewConnector.dim}`
        : activeTab === 'kits'
          ? `${kitName(previewKit)} · ${kitLineNames(previewKit.id, layouts).join(' + ')}`
          : t('diy.captionScrew', {
              std: SCREW_FAMILIES[previewScrewFamily].std,
              size: previewScrewSize,
            });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs */}
      <div className="px-3 pt-2 flex-shrink-0">
        <div className="flex border-b border-neutral-700">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer
                ${activeTab === t.id
                  ? 'text-wood-300 border-b-2 border-wood-500 -mb-px'
                  : 'text-neutral-500 hover:text-neutral-300 border-b-2 border-transparent'
                }`}
              onClick={() => { setActiveTab(t.id); setHoveredId(null); setShowCornerHints(t.id === 'connectors'); }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inline 3D preview strip (below tabs, collapsible) */}
      <div className="flex-shrink-0 border-b border-neutral-800">
        <div className="px-3 py-1.5 flex items-center gap-1.5">
          <button
            onClick={() => setPreviewOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
            title={previewOpen ? t('diy.collapsePreview') : t('diy.expandPreview')}
          >
            <span className="text-[8px]">{previewOpen ? '▼' : '▶'}</span>
            <span>{t('diy.previewStrip')}</span>
          </button>
          <span data-preview-caption className="text-[10px] text-neutral-600 truncate">{previewCaption}</span>
        </div>
        {/* Body stays mounted (display toggled) so WebGL contexts survive
            collapse; the three tab Canvases each fill the strip. */}
        <div className="relative h-40" style={{ display: previewOpen ? 'block' : 'none' }}>
          <div
            className="absolute inset-0"
            style={{ display: activeTab === 'profiles' ? 'block' : 'none' }}
          >
            <ProfileStlPreview profileSize={Number(previewProfileSize)} fill />
          </div>
          <div
            className="absolute inset-0"
            style={{ display: activeTab === 'connectors' ? 'block' : 'none' }}
          >
            <Bracket3DPreview connector={previewConnector} />
          </div>
          <div
            className="absolute inset-0"
            style={{ display: activeTab === 'screws' ? 'block' : 'none' }}
          >
            <Screw3DPreview size={previewScrewSize} family={previewScrewFamily} />
          </div>
          <div
            className="absolute inset-0"
            style={{ display: activeTab === 'kits' ? 'block' : 'none' }}
          >
            <Kit3DPreview kit={previewKit} />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {activeTab === 'profiles' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">{t('diy.pickProfileHint')}</p>
            {SIZES.map((s) => {
              const held = isHeld({ kind: 'profile', size: s.id });
              return (
                <div
                  key={s.id}
                  data-diy-card={`profile:${s.id}`}
                  data-diy-card-held={held ? '1' : '0'}
                  onMouseEnter={() => handleMouseEnter(s.id)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => pickUpHand({ kind: 'profile', size: s.id })}
                  className={cardClass(held)}
                >
                  <div
                    className="w-10 h-10 rounded flex-shrink-0 border-2 flex items-center justify-center font-mono text-[10px]"
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
                  {cardBadge(held)}
                </div>
              );
            })}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p>{t('diy.helpPickProfileRoot')}</p>
              <p>{t('diy.helpHoverFace')}</p>
              <p>{t('diy.helpDragArrow')}</p>
              <p>{t('diy.helpMove')}</p>
            </div>
          </>
        )}

        {activeTab === 'connectors' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">{t('diy.pickConnectorHint')}</p>
            {CONNECTORS.map((c) => {
              // Held = clicking the scene's corner ghosts drops THIS connector.
              // Clicking the held card again puts it back down (`pickUpHand`
              // toggles), so the card is a two-state switch, not a one-way mode.
              const held = isHeld({ kind: 'connector', connectorId: c.id });
              // Highlighted for the whole time this connector is the one in play,
              // not just while it is in hand — a placement releases the hand, and
              // the card going dark at that moment is exactly the "it reverted to
              // the default" reading the user reported.
              const current = lastConnectorId === c.id;
              return (
              <div
                key={c.id}
                data-connector-card={c.id}
                data-diy-card={`connector:${c.id}`}
                data-connector-armed={held ? '1' : '0'}
                data-connector-current={current ? '1' : '0'}
                data-diy-card-held={held ? '1' : '0'}
                onMouseEnter={() => handleMouseEnter(c.id)}
                onMouseLeave={handleMouseLeave}
                onClick={() => pickUpHand({ kind: 'connector', connectorId: c.id })}
                className={cardClass(held || current)}
              >
                <span
                  className="w-10 h-10 rounded flex-shrink-0 border-2 flex items-center justify-center text-[15px]"
                  style={{
                    borderColor: c.color,
                    backgroundColor: c.color + '20',
                    color: c.color,
                  }}
                  title={hasKey(`diy.kind.${c.kind}`) ? t(`diy.kind.${c.kind}`) : c.kind}
                >
                  {KIND_ICON[c.kind]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-200 group-hover:text-white font-medium">
                    {connectorLabel(c)}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {c.dim} · {connectorDesc(c)}
                  </div>
                </div>
                {cardBadge(held)}
              </div>
              );
            })}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p>{t('diy.helpClickCorner')}</p>
              <p>{t('diy.helpHoverCard')}</p>
              <p>{t('diy.helpPickCardAgain')}</p>
              <p>{t('diy.helpMove')}</p>
            </div>
          </>
        )}

        {activeTab === 'screws' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">{t('diy.pickScrewHint')}</p>
            {SCREW_GROUPS.map((group) => {
              const std = SCREW_FAMILIES[group.family];
              return (
                <div key={group.family} data-screw-group={group.family} className="space-y-2">
                  {/* The standard, as the workshop says it (DIN 7984) with the
                      catalog's own name for the head beside it. */}
                  <div className="flex items-baseline gap-2 px-1 pt-2">
                    <span className="text-[11px] font-medium text-neutral-400">{std.std}</span>
                    <span className="text-[10px] text-neutral-600 truncate">
                      {screwFamilyLabel(group.family, std.label)}
                    </span>
                  </div>
                  {group.sizes.map((s) => {
                    const held = isHeld({ kind: 'screw', size: s.id, family: group.family });
                    return (
                    <div
                      key={s.id}
                      data-screw-card={screwCardId(group.family, s.id)}
                      data-diy-card={`screw:${group.family}:${s.id}`}
                      data-diy-card-held={held ? '1' : '0'}
                      onMouseEnter={() => handleMouseEnter(screwCardId(group.family, s.id))}
                      onMouseLeave={handleMouseLeave}
                      onClick={() => pickUpHand({ kind: 'screw', size: s.id, family: group.family })}
                      className={cardClass(held)}
                    >
                      <div className="w-10 h-10 rounded flex-shrink-0 border border-neutral-600 bg-neutral-800/60 flex items-center justify-center font-mono text-[11px] text-neutral-300">
                        {s.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-neutral-200 group-hover:text-white font-medium">
                          {s.label}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {t('diy.screwCardLengths', {
                            part: `${s.id}×${defaultScrewLength(group.family, s.id)}`,
                            n: screwLengths(group.family, s.id).length,
                          })}
                        </div>
                      </div>
                      {cardBadge(held)}
                    </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p>{t('diy.helpPickScrew')}</p>
              <p>{t('diy.helpClickScrew')}</p>
              <p>{t('diy.helpMove')}</p>
            </div>
          </>
        )}

        {activeTab === 'kits' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">
              {t('diy.pickKitsHint')}
            </p>
            {DIY_KITS.map((k) => {
              const reason = fitMm === null ? null : kitFitReason(k, fitMm);
              const blocked = reason !== null;
              const parts = kitLineNames(k.id, layouts);
              const held = isHeld({ kind: 'kit', kitId: k.id });
              return (
                <div
                  key={k.id}
                  data-kit={k.id}
                  data-diy-card={`kit:${k.id}`}
                  data-kit-blocked={blocked ? '1' : '0'}
                  data-diy-card-held={held ? '1' : '0'}
                  onMouseEnter={() => handleMouseEnter(k.id)}
                  onMouseLeave={handleMouseLeave}
                  // A blocked card is inert rather than a click that does
                  // nothing: the tooltip already says which sizes it wants.
                  onClick={blocked ? undefined : () => pickUpHand({ kind: 'kit', kitId: k.id })}
                  title={reason ?? kitDesc(k)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors group
                    ${blocked
                      ? 'border-neutral-800/50 bg-neutral-900/20 opacity-40 cursor-not-allowed'
                      : cardClass(held)
                    }`}
                >
                  <span
                    className="w-10 h-10 rounded flex-shrink-0 border-2 flex items-center justify-center font-mono text-[10px] text-wood-300"
                    style={{ borderColor: '#b08968', backgroundColor: '#b0896820' }}
                  >
                    {`×${k.boltsPerJoint}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-neutral-200 group-hover:text-white font-medium">
                      {kitName(k)}
                    </div>
                    <div className="text-[10px] text-neutral-500 truncate">
                      {parts.join(' + ')}
                    </div>
                    {reason && (
                      <div className="text-[10px] text-amber-600/80">{reason}</div>
                    )}
                  </div>
                  {!blocked && cardBadge(held)}
                </div>
              );
            })}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p>{t('diy.helpPickKit')}</p>
              <p>{t('diy.helpKitCancel')}</p>
              <p>{t('diy.helpKitNuts')}</p>
              <p className="pt-1 text-neutral-600">{t('diy.helpKitTune')}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DiyProfileLibrary;
