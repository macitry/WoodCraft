import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/dict';
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
import {
  BRACKET_TRAY,
  type AssemblyMotion,
  type AssemblyPlan,
  type BracketLeg,
  type BracketStage,
  type BracketSteps,
} from './assemblyPlan';

const MM = 0.001;

/** How far a T-nut rides outside its seat while sliding along the slot (mm).
 *  The seat is ~8 mm inside the profile face; this puts the nut at the slot
 *  mouth, where the camera can actually see it, before it presses in. */
const MATE_MOUTH_MM = 10;

/** The tray mat the staged kit rests on, in metres. Both the loose hardware
 *  and the waiting brackets are lowered onto its top face. */
const TRAY_THICKNESS = 0.005;
const TRAY_TOP = TRAY_THICKNESS;

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
  onPickStep?: () => void;
}> = ({ part, model, motion, stepIndex, clock, reduceMotion, onPickStep }) => {
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

  // `PartRenderer` draws the piece at its UPRIGHT assembled position; the outer
  // group carries the (possibly upside-down) pose, so the inner group cancels
  // that upright position rather than the final flat one.
  const [fx, fy, fz] = motion.renderPosition ?? motion.final.position;

  return (
    <group
      ref={ref}
      position={motion.start.position}
      quaternion={motion.start.quaternion}
      userData={{ wcAssemblyPart: part.id }}
    >
      <group position={[-fx, -fy, -fz]}>
        <PartRenderer
          part={part}
          model={model}
          isSelected={false}
          onClick={onPickStep ?? noop}
        />
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Hardware inside one connector
// ---------------------------------------------------------------------------

/** A corner joint is fitted in two steps, each moving ONE leg's hardware:
 *
 *      nut → plate lands → screw     (mount: screwed to the profile on the
 *                                     bench, before the other profile exists)
 *      nut → screw → cover           (attach: the profile just laid on top)
 *
 *  Windows are fractions of the step's own duration. The split is what lets the
 *  plan put the arriving profile's `part` step between the two halves. */
const STAGE_WINDOW: Record<
  BracketStage,
  { mate: [number, number]; bolt: [number, number]; cover: [number, number] }
> = {
  mount: { mate: [0.05, 0.3], bolt: [0.69, 0.98], cover: [1, 1] },
  attach: { mate: [0.03, 0.28], bolt: [0.31, 0.64], cover: [0.7, 0.95] },
};

/** When the plate itself flies to its seat: after the mount-side nut, before
 *  the mount-side screw. */
const BRACKET_LAND: [number, number] = [0.33, 0.66];

function roleWindow(role: PartRole, stage: BracketStage): [number, number] {
  const w = STAGE_WINDOW[stage];
  if (role === 'cover') return w.cover;
  if (role === 'mate') return w.mate;
  // `extra` parts have no seat and no side of their own; the bolt slot keeps
  // them out of the nut's and the plate's way.
  return w.bolt;
}

const AssemblyFastener: React.FC<{
  fastener: LocalFastener;
  /** Which half of the joint's fitting this step is. */
  stage: BracketStage;
  bracketId: string;
  atStep: number;
  clock: ClockRef;
  reduceMotion: boolean;
}> = ({ fastener, stage, bracketId, atStep, clock, reduceMotion }) => {
  const ref = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);

  const axis = useMemo(() => {
    const [x, y, z] = socketAxis(fastener.rotation);
    return new THREE.Vector3(x, y, z);
  }, [fastener.rotation]);

  const [from, to] = roleWindow(fastener.role, stage);

  // A T-nut lives IN the slot, so it is not offered along the screw axis (that
  // would push it through the bracket plate). It slides along the slot — the
  // nut's own long axis, which the seat rotation maps onto its profile's length
  // direction. Everything else is offered along the socket axis from outside.
  const slideAxis = useMemo(() => {
    const e = new THREE.Euler(
      fastener.rotation[0],
      fastener.rotation[1],
      fastener.rotation[2],
      'XYZ',
    );
    return new THREE.Vector3(0, 1, 0).applyEuler(e);
  }, [fastener.rotation]);
  const isMate = fastener.role === 'mate';

  // Millimetres of travel outside the seat. A screw has to clear its own shaft
  // plus some air; a T-nut slides in along the slot from beyond the bracket; a
  // cover only needs to stand off the plate.
  const travel = useMemo(() => {
    if (fastener.role === 'cover') return 26;
    if (fastener.role === 'mate') return 80;
    return (fastener.spec.length ?? 10) + 24;
  }, [fastener]);

  const base = fastener.position;

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const p = stepProgress(atStep, clock.current);
    const w = windowProgress(p, from, to);
    const e = reduceMotion ? (w > 0 ? 1 : 0) : easeInOut(w);
    // Bolts and the cover approach along the socket axis (which points INWARD);
    // the nut slides the other way — outward along its slot.
    const dir = isMate ? slideAxis : axis;
    const out = (isMate ? travel : -travel) * (1 - e);

    // A nut that is all the way in the slot is invisible from the assembly
    // camera (the profile hides it), so it rides in AT THE SLOT MOUTH — half
    // proud, sliding along the slot — and is pressed into its seat.
    //
    // The mount-side nut presses in at the end: the plate is not bolted down
    // yet, so the whole slide can stay visible. The attach-side nut presses in
    // EARLY, because its bracket leg is already sitting over that slot — the
    // nut dives under the plate while it is still outside the plate's footprint
    // (the leg reaches ~28 mm from the corner, the seat is at 15), then slides
    // flush the rest of the way, exactly as it would have to in the workshop.
    const press = stage === 'mount'
      ? clamp01((e - 0.72) / 0.28)
      : clamp01((e - 0.3) / 0.39);
    const mouth = isMate ? MATE_MOUTH_MM * (1 - press) : 0;

    group.visible = w > 0.001;
    group.position.set(
      (base[0] + dir.x * out - axis.x * mouth) * MM,
      (base[1] + dir.y * out - axis.y * mouth) * MM,
      (base[2] + dir.z * out - axis.z * mouth) * MM,
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
  /** The step (and stage) this group animates on. */
  atStep: number;
  stage: BracketStage;
  clock: ClockRef;
  reduceMotion: boolean;
  /** Draw only these roles. The T-nuts are rendered in the joint's fixed frame
   *  (they belong to the profile, not to the bracket that flies in), so they
   *  are split out of the bracket's animated group. */
  only?: PartRole[];
  /** Draw only hardware on this leg. The cover has no leg and is never
   *  filtered out. */
  leg?: BracketLeg;
}> = ({ bracket, atStep, stage, clock, reduceMotion, only, leg }) => {
  const kitId = useModelStore((s) => s.activeKitId);
  const kit = accessoryKitById(kitId);
  const stlUrl = bracketStlUrl(bracket);
  const layout = useKitLayoutFor(kitId, stlUrl);

  const fasteners = useMemo(
    () => (kit ? jointFasteners(kit, stlUrl, 1, layout) : []),
    [kit, stlUrl, layout],
  );

  // `partKey` is `<role>|<leg>|<along>|<across>`. The leg was chosen by the
  // plan from the bracket's own geometry, so this is a plain filter: each
  // stage draws exactly the seats it drives.
  const legOf = (f: LocalFastener) => f.key.split('|')[1];
  const shown = fasteners.filter(
    (f) =>
      (!only || only.includes(f.role)) &&
      (leg === undefined || f.role === 'cover' || legOf(f) === leg),
  );

  if (shown.length === 0) return null;

  return (
    <group>
      {shown.map((f) => (
        <AssemblyFastener
          key={f.key}
          fastener={f}
          stage={stage}
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
  /** Where the plate flies onto the profile already in place. */
  mountStep: number;
  /** Where the arriving profile's side is screwed down (absent when the kit
   *  puts no hardware on that leg and has no cover). */
  attachStep?: number;
  mountLeg: BracketLeg;
  attachLeg?: BracketLeg;
  stepIndex: number;
  clock: ClockRef;
  reduceMotion: boolean;
  onPickStep?: () => void;
}> = ({
  bracket,
  motion,
  mountStep,
  attachStep,
  mountLeg,
  attachLeg,
  stepIndex,
  clock,
  reduceMotion,
  onPickStep,
}) => {
  const ref = useRef<THREE.Group>(null);
  const geom = useLoader(STLLoader, bracketStlUrl(bracket));
  const cloned = useMemo(() => geom.clone(), [geom]);
  useEffect(() => () => cloned.dispose(), [cloned]);

  const rot = useMemo<[number, number, number]>(
    () => [
      THREE.MathUtils.degToRad(bracket.rotation.roll),
      THREE.MathUtils.degToRad(bracket.rotation.pitch),
      THREE.MathUtils.degToRad(bracket.rotation.yaw),
    ],
    [bracket.rotation.roll, bracket.rotation.pitch, bracket.rotation.yaw],
  );
  const rawQuat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')),
    [rot],
  );

  // In the tray every connector lies the same way up, in the STL's own resting
  // pose, rather than each wearing its installed attitude — otherwise the tray
  // is a field of plates standing on edge at eight different angles. The
  // installed rotation is pushed into the inner group and the outer group
  // starts at its inverse, so the mesh reads as raw; the mount flight then
  // slerps from that flat pose into the final one.
  const planStartQuat = useMemo(
    () => new THREE.Quaternion(...motion.start.quaternion),
    [motion],
  );
  const startQuat = useMemo(
    () => planStartQuat.clone().multiply(rawQuat.clone().invert()),
    [planStartQuat, rawQuat],
  );

  // The plan's tray slot y is only nominal. A bracket's origin sits at its
  // centre, so the plate has to be lowered onto the mat by its own bounds —
  // otherwise it hovers over (or, as it did, sinks into) the floor.
  const box = useMemo(() => {
    geom.computeBoundingBox();
    return geom.boundingBox;
  }, [geom]);
  const startPos = useMemo(() => {
    const p = new THREE.Vector3(...motion.start.position);
    if (!box) return p;
    // World orientation while staged is startQuat · rawQuat = planStartQuat.
    const v = new THREE.Vector3();
    let minY = Infinity;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          minY = Math.min(minY, v.set(x, y, z).applyQuaternion(planStartQuat).y);
        }
      }
    }
    if (Number.isFinite(minY)) p.y = TRAY_TOP - minY * MM;
    return p;
  }, [motion, box, planStartQuat]);
  const endPos = useMemo(() => new THREE.Vector3(...motion.final.position), [motion]);
  const endQuat = useMemo(() => new THREE.Quaternion(...motion.final.quaternion), [motion]);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const raw = stepProgress(mountStep, clock.current);
    // The mount-side nut seats first, then the plate comes down on that
    // profile. The mount-side screw starts right after it lands, so the
    // bracket is fixed to one profile before the other one ever arrives.
    const p = reduceMotion
      ? (raw > 0 ? 1 : 0)
      : easeInOut(
          clamp01((raw - BRACKET_LAND[0]) / (BRACKET_LAND[1] - BRACKET_LAND[0])),
        );
    group.position.lerpVectors(startPos, endPos, p);
    group.quaternion.slerpQuaternions(startQuat, endQuat, p);
  });

  const active =
    stepIndex === mountStep || (attachStep !== undefined && stepIndex === attachStep);
  const installed = stepIndex >= mountStep;

  return (
    <>
      {/* Visible from the layout step on: until its mount step the bracket
          waits in the staged tray at this start transform. */}
      <group
        ref={ref}
        position={startPos}
        quaternion={startQuat}
        userData={{ wcBracketId: bracket.id, wcAssemblyBracket: bracket.id }}
      >
        <group rotation={rot}>
          <mesh
            geometry={cloned}
            scale={MM}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              onPickStep?.();
            }}
          >
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
              atStep={mountStep}
              stage="mount"
              leg={mountLeg}
              clock={clock}
              reduceMotion={reduceMotion}
              only={['bolt', 'extra']}
            />
          )}
          {installed && attachStep !== undefined && attachLeg !== undefined && (
            <AssemblyFasteners
              bracket={bracket}
              atStep={attachStep}
              stage="attach"
              leg={attachLeg}
              clock={clock}
              reduceMotion={reduceMotion}
              only={['bolt', 'extra']}
            />
          )}
          {installed && attachStep !== undefined && (
            <AssemblyFasteners
              bracket={bracket}
              atStep={attachStep}
              stage="attach"
              clock={clock}
              reduceMotion={reduceMotion}
              only={['cover']}
            />
          )}
          {/* Hand-added parts have no leg of their own; they ride along with
              the plate on its mount step, unfiltered. */}
          {installed && (
            <AssemblyFasteners
              bracket={bracket}
              atStep={mountStep}
              stage="mount"
              clock={clock}
              reduceMotion={reduceMotion}
              only={['extra']}
            />
          )}
        </group>
      </group>

      {/* T-nuts belong to the joint, not to the bracket that flies in: they are
          already in the profile slots before the plate arrives, so they must
          not inherit its approach animation. Same final transform, same inner
          rotation — only the animation is left out. Each stage drops its own
          nut onto its own leg. */}
      {installed && (
        <group position={motion.final.position} quaternion={motion.final.quaternion}>
          <group rotation={rot}>
            <AssemblyFasteners
              bracket={bracket}
              atStep={mountStep}
              stage="mount"
              leg={mountLeg}
              clock={clock}
              reduceMotion={reduceMotion}
              only={['mate']}
            />
            {attachStep !== undefined && attachLeg !== undefined && (
              <AssemblyFasteners
                bracket={bracket}
                atStep={attachStep}
                stage="attach"
                leg={attachLeg}
                clock={clock}
                reduceMotion={reduceMotion}
                only={['mate']}
              />
            )}
          </group>
        </group>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// The frame is built upside-down and turned over in one go
// ---------------------------------------------------------------------------

/**
 * Rotates the whole frame 180° about X at the flip step.
 *
 * Nesting is the trick: an outer group at `y = pivotY` and an inner group at
 * `-pivotY` put the outer group's origin on the rotation axis. The `lift` term
 * raises that axis at mid-turn so the corners cannot scrape the floor while the
 * frame is edge-on.
 *
 * The pose is written every frame from the clock, so jumping to any step lands
 * correctly — nothing about the flip is stored in React state.
 */
const FrameFlip: React.FC<{
  plan: AssemblyPlan;
  clock: ClockRef;
  reduceMotion: boolean;
  children: React.ReactNode;
}> = ({ plan, clock, reduceMotion, children }) => {
  const ref = useRef<THREE.Group>(null);
  const { stepIndex, pivotY, lift } = plan.flip;

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const raw = stepProgress(stepIndex, clock.current);
    const p = reduceMotion ? (raw > 0 ? 1 : 0) : easeInOut(raw);
    const angle = p * Math.PI;
    group.rotation.x = angle;
    group.position.y = pivotY + lift * Math.sin(angle);
  });

  return (
    <group ref={ref} position={[0, pivotY, 0]} userData={{ wcFlip: true }}>
      <group position={[0, -pivotY, 0]}>{children}</group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Hardware callouts
// ---------------------------------------------------------------------------

type CalloutRole = 'mate' | 'bolt' | 'cover';

const CALLOUT_KEY: Record<CalloutRole, DictKey> = {
  mate: 'assembly.callout.mate',
  bolt: 'assembly.callout.bolt',
  cover: 'assembly.callout.cover',
};

/** ①②③ labels beside the joint, lit in turn as each piece goes in.
 *
 *  Anchored at the SEAT, not at the bracket's animated position: the labels are
 *  a caption for the joint, and a caption that flies in with the part is noise.
 *  The numbers follow the same `roleWindow` the parts animate on, so the label
 *  and the moving screw can never disagree. Each stage lights the hardware it
 *  actually drives: the mount step has no cover yet, the attach step does.
 */
const BracketCallouts: React.FC<{
  target: [number, number, number];
  atStep: number;
  stage: BracketStage;
  clock: ClockRef;
  roles: CalloutRole[];
}> = ({ target, atStep, stage, clock, roles }) => {
  const t = useT();
  const refs = useRef<Partial<Record<CalloutRole, HTMLDivElement | null>>>({});

  useFrame(() => {
    const p = stepProgress(atStep, clock.current);
    for (const role of roles) {
      const el = refs.current[role];
      if (!el) continue;
      const [from, to] = roleWindow(role, stage);
      const w = windowProgress(p, from, to);
      const active = w > 0 && w < 1;
      el.style.opacity = active ? '1' : w >= 1 ? '0.7' : '0.42';
      el.style.transform = `scale(${active ? 1 : 0.92})`;
    }
  });

  // Stack the labels just inside the frame and above the joint, clear of the
  // rails that would otherwise cover them.
  const len = Math.hypot(target[0], target[2]) || 1;
  const base: [number, number, number] = [
    target[0] - (target[0] / len) * 0.14,
    target[1] + 0.1,
    target[2] - (target[2] / len) * 0.14,
  ];

  // One Html block, three CSS-stacked rows. Three separate 3D anchors would
  // climb out of a close-up frame that is level with the joint.
  return (
    <group position={base}>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col items-start gap-1">
          {roles.map((role, i) => (
            <div
              key={role}
              ref={(el) => {
                refs.current[role] = el;
              }}
              data-callout={role}
              className="flex items-center gap-1.5 rounded-full border border-neutral-600/70 bg-neutral-950/85 px-2 py-0.5 whitespace-nowrap text-[11px] text-neutral-200 shadow-lg backdrop-blur-sm transition-[opacity,transform] duration-150"
              style={{ opacity: 0.42 }}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-wood-500 text-[9px] font-semibold text-neutral-950">
                {i + 1}
              </span>
              {t(CALLOUT_KEY[role])}
            </div>
          ))}
        </div>
      </Html>
    </group>
  );
};

// ---------------------------------------------------------------------------
// The loose hardware waiting in the tray
// ---------------------------------------------------------------------------

/** Layout of one joint's hardware inside the tray, in metres. One row of bolts
 *  and nuts in front of (toward the build from) the bracket, the cover by
 *  itself between them — the run is wide enough for the largest parts and the
 *  rows are far enough apart that nothing overlaps. */
const HARDWARE_PITCH = 0.030;
const HARDWARE_ROW_Z = 0.090;
const COVER_ROW_Z = 0.045;

/** How each loose part lies on the bench.
 *
 *  The baked parts are authored in their INSTALLED frame: +Z runs into the
 *  material, and a T-nut's long axis is its own +Y. Left unrotated, a 20mm nut
 *  balances on its 4mm edge and a 32mm cover stands on end — parts do not wait
 *  for assembly like that. A quarter turn about X lays the nut and the cover
 *  on their broad faces; a screw's shaft is already horizontal at identity, so
 *  it stays lying along Z. */
const STAGED_ROT: Record<PartRole, [number, number, number]> = {
  bolt: [0, 0, 0],
  extra: [0, 0, 0],
  mate: [-Math.PI / 2, 0, 0],
  cover: [-Math.PI / 2, 0, 0],
};

/** One loose screw / T-nut / cover, lying on the tray mat.
 *
 *  The baked hardware is modelled in millimetres with its mating plane on z=0
 *  and its axis along +Z; `STAGED_ROT` lays each kind on its natural face. The
 *  lift comes from the mesh's own bounds rather than a guessed offset: a screw
 *  head, a 4mm nut and a 28mm cover all have to meet the mat.
 *
 *  The piece leaves the tray at the moment its counterpart starts moving in
 *  (the same window `AssemblyFastener` uses), not when the step begins — the
 *  bracket has to fly and seat first, and a bolt that vanished as soon as its
 *  step started would be missing from the bench for most of the joint. */
const StagedPiece: React.FC<{
  fastener: LocalFastener;
  position: [number, number, number];
  atStep: number;
  /** The counterpart's approach window within its step. */
  range: [number, number];
  clock: ClockRef;
}> = ({ fastener, position, atStep, range: [from, to], clock }) => {
  const ref = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Group>(null);
  const lifted = useRef(false);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const p = stepProgress(atStep, clock.current);
    group.visible = windowProgress(p, from, to) <= 0.001;

    const g = mesh.current;
    if (lifted.current || !g || g.children.length === 0) return;
    g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(g);
    if (!Number.isFinite(box.min.y)) return;
    g.position.y += TRAY_TOP - box.min.y;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    lifted.current = true;
  });

  return (
    <group
      ref={ref}
      position={position}
      userData={{ wcStagedPiece: fastener.key, wcStagedRole: fastener.role }}
    >
      <group ref={mesh} scale={MM} rotation={STAGED_ROT[fastener.role]}>
        <FastenerStl fastener={fastener} />
      </group>
    </group>
  );
};

