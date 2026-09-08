import { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import ProfileStlPreview from './ProfileStlPreview';
import { buildScrewGroup } from '../diy/DiyScrewGeometry';
import { CONNECTORS, connectorById } from '../diy/connectors';
import type { DiyConnector } from '../diy/connectors';
import type { ProfileSize, ScrewSize } from '../types/furniture';
import { PROFILE_DIMS, SCREW_DEFAULT_LENGTH } from '../types/furniture';

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
};

const SCREW_SIZES: { id: ScrewSize; label: string; desc: string }[] = [
  { id: 'M4', label: 'M4', desc: 'Ø4 · 内六角杯头' },
  { id: 'M5', label: 'M5', desc: 'Ø5 · 内六角杯头' },
  { id: 'M6', label: 'M6', desc: 'Ø6 · 内六角杯头' },
];

type TabId = 'profiles' | 'connectors' | 'screws';

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
  const group = useMemo(
    () => buildScrewGroup(size, SCREW_DEFAULT_LENGTH[size]),
    [size],
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.65;
  });

  return (
    <group ref={groupRef} scale={0.001}>
      <primitive object={group} />
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
// Library panel component
// ---------------------------------------------------------------------------

const DiyProfileLibrary: React.FC = () => {
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

  const handleMouseEnter = (id: string) => setHoveredId(id);

  const handleMouseLeave = () => setHoveredId(null);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'profiles', label: 'Profiles' },
    { id: 'connectors', label: 'Connectors' },
    { id: 'screws', label: 'Screws' },
  ];

  // Resolved models for the inline preview strip.
  const previewProfileSize: ProfileSize =
    SIZES.find((x) => x.id === hoveredId)?.id ?? selProfileSize ?? SIZES[0].id;
  const previewConnector = connectorById(
    CONNECTORS.find((c) => c.id === hoveredId)?.id ?? selConnectorId ?? CONNECTORS[0].id,
  );
  const previewScrewSize: ScrewSize =
    SCREW_SIZES.find((x) => x.id === hoveredId)?.id ?? selScrewSize ?? SCREW_SIZES[0].id;
  const previewCaption =
    activeTab === 'profiles'
      ? `型材 ${previewProfileSize} · ${PROFILE_DIMS[previewProfileSize]}×${PROFILE_DIMS[previewProfileSize]}mm`
      : activeTab === 'connectors'
        ? `${previewConnector.label} · ${previewConnector.dim}`
        : `螺丝 ${previewScrewSize}`;

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
            title={previewOpen ? '收起预览' : '展开预览'}
          >
            <span className="text-[8px]">{previewOpen ? '▼' : '▶'}</span>
            <span>3D 预览</span>
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
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {activeTab === 'profiles' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">Drag a profile into the scene</p>
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
              <p><span className="text-neutral-400">Drag</span> profile → place root</p>
              <p><span className="text-neutral-400">Shift+Click</span> face → grow new</p>
              <p><span className="text-neutral-400">Drag</span> arrow → stretch</p>
              <p><span className="text-neutral-400">Double-click</span> face → purple target</p>
            </div>
          </>
        )}

        {activeTab === 'connectors' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">Drag a connector onto a frame corner</p>
            {CONNECTORS.map((c) => (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => handleBracketDragStart(e, c.id)}
                onMouseEnter={() => handleMouseEnter(c.id)}
                onMouseLeave={handleMouseLeave}
                className="flex items-center gap-3 p-3 rounded-lg border border-neutral-800
                  hover:border-neutral-600 bg-neutral-900/50 cursor-grab active:cursor-grabbing
                  transition-colors group"
              >
                <span
                  className="w-10 h-10 rounded flex-shrink-0 border-2 flex items-center justify-center text-[15px]"
                  style={{
                    borderColor: c.color,
                    backgroundColor: c.color + '20',
                    color: c.color,
                  }}
                  title={c.kind}
                >
                  {KIND_ICON[c.kind]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-200 group-hover:text-white font-medium">
                    {c.label}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {c.dim} · {c.desc}
                  </div>
                </div>
                <span className="text-neutral-700 text-xs">⠿</span>
              </div>
            ))}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p><span className="text-neutral-400">Hover</span> card → 3D preview of the model</p>
              <p><span className="text-neutral-400">Drag</span> card → drop on a corner to mount</p>
              <p><span className="text-neutral-400">Double-click</span> a face pair places the built-in bracket</p>
            </div>
          </>
        )}

        {activeTab === 'screws' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">Drag a screw onto a profile face</p>
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
                  <div className="text-[10px] text-neutral-500">{s.desc}</div>
                </div>
                <span className="text-neutral-700 text-xs">⠿</span>
              </div>
            ))}

            {/* Help */}
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-[10px] space-y-1">
              <p><span className="text-neutral-400">Drag</span> screw → profile face, snaps to face</p>
              <p><span className="text-neutral-400">Click</span> screw → edit spec in right panel</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DiyProfileLibrary;
