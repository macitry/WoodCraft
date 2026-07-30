import { Suspense } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import type { Component, FurnitureModel, TabletopHole } from '../types/furniture';
import { useModelStore } from '../store/modelStore';
import ProfileStlPreview from './ProfileStlPreview';

/**
 * Small floating preview shown when hovering over a part in the tree.
 *
 * - Tabletop → mini 3D canvas with auto-rotating model
 * - Leg/beam (aluminum) → 2D cross-section profile SVG
 */

interface MiniPartPreviewProps {
  part: Component;
  model: FurnitureModel;
  style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// 3D tabletop preview
// ---------------------------------------------------------------------------

const TabletopPreview3D: React.FC<{ model: FurnitureModel }> = ({ model }) => {
  const holes = useModelStore((s) => s.holes);
  const w = (model.parameters.find((p) => p.id === 'width')?.value ?? 1200) / 1000;
  const d = (model.parameters.find((p) => p.id === 'depth')?.value ?? 600) / 1000;
  const t = (model.parameters.find((p) => p.id === 'tabletop_thickness')?.value ?? 18) / 1000;

  const geometry = (() => {
    if (holes.length > 0) {
      // Build ExtrudeGeometry with holes (same as ModelLoader)
      const hw = w / 2, hd = d / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-hw, -hd);
      shape.lineTo(hw, -hd);
      shape.lineTo(hw, hd);
      shape.lineTo(-hw, hd);
      shape.closePath();
      for (const hole of holes) {
        const hr = hole.radius / 1000;
        const holePath = new THREE.Path();
        holePath.absarc(hole.x / 1000, hole.y / 1000, hr, 0, Math.PI * 2, true);
        shape.holes.push(holePath);
      }
      const geom = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
      geom.rotateX(-Math.PI / 2);
      geom.translate(0, t / 2, 0);
      geom.computeVertexNormals();
      return geom;
    }
    return new THREE.BoxGeometry(w, t, d);
  })();

  return (
    <mesh geometry={geometry} rotation={[0, 0.4, 0]}>
      <meshStandardMaterial color="#c4a46c" metalness={0} roughness={0.55} />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Fallback preview (generic part type)
// ---------------------------------------------------------------------------

const GenericPreview: React.FC<{ partType: string }> = ({ partType }) => {
  return (
    <div className="flex items-center justify-center w-20 h-14 rounded bg-[#1a1a2e] border border-neutral-700">
      <span className="text-[10px] text-neutral-500 capitalize">{partType}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const MiniPartPreview: React.FC<MiniPartPreviewProps> = ({ part, model, style }) => {
  const profileStr = useModelStore((s) => s.currentParams).profile;
  const profileSize = parseInt(profileStr.substring(0, 2)) || 30;

  let content: React.ReactNode;

  switch (part.partType) {
    case 'tabletop':
      content = (
        <Canvas
          camera={{ position: [0.8, 0.5, 0.6], fov: 30 }}
          style={{ width: 160, height: 120, borderRadius: 4, background: '#1a1a2e' }}
          gl={{ antialias: true }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[2, 3, 2]} intensity={0.8} />
          <Suspense fallback={null}>
            <TabletopPreview3D model={model} />
          </Suspense>
        </Canvas>
      );
      break;

    case 'leg':
    case 'beam':
      content = <ProfileStlPreview profileSize={profileSize} size={210} />;
      break;

    default:
      content = <GenericPreview partType={part.partType || 'part'} />;
  }

  return (
    <div
      className="absolute z-50 pointer-events-none shadow-2xl rounded-md border border-neutral-700 bg-neutral-900/95 backdrop-blur-sm p-1"
      style={style}
    >
      {content}
    </div>
  );
};

export default MiniPartPreview;
