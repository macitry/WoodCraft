import { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import ProfileStlPreview from './ProfileStlPreview';
import { ScrewMesh, TNutMesh } from '../diy/FastenerStl';
import { DEFAULT_SCREW_FAMILY, defaultScrewLength } from '../diy/fastenerDims';
import { CONNECTORS, connectorById } from '../diy/connectors';
import type { DiyConnector } from '../diy/connectors';
import type { ProfileSize, ScrewSize } from '../types/furniture';
import { DEFAULT_BRACKET_STL_URL, PROFILE_DIMS } from '../types/furniture';
import {
  JOINT_KITS,
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
import { connectorLabel, connectorDesc, hardwareName, kitName, kitDesc } from '../i18n/names';

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

/** One card per thread size. The drag payload is a size, so a dropped screw
 *  starts on the default standard (DIN 7984 薄头) — its family and length are
 *  then editable in the property panel, which is where the full catalog of
 *  lengths is on offer. */
const SCREW_SIZES: { id: ScrewSize; label: string }[] = [
  { id: 'M4', label: 'M4' },
  { id: 'M5', label: 'M5' },
  { id: 'M6', label: 'M6' },
];

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

/** Auto-rotating screw mesh — rendered INSIDE the preview Canvas. */
const RotatingScrewMesh: React.FC<{ size: ScrewSize }> = ({ size }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.65;
  });

  return (
    <group ref={groupRef} scale={0.001}>
      <ScrewMesh
        family={DEFAULT_SCREW_FAMILY}
        size={size}
        length={defaultScrewLength(DEFAULT_SCREW_FAMILY, size)}
      />
    </group>
  );
};

