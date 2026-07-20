import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ViewPreset } from '../types/furniture';
import * as THREE from 'three';

/**
 * Camera controller with orbit controls, view presets, and focus-on-select.
 *
 * - Left mouse: rotate around target
 * - Right mouse: pan
 * - Scroll: zoom (min 50mm for close-up bracket inspection)
 * - Selecting a part/bracket auto-focuses the camera on it
 */

interface CameraControllerProps {
  viewPreset: ViewPreset;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  onMounted?: (controls: OrbitControlsImpl | null) => void;
  /** World-space position (meters) to focus on. Changes trigger smooth zoom. */
  focusTarget?: [number, number, number] | null;
  /** How close to zoom to the focus target (meters, default 0.3). */
  focusDistance?: number;
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
  focusTarget,
  focusDistance = 0.3,
}) => {
  const camera = useThree((state) => state.camera);
  const prevPreset = useRef<ViewPreset>('perspective');
  const prevFocusTarget = useRef<string>('');

  // --- View preset animation ---
  useEffect(() => {
    if (prevPreset.current === viewPreset) return;
    prevPreset.current = viewPreset;

    const preset = PRESET_POSITIONS[viewPreset];
    const controls = controlsRef.current;
    if (!controls) return;

    animateCamera(camera, controls, preset.pos, preset.target, 800);
  }, [viewPreset, camera, controlsRef]);

  // --- Focus on selection ---
  useEffect(() => {
    if (!focusTarget) {
      prevFocusTarget.current = '';
      return;
    }

    const key = focusTarget.map((v) => v.toFixed(4)).join(',');
    if (key === prevFocusTarget.current) return;
    prevFocusTarget.current = key;

    const controls = controlsRef.current;
    if (!controls) return;

    const target = new THREE.Vector3(...focusTarget);

    // Place camera at focusDistance away, preserving current view direction
    const currentDir = camera.position.clone().sub(controls.target).normalize();
    if (currentDir.length() < 0.01) {
      currentDir.set(0.5, 0.5, 1).normalize();
    }
    const newCamPos = target.clone().add(
      currentDir.multiplyScalar(focusDistance),
    );

    // Temporarily reduce min distance for the focus animation
    const oldMin = controls.minDistance;
    controls.minDistance = 0.02;
    animateCamera(camera, controls, newCamPos.toArray() as [number, number, number], target.toArray() as [number, number, number], 500, () => {
      controls.minDistance = oldMin;
    });
  }, [focusTarget, focusDistance, camera, controlsRef]);

  return (
    <OrbitControls
      ref={(controls) => {
        controlsRef.current = controls;
        if (onMounted) onMounted(controls);
      }}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.05}
      maxDistance={15}
      maxPolarAngle={Math.PI * 0.6}
      target={[0, 0.75, 0]}
    />
  );
};

/** Smoothly animate camera position + orbit target. */
function animateCamera(
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
  targetPos: [number, number, number],
  targetLook: [number, number, number],
  duration: number,
  onDone?: () => void,
) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = new THREE.Vector3(...targetPos);
  const endLook = new THREE.Vector3(...targetLook);
  const startTime = performance.now();

  function animate(now: number) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1.0);
    const ease = 1 - Math.pow(1 - t, 3);

    camera.position.lerpVectors(startPos, endPos, ease);
    controls.target.lerpVectors(startTarget, endLook, ease);
    controls.update();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      onDone?.();
    }
  }

  requestAnimationFrame(animate);
}

export { PRESET_POSITIONS };
export default CameraController;
