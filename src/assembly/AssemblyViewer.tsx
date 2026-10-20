import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SceneEnvironment } from '../viewer/scenes/lighting';
import type { BracketInstance, FurnitureModel } from '../types/furniture';
import { AssemblyScene } from './AssemblyParts';
import { stepProgress } from './assemblyClock';
import type { AssemblyClock } from './assemblyClock';
import type { AssemblyPlan, AssemblyStep } from './assemblyPlan';

const FLOOR = '#14161b';

/**
 * Flies the camera to the current step's shot.
 *
 * A step owns a camera, not the other way round: the plan already decided
 * where the interesting side of this piece is. The flight is a plain rAF, like
 * `CameraController`'s — there is no animation library in this project, and
 * `OrbitControls` is written every frame by this loop and then updated by the
 * controller, exactly as it is there.
 *
 * The user can still orbit after the flight lands. The next step's flight takes
 * over; that is deliberate, because leaving the camera where the user parked it
 * would make the next step's close-up miss the piece.
 */
const AssemblyCamera: React.FC<{
  step: AssemblyStep;
  stepIndex: number;
  clock: React.MutableRefObject<AssemblyClock>;
  resetNonce: number;
  reduceMotion: boolean;
}> = ({ step, stepIndex, clock, resetNonce, reduceMotion }) => {
  const camera = useThree((s) => s.camera);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const rafRef = useRef<number | null>(null);

  // Some steps are two shots: a wide one while the piece is carried in, then a
  // close-up once it has landed. The phase is tied to the step id, so jumping
  // to another step starts that step at its first shot without a reset effect.
  const [camPhase, setCamPhase] = useState<{ id: string; phase: 0 | 1 }>({ id: '', phase: 0 });
  const phase = camPhase.id === step.id ? camPhase.phase : 0;
  const shot = phase === 1 && step.camera2 ? step.camera2 : step.camera;

  useFrame(() => {
    if (phase !== 0 || !step.camera2) return;
    if (stepProgress(stepIndex, clock.current) >= (step.cameraSwitch ?? 0.5)) {
      setCamPhase({ id: step.id, phase: 1 });
    }
  });

  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcAssemblyScene?: unknown };
    w.__wcAssemblyScene = scene;
    return () => {
      delete w.__wcAssemblyScene;
    };
  }, [scene]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const endPos = new THREE.Vector3(...shot.position);
    const endTarget = new THREE.Vector3(...shot.target);

    if (reduceMotion) {
      camera.position.copy(endPos);
      controls.target.copy(endTarget);
      controls.update();
      return;
    }

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const t0 = performance.now();
    const duration = 820;

    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, endPos, e);
      controls.target.lerpVectors(startTarget, endTarget, e);
      controls.update();
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [step.id, phase, shot.position, shot.target, resetNonce, reduceMotion, camera]);

  // Dev-only, same convention as the editor's `__wcMainControls`.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcAssemblyControls?: unknown };
    w.__wcAssemblyControls = controlsRef.current;
    return () => {
      delete w.__wcAssemblyControls;
    };
  }, []);

  return (
    <OrbitControls
      ref={(controls) => {
        controlsRef.current = controls;
      }}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.2}
      maxDistance={14}
      maxPolarAngle={Math.PI * 0.495}
    />
  );
};

/** Advances the clock while playing and reports the end of each step once. */
const StepDriver: React.FC<{
  clock: React.MutableRefObject<AssemblyClock>;
  total: number;
  onDone: () => void;
  progressRef?: React.RefObject<HTMLDivElement | null>;
}> = ({ clock, total, onDone, progressRef }) => {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useFrame((_, delta) => {
    const c = clock.current;
    if (!c.playing) return;
    // A tab that was asleep can hand us a delta of seconds; letting that
    // through would skip half the assembly in one frame.
    c.t += Math.min(delta, 0.1);
    if (c.t >= c.duration + c.hold) {
      c.t = c.duration + c.hold;
      c.playing = false;
      onDoneRef.current();
    }
  });

  // Written straight to the DOM: this is the one value that changes every
  // frame, and routing it through React would re-render the rail and the
  // control bar sixty times a second for a 2px line.
  useFrame(() => {
    const bar = progressRef?.current;
    if (!bar) return;
    const c = clock.current;
    const within = c.duration > 0 ? Math.min(1, c.t / c.duration) : 1;
    const overall = total > 0 ? Math.min(1, (c.stepIndex + within) / total) : 0;
    bar.style.transform = `scaleX(${overall})`;
  });

  return null;
};

const Workshop: React.FC = () => (
  <>
    <color attach="background" args={[FLOOR]} />
    <fog attach="fog" args={[FLOOR, 8, 18]} />

    {/* Aluminium and steel are `metalness: 0.9`; with no environment to reflect
        they render black, however many lights point at them. */}
    <SceneEnvironment intensity={0.35} />

    <ambientLight intensity={0.55} />
    <hemisphereLight args={['#cdd6e2', '#181a1f', 0.5]} />

    <directionalLight
      position={[2.6, 5.2, 3.2]}
      intensity={2.3}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-3.5}
      shadow-camera-right={3.5}
      shadow-camera-top={3.5}
      shadow-camera-bottom={-3.5}
      shadow-camera-near={0.5}
      shadow-camera-far={20}
      shadow-bias={-0.0004}
    />
    <directionalLight position={[-3.4, 2.6, -2.2]} intensity={0.7} />

    <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial color="#1b1e24" roughness={0.95} metalness={0} />
    </mesh>
    <gridHelper args={[20, 40, '#2c313a', '#22262d']} position={[0, 0.001, 0]} />
  </>
);

export interface AssemblyViewerProps {
  model: FurnitureModel;
  brackets: BracketInstance[];
  plan: AssemblyPlan;
  step: AssemblyStep;
  stepIndex: number;
  clock: React.MutableRefObject<AssemblyClock>;
  onStepDone: () => void;
  resetNonce: number;
  reduceMotion: boolean;
  progressRef?: React.RefObject<HTMLDivElement | null>;
}

const AssemblyViewer: React.FC<AssemblyViewerProps> = ({
  model,
  brackets,
  plan,
  step,
  stepIndex,
  clock,
  onStepDone,
  resetNonce,
  reduceMotion,
  progressRef,
}) => {
  return (
    <Canvas
      shadows="soft"
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
        outputColorSpace: 'srgb',
      }}
      camera={{
        position: [2.8, 1.9, 3.6],
        fov: 45,
        near: 0.05,
        far: 100,
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <Workshop />
      <AssemblyScene
        model={model}
        brackets={brackets}
        plan={plan}
        stepIndex={stepIndex}
        clock={clock}
        reduceMotion={reduceMotion}
      />
      <AssemblyCamera
        step={step}
        stepIndex={stepIndex}
        clock={clock}
        resetNonce={resetNonce}
        reduceMotion={reduceMotion}
      />
      <StepDriver
        clock={clock}
        total={plan.steps.length}
        onDone={onStepDone}
        progressRef={progressRef}
      />
    </Canvas>
  );
};

export default AssemblyViewer;
