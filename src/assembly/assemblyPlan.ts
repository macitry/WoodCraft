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
//   lay everything out → lay the top rail ring on the floor → stand the legs
//   in the corners (feet up) → cross rails → one connector at a time →
//   FLIP THE WHOLE FRAME OVER ONCE → the top → done.
//
// Building upside-down is not a gimmick: with four legs and a closed rail
// ring, there is no way to lay the frame down at any angle that is both flat
// and keeps every joint square. Turning the ring face-down on the floor is the
// one pose where all eight joints can be fitted at once, and a single rigid
// flip then lands the desk on its feet.
//
// Every step is one piece (逐件式): its own start transform, its own camera.
// Transform maths below is in METRES, Y-up, the frame the viewer draws in.
// The frame pieces are authored in the UPSIDE-DOWN pose (`U` below); the flip
// group in `AssemblyParts` rotates them upright at the flip step.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { BracketInstance, Component, FurnitureModel } from '../types/furniture';
import { TEMPLATE_LAYOUTS, bracketStlUrl } from '../types/furniture';
import { computeFrameLayout } from '../viewer/frameLayout';
import {
  MATE_DEPTH_MM,
  accessoryKitById,
  holePatternFor,
  jointSeats,
  socketAxis,
} from '../utils/accessoryKits';

export type AssemblyPhase = 'prep' | 'frame' | 'joints' | 'flip' | 'top' | 'done';
export type AssemblyStepKind = 'layout' | 'part' | 'bracket' | 'flip' | 'complete';

/** One bracket joint is fitted in two steps, because it is two physical acts:
 *  the plate is screwed to a profile that is already on the bench (mount), and
 *  the next profile is then laid onto the plate's free leg and screwed down
 *  (attach). Between the two, the profile itself arrives (a `part` step). */
export type BracketStage = 'mount' | 'attach';

/** Which of the bracket's two legs a piece of hardware sits on. The legs are
 *  the local x/y of the connector, not "first/second": which one belongs to
 *  which profile is decided per bracket, geometrically, in this module. */
export type BracketLeg = 'x' | 'y';

/** Hardware this one step actually shows, after the kit and the leg are known. */
export interface StepHardware {
  bolts: number;
  mates: number;
  covers: number;
}

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
  /** `bracket` steps only: whether the plate is being screwed to the profile
   *  that is already in place, or the arriving profile is being fastened to it. */
  bracketStage?: BracketStage;
  /** `bracket` steps only: the plate's mounting profile (the one already in
   *  place) and the profile that arrives onto it, resolved per bracket. */
  mountPartId?: string;
  attachPartId?: string;
  /** `bracket` steps only: the bracket leg this step drives (local x or y). */
  bracketLeg?: BracketLeg;
  /** `bracket` steps only: hardware this stage shows, already filtered to the
   *  relevant leg. */
  hardware?: StepHardware;
  /** `bracket` steps only: the pieces this connector joins, in model order. */
  connectedPartIds?: string[];
  /** `part` steps only: the cut length of this piece, in millimetres. */
  cutLengthMm?: number;
  /** Tabletop steps only: the board size, in millimetres. */
  boardSize?: [number, number, number];
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
  /** Where `PartRenderer` draws the piece in the UPRIGHT frame.
   *
   *  The animated outer group subtracts this from the mesh, so the outer
   *  transform is the piece's whole pose. For frame pieces the final pose is
   *  the UPSIDE-DOWN one, which is not where the renderer draws them — hence
   *  this separate value. Omitting it (brackets) means the final position. */
  renderPosition?: [number, number, number];
}

/** One line of the cut list: identical pieces collapsed to a count. */
export interface LayoutGroup {
  kind: 'leg' | 'beam' | 'cross_beam' | 'tabletop';
  lengthMm?: number;
  sizeMm?: [number, number, number];
  count: number;
}

