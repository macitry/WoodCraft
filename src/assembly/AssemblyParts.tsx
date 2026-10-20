import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import type { BracketInstance, Component, FurnitureModel } from '../types/furniture';
import { bracketStlUrl } from '../types/furniture';
import { PartRenderer } from '../viewer/ModelLoader';
import { FastenerStl } from '../viewer/FastenerParts';
import {
  accessoryKitById,
  jointFasteners,
  socketAxis,
  type LocalFastener,
  type PartRole,
} from '../utils/accessoryKits';
import { useKitLayoutFor } from '../store/kitLayoutStore';
import { useModelStore } from '../store/modelStore';
import {
  clamp01,
  easeInOut,
  stepProgress,
  windowProgress,
  type AssemblyClock,
} from './assemblyClock';
import type { AssemblyMotion, AssemblyPlan } from './assemblyPlan';

const MM = 0.001;

const noop = () => {};

type ClockRef = React.MutableRefObject<AssemblyClock>;

/**
 * The animated frame around one part.
 *
 * `PartRenderer` draws the piece at its FINAL position, so the inner group
 * offsets it by `-final` — that puts the piece at the outer group's origin.
 * The outer group can then rotate it around its own centre (not the world
 * origin), and its position/quaternion are the only things the animation
 * writes. Re-renders mid-flight cannot snap it back: React supplies the start
 * transform only on mount, and after that the frame loop owns it.
 */
const AssemblyPart: React.FC<{
  part: Component;
  model: FurnitureModel;
  motion: AssemblyMotion;
  stepIndex: number;
  clock: ClockRef;
  reduceMotion: boolean;
}> = ({ part, model, motion, stepIndex, clock, reduceMotion }) => {
  const ref = useRef<THREE.Group>(null);

  const startPos = useMemo(() => new THREE.Vector3(...motion.start.position), [motion]);
  const endPos = useMemo(() => new THREE.Vector3(...motion.final.position), [motion]);
  const startQuat = useMemo(() => new THREE.Quaternion(...motion.start.quaternion), [motion]);
  const endQuat = useMemo(() => new THREE.Quaternion(...motion.final.quaternion), [motion]);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const raw = stepProgress(stepIndex, clock.current);
    const p = reduceMotion ? (raw > 0 ? 1 : 0) : easeInOut(raw);
    group.position.lerpVectors(startPos, endPos, p);
    group.quaternion.slerpQuaternions(startQuat, endQuat, p);
  });

  const [fx, fy, fz] = motion.final.position;

  return (
    <group
      ref={ref}
      position={motion.start.position}
      quaternion={motion.start.quaternion}
      userData={{ wcAssemblyPart: part.id }}
    >
      <group position={[-fx, -fy, -fz]}>
        <PartRenderer part={part} model={model} isSelected={false} onClick={noop} />
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Hardware inside one connector
// ---------------------------------------------------------------------------

/** Where in the bracket's step each role moves. The bracket itself lands by
 *  0.45; the T-nut is pushed into the slot as it lands, then the screws drive
 *  home, then the cover clips on. */
function roleWindow(role: PartRole): [number, number] {
  switch (role) {
    case 'mate':
      return [0.34, 0.56];
    case 'cover':
      return [0.86, 1];
    case 'extra':
    case 'bolt':
    default:
      return [0.46, 0.84];
  }
}

const AssemblyFastener: React.FC<{
  fastener: LocalFastener;
  bracketId: string;
  atStep: number;
  clock: ClockRef;
  reduceMotion: boolean;
}> = ({ fastener, bracketId, atStep, clock, reduceMotion }) => {
  const ref = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);

  const axis = useMemo(() => {
    const [x, y, z] = socketAxis(fastener.rotation);
    return new THREE.Vector3(x, y, z);
  }, [fastener.rotation]);

  const [from, to] = roleWindow(fastener.role);

  // Millimetres of travel outside the seat. A screw has to clear its own shaft
  // plus some air; a T-nut is short; a cover only needs to stand off the plate.
  const travel = useMemo(() => {
    if (fastener.role === 'cover') return 26;
    if (fastener.role === 'mate') return 18;
    return (fastener.spec.length ?? 10) + 24;
  }, [fastener]);

  const base = fastener.position;

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const p = stepProgress(atStep, clock.current);
    const w = windowProgress(p, from, to);
    const e = reduceMotion ? (w > 0 ? 1 : 0) : easeInOut(w);
    const out = -travel * (1 - e);

    group.visible = w > 0.001;
    group.position.set(
      (base[0] + axis.x * out) * MM,
      (base[1] + axis.y * out) * MM,
      (base[2] + axis.z * out) * MM,
    );

    // The hex socket and flange make the spin legible; a smooth shaft alone
    // would look like a part sliding in. Four turns over the insertion window.
    if (spinRef.current) {
      spinRef.current.rotation.z =
        fastener.role === 'bolt' || fastener.role === 'extra'
          ? e * Math.PI * 8
          : 0;
    }
  });

  return (
    <group
      ref={ref}
      position={[0, 0, 0]}
      rotation={fastener.rotation as unknown as [number, number, number]}
      scale={MM}
      visible={false}
      userData={{
        wcFastenerKey: fastener.key,
        wcBracketId: bracketId,
        wcRole: fastener.role,
      }}
    >
      <group ref={spinRef}>
        <FastenerStl fastener={fastener} />
      </group>
    </group>
  );
};

