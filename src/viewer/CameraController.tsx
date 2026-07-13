import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ViewPreset } from '../types/furniture';
import * as THREE from 'three';

/**
 * Camera controller with orbit controls and view presets.
 */

interface CameraControllerProps {
  viewPreset: ViewPreset;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  onMounted?: (controls: OrbitControlsImpl | null) => void;
}

const PRESET_POSITIONS: Record<ViewPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  front: { pos: [0, 0.75, 5], target: [0, 0.75, 0] },
  top: { pos: [0, 6, 0.01], target: [0, 0.75, 0] },
  side: { pos: [5, 0.75, 0], target: [0, 0.75, 0] },
  perspective: { pos: [3, 2, 4], target: [0, 0.75, 0] },
};

const CameraController: React.FC<CameraControllerProps> = ({
  viewPreset,
  controlsRef,
  onMounted,
}) => {
  const camera = useThree((state) => state.camera);
  const prevPreset = useRef<ViewPreset>('perspective');

  useEffect(() => {
    if (prevPreset.current === viewPreset) return;
    prevPreset.current = viewPreset;

    const preset = PRESET_POSITIONS[viewPreset];
    const controls = controlsRef.current;
    if (!controls) return;

    const targetPos = new THREE.Vector3(...preset.pos);
    const targetLook = new THREE.Vector3(...preset.target);

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startTime = performance.now();
    const duration = 800;

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1.0);
      const ease = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(startPos, targetPos, ease);
      controls.target.lerpVectors(startTarget, targetLook, ease);
      controls.update();

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [viewPreset, camera, controlsRef]);

  return (
    <OrbitControls
      ref={(controls) => {
        controlsRef.current = controls;
        if (onMounted) onMounted(controls);
      }}
      enableDamping
      dampingFactor={0.08}
      minDistance={1.5}
      maxDistance={15}
      maxPolarAngle={Math.PI * 0.6}
      target={[0, 0.75, 0]}
    />
  );
};

export { PRESET_POSITIONS };
export default CameraController;