export interface AssemblyFlip {
  /** Index of the step that turns the frame over. */
  stepIndex: number;
  /** Height of the rotation axis: the frame turns about y = legH / 2. */
  pivotY: number;
  /** Extra height at mid-turn, so the corners never scrape the floor. */
  lift: number;
}

/** The steps one connector occupies, and which leg each of them fastens. */
export interface BracketSteps {
  mount: number;
  attach?: number;
  mountLeg: BracketLeg;
  attachLeg?: BracketLeg;
}

export interface AssemblyPlan {
  steps: AssemblyStep[];
  partMotions: Map<string, AssemblyMotion>;
  bracketMotions: Map<string, AssemblyMotion>;
  /** Step index at which each piece starts moving. */
  partStepIndex: Map<string, number>;
  /** The one or two steps each connector occupies. */
  bracketSteps: Map<string, BracketSteps>;
  /** The inverse lookup the scene needs: which connector a bracket step is. */
  bracketStepAt: Map<number, { bracketId: string; stage: BracketStage }>;
  /** Collapsed material list, shown on the layout step. */
  layoutGroups: LayoutGroup[];
  flip: AssemblyFlip;
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
  profile: string;
}

const MM = 0.001;
const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];
/** 180° about X: the frame's upside-down pose, as a quaternion. */
const QUAT_U: [number, number, number, number] = [1, 0, 0, 0];
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** The connector tray on the floor, in metres. Exported because the staged
 *  hardware is laid out beside the same slots in `AssemblyParts`. */
export const BRACKET_TRAY = { x: -1.15, z: 0.66, cols: 4, gap: 0.13 } as const;

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

/** Shortest distance from a point to a finite axis segment, in metres. */
function distanceToAxis(
  point: THREE.Vector3,
  center: THREE.Vector3,
  dir: THREE.Vector3,
  half: number,
): number {
  const v = point.clone().sub(center);
  const along = THREE.MathUtils.clamp(v.dot(dir), -half, half);
  return v.sub(dir.clone().multiplyScalar(along)).length();
}

/** Default start pose for a piece that gets carried in from outside the frame. */
function carriedInStart(
  finalPos: [number, number, number],
  radialDistance: number,
  y: number,
  quaternion: [number, number, number, number],
): AssemblyTransform {
  const [rx, rz] = radial(finalPos[0], finalPos[2]);
  return {
    position: [
      finalPos[0] + rx * radialDistance,
      y,
      finalPos[2] + rz * radialDistance,
    ],
    quaternion,
  };
}