/** Small 3D canvas showing the screw, auto-rotating. */
const Screw3DPreview: React.FC<{ size: ScrewSize }> = ({ size }) => (
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
      <RotatingScrewMesh size={size} />
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
  // Cross-section the fit gate is judged against: the selected bracket's size
  // if one is selected, else the selected profile's. 0 = nothing selected, and
  // then no kit is greyed out (we have nothing to judge against).
  const selBracketSize = useDiyStore(
    (s) => s.brackets.find((b) => b.id === s.selectedBracketId)?.size ?? null,
  );
  // The connector the next corner-click will drop. Arming is not a mode — it
  // does not change what the pointer does, only which part the ghosts place.
  const armedConnectorId = useDiyStore((s) => s.armedConnectorId);
  const armConnector = useDiyStore((s) => s.armConnector);

  const handleProfileDragStart = (e: React.DragEvent, size: ProfileSize) => {
    e.dataTransfer.setData('application/diy-profile', size);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleBracketDragStart = (e: React.DragEvent, connectorId: string) => {
    // Carries the catalog id — DiyViewer reads it on drop so the placed
    // bracket renders the dragged connector model.
    e.dataTransfer.setData('application/diy-bracket', connectorId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleScrewDragStart = (e: React.DragEvent, size: ScrewSize) => {
    // Size is carried in the type itself so DiyViewer can read it during
    // dragover (getData only works on drop).
    e.dataTransfer.setData(`application/diy-screw-${size}`, size);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleKitDragStart = (e: React.DragEvent, kitId: string) => {
    // Like the bracket payload: the kit id rides on the drag so DiyViewer can
    // resolve it on drop. A kit is meaningless without a corner joint to bind
    // to, so the drop handler refuses anything but a valid corner ghost.
    e.dataTransfer.setData('application/diy-kit', kitId);
    e.dataTransfer.effectAllowed = 'copy';
  };

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
  const previewScrewSize: ScrewSize =
    SCREW_SIZES.find((x) => x.id === hoveredId)?.id ?? selScrewSize ?? SCREW_SIZES[0].id;
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
          : t('diy.captionScrew', { size: previewScrewSize });

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
          <span className="text-[10px] text-neutral-600 truncate">{previewCaption}</span>
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
            <Screw3DPreview size={previewScrewSize} />
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
            <p className="text-[10px] text-neutral-600 px-1">{t('diy.dragProfileHint')}</p>
            {SIZES.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => handleProfileDragStart(e, s.id)}
                onMouseEnter={() => handleMouseEnter(s.id)}
                onMouseLeave={handleMouseLeave}
                className="flex items-center gap-3 p-3 rounded-lg border border-neutral-800
                  hover:border-neutral-600 bg-neutral-900/50 cursor-grab active:cursor-grabbing
                  transition-colors group"
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
                <span className="text-neutral-700 text-xs">⠿</span>
              </div>
            ))}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p>{t('diy.helpDragProfileRoot')}</p>
              <p>{t('diy.helpShiftClickFace')}</p>
              <p>{t('diy.helpDragArrow')}</p>
              <p>{t('diy.helpDoubleClickFace')}</p>
            </div>
          </>
        )}

        {activeTab === 'connectors' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">{t('diy.dragConnectorHint')}</p>
            {CONNECTORS.map((c) => {
              // Armed = clicking a corner ghost drops THIS connector. Clicking
              // the armed card again puts it back down (`armConnector` toggles),
              // so the card is a two-state switch rather than a one-way mode.
              const armed = armedConnectorId === c.id;
              return (
              <div
                key={c.id}
                data-connector-card={c.id}
                data-connector-armed={armed ? '1' : '0'}
                draggable
                onDragStart={(e) => handleBracketDragStart(e, c.id)}
                onMouseEnter={() => handleMouseEnter(c.id)}
                onMouseLeave={handleMouseLeave}
                // A real HTML5 drag does not fire `click`, so arming and
                // dragging share the card without fighting.
                onClick={() => armConnector(c.id)}
                className={`flex items-center gap-3 p-3 rounded-lg border
                  bg-neutral-900/50 cursor-grab active:cursor-grabbing
                  transition-colors group
                  ${armed
                    ? 'border-wood-500 ring-1 ring-wood-500/40'
                    : 'border-neutral-800 hover:border-neutral-600'
                  }`}
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
                <span className="text-neutral-700 text-xs">⠿</span>
              </div>
              );
            })}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p>{t('diy.helpClickCorner')}</p>
              <p>{t('diy.helpHoverCard')}</p>
              <p>{t('diy.helpDragCard')}</p>
              <p>{t('diy.helpDoubleClickPair')}</p>
            </div>
          </>
        )}

        {activeTab === 'screws' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">{t('diy.dragScrewHint')}</p>
            {SCREW_SIZES.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => handleScrewDragStart(e, s.id)}
                onMouseEnter={() => handleMouseEnter(s.id)}
                onMouseLeave={handleMouseLeave}
                className="flex items-center gap-3 p-3 rounded-lg border border-neutral-800
                  hover:border-neutral-600 bg-neutral-900/50 cursor-grab active:cursor-grabbing
                  transition-colors group"
              >
                <div className="w-10 h-10 rounded flex-shrink-0 border border-neutral-600 bg-neutral-800/60 flex items-center justify-center font-mono text-[11px] text-neutral-300">
                  {s.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-200 group-hover:text-white font-medium">
                    {s.label}
                  </div>
                  <div className="text-[10px] text-neutral-500">{t('diy.screwCardDesc', { d: s.id.slice(1) })}</div>
                </div>
                <span className="text-neutral-700 text-xs">⠿</span>
              </div>
            ))}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p>{t('diy.helpDragScrew')}</p>
              <p>{t('diy.helpClickScrew')}</p>
            </div>
          </>
        )}

        {activeTab === 'kits' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">
              {t('diy.kitsDragHint')}
            </p>
            {DIY_KITS.map((k) => {
              const reason = fitMm === null ? null : kitFitReason(k, fitMm);
              const blocked = reason !== null;
              const parts = kitLineNames(k.id, layouts);
              return (
                <div
                  key={k.id}
                  data-kit={k.id}
                  data-kit-blocked={blocked ? '1' : '0'}
                  draggable={!blocked}
                  onDragStart={(e) => !blocked && handleKitDragStart(e, k.id)}
                  onMouseEnter={() => handleMouseEnter(k.id)}
                  onMouseLeave={handleMouseLeave}
                  title={reason ?? kitDesc(k)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors group
                    ${blocked
                      ? 'border-neutral-800/50 bg-neutral-900/20 opacity-40 cursor-not-allowed'
                      : 'border-neutral-800 hover:border-neutral-600 bg-neutral-900/50 cursor-grab active:cursor-grabbing'
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
                  {!blocked && <span className="text-neutral-700 text-xs">⠿</span>}
                </div>
              );
            })}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p>{t('diy.helpKitDrag')}</p>
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
