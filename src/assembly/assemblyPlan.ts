// ---------------------------------------------------------------------------
// The installation order, as data.
//
// There is no order in the model: the solver returns parts in whatever order
// the URDF walk found them, and brackets carry no sequence number. So the plan
// is DERIVED, once, from the same layout the renderer uses — never from an id
// string, because the four templates mirror legs and beams differently and a
// name-based guess would send a piece through the desk.
//
// The order is the one a person actually builds in:
//   lay everything out → stand the legs → fit the rails → cross rails →
//   one connector at a time → the top → done.
//
// Every step is one piece (逐件式): its own start transform, its own camera.
// Transform maths below is in METRES, Y-up, the frame the viewer draws in.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { BracketInstance, Component, FurnitureModel } from '../types/furniture';
import { TEMPLATE_LAYOUTS } from '../types/furniture';
import { computeFrameLayout } from '../viewer/frameLayout';

export type AssemblyPhase = 'prep' | 'frame' | 'joints' | 'top' | 'done';
export type AssemblyStepKind = 'layout' | 'part' | 'bracket' | 'complete';

export interface AssemblyCameraShot {
  position: [number, number, number];
  target: [number, number, number];
}

export interface AssemblyStep {
  id: string;
  kind: AssemblyStepKind;
  phase: AssemblyPhase;
  /** `part` steps only. */
  partId?: string;
  /** `part` steps only, so the UI can pick the right sentence. */
  partType?: string;
  /** `bracket` steps only. */
  bracketId?: string;
  /** `bracket` steps only: the pieces this connector joins, in model order. */
  connectedPartIds?: string[];
  /** Seconds the motion runs, then seconds it holds before auto-advance. */
  duration: number;
  hold: number;
  camera: AssemblyCameraShot;
  /** A second shot, flown to once the step passes `cameraSwitch` (0..1). */
  camera2?: AssemblyCameraShot;
  cameraSwitch?: number;
}

export interface AssemblyTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface AssemblyMotion {
  start: AssemblyTransform;
  final: AssemblyTransform;
}

export interface AssemblyPlan {
  steps: AssemblyStep[];
  partMotions: Map<string, AssemblyMotion>;
  bracketMotions: Map<string, AssemblyMotion>;
  /** Step index at which each piece starts moving. */
  partStepIndex: Map<string, number>;
  bracketStepIndex: Map<string, number>;
  parts: number;
  brackets: number;
}

/** The slice of the store's `currentParams` this module needs. */
export interface AssemblyParams {
  templateId: string;
  width: number;
  depth: number;
  height: number;
  tabletopThickness: number;
  insetRatioX: number;
  insetRatioZ: number;
  crossBeamHeightRatio: number;
}

const MM = 0.001;
const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];
const UP = new THREE.Vector3(0, 1, 0);

const getParam = (model: FurnitureModel, id: string, fallback: number): number =>
  model.parameters.find((p) => p.id === id)?.value ?? fallback;

/** Sort key for "go around the desk": front-left, front-right, back-right,
 *  back-left. Brackets on the same corner then go bottom to top. */
function cornerKey(x: number, z: number): number {
  const a = Math.atan2(z, x);
  return a < 0 ? a + Math.PI * 2 : a;
}

function radial(x: number, z: number): [number, number] {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return [0, 0];
  return [x / len, z / len];
}

/** A camera placed outside the piece, looking back at it. `lift` is in metres. */
function shotLookingAt(
  target: [number, number, number],
  distance: number,
  lift = 0.85,
): AssemblyCameraShot {
  const [rx, rz] = radial(target[0], target[2]);
  const dir = new THREE.Vector3(
    rx || 0.55,
    lift,
    rz || 1,
  ).normalize();
  const position = new THREE.Vector3(...target).addScaledVector(dir, distance);
  // Never let a close-up of a floor-level piece put the camera under the floor.
  position.y = Math.max(position.y, 0.18);
  return {
    position: [position.x, position.y, position.z],
    target,
  };
}

/** A camera inside the frame, looking back out at a joint.
 *
 *  Connectors sit in the inner corner, below the rail: from outside the desk the
 *  leg and beam hide them, and from above the rail's top edge cuts across the
 *  face. The only view with the bracket in it is from inside, roughly level
 *  with the joint. */
