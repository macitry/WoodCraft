import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useDiyStore } from '../store/diyStore';
import Lighting from '../viewer/Lighting';
import DiyProfileRenderer from './DiyProfileRenderer';
import DiyStretchGizmo from './DiyStretchGizmo';
import DiyBracketRenderer from './DiyBracketRenderer';
import DiyBracketPlacementGhost from './DiyBracketPlacementGhost';
import DiyScrewRenderer from './DiyScrewRenderer';
import DiyScrewPlacementGhost from './DiyScrewPlacementGhost';
import DiyPlacingGhost from './DiyPlacingGhost';
import DiyCornerHints from './DiyCornerHints';
import DiyBracketFaceMarker from './DiyBracketFaceMarker';

const TARGET_DIST = 1.8; // camera distance after zoom-in (metres)
const LERP = 0.10;       // per-frame lerp factor

interface DiySceneProps {
  onCameraReady: (cam: THREE.PerspectiveCamera) => void;
}

const DiyScene: React.FC<DiySceneProps> = ({ onCameraReady }) => {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const setControlsRef = useDiyStore((s) => s.setControlsRef);
  const isDraggingBracket = useDiyStore((s) => s.isDraggingBracket);
  const isDraggingScrew = useDiyStore((s) => s.isDraggingScrew);
  const placingProfile = useDiyStore((s) => s.placingProfile);
  const orbitDisabled = isDraggingBracket || isDraggingScrew || !!placingProfile;
  const cameraFocus = useDiyStore((s) => s.cameraFocus);
  const clearCameraFocus = useDiyStore((s) => s.clearCameraFocus);
  const focusRef = useRef<THREE.Vector3 | null>(null);

  // Keep focusRef in sync with store
  if (cameraFocus) {
    focusRef.current = new THREE.Vector3(cameraFocus.x, cameraFocus.y, cameraFocus.z);
  }

  useEffect(() => {
    setControlsRef(controlsRef as React.MutableRefObject<OrbitControlsImpl | null>);
  }, [setControlsRef, controlsRef]);

  useRef(() => {
    onCameraReady(camera as THREE.PerspectiveCamera);
  }).current?.();

  // Dev-only, same convention as `__wcKitEditorCamera`: face picking reports its
  // result through `matrixWorld`, so a headless test has to aim at a real point
  // in the scene rather than poke the store. Without the camera it cannot project
  // mm → screen and the whole DIY raycast path stays untestable.
  //
  // The SCENE comes along for the same reason the camera does: the hardware here
  // is a catalog mesh reached through two of this app's own transforms
  // (`DiyKitRenderer` / `DiyScrewRenderer`), and the only way to check that what
  // was drawn is the part the spec names — rather than any screw-shaped thing —
  // is to measure the mounted geometry. Counting pieces cannot tell them apart.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcDiyCamera?: unknown; __wcDiyScene?: unknown };
    w.__wcDiyCamera = camera;
    w.__wcDiyScene = scene;
    return () => {
      delete w.__wcDiyCamera;
      delete w.__wcDiyScene;
    };
  }, [camera, scene]);

  // Animate camera toward focus after placing a root profile
  useFrame(() => {
    const ctrl = controlsRef.current;
    const focus = focusRef.current;
    if (!ctrl || !focus) return;

    // Smooth lerp the orbit target
    ctrl.target.lerp(focus, LERP);

    // Smooth lerp the camera distance
    const dir = new THREE.Vector3().subVectors(camera.position, ctrl.target).normalize();
    const curDist = camera.position.distanceTo(ctrl.target);
    const newDist = curDist + (TARGET_DIST - curDist) * LERP;
    camera.position.copy(ctrl.target).addScaledVector(dir, newDist);

    ctrl.update();

    // Stop when close enough
    if (ctrl.target.distanceTo(focus) < 0.01 && Math.abs(curDist - TARGET_DIST) < 0.05) {
      focusRef.current = null;
      clearCameraFocus();
    }
  });

  return (
    <>
      <color attach="background" args={['#1a1a2e']} />
      <Lighting />

      <OrbitControls
        ref={controlsRef}
        enabled={!orbitDisabled}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.2}
        maxDistance={20}
        maxPolarAngle={Math.PI * 0.55}
        target={[0, 0.5, 0]}
      />

      {/* Ground grid */}
      <gridHelper args={[10, 20, '#303050', '#202035']} position={[0, -0.005, 0]} />
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowMaterial transparent opacity={0.2} />
      </mesh>

      <DiyProfileRenderer />
      <DiyBracketRenderer />
      <DiyScrewRenderer />
      <DiyCornerHints />
      <DiyStretchGizmo />
      <DiyBracketPlacementGhost />
      <DiyScrewPlacementGhost />
      <DiyPlacingGhost />
      <DiyBracketFaceMarker />
    </>
  );
};

export default DiyScene;
