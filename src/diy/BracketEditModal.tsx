import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import type { DiyBracket } from '../types/furniture';

const M = 0.001;
const BRACKET_STL = '/Cast_Corner_Bracket.stl';

/**
 * Full-screen modal for editing a bracket part in isolation.
 * Shows the STL model, wireframe boundary, and coordinate axes.
 */
const BracketEditModal: React.FC = () => {
  const editingBracketId = useDiyStore((s) => s.editingBracketId);
  const brackets = useDiyStore((s) => s.brackets);
  const updateBracket = useDiyStore((s) => s.updateBracket);

  const bracket = brackets.find((b) => b.id === editingBracketId);
  if (!bracket) return null;

  const close = () => useDiyStore.setState({ editingBracketId: null });

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="h-12 px-4 flex items-center gap-3 border-b border-neutral-800 flex-shrink-0">
        <span className="text-sm text-white font-medium">Edit Bracket — {bracket.name}</span>
        <span className="text-xs text-neutral-500">Size: {bracket.size}×{bracket.size}×{bracket.size}mm</span>
        <div className="flex-1" />
        <button onClick={close} className="px-3 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer">✕ Close</button>
      </div>

      <div className="flex-1 flex">
        {/* 3D Viewport */}
        <div className="flex-1 bg-[#1a1a2e]">
          <Canvas
            shadows
            gl={{ antialias: true, toneMapping: 3, toneMappingExposure: 1.0, outputColorSpace: 'srgb' }}
            camera={{ position: [0.08, 0.05, 0.08], fov: 40, near: 0.001, far: 10 }}
            style={{ width: '100%', height: '100%' }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[0.1, 0.15, 0.1]} intensity={2} color="#fff8ee" castShadow />
            <directionalLight position={[-0.05, 0.03, -0.02]} intensity={0.6} color="#e8f0ff" />
            <OrbitControls enableDamping minDistance={0.01} maxDistance={0.5} target={[0, 0, 0]} />
            <BracketModel bracket={bracket} />
            <axesHelper args={[M * bracket.size * 0.8]} />
            <GizmoHelper alignment="bottom-right" margin={[80, 80]}><GizmoViewport /></GizmoHelper>
          </Canvas>
        </div>

        {/* Right panel */}
        <aside className="w-72 flex-shrink-0 border-l border-neutral-800 bg-neutral-950 overflow-y-auto p-4">
          <BracketEditor bracket={bracket} onUpdate={(p) => updateBracket(bracket.id, p)} />
        </aside>
      </div>
    </div>
  );
};

/** STL model + wireframe in isolation. */
const BracketModel: React.FC<{ bracket: DiyBracket }> = ({ bracket }) => {
  const s = M * bracket.size;

  return (
    <group>
      {/* Wireframe */}
      <mesh renderOrder={1}>
        <boxGeometry args={[s, s, s]} />
        <meshBasicMaterial color="#4488aa" wireframe transparent opacity={0.4} depthTest />
      </mesh>

      {/* STL */}
      <Suspense fallback={null}>
        <BracketStlModel size={bracket.size} />
      </Suspense>
    </group>
  );
};

const BracketStlModel: React.FC<{ size: number }> = ({ size }) => {
  const geom = useLoader(STLLoader, BRACKET_STL);
  const s = M * size;

  const cloned = useMemo(() => {
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
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const ref = ext > 0 ? s / ext : 1;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (pos.getX(i) - cx) * ref, (pos.getY(i) - cy) * ref, (pos.getZ(i) - cz) * ref);
    }
    pos.needsUpdate = true;
    return g;
  }, [geom, s]);

  return (
    <mesh geometry={cloned}>
      <meshStandardMaterial color="#707070" metalness={0.9} roughness={0.25} />
    </mesh>
  );
};

/** Bracket property editor fields. */
const BracketEditor: React.FC<{
  bracket: DiyBracket;
  onUpdate: (patch: Partial<DiyBracket>) => void;
}> = ({ bracket, onUpdate }) => {
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

  const commit = () => onUpdate({ position: local.pos, rotation: local.rot, anchorPosition: local.aPos, anchorRotation: local.aRot });

  const cls = "w-20 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-right tabular-nums focus:border-wood-600 focus:outline-none";

  return (
    <div className="space-y-4 text-xs">
      <Section label="World Position (mm)">
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
    </div>
  );
};

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p className="text-[10px] text-neutral-500 mb-1.5">{label}</p>
    <div className="space-y-1">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between items-center">
    <span className="text-neutral-400">{label}</span>
    {children}
  </div>
);

export default BracketEditModal;