function shotInside(
  target: [number, number, number],
  distance: number,
  lift = 0.1,
): AssemblyCameraShot {
  const [rx, rz] = radial(target[0], target[2]);
  const dir = new THREE.Vector3(-rx || -0.55, lift, -rz || -1).normalize();
  const position = new THREE.Vector3(...target).addScaledVector(dir, distance);
  position.y = Math.max(position.y, 0.18);
  return {
    position: [position.x, position.y, position.z],
    target,
  };
}

/** Default start pose for a piece that gets carried in from outside the frame. */
function carriedInStart(
  finalPos: [number, number, number],
  radialDistance: number,
  y: number,
): AssemblyTransform {
  const [rx, rz] = radial(finalPos[0], finalPos[2]);
  return {
    position: [
      finalPos[0] + rx * radialDistance,
      y,
      finalPos[2] + rz * radialDistance,
    ],
    quaternion: IDENTITY,
  };
}

export function buildAssemblyPlan(
  model: FurnitureModel,
  brackets: BracketInstance[],
  params: AssemblyParams,
): AssemblyPlan {
  const layout =
    TEMPLATE_LAYOUTS[params.templateId] || TEMPLATE_LAYOUTS['basic-desk'];
  const profileSize = layout?.profileSize ?? 30;
  const ps = profileSize * MM;

  const w = getParam(model, 'width', 1200) * MM;
  const d = getParam(model, 'depth', 600) * MM;
  const h = getParam(model, 'height', 750) * MM;
  const tt = getParam(model, 'tabletop_thickness', 18) * MM;

  const layoutCfg = {
    insetRatioX: params.insetRatioX,
    insetRatioZ: params.insetRatioZ,
    profileSize,
    crossBeamHeightRatio: params.crossBeamHeightRatio,
  };

  const visible = model.components.filter((c) => c.visible);
  const partsByType = (type: string) => visible.filter((c) => c.partType === type);

  const steps: AssemblyStep[] = [];
  const partMotions = new Map<string, AssemblyMotion>();
  const bracketMotions = new Map<string, AssemblyMotion>();
  const partStepIndex = new Map<string, number>();
  const bracketStepIndex = new Map<string, number>();

  // --- 0. Everything on the floor -----------------------------------------
  // The opening camera frames the whole staging area, not the finished desk:
  // at this point the desk does not exist yet.
  const span = Math.max(w, d, 1);
  steps.push({
    id: 'layout',
    kind: 'layout',
    phase: 'prep',
    duration: 1.6,
    hold: 1.2,
    camera: {
      ...shotLookingAt([0, 0.16, 0.18], 2.0 + span * 0.95, 0.8),
    },
  });

  const addPartStep = (type: string, part: Component) => {
    const frame = computeFrameLayout(model, part, layoutCfg);
    const finalPos: [number, number, number] = frame
      ? [...frame.worldPosition]
      : [
          (part.pose?.x ?? 0) * MM,
          (part.pose?.z ?? 0) * MM,
          (part.pose?.y ?? 0) * MM,
        ];

    let start: AssemblyTransform;
    let distance = 1.5;

    if (type === 'leg') {
      const len = Math.max(0.2, (part.dimensions?.extrusion_length ?? 350) * MM * (frame?.zScale ?? 1));
      const [rx, rz] = radial(finalPos[0], finalPos[2]);
      const dir = new THREE.Vector3(rx || 1, 0, rz || 0).normalize();
      // Lying radially: the long axis goes from vertical to horizontal, and
      // half the piece sits beyond its final corner.
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      start = {
        position: [
          finalPos[0] + dir.x * (len / 2 + 0.18),
          ps / 2,
          finalPos[2] + dir.z * (len / 2 + 0.18),
        ],
        quaternion: [q.x, q.y, q.z, q.w],
      };
      distance = 1.3 + len * 0.5;
    } else if (type === 'tabletop') {
      // Flat, in front of the build. Identity rotation: a board is already
      // lying the way it will be installed.
      start = {
        position: [0, tt / 2 + 0.002, d / 2 + 0.9],
        quaternion: IDENTITY,
      };
      distance = 1.7 + Math.max(w, d) * 0.6;
    } else {
      // Rails are already horizontal — carry them in, do not tip them.
      start = carriedInStart(finalPos, 0.5 + ps * 2, ps / 2);
      distance = 1.35 + Math.max(w, d) * 0.25;
    }

    partMotions.set(part.id, {
      start,
      final: { position: finalPos, quaternion: IDENTITY },
    });
    partStepIndex.set(part.id, steps.length);

    const mid: [number, number, number] = [
      (start.position[0] + finalPos[0]) / 2,
      Math.max(0.12, (start.position[1] + finalPos[1]) / 2),
      (start.position[2] + finalPos[2]) / 2,
    ];

    steps.push({
      id: `part:${part.id}`,
      kind: 'part',
      phase: type === 'tabletop' ? 'top' : 'frame',
      partId: part.id,
      partType: type,
      duration: type === 'tabletop' ? 1.9 : 1.5,
      hold: type === 'tabletop' ? 0.8 : 0.35,
      camera: shotLookingAt(mid, distance),
    });
  };

  // --- Frame parts, one by one -------------------------------------------
  for (const type of ['leg', 'beam', 'cross_beam']) {
    for (const part of partsByType(type)) addPartStep(type, part);
  }

  // --- Connectors, one joint at a time ------------------------------------
  // Order around the frame, then bottom to top: matches how the frame was
  // built and keeps the camera from hopping back and forth across the desk.
  const orderedBrackets = brackets
    .filter((b) => b.enabled)
    .slice()
    .sort((a, b) => {
      const ka = cornerKey(a.position.x, a.position.z);
      const kb = cornerKey(b.position.x, b.position.z);
      if (Math.abs(ka - kb) > 1e-3) return ka - kb;
      return a.position.y - b.position.y;
    });

  for (const bracket of orderedBrackets) {
    const finalPos: [number, number, number] = [
      bracket.position.x * MM,
      bracket.position.y * MM,
      bracket.position.z * MM,
    ];
    const [rx, rz] = radial(finalPos[0], finalPos[2]);
    const start: AssemblyTransform = {
      position: [
        finalPos[0] + (rx || 0.4) * 0.3,
        finalPos[1] + 0.2,
        finalPos[2] + (rz || 0.4) * 0.3,
      ],
      // Turned away from its seat, so the flip into place reads as a rotation.
      quaternion: (() => {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0.32, 1.05, -0.18, 'XYZ'),
        );
        return [q.x, q.y, q.z, q.w] as [number, number, number, number];
      })(),
    };

    bracketMotions.set(bracket.id, {
      start,
      final: { position: finalPos, quaternion: IDENTITY },
    });

    const connectedPartIds = bracket.connectedParts.filter((id) =>
      visible.some((c) => c.id === id),
    );

    const stepIndex = steps.length;
    bracketStepIndex.set(bracket.id, stepIndex);

    // Frame the whole approach: the connector starts a third of a metre off
    // its seat, so aiming at the seat alone would play the flip off-screen.
    const mid: [number, number, number] = [
      (start.position[0] + finalPos[0]) / 2,
      (start.position[1] + finalPos[1]) / 2,
      (start.position[2] + finalPos[2]) / 2,
    ];

    steps.push({
      id: `bracket:${bracket.id}`,
      kind: 'bracket',
      phase: 'joints',
      bracketId: bracket.id,
      connectedPartIds,
      duration: 3.0,
      hold: 0.5,
      // Wide for the approach, then in on the joint for the hardware: at this
      // size a connector seen from a metre away is a blue speck.
      camera: shotLookingAt(mid, 0.9, 0.4),
      camera2: shotInside(finalPos, 0.4),
      cameraSwitch: 0.28,
    });
  }

  // --- The top goes on last, over the finished frame ------------------------
  for (const part of partsByType('tabletop')) addPartStep('tabletop', part);

  // --- Done ---------------------------------------------------------------
  steps.push({
    id: 'complete',
    kind: 'complete',
    phase: 'done',
    duration: 0.01,
    hold: 0,
    camera: shotLookingAt([0, Math.min(0.42, h * 0.55), 0], 1.9 + span * 0.6, 0.8),
  });

  return {
    steps,
    partMotions,
    bracketMotions,
    partStepIndex,
    bracketStepIndex,
    parts: steps.filter((s) => s.kind === 'part').length,
    brackets: orderedBrackets.length,
  };
}