export function buildAssemblyPlan(
  model: FurnitureModel,
  brackets: BracketInstance[],
  params: AssemblyParams,
  kitId?: string | null,
): AssemblyPlan {
  const layout =
    TEMPLATE_LAYOUTS[params.templateId] || TEMPLATE_LAYOUTS['basic-desk'];
  const profileSize = layout?.profileSize ?? 30;
  const ps = profileSize * MM;

  const w = getParam(model, 'width', 1200) * MM;
  const d = getParam(model, 'depth', 600) * MM;
  const h = getParam(model, 'height', 750) * MM;
  const tt = getParam(model, 'tabletop_thickness', 18) * MM;
  const legH = h - tt;

  const layoutCfg = {
    insetRatioX: params.insetRatioX,
    insetRatioZ: params.insetRatioZ,
    profileSize,
    crossBeamHeightRatio: params.crossBeamHeightRatio,
  };

  /** The upside-down pose: 180° about X through y = legH / 2, so a piece at
   *  the floor stays at the floor and a leg's foot points up. Its own inverse. */
  const U = (p: [number, number, number]): [number, number, number] => [
    p[0],
    legH - p[1],
    -p[2],
  ];

  const visible = model.components.filter((c) => c.visible);
  const partsByType = (type: string) => visible.filter((c) => c.partType === type);

  const steps: AssemblyStep[] = [];
  const partMotions = new Map<string, AssemblyMotion>();
  const bracketMotions = new Map<string, AssemblyMotion>();
  const partStepIndex = new Map<string, number>();
  const bracketSteps = new Map<string, BracketSteps>();
  const bracketStepAt = new Map<number, { bracketId: string; stage: BracketStage }>();

  const groups = new Map<string, LayoutGroup>();
  const addToGroup = (
    kind: LayoutGroup['kind'],
    lengthMm: number | undefined,
    sizeMm: [number, number, number] | undefined,
  ) => {
    const key =
      kind === 'tabletop'
        ? `tabletop|${sizeMm?.join('x')}`
        : `${kind}|${Math.round(lengthMm ?? 0)}`;
    const prev = groups.get(key);
    if (prev) prev.count += 1;
    else groups.set(key, { kind, lengthMm, sizeMm, count: 1 });
  };

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

  // --- 0b. The kit on the floor -------------------------------------------
  // The opening shot is a parts check, so the pieces are staged the way a kit
  // comes out of its box rather than scattered around their seats: the
  // profiles in one rack behind the build, the connectors in one tray at the
  // front-left, the board by itself in front. Every flight starts here.
  const staged = new Map<string, AssemblyTransform>();

  const RACK_GAP = 0.06;
  const RACK_Z = -0.58;
  const rackParts = visible
    .filter((c) => c.partType && c.partType !== 'tabletop')
    .map((part) => {
      const frame = computeFrameLayout(model, part, layoutCfg);
      const cut = Math.max(
        0.1,
        (part.dimensions?.extrusion_length ?? 0) * MM * (frame?.zScale ?? 1),
      );
      return { part, cut };
    })
    // Shortest nearest the build, longest at the far end — a rack reads as a
    // rack when the pieces are ordered, not when they are in solver order.
    .sort((a, b) => a.cut - b.cut || a.part.id.localeCompare(b.part.id));

  /** A profile's assembled length runs along world X for a width rail, along Z
   *  for a depth rail and along Y for a leg. The rack runs along X, so depth
   *  pieces and legs get a quarter turn about Y on top of their lying pose. */
  const rackQuat = (part: Component): [number, number, number, number] => {
    const isLeg = part.partType === 'leg';
    const depthRail = !isLeg && !(part.id.includes('front') || part.id.includes('back'));
    // Assembled along Y; tipping the upside-down pose another 90° lays it
    // along -Z, which the yaw below then turns along X.
    const q = isLeg
      ? new THREE.Quaternion()
          .setFromAxisAngle(X_AXIS, -Math.PI / 2)
          .multiply(new THREE.Quaternion(...QUAT_U))
      : new THREE.Quaternion(...QUAT_U);
    if (isLeg || depthRail) {
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI / 2));
    }
    return [q.x, q.y, q.z, q.w];
  };

  rackParts.forEach(({ part }, i) => {
    staged.set(part.id, {
      position: [0, ps / 2, RACK_Z - i * RACK_GAP],
      quaternion: rackQuat(part),
    });
  });

  // The board is already lying the way it will be installed; keep it flat in
  // front of the build, clear of both other groups.
  for (const part of visible.filter((c) => c.partType === 'tabletop')) {
    staged.set(part.id, {
      position: [0, tt / 2 + 0.002, d / 2 + 0.9],
      quaternion: IDENTITY,
    });
  }

  // Connectors wait in a tray at the front-left, four to a row.
  const trayY = Math.max(0.018, ps * 0.7);
  const traySlots = new Map<string, [number, number, number]>();
  [...brackets]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((bracket, i) => {
      traySlots.set(bracket.id, [
        BRACKET_TRAY.x + (i % BRACKET_TRAY.cols) * BRACKET_TRAY.gap,
        trayY,
        BRACKET_TRAY.z + Math.floor(i / BRACKET_TRAY.cols) * BRACKET_TRAY.gap,
      ]);
    });

  const addPartStep = (type: LayoutGroup['kind'], part: Component) => {
    const frame = computeFrameLayout(model, part, layoutCfg);
    const upright: [number, number, number] = frame
      ? [...frame.worldPosition]
      : [
          (part.pose?.x ?? 0) * MM,
          (part.pose?.z ?? 0) * MM,
          (part.pose?.y ?? 0) * MM,
        ];
    // The tabletop is put on after the flip, so it lives in the upright frame.
    const isTop = type === 'tabletop';
    const finalPos = isTop ? upright : U(upright);
    const finalQuat: [number, number, number, number] = isTop ? IDENTITY : QUAT_U;

    // Every piece starts in the staged kit, not beside its seat.
    const start =
      staged.get(part.id) ?? carriedInStart(finalPos, 0.5 + ps * 2, ps / 2, finalQuat);
    const distance =
      type === 'tabletop' ? 1.7 + Math.max(w, d) * 0.6 : 1.35 + Math.max(w, d) * 0.25;

    partMotions.set(part.id, {
      start,
      final: { position: finalPos, quaternion: finalQuat },
      // The renderer places the piece in the upright assembly. The outer group
      // is the pose, so the inner mesh has to be pulled back to its origin.
      renderPosition: upright,
    });
    partStepIndex.set(part.id, steps.length);

    const mid: [number, number, number] = [
      (start.position[0] + finalPos[0]) / 2,
      Math.max(0.12, (start.position[1] + finalPos[1]) / 2),
      (start.position[2] + finalPos[2]) / 2,
    ];

    const cutLengthMm =
      type === 'tabletop'
        ? undefined
        : (part.dimensions?.extrusion_length ?? 0) * (frame?.zScale ?? 1);
    const boardSize: [number, number, number] | undefined = isTop
      ? [
          Math.round(w * 1000),
          Math.round(d * 1000),
          Math.round(tt * 1000),
        ]
      : undefined;

    addToGroup(type, cutLengthMm, boardSize);

    steps.push({
      id: `part:${part.id}`,
      kind: 'part',
      phase: isTop ? 'top' : 'frame',
      partId: part.id,
      partType: type,
      cutLengthMm,
      boardSize,
      duration: isTop ? 1.9 : 1.5,
      hold: isTop ? 0.8 : 0.35,
      camera: shotLookingAt(mid, distance),
    });
  };

  // --- Profiles one at a time, each onto plates already screwed down ------
  // Every bracket is an EDGE between the two profiles it joins; every profile
  // is a node. Walking that graph from one rail gives the order a person
  // builds in: screw the plate to a profile that is already on the bench, then
  // lay the next profile onto the plate's free leg and drive that side's
  // screws. A joint is therefore two steps with the arriving profile between
  // them, and no bracket is ever fitted to two floating pieces at once.

  const kit = accessoryKitById(kitId ?? null);

  const partById = new Map(visible.map((c) => [c.id, c]));
  const axisById = new Map<
    string,
    { center: THREE.Vector3; dir: THREE.Vector3; half: number }
  >();
  for (const part of visible) {
    if (part.partType === 'tabletop') continue;
    const frame = computeFrameLayout(model, part, layoutCfg);
    if (!frame) continue;
    // The renderer draws extrusions along their own local Z; after the layout
    // rotation every one of them is axis-aligned, so the axis direction follows
    // the part type and the template's naming, exactly as the auto-generator
    // maps them into the DIY solver.
    const dir =
      part.partType === 'leg'
        ? new THREE.Vector3(0, 1, 0)
        : part.id.includes('front') || part.id.includes('back')
          ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(0, 0, 1);
    const half =
      Math.abs((part.dimensions?.extrusion_length ?? 0) * (frame.zScale ?? 1) * MM) / 2;
    axisById.set(part.id, {
      center: new THREE.Vector3(...frame.worldPosition),
      dir,
      half,
    });
  }

  /** Which profile each bracket leg bolts into.
   *
   *  The bracket's local +x/+y legs point along the two mating faces, and each
   *  leg's T-nut sits a few millimetres inside one of them. Rather than encode
   *  that convention a second time here, place each leg's nut next to both
   *  candidate profiles and take the nearer axis. The generator's own
   *  [faceA, faceB] order is the fallback if the geometry is too symmetric. */
  const legProfiles = (bracket: BracketInstance): Map<BracketLeg, string> => {
    const out = new Map<BracketLeg, string>();
    const parts = bracket.connectedParts.filter((id) => axisById.has(id));
    if (parts.length < 2) return out;

    const rot = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(bracket.rotation.roll),
        THREE.MathUtils.degToRad(bracket.rotation.pitch),
        THREE.MathUtils.degToRad(bracket.rotation.yaw),
        'XYZ',
      ),
    );
    const origin = new THREE.Vector3(
      bracket.position.x * MM,
      bracket.position.y * MM,
      bracket.position.z * MM,
    );
    const seats = jointSeats(holePatternFor(bracketStlUrl(bracket)));
    const legs: BracketLeg[] = seats[0]?.leg === 'y' ? ['y', 'x'] : ['x', 'y'];

    for (const leg of legs) {
      const seat = seats.find((s) => s.leg === leg);
      if (!seat) continue;
      const axis = socketAxis(seat.rotation);
      const depth = seat.plateT + MATE_DEPTH_MM;
      const nut = new THREE.Vector3(
        seat.position[0] + axis[0] * depth,
        seat.position[1] + axis[1] * depth,
        seat.position[2] + axis[2] * depth,
      )
        .applyMatrix4(rot)
        .add(origin);

      let best: string | undefined;
      let bestD = Infinity;
      for (const id of parts) {
        const a = axisById.get(id)!;
        const d = distanceToAxis(nut, a.center, a.dir, a.half);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      if (best) out.set(leg, best);
    }

    // Two legs can never bolt into the same profile. If the two axes came out
    // indistinguishable, trust the generator's order: local x meets faceB,
    // local y meets faceA, and the hint stores them as [faceA, faceB].
    if (out.get('x') === out.get('y')) {
      out.set('x', parts[1]);
      out.set('y', parts[0]);
    }
    return out;
  };

  const placeable = visible.filter(
    (c) =>
      c.partType !== undefined &&
      c.partType !== 'tabletop' &&
      ['beam', 'leg', 'cross_beam'].includes(c.partType) &&
      axisById.has(c.id),
  );
  const placeableIds = new Set(placeable.map((c) => c.id));
  const centerOf = (id: string) => axisById.get(id)?.center;

  interface JointEdge {
    bracket: BracketInstance;
    a: string;
    b: string;
    legs: Map<BracketLeg, string>;
  }

  const edges: JointEdge[] = [];
  for (const bracket of brackets) {
    if (!bracket.enabled) continue;
    const [a, b] = bracket.connectedParts;
    if (!a || !b || !placeableIds.has(a) || !placeableIds.has(b)) continue;
    edges.push({ bracket, a, b, legs: legProfiles(bracket) });
  }

  const edgesByPart = new Map<string, JointEdge[]>();
  for (const e of edges) {
    for (const id of [e.a, e.b]) {
      const list = edgesByPart.get(id);
      if (list) list.push(e);
      else edgesByPart.set(id, [e]);
    }
  }
  const otherEnd = (e: JointEdge, id: string) => (e.a === id ? e.b : e.a);

  // Depth-first, neighbours sorted around the frame: start on a rail and go
  // round the desk corner by corner instead of hopping across it.
  const root = placeable.find((c) => c.partType === 'beam') ?? placeable[0];
  const order: string[] = [];
  const seen = new Set<string>();
  if (root) {
    const stack = [root.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      const next = (edgesByPart.get(id) ?? [])
        .filter((e) => !seen.has(otherEnd(e, id)))
        .sort((e1, e2) => {
          const p1 = centerOf(otherEnd(e1, id));
          const p2 = centerOf(otherEnd(e2, id));
          const k1 = p1 ? cornerKey(p1.x, p1.z) : 0;
          const k2 = p2 ? cornerKey(p2.x, p2.z) : 0;
          if (Math.abs(k1 - k2) > 1e-3) return k1 - k2;
          return e1.bracket.position.y - e2.bracket.position.y;
        });
      // Reversed so the first neighbour is popped first.
      for (let i = next.length - 1; i >= 0; i--) stack.push(otherEnd(next[i], id));
    }
  }
  // A profile no bracket reaches (or a model with no brackets at all) still has
  // to be placed; it joins after the connected frame.
  for (const c of placeable) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      order.push(c.id);
    }
  }

  const legFor = (e: JointEdge, partId: string): BracketLeg => {
    if (e.legs.get('x') === partId) return 'x';
    if (e.legs.get('y') === partId) return 'y';
    return e.bracket.connectedParts[1] === partId ? 'x' : 'y';
  };

  const bracketMotion = (bracket: BracketInstance): AssemblyMotion => {
    const existing = bracketMotions.get(bracket.id);
    if (existing) return existing;
    const upright: [number, number, number] = [
      bracket.position.x * MM,
      bracket.position.y * MM,
      bracket.position.z * MM,
    ];
    const finalPos = U(upright);
    // Lifted out of the tray. Identity is the bracket's upright pose, so it
    // waits seated on its two outer faces like a part in a box.
    const tray = traySlots.get(bracket.id) ?? [
      BRACKET_TRAY.x,
      trayY,
      BRACKET_TRAY.z,
    ];
    const motion: AssemblyMotion = {
      start: { position: tray, quaternion: IDENTITY },
      final: { position: finalPos, quaternion: QUAT_U },
    };
    bracketMotions.set(bracket.id, motion);
    return motion;
  };

  const seatsFor = (bracket: BracketInstance) =>
    jointSeats(holePatternFor(bracketStlUrl(bracket)));

  const hardwareOn = (
    bracket: BracketInstance,
    leg: BracketLeg,
    stage: BracketStage,
  ): StepHardware => {
    const seats = seatsFor(bracket);
    const n = kit ? Math.min(kit.boltsPerJoint, seats.length) : 0;
    const onLeg = seats.slice(0, n).filter((s) => s.leg === leg).length;
    return {
      bolts: onLeg,
      mates: kit?.mate ? onLeg : 0,
      covers: stage === 'attach' && kit?.cover ? 1 : 0,
    };
  };

  const addBracketStep = (
    e: JointEdge,
    stage: BracketStage,
    mountPartId: string,
    attachPartId: string,
    leg: BracketLeg,
  ): number => {
    const bracket = e.bracket;
    const motion = bracketMotion(bracket);
    const at = steps.length;
    steps.push({
      id: `bracket:${bracket.id}:${stage}`,
      kind: 'bracket',
      phase: 'joints',
      bracketId: bracket.id,
      bracketStage: stage,
      mountPartId,
      attachPartId,
      bracketLeg: leg,
      connectedPartIds: bracket.connectedParts.filter((id) => placeableIds.has(id)),
      hardware: hardwareOn(bracket, leg, stage),
      // The split keeps the old per-joint pace: 3.6 s for the plate (nut,
      // landing, screw) and 3.6 s for the far side (nut, screw, cover). At the
      // old single-step 3 s these were a blur, which is what this preserves.
      duration: 3.6,
      hold: 0.6,
      // A fixed close-up, level with the joint: at 0.9 m a 28 mm bracket and
      // its T-nuts are specks. The plate enters from just outside this frame,
      // so the approach is framed rather than hidden.
      camera: shotInside(motion.final.position, stage === 'mount' ? 0.42 : 0.46),
    });
    bracketStepAt.set(at, { bracketId: bracket.id, stage });
    return at;
  };

  const placed = new Set<string>();

  for (const id of order) {
    // Brackets joining this profile to one already in place go on FIRST: the
    // plate is screwed to the profile on the bench, then the profile is laid
    // onto the plate's free leg.
    const incoming = (edgesByPart.get(id) ?? []).filter(
      (e) => !bracketSteps.has(e.bracket.id) && placed.has(otherEnd(e, id)),
    );
    for (const e of incoming) {
      const baseId = otherEnd(e, id);
      const mountLeg = legFor(e, baseId);
      bracketSteps.set(e.bracket.id, {
        mount: addBracketStep(e, 'mount', baseId, id, mountLeg),
        mountLeg,
      });
    }

    const part = partById.get(id);
    if (part && part.partType) {
      addPartStep(part.partType as 'leg' | 'beam' | 'cross_beam', part);
    }
    placed.add(id);

    // The profile is on the plates: fasten the far side and clip the cover on.
    for (const e of incoming) {
      const baseId = otherEnd(e, id);
      const attachLeg = legFor(e, id);
      const hw = hardwareOn(e.bracket, attachLeg, 'attach');
      const owner = bracketSteps.get(e.bracket.id)!;
      owner.attachLeg = attachLeg;
      // No hardware on the far leg and no cover: the plate is on, and the
      // profile's own step already showed it landing. Nothing to fasten.
      if (hw.bolts > 0 || hw.covers > 0) {
        owner.attach = addBracketStep(e, 'attach', baseId, id, attachLeg);
      }
    }
  }

  // Every edge normally lands in the loop above, because both of its profiles
  // are in `order`. A bracket whose parts are both unreachable (no motion) is
  // skipped outright rather than shown floating.
  for (const e of edges) {
    if (bracketSteps.has(e.bracket.id)) continue;
    const mountLeg = legFor(e, e.a);
    const attachLeg = legFor(e, e.b);
    const mountStep = addBracketStep(e, 'mount', e.a, e.b, mountLeg);
    const hw = hardwareOn(e.bracket, attachLeg, 'attach');
    bracketSteps.set(e.bracket.id, {
      mount: mountStep,
      mountLeg,
      attach:
        hw.bolts > 0 || hw.covers > 0
          ? addBracketStep(e, 'attach', e.a, e.b, attachLeg)
          : undefined,
      attachLeg,
    });
  }

  // --- One flip, then the desk is the right way up -------------------------
  const flipStepIndex = steps.length;
  const flip: AssemblyFlip = {
    stepIndex: flipStepIndex,
    pivotY: legH / 2,
    lift: 0.3,
  };
  steps.push({
    id: 'flip',
    kind: 'flip',
    phase: 'flip',
    duration: 2.4,
    hold: 0.8,
    // Fixed three-quarter view: a camera tied to the frame would spin with it.
    camera: {
      position: [1.1 + span * 0.55, 1.35 + h * 0.55, 1.2 + span * 0.8],
      target: [0, 0.4, 0],
    },
  });

  // --- The top goes on last, over the upright frame ------------------------
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

  const kindRank: Record<LayoutGroup['kind'], number> = {
    leg: 0,
    beam: 1,
    cross_beam: 2,
    tabletop: 3,
  };
  const layoutGroups = [...groups.values()].sort((a, b) => {
    if (kindRank[a.kind] !== kindRank[b.kind]) return kindRank[a.kind] - kindRank[b.kind];
    return (a.lengthMm ?? 0) - (b.lengthMm ?? 0);
  });

  return {
    steps,
    partMotions,
    bracketMotions,
    partStepIndex,
    bracketSteps,
    bracketStepAt,
    layoutGroups,
    flip,
    parts: steps.filter((s) => s.kind === 'part').length,
    brackets: edges.length,
  };
}