/** One bracket's hardware, laid in the patch of tray in front of its slot. */
const StagedBracketHardware: React.FC<{
  bracket: BracketInstance;
  /** Position in the tray, matching the bracket's own slot. */
  index: number;
  steps: BracketSteps;
  clock: ClockRef;
}> = ({ bracket, index, steps, clock }) => {
  const kitId = useModelStore((s) => s.activeKitId);
  const kit = accessoryKitById(kitId);
  const stlUrl = bracketStlUrl(bracket);
  const layout = useKitLayoutFor(kitId, stlUrl);

  const fasteners = useMemo(
    () => (kit ? jointFasteners(kit, stlUrl, 1, layout) : []),
    [kit, stlUrl, layout],
  );

  if (fasteners.length === 0) return null;

  const col = index % BRACKET_TRAY.cols;
  const row = Math.floor(index / BRACKET_TRAY.cols);
  const bx = BRACKET_TRAY.x + col * BRACKET_TRAY.gap;
  const bz = BRACKET_TRAY.z + row * BRACKET_TRAY.gap;

  // Bolts and nuts share one even row; the cover is wider than the pitch, so
  // it gets a short row of its own between that row and the bracket.
  const loose = fasteners.filter((f) => f.role !== 'cover');
  const covers = fasteners.filter((f) => f.role === 'cover');
  const placed = [
    ...loose.map((f, i) => ({
      f,
      p: [
        bx + (i - (loose.length - 1) / 2) * HARDWARE_PITCH,
        0,
        bz - HARDWARE_ROW_Z,
      ] as [number, number, number],
    })),
    ...covers.map((f, i) => ({
      f,
      p: [
        bx + (i - (covers.length - 1) / 2) * 0.036,
        0,
        bz - COVER_ROW_Z,
      ] as [number, number, number],
    })),
  ];

  return (
    <group userData={{ wcStagedBracket: bracket.id }}>
      {placed.map(({ f, p }) => {
        // The same side/stage split `AssemblyBracket` draws the pieces on. A
        // cover closes the second side; extras have no side and ride with the
        // mount.
        const leg = f.key.split('|')[1];
        const onAttach =
          steps.attach !== undefined &&
          steps.attachLeg !== undefined &&
          (f.role === 'cover' || leg === steps.attachLeg);
        const stage: BracketStage = onAttach ? 'attach' : 'mount';
        const atStep = stage === 'attach' ? (steps.attach ?? steps.mount) : steps.mount;
        return (
          <StagedPiece
            key={f.key}
            fastener={f}
            atStep={atStep}
            range={roleWindow(f.role, stage)}
            clock={clock}
            position={p}
          />
        );
      })}
    </group>
  );
};

