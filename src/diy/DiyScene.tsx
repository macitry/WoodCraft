import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useDiyStore } from '../store/diyStore';
import Lighting from '../viewer/Lighting';
import DiyProfileRenderer from './DiyProfileRenderer';
import DiyStretchGizmo from './DiyStretchGizmo';
import DiyDimension from './DiyDimension';
import DiyBracketRenderer from './DiyBracketRenderer';
import DiyBracketPlacementGhost from './DiyBracketPlacementGhost';
import DiyScrewRenderer from './DiyScrewRenderer';
import DiyScrewPlacementGhost from './DiyScrewPlacementGhost';
import DiyProfilePlacementGhost from './DiyProfilePlacementGhost';
import DiyPlacingGhost from './DiyPlacingGhost';
import DiyCornerHints from './DiyCornerHints';
import { fitPreset } from './diyViewFit';
import { backgroundById } from './diyBackgrounds';

const TARGET_DIST = 1.8; // camera distance after zoom-in (metres)
const LERP = 0.10;       // per-frame lerp factor
const FLIGHT_MS = 700;   // how long a view preset takes to fly

interface DiySceneProps {
  onCameraReady: (cam: THREE.PerspectiveCamera) => void;
}

const DiyScene: React.FC<DiySceneProps> = ({ onCameraReady }) => {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const setControlsRef = useDiyStore((s) => s.setControlsRef);
  const movingPart = useDiyStore((s) => s.movingPart);
  // What is IN HAND is deliberately absent: holding a ghost must not cost the
  // user the ability to orbit and look at where it would land. Neither is the
  // child-profile ghost, for the same reason it is no longer a mode: it is armed
  // by a HOVER, so tying the camera to it would freeze the view whenever the
  // pointer came to rest on the selected bar. Only the one gesture that tracks
  // the pointer 1:1 — dragging a part already on the assembly — takes the camera
  // away.
  const orbitDisabled = movingPart !== null;
  const cameraFocus = useDiyStore((s) => s.cameraFocus);
  const clearCameraFocus = useDiyStore((s) => s.clearCameraFocus);
  const showGrid = useDiyStore((s) => s.showGrid);
  const background = useDiyStore((s) => s.background);
  const viewPreset = useDiyStore((s) => s.viewPreset);
  const viewNonce = useDiyStore((s) => s.viewNonce);
  const focusRef = useRef<THREE.Vector3 | null>(null);
  /** The preset click this effect has already flown for — see the flight below. */
  const flownNonce = useRef(viewNonce);
  /** The in-flight rAF, or null. Held so a second click can cancel the first. */
  const flightRef = useRef<number | null>(null);

  // Keep focusRef in sync with store
  if (cameraFocus) {
    focusRef.current = new THREE.Vector3(cameraFocus.x, cameraFocus.y, cameraFocus.z);
  }

  // ...and the other way: `focusRef` is what the frame loop below reads, so
  // anything that clears the store flag has to clear it too, or the placement
  // auto-zoom keeps flying the camera to a target nobody is waiting for.
  useEffect(() => {
    if (!cameraFocus) focusRef.current = null;
  }, [cameraFocus]);

  useEffect(() => {
    setControlsRef(controlsRef as React.MutableRefObject<OrbitControlsImpl | null>);
  }, [setControlsRef, controlsRef]);

  /**
   * Fly the camera to a standard view.
   *
   * Keyed on the nonce rather than on `viewPreset`, so that clicking 前视 a
   * second time — after orbiting away, which is exactly when you want it — is a
   * new request rather than a value that has not changed. The ref is seeded with
   * the mount-time nonce, which is what keeps the first render from being read
   * as a click and keeps StrictMode's setup/cleanup/setup from flying twice.
   */
  useEffect(() => {
    if (flownNonce.current === viewNonce) return;
    flownNonce.current = viewNonce;

    const controls = controlsRef.current;
    if (!controls || !viewPreset) return;

    // The flight owns the camera for the next 700 ms, and the placement
    // auto-zoom writes the same position and target every frame — whichever
    // loop finished last would be the one left on screen, so a preset fired
    // during that zoom would fly out and be snatched back. Both ends have to
    // let go: the store flag, and `focusRef`, which is what the loop reads.
    focusRef.current = null;
    clearCameraFocus();

    // Read through `getState` rather than as a hook value: this effect must NOT
    // re-run — and re-fly — every time the user edits a profile.
    const { pos, target } = fitPreset(
      viewPreset,
      useDiyStore.getState().profiles,
      (camera as THREE.PerspectiveCamera).aspect,
    );

    if (flightRef.current !== null) cancelAnimationFrame(flightRef.current);
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPos = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const endTarget = new THREE.Vector3(target[0], target[1], target[2]);
    const t0 = performance.now();

    const step = (now: number) => {
      const raw = Math.min((now - t0) / FLIGHT_MS, 1);
      const ease = 1 - Math.pow(1 - raw, 3);
      camera.position.lerpVectors(startPos, endPos, ease);
      controls.target.lerpVectors(startTarget, endTarget, ease);
      // `update` is what carries the look-at, and it reads `enabled` only in the
      // pointer handlers — so this orients the camera even mid-gesture. Doing it
      // by hand instead would move the camera without ever pointing it.
      controls.update();
      flightRef.current = raw < 1 ? requestAnimationFrame(step) : null;
    };
    flightRef.current = requestAnimationFrame(step);
  }, [viewNonce, viewPreset, camera, clearCameraFocus]);

  useEffect(() => () => {
    if (flightRef.current !== null) cancelAnimationFrame(flightRef.current);
  }, []);

  /**
   * Taking the camera back takes the highlight with it.
   *
   * The lit button means "this is the view on screen", so it cannot survive the
   * user orbiting somewhere else — 俯视 still lit while the assembly is being
   * looked at from behind is a label about a view that is not there. `start` is
   * OrbitControls' own "the user has the camera now", and it does not fire for
   * the flight above, which touches the camera only through `update`.
   */
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => useDiyStore.getState().clearViewPreset();
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, []);

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

  const bg = backgroundById(background);

  return (
    <>
      {/* No `<color attach="background">`, and that is the feature rather than
          an omission: the canvas is transparent (see `DiyViewer`'s `alpha`), and
          the backdrop is the CSS of the stage div behind it. A background that
          can be a gradient belongs on the element that can paint a gradient —
          and it means the swatch in the toolbar and the colour on screen are the
          same string, so they cannot drift apart. */}
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

      {/* Ground grid — the reference a placement ghost lands on, and therefore
          the first thing to turn off when the user would rather see the parts
          alone. The shadow plane below is not part of it: the shadow is what
          says the assembly is standing on something, and it is invisible except
          where a part casts into it. */}
      {showGrid && (
        <gridHelper args={[10, 20, bg.grid[0], bg.grid[1]]} position={[0, -0.005, 0]} />
      )}
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
      <DiyDimension />
      <DiyBracketPlacementGhost />
      <DiyScrewPlacementGhost />
      <DiyProfilePlacementGhost />
      <DiyPlacingGhost />
    </>
  );
};

export default DiyScene;
