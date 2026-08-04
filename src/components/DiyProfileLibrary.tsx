import { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import ProfileStlPreview from './ProfileStlPreview';
import type { ProfileSize } from '../types/furniture';
import { PROFILE_DIMS } from '../types/furniture';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SIZES: { id: ProfileSize; label: string; color: string; desc: string }[] = [
  { id: '2020', label: '2020', color: '#8a8a8a', desc: '20×20mm' },
  { id: '3030', label: '3030', color: '#a0a0a0', desc: '30×30mm' },
  { id: '4040', label: '4040', color: '#b8b8b8', desc: '40×40mm' },
];

const CONNECTORS = [
  { id: 'corner_bracket', label: 'Corner Bracket', desc: 'Cast L-bracket 3030', icon: '└┘' },
];

type TabId = 'profiles' | 'connectors';

// ---------------------------------------------------------------------------
// Rotating 3D bracket preview
// ---------------------------------------------------------------------------

const BRACKET_STL = '/Cast_Corner_Bracket.stl';

/** Auto-rotating bracket mesh (runs inside a Canvas). */
const RotatingBracketMesh: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const geom = useLoader(STLLoader, BRACKET_STL);

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
        <meshStandardMaterial color="#c8c8c8" metalness={0.55} roughness={0.38} />
      </mesh>
    </group>
  );
};

/** Small 3D canvas showing the cast corner bracket, auto-rotating. */
const Bracket3DPreview: React.FC = () => (
  <Canvas
    camera={{ position: [0, 0.005, 0.038], fov: 35, near: 0.001, far: 0.3 }}
    style={{ width: 240, height: 195, background: '#f5f5f5', borderRadius: 4 }}
    gl={{ antialias: true }}
  >
    <gridHelper args={[0.06, 12, '#cccccc', '#e8e8e8']} position={[0, -0.008, 0]} />
    <ambientLight intensity={0.5} />
    <directionalLight position={[1.5, 2.5, 2]} intensity={0.7} />
    <directionalLight position={[-1, -0.5, -1]} intensity={0.2} />
    <Suspense fallback={null}>
      <RotatingBracketMesh />
    </Suspense>
  </Canvas>
);

// ---------------------------------------------------------------------------
// Library panel component
// ---------------------------------------------------------------------------

const DiyProfileLibrary: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('profiles');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewStyle, setPreviewStyle] = useState<React.CSSProperties>({});

  const handleProfileDragStart = (e: React.DragEvent, size: ProfileSize) => {
    e.dataTransfer.setData('application/diy-profile', size);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleBracketDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/diy-bracket', 'corner_bracket');
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleMouseEnter = (id: string, e: React.MouseEvent) => {
    setHoveredId(id);
    const rect = e.currentTarget.getBoundingClientRect();
    setPreviewStyle({ left: rect.right + 8, top: rect.top - 10 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPreviewStyle({ left: rect.right + 8, top: rect.top - 10 });
  };

  const handleMouseLeave = () => setHoveredId(null);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'profiles', label: 'Profiles' },
    { id: 'connectors', label: 'Connectors' },
  ];

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-4 pt-4 pb-0">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-2">
          Profile Library
        </p>

        {/* Tabs */}
        <div className="flex border-b border-neutral-700">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer
                ${activeTab === t.id
                  ? 'text-wood-300 border-b-2 border-wood-500 -mb-px'
                  : 'text-neutral-500 hover:text-neutral-300 border-b-2 border-transparent'
                }`}
              onClick={() => { setActiveTab(t.id); setHoveredId(null); }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'profiles' && (
          <>
            <p className="text-[10px] text-neutral-600 px-1">Drag a profile into the scene</p>
            {SIZES.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => handleProfileDragStart(e, s.id)}
                onMouseEnter={(e) => handleMouseEnter(s.id, e)}
                onMouseMove={handleMouseMove}
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
            {CONNECTORS.map((c) => (
              <div
                key={c.id}
                draggable
                onDragStart={handleBracketDragStart}
                onMouseEnter={(e) => handleMouseEnter(c.id, e)}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="flex items-center gap-3 p-3 rounded-lg border border-neutral-700 bg-neutral-900/50 text-neutral-300 hover:border-neutral-600 transition-colors group cursor-grab active:cursor-grabbing"
              >
                <span className="text-lg flex-shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium group-hover:text-white">{c.label}</div>
                  <div className="text-[10px] text-neutral-500">{c.desc}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Hover preview portal — always mounted to avoid WebGL context loss */}
      <div
        className="fixed z-50 pointer-events-none shadow-xl rounded-md border border-neutral-700 bg-neutral-900/95 backdrop-blur-sm p-1"
        style={{
          ...previewStyle,
          visibility: hoveredId ? 'visible' : 'hidden',
        }}
      >
        {activeTab === 'profiles' && (
          <ProfileStlPreview profileSize={parseInt(hoveredId?.substring(0, 2) || '30') || 30} />
        )}
        {activeTab === 'connectors' && (
          <Bracket3DPreview />
        )}
      </div>
    </div>
  );
};

export default DiyProfileLibrary;