const AssemblyFasteners: React.FC<{
  bracket: BracketInstance;
  atStep: number;
  clock: ClockRef;
  reduceMotion: boolean;
}> = ({ bracket, atStep, clock, reduceMotion }) => {
  const kitId = useModelStore((s) => s.activeKitId);
  const kit = accessoryKitById(kitId);
  const stlUrl = bracketStlUrl(bracket);
  const layout = useKitLayoutFor(kitId, stlUrl);

  const fasteners = useMemo(
    () => (kit ? jointFasteners(kit, stlUrl, 1, layout) : []),
    [kit, stlUrl, layout],
  );

  if (fasteners.length === 0) return null;

  return (
    <group>
      {fasteners.map((f) => (
        <AssemblyFastener
          key={f.key}
          fastener={f}
          bracketId={bracket.id}
          atStep={atStep}
          clock={clock}
          reduceMotion={reduceMotion}
        />
      ))}
    </group>
  );
};

// ---------------------------------------------------------------------------
// One connector
// ---------------------------------------------------------------------------

const AssemblyBracket: React.FC<{
  bracket: BracketInstance;
  motion: AssemblyMotion;
  atStep: number;
  stepIndex: number;
  clock: ClockRef;
  reduceMotion: boolean;
}> = ({ bracket, motion, atStep, stepIndex, clock, reduceMotion }) => {
  const ref = useRef<THREE.Group>(null);
  const geom = useLoader(STLLoader, bracketStlUrl(bracket));
  const cloned = useMemo(() => geom.clone(), [geom]);
  useEffect(() => () => cloned.dispose(), [cloned]);

  const startPos = useMemo(() => new THREE.Vector3(...motion.start.position), [motion]);
  const endPos = useMemo(() => new THREE.Vector3(...motion.final.position), [motion]);
  const startQuat = useMemo(() => new THREE.Quaternion(...motion.start.quaternion), [motion]);
  const endQuat = useMemo(() => new THREE.Quaternion(...motion.final.quaternion), [motion]);

  const rot: [number, number, number] = [
    THREE.MathUtils.degToRad(bracket.rotation.roll),
    THREE.MathUtils.degToRad(bracket.rotation.pitch),
    THREE.MathUtils.degToRad(bracket.rotation.yaw),
  ];

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const raw = stepProgress(atStep, clock.current);
    // The bracket has to be seated before hardware starts: give it the first
    // 45% of the step.
    const p = reduceMotion
      ? (raw > 0 ? 1 : 0)
      : easeInOut(clamp01(raw / 0.45));
    group.position.lerpVectors(startPos, endPos, p);
    group.quaternion.slerpQuaternions(startQuat, endQuat, p);
  });

  const active = stepIndex === atStep;
  const installed = stepIndex >= atStep;

  return (
    <group
      ref={ref}
      position={motion.start.position}
      quaternion={motion.start.quaternion}
      visible={installed}
      userData={{ wcBracketId: bracket.id, wcAssemblyBracket: bracket.id }}
    >
      <group rotation={rot}>
        <mesh geometry={cloned} scale={MM} castShadow receiveShadow>
          <meshStandardMaterial
            color="#7a7f87"
            metalness={0.9}
            roughness={0.28}
            emissive={active ? '#4a7fd4' : '#000000'}
            emissiveIntensity={active ? 0.12 : 0}
          />
        </mesh>
        {installed && (
          <AssemblyFasteners
            bracket={bracket}
            atStep={atStep}
            clock={clock}
            reduceMotion={reduceMotion}
          />
        )}
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// The whole animated assembly
// ---------------------------------------------------------------------------

export const AssemblyScene: React.FC<{
  model: FurnitureModel;
  brackets: BracketInstance[];
  plan: AssemblyPlan;
  stepIndex: number;
  clock: ClockRef;
  reduceMotion: boolean;
}> = ({ model, brackets, plan, stepIndex, clock, reduceMotion }) => {
  return (
    <group>
      {model.components
        .filter((c) => c.visible && plan.partMotions.has(c.id))
        .map((part) => {
          const motion = plan.partMotions.get(part.id)!;
          const at = plan.partStepIndex.get(part.id);
          if (at === undefined) return null;
          return (
            <AssemblyPart
              key={part.id}
              part={part}
              model={model}
              motion={motion}
              stepIndex={at}
              clock={clock}
              reduceMotion={reduceMotion}
            />
          );
        })}

      {brackets
        .filter((b) => b.enabled)
        .map((bracket) => {
          const motion = plan.bracketMotions.get(bracket.id);
          const at = plan.bracketStepIndex.get(bracket.id);
          if (!motion || at === undefined) return null;
          return (
            <Suspense key={bracket.id} fallback={null}>
              <AssemblyBracket
                bracket={bracket}
                motion={motion}
                atStep={at}
                stepIndex={stepIndex}
                clock={clock}
                reduceMotion={reduceMotion}
              />
            </Suspense>
          );
        })}
    </group>
  );
};
