import { useRef, useCallback, useEffect, type DragEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { useDiyStore } from '../store/diyStore';
import type { ProfileSize, AxisDir } from '../types/furniture';
import DiyScene from './DiyScene';
import * as THREE from 'three';

/**
 * 3D viewport for the DIY builder.
 * Handles HTML5 drag-and-drop from the profile library → raycast placement.
 */
const DiyViewer: React.FC = () => {
  const addRootProfile = useDiyStore((s) => s.addRootProfile);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const size = e.dataTransfer.getData('application/diy-profile') as ProfileSize;
      if (!size || !containerRef.current || !cameraRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      // Cast against Y=0 ground plane
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, hit);

      if (hit) {
        // Place at hit position, default X axis, aligned to 10mm grid
        const px = Math.round(hit.x * 1000 / 10) * 10;
        const pz = Math.round(hit.z * 1000 / 10) * 10;
        const dim = { '2020': 20, '3030': 30, '4040': 40 }[size];
        addRootProfile(size, { x: px, y: dim / 2, z: pz }, 'X' as AxisDir);
      }
    },
    [addRootProfile],
  );

  // Expose camera for drag-drop raycasting
  useEffect(() => {
    // Camera ref populated by DiyScene
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative bg-[#1a1a2e]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Canvas
        shadows="soft"
        gl={{ antialias: true, toneMapping: 3, toneMappingExposure: 1.0, outputColorSpace: 'srgb' }}
        camera={{ position: [3, 2.5, 5], fov: 50, near: 0.05, far: 100 }}
        style={{ width: '100%', height: '100%' }}
      >
        <DiyScene onCameraReady={(cam) => { cameraRef.current = cam; }} />
      </Canvas>

      {/* Drop hint */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
        <div className="text-neutral-700 text-sm">
          Drag profile from library here
        </div>
      </div>
    </div>
  );
};

export default DiyViewer;