/** The hardware laid out beside the connector tray on the floor.
 *
 *  No `stepIndex` gate: every piece decides for itself when it is picked up,
 *  which keeps a step jump backwards from permanently emptying the tray. */
const StagedHardware: React.FC<{
  brackets: BracketInstance[];
  plan: AssemblyPlan;
  clock: ClockRef;
}> = ({ brackets, plan, clock }) => {
  // Same order as the plan's tray slots — including disabled brackets, so the
  // indices line up with the slots even if one is switched off.
  const ordered = useMemo(
    () => [...brackets].sort((a, b) => a.id.localeCompare(b.id)),
    [brackets],
  );

  // The mat is what makes the grouping read as a tray instead of parts lying
  // loose on the workshop floor. Its extent is the slots plus the hardware
  // rows in front of them; rows are 4 wide, so a partial last row still fits.
  const rows = Math.max(1, Math.ceil(ordered.length / BRACKET_TRAY.cols));
  const colsUsed = Math.min(BRACKET_TRAY.cols, Math.max(1, ordered.length));
  const x0 = BRACKET_TRAY.x - 0.062;
  const x1 = BRACKET_TRAY.x + (colsUsed - 1) * BRACKET_TRAY.gap + 0.062;
  const z0 = BRACKET_TRAY.z - 0.106;
  const z1 = BRACKET_TRAY.z + (rows - 1) * BRACKET_TRAY.gap + 0.04;

  return (
    <group>
      {ordered.length > 0 && (
        <mesh
          position={[(x0 + x1) / 2, TRAY_THICKNESS / 2, (z0 + z1) / 2]}
          receiveShadow
          userData={{ wcStageTray: true }}
        >
          <boxGeometry args={[x1 - x0, TRAY_THICKNESS, z1 - z0]} />
          <meshStandardMaterial color="#333944" roughness={0.92} metalness={0.05} />
        </mesh>
      )}
      {ordered.map((bracket, i) => {
        const steps = plan.bracketSteps.get(bracket.id);
        if (!bracket.enabled || !steps) return null;
        return (
          <Suspense key={bracket.id} fallback={null}>
            <StagedBracketHardware
              bracket={bracket}
              index={i}
              steps={steps}
              clock={clock}
            />
          </Suspense>
        );
      })}
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
  /** Jump to the step that installs a piece the viewer clicked. */
  onPickStep?: (index: number) => void;
}> = ({ model, brackets, plan, stepIndex, clock, reduceMotion, onPickStep }) => {
  const kitId = useModelStore((s) => s.activeKitId);
  const kit = accessoryKitById(kitId);

  // The kit decides which callouts exist: a tapped joint has no T-nut, and a
  // heavy kit has no cover.
  const calloutRoles = useMemo<CalloutRole[]>(() => {
    const roles: CalloutRole[] = [];
    if (kit?.mate) roles.push('mate');
    roles.push('bolt');
    if (kit?.cover) roles.push('cover');
    return roles;
  }, [kit]);

  // The current step, when it is a bracket step, names its connector and stage.
  const activeStep = plan.bracketStepAt.get(stepIndex);
  const activeBracket = activeStep
    ? brackets.find((b) => b.id === activeStep.bracketId)
    : undefined;
  const calloutTarget = activeBracket
    ? plan.bracketMotions.get(activeBracket.id)?.final.position
    : undefined;
  // The mount step is over before the cover exists; the attach step clips it on.
  const stageRoles =
    activeStep?.stage === 'attach'
      ? calloutRoles
      : calloutRoles.filter((role) => role !== 'cover');

  const renderPart = (part: Component) => {
    const motion = plan.partMotions.get(part.id);
    const at = plan.partStepIndex.get(part.id);
    if (!motion || at === undefined) return null;
    return (
      <AssemblyPart
        key={part.id}
        part={part}
        model={model}
        motion={motion}
        stepIndex={at}
        clock={clock}
        reduceMotion={reduceMotion}
        onPickStep={onPickStep ? () => onPickStep(at) : undefined}
      />
    );
  };

  const isTop = (c: Component) => c.partType === 'tabletop';
  const frameParts = model.components.filter(
    (c) => c.visible && plan.partMotions.has(c.id) && !isTop(c),
  );
  const topParts = model.components.filter(
    (c) => c.visible && plan.partMotions.has(c.id) && isTop(c),
  );

  return (
    <group>
      <FrameFlip plan={plan} clock={clock} reduceMotion={reduceMotion}>
        {frameParts.map(renderPart)}

        {brackets.map((bracket) => {
          const motion = plan.bracketMotions.get(bracket.id);
          const at = plan.bracketSteps.get(bracket.id);
          if (!bracket.enabled || !motion || !at) return null;
          return (
            <Suspense key={bracket.id} fallback={null}>
              <AssemblyBracket
                bracket={bracket}
                motion={motion}
                mountStep={at.mount}
                attachStep={at.attach}
                mountLeg={at.mountLeg}
                attachLeg={at.attachLeg}
                stepIndex={stepIndex}
                clock={clock}
                reduceMotion={reduceMotion}
                onPickStep={onPickStep ? () => onPickStep(at.mount) : undefined}
              />
            </Suspense>
          );
        })}

        {activeBracket && activeStep && calloutTarget && (
          <BracketCallouts
            target={calloutTarget}
            atStep={stepIndex}
            stage={activeStep.stage}
            clock={clock}
            roles={stageRoles}
          />
        )}
      </FrameFlip>

      {/* Floor furniture, so outside the flip: every piece here is consumed
          before the frame turns over. */}
      <StagedHardware brackets={brackets} plan={plan} clock={clock} />

      {topParts.map(renderPart)}
    </group>
  );
};
