import { create } from 'zustand';
import type { MutableRefObject } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type {
  DiyProfile,
  DiyBracket,
  DiyScrew,
  DiyScrewGhost,
  DiyProfileGhost,
  DiyHand,
  DiyDimension,
  DiyMovingPart,
  DiyMode,
  ProfileSize,
  AxisDir,
  FaceDir,
  DiyKitInstance,
  ViewPreset,
} from '../types/furniture';
import { DEFAULT_BRACKET_STL_URL, PROFILE_DIMS } from '../types/furniture';
import { CAST_CONNECTOR, CONNECTORS } from '../diy/connectors';
import { defaultScrewLength } from '../diy/fastenerDims';
import { jointFitInfo } from '../diy/diyJointGeometry';
import { bracketAtHint, eulerFromNormals } from '../diy/diyCornerGeometry';
import {
  readBackground,
  writeBackground,
  type DiyBackgroundId,
} from '../diy/diyBackgrounds';
import type { CornerHint } from '../diy/diyCornerGeometry';
import { accessoryKitById } from '../utils/accessoryKits';

let _nextId = 1;
function uid(): string {
  return `diy_${_nextId++}_${Date.now().toString(36)}`;
}
/** Stable per-profile creation sequence (structure-tree numbering). */
let _seq = 0;

/**
 * Length a root profile is created with (mm).
 *
 * Exported because the placement ghost draws the post that is about to be made:
 * a literal in each place would let the preview stand 120 mm tall and the click
 * produce 100. The child-profile length is a separate literal in the store — it
 * has its own ghost, and the two never mix.
 */
export const ROOT_PROFILE_LENGTH = 100;

/**
 * The connector a newly placed bracket gets — the same part the main
 * configurator's brackets default to (`DEFAULT_BRACKET_STL_URL`) and the same one
 * `DiyCornerHints` ghosts in, since a hint that previewed one part and placed
 * another would be a lie about the thing it is inviting you to click.
 *
 * Resolved through the STL url rather than written as a connector id so the two
 * editors cannot end up naming different parts; the cast bracket is still in
 * `CONNECTORS` and still selectable from the connector library.
 */
export const DEFAULT_BRACKET_CONNECTOR_ID =
  CONNECTORS.find((c) => c.stlUrl === DEFAULT_BRACKET_STL_URL)?.id ?? CAST_CONNECTOR.id;

/**
 * A corner bracket for a pair of mounting faces — the ONE builder behind
 * placing a bracket at a joint.
 *
 * The manual two-face pick (since removed) and `moveBracket` used to inline
 * this rotation/rounding block. Copying it again for the corner-click path is
 * how the entrances drift into placing subtly different parts at subtly
 * different poses, which is the exact complaint that started this rewrite.
 */
function jointBracket(opts: {
  idA: string;
  idB: string;
  faceA: { x: number; y: number; z: number };
  faceB: { x: number; y: number; z: number };
  size: number;
  position: { x: number; y: number; z: number };
  connectorId?: string;
}): DiyBracket {
  // Rotation: R·(1,0,0)=n1, R·(0,1,0)=n2 — the convention that puts the two
  // mounting plates flush on the two extrusion faces. The basis math lives in
  // `eulerFromNormals` so this and the corner-hint preview can never drift.
  const eul = eulerFromNormals(opts.faceA, opts.faceB);

  return {
    id: uid(),
    connectorId: opts.connectorId ?? DEFAULT_BRACKET_CONNECTOR_ID,
    // 0.01 mm precision keeps the mounting faces flush without float noise.
    position: {
      x: Math.round(opts.position.x * 100) / 100,
      y: Math.round(opts.position.y * 100) / 100,
      z: Math.round(opts.position.z * 100) / 100,
    },
    rotation: {
      roll: THREE.MathUtils.radToDeg(eul.x),
      pitch: THREE.MathUtils.radToDeg(eul.y),
      yaw: THREE.MathUtils.radToDeg(eul.z),
    },
    anchorPosition: { x: 0, y: 0, z: 0 },
    anchorRotation: { roll: 0, pitch: 0, yaw: 0 },
    connectedProfiles: [opts.idA, opts.idB],
    enabled: true,
    size: opts.size,
    auto: true,
  };
}

/**
 * Snap a recovered face normal back onto the nearest axis unit vector.
 *
 * A normal read out of a rotation matrix carries float noise (a 90° Euler can
 * come back as 0.99999994), and `jointFitInfo` matches faces by exact axis —
 * `faceRect` compares the normal's components against ±1. Snapping is what makes
 * the round-trip through a stored Euler exact rather than merely close.
 */
function snapAxis(n: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const a = [n.x, n.y, n.z];
  let i = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(a[k]) > Math.abs(a[i])) i = k;
  const s = a[i] >= 0 ? 1 : -1;
  return { x: i === 0 ? s : 0, y: i === 1 ? s : 0, z: i === 2 ? s : 0 };
}

/**
 * The two mounting-face normals a joint bracket was placed with, recovered from
 * its stored rotation.
 *
 * `jointBracket` builds the pose as `eulerFromNormals(faceA, faceB)`, which is
 * `makeBasis(faceA, faceB, faceA×faceB)` — so columns 0 and 1 of the rotation
 * matrix ARE faceA and faceB, in the same order as `connectedProfiles`. That
 * makes the pose reversible without storing the normals a second time, which is
 * what lets `updateProfileSize` re-fit a bracket against resized profiles.
 */
function bracketFaces(b: DiyBracket): [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] {
  const eul = new THREE.Euler(
    THREE.MathUtils.degToRad(b.rotation.roll),
    THREE.MathUtils.degToRad(b.rotation.pitch),
    THREE.MathUtils.degToRad(b.rotation.yaw),
    'XYZ',
  );
  const m = new THREE.Matrix4().makeRotationFromEuler(eul);
  return [
    snapAxis(new THREE.Vector3().setFromMatrixColumn(m, 0)),
    snapAxis(new THREE.Vector3().setFromMatrixColumn(m, 1)),
  ];
}

/**
 * Whether two hands hold the same part.
 *
 * Compared by the field that names the part rather than as objects: the cards
 * build a fresh literal on every click, so identity would never match and
 * "click the same card twice to put it down" would never fire.
 */
function sameHand(a: DiyHand, b: DiyHand): boolean {
  if (a.kind === 'profile' && b.kind === 'profile') return a.size === b.size;
  if (a.kind === 'connector' && b.kind === 'connector') return a.connectorId === b.connectorId;
  if (a.kind === 'screw' && b.kind === 'screw') return a.size === b.size && a.family === b.family;
  if (a.kind === 'kit' && b.kind === 'kit') return a.kitId === b.kitId;
  return false;
}

interface DiyState {
  profiles: DiyProfile[];
  brackets: DiyBracket[];
  screws: DiyScrew[];
  selectedProfileId: string | null;
  selectedBracketId: string | null;
  selectedScrewId: string | null;
  mode: DiyMode;
  /** Profile being stretched. */
  stretchProfileId: string | null;
  /** Which end: 'start' or 'end'. */
  stretchEnd: 'start' | 'end' | null;
  /** Pending attach: which parent profile. */
  attachParentId: string | null;
  /** Pending attach: which face of parent. */
  attachFace: FaceDir | null;
  /** Pending attach: hit position on face (mm). */
  attachHitPos: { x: number; y: number; z: number } | null;

  // Actions
  addRootProfile: (size: ProfileSize, pos: { x: number; y: number; z: number }, dir: AxisDir) => DiyProfile;
  addChildProfile: (size: ProfileSize) => DiyProfile | null;
  /** Grow a new profile from a face of an existing profile. */
  growFromFace: (parentId: string, face: FaceDir, hitPos: { x: number; y: number; z: number }) => void;
  removeProfile: (id: string) => void;
  selectProfile: (id: string | null) => void;
  setStretchProfile: (id: string | null, end: 'start' | 'end' | null) => void;
  updateProfileLength: (id: string, length: number) => void;
  /**
   * Change one profile's cross-section (2020/3030/4040).
   *
   * Only the named profile is resized — children keep the size they were given.
   * But children standing on a LATERAL face ride outward with it (see the
   * implementation), and `auto` brackets standing on the moved geometry are
   * re-fitted, because a bracket drawn at the old cross-section is out of scale
   * with the profile it is bolted to.
   */
  updateProfileSize: (id: string, size: ProfileSize) => void;
  /** Update length and reposition so the fixed end stays in place. */
  updateProfilePosition: (id: string, newLen: number, axIdx: number, fixedEnd: { x: number; y: number; z: number }) => void;
  setMode: (mode: DiyMode) => void;
  controlsRef: MutableRefObject<OrbitControlsImpl | null> | null;
  setControlsRef: (ref: MutableRefObject<OrbitControlsImpl | null>) => void;

  // ---- Drag-to-move a placed part ----
  /**
   * The part currently being dragged, or null.
   *
   * OrbitControls is suppressed while this is set (see `DiyScene`), so it is the
   * one flag that says "this gesture is a move, not a camera orbit". Only an
   * already-SELECTED part can start one: with the viewport full of profiles,
   * letting any left-drag grab whatever is under it would make orbiting the
   * camera a way to drag the assembly apart.
   */
  movingPart: DiyMovingPart | null;
  setMovingPart: (part: DiyMovingPart | null) => void;

  /**
   * The dimension annotation to draw beside a part, or null.
   *
   * Published by the two gestures that change a height, at the moment the height
   * actually changes — `DiyStretchGizmo` for a stretch, the profile branch of
   * `useDiyMoveDrag` for a child sliding up its post. It is NOT withdrawn when
   * the drag ends: a height just set with the mouse is a number you want to keep
   * reading while you let go of the button. It leaves with the SELECTION instead
   * (see `selectProfile`, and `DiyDimension`'s render gate), which is one rule
   * rather than two — and it is the rule the user asked for.
   */
  dimension: DiyDimension | null;
  setDimension: (dimension: DiyDimension | null) => void;
  /**
   * Translate a profile by a delta in mm, bringing everything that rides on it:
   * its descendant profiles, every bracket bolted to one of them (with any kit
   * bound to that bracket), and every screw mounted on one of them.
   *
   * A subtree has to move rigidly or the assembly comes apart on screen — the
   * children would stay behind while their parent slides out from under them,
   * and `removeProfile` is the only other action that knows which ids travel
   * with a profile.
   */
  translateProfile: (id: string, delta: { x: number; y: number; z: number }) => void;
  /**
   * Re-seat a bracket on a corner, keeping its identity.
   *
   * Position, rotation and size all come from the hint, exactly as
   * `placeBracketAtHint` derives them for a new bracket — a moved bracket and a
   * placed one have to end up posed the same way. The id, connector and enabled
   * flag are the bracket's own and survive; `auto` goes back to true because the
   * app is choosing this pose again.
   */
  moveBracket: (id: string, hint: CornerHint) => void;

  // ---- What the pointer is holding (see `DiyHand`) ----
  /** The part picked from the library and not yet placed, or null. */
  hand: DiyHand | null;
  /**
   * Pick a part up, or put it back down. Passing the hand that is already held
   * clears it (clicking the same card twice is how you change your mind);
   * passing null always clears, so Escape cannot be defeated by a comparison.
   */
  pickUpHand: (hand: DiyHand | null) => void;

  // ---- Ghost previews (one per kind that has a pose to preview) ----
  /**
   * Ghost bracket/kit at the nearest snap target (mm), drawn while a connector
   * or a kit is in hand.
   *
   * Nothing is "dragged" any more — this follows the pointer, and the click that
   * commits it is the one that places. Null = nothing valid under the pointer,
   * and then a click places nothing.
   */
  ghostBracket: { position: { x: number; y: number; z: number }; size: number; profileId: string } | null;
  /** Update ghost position (pointer move while a connector/kit is in hand). */
  updateGhostBracket: (data: { position: { x: number; y: number; z: number }; size: number; profileId: string } | null) => void;
  /**
   * The connector the NEXT bracket is built from when nobody names one.
   *
   * Placing releases what is in hand, so without this the click AFTER a
   * placement falls back to `DEFAULT_BRACKET_CONNECTOR_ID`: the user picks a
   * connector, places one, places a second, and the second is the cast default —
   * the choice they made silently expires between two placements. The choice
   * outlives the hand instead. It is set when a connector card is picked up and
   * by every bracket placement, and only another choice replaces it.
   */
  lastConnectorId: string | null;

  /**
   * Place an UNORIENTED bracket at the ghost position.
   *
   * This is the fallback for a click with no joint under it. Anything that lands
   * on a real joint goes through `placeBracketAtHint` instead — it takes the
   * corner's own faces and size, so position, rotation and size all agree by
   * construction. There is deliberately no way to pass those in here: a second
   * route to a joint-accurate bracket is how the two used to disagree.
   */
  placeBracket: (patch?: {
    /** Connector catalog id to stamp on the new bracket. */
    connectorId?: string;
  }) => void;
  /** Ghost screw shown on the hovered profile face (mm + deg). */
  ghostScrew: DiyScrewGhost | null;
  /** Update ghost on pointer move. Null = no valid face under cursor. */
  updateGhostScrew: (data: DiyScrewGhost | null) => void;
  /** Place the screw at the ghost position. */
  placeScrew: (patch?: { length?: number }) => void;
  /** Ghost root profile on the ground plane while a profile is in hand (mm). */
  ghostProfile: DiyProfileGhost | null;
  /** Update the profile ghost on pointer move. */
  updateGhostProfile: (data: DiyProfileGhost | null) => void;

  // Screw CRUD
  addScrew: (s: DiyScrew) => void;
  updateScrew: (id: string, patch: Partial<DiyScrew>) => void;
  removeScrew: (id: string) => void;
  selectScrew: (id: string | null) => void;

  // ---- Corner-hint placement ----
  /**
   * Place a bracket at a computed corner hint, using the LOCAL euler solution
   * (`eulerFromNormals`) rather than the backend.
   *
   * The hint already carries the two mounting faces and the joint centre, which
   * is everything `jointBracket` needs, so this is synchronous. The backend
   * round-trip the drag path makes exists only because a drag can land on a
   * joint it has to *identify* first; a hint IS that identification. Skipping
   * the call also removes the "request failed → place an unrotated bracket"
   * fallback, which is a bracket nobody asked for.
   */
  placeBracketAtHint: (hint: CornerHint, connectorId?: string) => string | null;

  // ---- Click-to-place child profile (方案 B) ----
  /** Ghost shown while placing a child profile on a face (mm). */
  placingProfile: {
    parentId: string;
    face: FaceDir;
    position: { x: number; y: number; z: number };
    size: ProfileSize;
  } | null;
  /** Enter placing mode: click a face of a selected profile. */
  startPlacingProfile: (parentId: string, face: FaceDir, pos: { x: number; y: number; z: number }, size: ProfileSize) => void;
  /** Mouse move during placing — update ghost position. */
  updatePlacingPosition: (pos: { x: number; y: number; z: number }) => void;
  /** Click again — confirm and create the child profile. */
  confirmPlacingProfile: () => DiyProfile | null;
  /** Escape — cancel placing. */
  cancelPlacing: () => void;

  // Bracket actions
  addBracket: (b: DiyBracket) => void;
  updateBracket: (id: string, patch: Partial<DiyBracket>) => void;
  removeBracket: (id: string) => void;
  selectBracket: (id: string | null) => void;
  editingBracketId: string | null;
  openBracketEditor: (id: string) => void;

  // ---- Accessory kits (配件组合) ----
  /** Kits bound to joints. Hardware is derived, never stored per screw. */
  kitInstances: DiyKitInstance[];
  selectedKitId: string | null;
  /** Draw the kit bolts. */
  showKitFasteners: boolean;
  /** Mount the T-nuts sitting inside the profile slots. On by default — see
   *  `showInternalFasteners` in `modelStore`, which defaults the same way and for
   *  the same reason. */
  showKitNuts: boolean;
  /** Bind a kit to an ALREADY-PLACED bracket. Never places a bracket itself —
   *  DiyViewer orients and places first, then binds. False if the kit id is
   *  unknown or the bracket does not exist.
   *
   *  At most ONE kit per bracket: a joint's seats are fixed, so a second kit
   *  would fill holes the first already fills. Binding a different kit to the
   *  same bracket replaces the previous one. */
  bindKit: (kitId: string, bracketId: string) => boolean;
  removeKitInstance: (id: string) => void;
  selectKit: (id: string | null) => void;
  setShowKitFasteners: (v: boolean) => void;
  setShowKitNuts: (v: boolean) => void;

  // Bulk
  getProfilesByParent: (parentId: string) => DiyProfile[];
  getDescendantIds: (profileId: string) => string[];

  /** Set after adding a root profile — DiyScene animates the camera toward it (metres). */
  cameraFocus: { x: number; y: number; z: number } | null;
  clearCameraFocus: () => void;

  /** Whether to show corner-hint wireframes (toggled by sidebar Connectors tab). */
  showCornerHints: boolean;
  setShowCornerHints: (v: boolean) => void;

  // ---- The viewport's own view controls (see `DiyToolbar`) ----
  /**
   * Draw the ground grid. On by default: it is the reference the placement ghost
   * lands on, so turning it off is a deliberate choice rather than a starting
   * state. It lives here, next to `showCornerHints`, for the same reason — the
   * scene reads it without a prop threaded through the Canvas.
   */
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;

  /**
   * The backdrop the parts are drawn on (see `diyBackgrounds`), remembered
   * across reloads.
   *
   * The SCENE does not read this — the canvas is transparent and the value is
   * the CSS background of the stage div behind it (`DiyViewer`). That is why it
   * is a string of CSS and not a colour: three of the six presets are gradients,
   * and a gradient is one thing the browser already knows how to paint. The
   * grid colours that belong with it are the scene's half of the same choice,
   * and the scene does read those.
   */
  background: DiyBackgroundId;
  /** Writes through to storage: the choice is a preference, not a scratch pad,
   *  so there is no separate "save" and no way to set one without the other. */
  setBackground: (id: DiyBackgroundId) => void;

  /**
   * The standard view the camera was last sent to, or null once the user takes
   * the camera back by orbiting.
   *
   * Null is not "no view" — the camera is always somewhere — it is "not one of
   * the four, any more". The toolbar's active highlight hangs off it, and a
   * highlight left on 俯视 after the user has orbited round to the back would be
   * a label about a view they are no longer looking at.
   */
  viewPreset: ViewPreset | null;
  /**
   * Bumped by EVERY preset click, including one on the preset already showing.
   *
   * The Configurator guards its flight with a "has the preset changed" check, so
   * clicking 前视 twice does nothing there. Here a second click is a real
   * request — "put me back on this view" after orbiting away — and the value
   * alone cannot express it, so the change signal is the counter.
   */
  viewNonce: number;
  setViewPreset: (p: ViewPreset) => void;
  /** The user has taken the camera back: drop the highlight, fly nowhere. */
  clearViewPreset: () => void;
}

export const useDiyStore = create<DiyState>((set, get) => ({
  profiles: [],
  brackets: [],
  screws: [],
  selectedProfileId: null,
  selectedBracketId: null,
  selectedScrewId: null,
  mode: 'idle',
  stretchProfileId: null,
  stretchEnd: null,
  attachParentId: null,
  attachFace: null,
  attachHitPos: null,

  addRootProfile: (size, pos, dir) => {
    const p: DiyProfile = {
      id: uid(),
      seq: ++_seq,
      profileSize: size,
      length: ROOT_PROFILE_LENGTH,
      position: pos,
      direction: dir,
      parentId: null,
      parentFace: null,
      parentOffset: 0,
    };
    set((s) => ({
      profiles: [...s.profiles, p],
      selectedProfileId: p.id,
      cameraFocus: { x: pos.x * 0.001, y: pos.y * 0.001, z: pos.z * 0.001 },
      // Placing consumes what was in hand, so the next click lands on the new
      // post (select it, then drag it) rather than stamping another one.
      hand: null,
      ghostProfile: null,
    }));
    return p;
  },

  addChildProfile: (size) => {
    const { attachParentId, attachFace, attachHitPos, profiles } = get();
    if (!attachParentId || !attachFace || !attachHitPos) return null;

    const parent = profiles.find((p) => p.id === attachParentId);
    if (!parent) return null;

    // Determine child direction from face normal
    const faceToDir: Record<FaceDir, AxisDir> = {
      '+X': 'X', '-X': 'X',
      '+Y': 'Y', '-Y': 'Y',
      '+Z': 'Z', '-Z': 'Z',
    };
    const childDir = faceToDir[attachFace];

    // Compute parent offset: hit point projected onto parent axis
    const ax = parent.direction;
    const hitVal = attachHitPos[ax.toLowerCase() as 'x' | 'y' | 'z'];
    const parentCenter = parent.position[ax.toLowerCase() as 'x' | 'y' | 'z'];
    const offset = Math.round(hitVal - parentCenter);

    // Child position: center at the attachment face, offset along parent axis
    const dim = { '2020': 20, '3030': 30, '4040': 40 }[size];
    const halfDim = dim / 2;

    const pPos = { ...attachHitPos };
    // Shift child center half-dim out from the face
    const sign = attachFace.startsWith('+') ? 1 : -1;
    const axis = attachFace[1].toLowerCase() as 'x' | 'y' | 'z';
    pPos[axis] += sign * halfDim;

    const child: DiyProfile = {
      id: uid(),
      seq: ++_seq,
      profileSize: size,
      length: 100, // default child length
      position: pPos,
      direction: childDir,
      parentId: attachParentId,
      parentFace: attachFace,
      parentOffset: offset,
    };

    set((s) => ({
      profiles: [...s.profiles, child],
      selectedProfileId: child.id,
      attachParentId: null,
      attachFace: null,
      attachHitPos: null,
      mode: 'stretching',
      stretchProfileId: child.id,
      stretchEnd: 'end',
    }));
    return child;
  },

  removeProfile: (id) => {
    const descendants = get().getDescendantIds(id);
    const allToRemove = new Set([id, ...descendants]);
    // Also remove brackets referencing removed profiles — and, with them, any
    // accessory kit bound to one of those brackets (a kit without its bracket
    // would be orphaned hardware with nowhere to sit).
    const doomedBrackets = new Set(
      get().brackets.filter((b) => b.connectedProfiles.some((pid) => allToRemove.has(pid))).map((b) => b.id),
    );
    const doomedKits = new Set(
      get().kitInstances.filter((k) => doomedBrackets.has(k.bracketId)).map((k) => k.id),
    );
    set((s) => ({
      profiles: s.profiles.filter((p) => !allToRemove.has(p.id)),
      brackets: s.brackets.filter((b) => !doomedBrackets.has(b.id)),
      screws: s.screws.filter((sc) => !allToRemove.has(sc.profileId)),
      kitInstances: s.kitInstances.filter((k) => !doomedKits.has(k.id)),
      selectedKitId: s.selectedKitId && doomedKits.has(s.selectedKitId) ? null : s.selectedKitId,
      selectedProfileId: s.selectedProfileId && allToRemove.has(s.selectedProfileId) ? null : s.selectedProfileId,
      selectedScrewId: s.selectedScrewId && s.screws.some((sc) => sc.id === s.selectedScrewId && allToRemove.has(sc.profileId)) ? null : s.selectedScrewId,
    }));
  },

  // Selection is what the dimension annotation hangs from: it says "this is the
  // part I am working on", and the number beside it says how tall it is. Picking
  // anything at all — a new profile, a bracket, an empty patch of ground —
  // withdraws it, so the annotation can never outlive the moment it belongs to.
  selectProfile: (id) => set({
    selectedProfileId: id,
    selectedBracketId: null,
    selectedScrewId: null,
    selectedKitId: null,
    dimension: null,
  }),

  setStretchProfile: (id, end) =>
    set({ stretchProfileId: id, stretchEnd: end, mode: id ? 'stretching' : 'idle' }),

  updateProfileLength: (id, length) =>
    set((s) => ({
      profiles: s.profiles.map((p) => {
        if (p.id !== id) return p;
        const newLen = Math.max(20, Math.round(length || 20));
        const oldHalfM = (p.length * 0.001) / 2;
        const newHalfM = (newLen * 0.001) / 2;
        const axIdx = p.direction === 'X' ? 0 : p.direction === 'Y' ? 1 : 2;
        const axisKey = (['x', 'y', 'z'] as const)[axIdx];
        // Fixed end = bottom = center - old halfLen
        const fixedEnd = p.position[axisKey] - Math.round(oldHalfM * 1000);
        // New center = fixed end + new halfLen
        const newPos = { ...p.position };
        newPos[axisKey] = fixedEnd + Math.round(newHalfM * 1000);
        return { ...p, length: newLen, position: newPos };
      }),
    })),

  updateProfilePosition: (id, newLen, axIdx, fixedEnd) =>
    set((s) => ({
      profiles: s.profiles.map((p) => {
        if (p.id !== id) return p;
        const newHalfLenM = (Math.max(20, Math.round(newLen)) * 0.001) / 2;
        // Center = fixedEnd ± newHalfLen along axis
        const newPos = { ...p.position };
        const axisKey = (['x', 'y', 'z'] as const)[axIdx];
        const sign = p.position[axisKey] > (fixedEnd as Record<string, number>)[axisKey] ? 1 : -1;
        newPos[axisKey] = Math.round(((fixedEnd as Record<string, number>)[axisKey] + sign * newHalfLenM) * 1000);
        return { ...p, length: Math.max(20, Math.round(newLen)), position: newPos };
      }),
    })),

  updateProfileSize: (id, size) =>
    set((s) => {
      const target = s.profiles.find((p) => p.id === id);
      if (!target || target.profileSize === size) return {};
      const delta = PROFILE_DIMS[size] - PROFILE_DIMS[target.profileSize];

      let profiles = s.profiles.map((p) => (p.id === id ? { ...p, profileSize: size } : p));

      // Re-seat the children standing on a LATERAL face. A face along the
      // parent's own axis is an END face, and its plane sits at ±length/2 — the
      // cross-section does not move it. A lateral face sits at ±dim/2, so it
      // slides out by half the growth and everything attached to it rides along
      // (a child's own cross-section is unchanged, so its subtree translates
      // rigidly with it). Without this a 30→40 growth buries the children 5 mm
      // inside the parent, and a shrink pulls them 5 mm clear of it.
      //
      // `parentFace` is written by every creation path and read nowhere else —
      // this is the first and only consumer.
      const shifts = new Map<string, { axis: 'x' | 'y' | 'z'; amount: number }>();
      if (delta !== 0) {
        const childAxis = target.direction.toLowerCase();
        for (const c of s.profiles) {
          if (c.parentId !== id || !c.parentFace) continue;
          const axis = c.parentFace[1].toLowerCase() as 'x' | 'y' | 'z';
          if (axis === childAxis) continue; // end face — stays put
          const amount = (c.parentFace.startsWith('+') ? 1 : -1) * (delta / 2);
          // A profile has at most one parent, so no two shifts can collide.
          for (const pid of [c.id, ...get().getDescendantIds(c.id)]) shifts.set(pid, { axis, amount });
        }
        if (shifts.size > 0) {
          profiles = profiles.map((p) => {
            const sh = shifts.get(p.id);
            if (!sh) return p;
            // 20/30/40 are all even, so `delta/2` is a whole millimetre.
            return { ...p, position: { ...p.position, [sh.axis]: p.position[sh.axis] + sh.amount } };
          });
        }
      }

      // Re-fit the brackets standing on the geometry we just moved. Brackets
      // anywhere else are left untouched: re-deriving a pose that did not change
      // would round a hint's integer position again and drift the bracket by
      // fractions of a millimetre for no reason.
      const touched = new Set<string>([id, ...shifts.keys()]);
      const dimOf = (pid: string) => {
        const p = profiles.find((q) => q.id === pid);
        return p ? PROFILE_DIMS[p.profileSize] : PROFILE_DIMS[size];
      };
      const brackets = s.brackets.map((b) => {
        if (!b.auto || b.connectedProfiles.length !== 2) return b;
        if (!b.connectedProfiles.some((pid) => touched.has(pid))) return b;
        const pa = profiles.find((p) => p.id === b.connectedProfiles[0]);
        const pb = profiles.find((p) => p.id === b.connectedProfiles[1]);
        if (!pa || !pb) return b;
        const [nA, nB] = bracketFaces(b);
        const fit = jointFitInfo(pa, nA, pb, nB);
        // No longer a joint (the bars no longer overlap). Keep the bracket
        // exactly where the user last saw it — a resize is not a reason to
        // delete their hardware.
        if (!fit) return b;
        return {
          ...b,
          position: {
            x: Math.round(fit.position.x),
            y: Math.round(fit.position.y),
            z: Math.round(fit.position.z),
          },
          size: Math.max(dimOf(pa.id), dimOf(pb.id)),
        };
      });

      return { profiles, brackets };
    }),

  growFromFace: (parentId, face, hitPos) => {
    const { profiles } = get();
    const parent = profiles.find((p) => p.id === parentId);
    if (!parent) return;

    const dim = { '2020': 20, '3030': 30, '4040': 40 }[parent.profileSize] ?? 30;
    const axis = face[1].toLowerCase() as 'x' | 'y' | 'z';
    const sign = face.startsWith('+') ? 1 : -1;

    // Child direction = face normal direction
    const faceToDir: Record<string, AxisDir> = {
      '+X': 'X', '-X': 'X', '+Y': 'Y', '-Y': 'Y', '+Z': 'Z', '-Z': 'Z',
    };
    const childDir = faceToDir[face] ?? 'Y';

    // Child position: centered on the parent face, bottom flush to face
    const childLen = 100;
    const childPos = { ...parent.position };
    // Align to parent face center along non-axis directions
    childPos[axis] = hitPos[axis] + sign * Math.round(childLen / 2);

    // Parent offset: project hit point onto parent axis
    const parentAxis = parent.direction.toLowerCase() as 'x' | 'y' | 'z';
    const offset = Math.round(hitPos[parentAxis] - parent.position[parentAxis]);

    const child: DiyProfile = {
      id: uid(),
      seq: ++_seq,
      profileSize: parent.profileSize,
      length: 100,
      position: childPos,
      direction: childDir,
      parentId: parent.id,
      parentFace: face,
      parentOffset: offset,
    };

    set((s) => ({
      profiles: [...s.profiles, child],
      selectedProfileId: child.id,
    }));
  },

  setMode: (mode) => set({ mode }),
  controlsRef: null,
  setControlsRef: (ref) => set({ controlsRef: ref }),

  // ---- Ghosts, selection bookkeeping ----
  ghostBracket: null,
  placingProfile: null,
  cameraFocus: null,

  clearCameraFocus: () => set({ cameraFocus: null }),

  showCornerHints: false,
  setShowCornerHints: (v) => set({ showCornerHints: v }),

  showGrid: true,
  setShowGrid: (v) => set({ showGrid: v }),

  // Read once, at the store's creation: a preference that only changes when the
  // user changes it does not need re-reading, and reading it here is what lets
  // every component take the resolved value straight off the store.
  background: readBackground(),
  setBackground: (id) => {
    writeBackground(id);
    set({ background: id });
  },

  // `perspective` is not a placeholder: it is the view the scene opens on, so the
  // toolbar starts with the button that describes what is actually on screen
  // lit up, rather than with nothing lit up until the first click.
  viewPreset: 'perspective',
  viewNonce: 0,
  setViewPreset: (p) => set((s) => ({
    viewPreset: p,
    viewNonce: s.viewNonce + 1,
    // A preset click is a deliberate camera move, so it cancels the auto-zoom
    // that follows a placement. That zoom is driven per-frame from
    // `cameraFocus`, and two writers on the same camera means the flight wins
    // for 700 ms and is then snatched back to the placement distance. Clearing
    // the flag here is half the fix — `DiyScene` drops the ref the frame loop
    // actually reads (see its preset effect).
    cameraFocus: null,
  })),
  clearViewPreset: () => set({ viewPreset: null }),

  updateGhostBracket: (data) => set({ ghostBracket: data }),

  placeBracket: (patch?: { connectorId?: string }) => {
    const { ghostBracket, profiles, lastConnectorId } = get();
    if (!ghostBracket) return;
    const parent = profiles.find((p) => p.id === ghostBracket.profileId);
    const size = ghostBracket.size;
    const connectorId = patch?.connectorId ?? lastConnectorId ?? DEFAULT_BRACKET_CONNECTOR_ID;
    const bracket: DiyBracket = {
      id: uid(),
      connectorId,
      position: ghostBracket.position,
      rotation: { roll: 0, pitch: 0, yaw: 0 },
      anchorPosition: { x: 0, y: 0, z: 0 },
      anchorRotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedProfiles: parent ? [parent.id] : [],
      enabled: true,
      size,
      // `auto` too, though with one connected profile and no rotation there is
      // nothing for a resize to re-fit. The flag means "the app chose this", and
      // the user typing over it still has to take it away.
      auto: true,
    };
    set((s) => ({
      brackets: [...s.brackets, bracket],
      selectedBracketId: bracket.id,
      // Mutual selection: placing a bracket deselects any profile/screw/kit.
      selectedProfileId: null,
      selectedScrewId: null,
      selectedKitId: null,
      hand: null,
      ghostBracket: null,
      // The fallback path's placement counts as a choice too: whatever went
      // down here is what a second click — with the hand now empty — must
      // produce again.
      lastConnectorId: connectorId,
    }));
  },

  hand: null,
  lastConnectorId: null,
  pickUpHand: (next) =>
    set((s) => ({
      // Same part again = put it down. `null` must clear unconditionally
      // (Escape), so it cannot go through the same comparison.
      hand: next !== null && s.hand !== null && sameHand(next, s.hand) ? null : next,
      // Picking a connector IS the choice, whether or not it gets placed —
      // putting one down again (Escape, or clicking the card twice) must not
      // quietly forget it and send the next bracket back to the default.
      lastConnectorId: next?.kind === 'connector' ? next.connectorId : s.lastConnectorId,
      // The ghosts belong to whatever was in hand a moment ago: a bracket ghost
      // left over from a connector would keep previewing a corner for a part the
      // user has already put back down.
      ghostBracket: null,
      ghostScrew: null,
      ghostProfile: null,
    })),

  // ---- Drag-to-move a placed part ----
  movingPart: null,
  setMovingPart: (part) => set({ movingPart: part }),

  dimension: null,
  setDimension: (dimension) => set({ dimension }),

  translateProfile: (id, delta) =>
    set((s) => {
      // The profile and everything that hangs off it — the same set
      // `removeProfile` computes, for the same reason. A subtree that did not
      // move rigidly would come apart on screen.
      const moving = new Set([id, ...get().getDescendantIds(id)]);

      const parent = s.profiles.find((p) => p.id === id)?.parentId;
      const parentProfile = parent ? s.profiles.find((p) => p.id === parent) : null;

      return {
        profiles: s.profiles.map((p) => {
          if (!moving.has(p.id)) return p;
          const moved = {
            ...p,
            position: {
              x: p.position.x + delta.x,
              y: p.position.y + delta.y,
              z: p.position.z + delta.z,
            },
          };
          // `parentOffset` records where this profile sits along its PARENT's
          // axis. A moved child is no longer where that number says it is, and
          // the only consumer (`updateProfileSize`) would then shift it about a
          // stale centre. Recomputed for the dragged profile only: its
          // descendants travelled rigidly with it, so theirs still hold.
          if (p.id === id && parentProfile) {
            const ax = parentProfile.direction.toLowerCase() as 'x' | 'y' | 'z';
            return { ...moved, parentOffset: Math.round(moved.position[ax] - parentProfile.position[ax]) };
          }
          return moved;
        }),
        // A bracket is bolted to the profiles it connects, in world coordinates
        // — it has no parent to follow. Any bracket touching a moved profile
        // travels, including one bridging the subtree and the rest of the frame:
        // leaving it behind would pull it off the very faces it mounts on.
        brackets: s.brackets.map((b) =>
          b.connectedProfiles.some((pid) => moving.has(pid))
            ? {
                ...b,
                position: {
                  x: b.position.x + delta.x,
                  y: b.position.y + delta.y,
                  z: b.position.z + delta.z,
                },
              }
            : b,
        ),
        // Screws are positioned on a face in world coordinates, and they carry
        // the profile they are mounted on as `profileId` — so the same rule.
        screws: s.screws.map((sc) =>
          moving.has(sc.profileId)
            ? {
                ...sc,
                position: {
                  x: sc.position.x + delta.x,
                  y: sc.position.y + delta.y,
                  z: sc.position.z + delta.z,
                },
              }
            : sc,
        ),
      };
    }),

  moveBracket: (id, hint) =>
    set((s) => ({
      brackets: s.brackets.map((b) => {
        if (b.id !== id) return b;
        // The same pose `placeBracketAtHint` builds through `jointBracket`, with
        // the connector id resolved the same way — a moved bracket and a placed
        // one have to land posed identically.
        const eul = eulerFromNormals(hint.faceA, hint.faceB);
        return {
          ...b,
          position: {
            x: Math.round(hint.position.x * 100) / 100,
            y: Math.round(hint.position.y * 100) / 100,
            z: Math.round(hint.position.z * 100) / 100,
          },
          rotation: {
            roll: THREE.MathUtils.radToDeg(eul.x),
            pitch: THREE.MathUtils.radToDeg(eul.y),
            yaw: THREE.MathUtils.radToDeg(eul.z),
          },
          connectedProfiles: [hint.profileIdA, hint.profileIdB],
          size: hint.size,
          // The app is choosing this pose again, so a later resize may re-fit it
          // — the same restoration `auto` performs for a freshly placed bracket.
          auto: true,
        };
      }),
    })),

  placeBracketAtHint: (hint, connectorId) => {
    // ONE JOINT, ONE BRACKET. The drop path reaches here through `findCornerAt`,
    // which reads profile geometry only and knows nothing about placed brackets,
    // so without this a connector dropped on an occupied corner appended a second
    // bracket at the same millimetre — the new one drawn over the old, and no
    // obvious way to get rid of either. Swapping the part in place is also what
    // the property panel's Model menu does, so the two entrances agree: the same
    // bracket keeps its id, pose, size and `auto`, and only the part changes.
    //
    // The click path cannot reach this branch: `DiyCornerHints` filters its
    // previews by the same `SAME_CORNER_MM`, so a click is only ever offered on a
    // free corner.
    //
    // Resolved once, for both branches, and from the user's last choice before
    // the factory default — see `lastConnectorId`. A bare corner click (nothing
    // in hand) is the common case here, and it is the one that used to hand back
    // the cast bracket a placement after the user had picked something else.
    const chosen = connectorId ?? get().lastConnectorId ?? DEFAULT_BRACKET_CONNECTOR_ID;
    const sitting = bracketAtHint(get().brackets, hint);
    if (sitting) {
      set((s) => ({
        brackets: s.brackets.map((b) =>
          b.id === sitting.id ? { ...b, connectorId: chosen } : b,
        ),
        selectedBracketId: sitting.id,
        selectedProfileId: null,
        selectedScrewId: null,
        selectedKitId: null,
        hand: null,
        ghostBracket: null,
        lastConnectorId: chosen,
      }));
      return sitting.id;
    }

    const bracket = jointBracket({
      idA: hint.profileIdA,
      idB: hint.profileIdB,
      faceA: hint.faceA,
      faceB: hint.faceB,
      size: hint.size,
      position: hint.position,
      connectorId: chosen,
    });
    set((s) => ({
      brackets: [...s.brackets, bracket],
      selectedBracketId: bracket.id,
      // Mutual selection: placing a bracket deselects any profile/screw/kit.
      selectedProfileId: null,
      selectedScrewId: null,
      selectedKitId: null,
      // A click on a joint goes through here too, so this has to clear the hand
      // and the ghost exactly the way `placeBracket` does — the fallback path
      // must not be the only one that puts the part down.
      hand: null,
      ghostBracket: null,
      lastConnectorId: chosen,
    }));
    return bracket.id;
  },

  // ---- Hover-to-place child profile ----
  //
  // Deliberately NOT a `mode`. Arming is now a hover: it happens and un-happens
  // every time the pointer crosses a selected bar, and anything keyed on `mode`
  // would flicker with it. Two examples that would break loudly — the property
  // panel prints the mode, and `DiyScene` takes the camera away during a mode —
  // so a hover that set one would freeze the view whenever the pointer rested
  // on the wrong bar.
  startPlacingProfile: (parentId, face, pos, size) =>
    set({ placingProfile: { parentId, face, position: pos, size } }),

  updatePlacingPosition: (pos) =>
    set((s) => {
      const cur = s.placingProfile;
      if (!cur) return {};
      // The snap quantises to 10 mm, so most pointer moves do not move the
      // ghost. Returning the same object is what keeps a hover from re-rendering
      // every profile in the scene on every mouse event.
      const p = cur.position;
      if (p.x === pos.x && p.y === pos.y && p.z === pos.z) return {};
      return { placingProfile: { ...cur, position: pos } };
    }),

  confirmPlacingProfile: () => {
    const { placingProfile, profiles } = get();
    if (!placingProfile) return null;
    const parent = profiles.find((p) => p.id === placingProfile.parentId);
    if (!parent) return null;

    const faceToDir: Record<string, AxisDir> = {
      '+X': 'X', '-X': 'X', '+Y': 'Y', '-Y': 'Y', '+Z': 'Z', '-Z': 'Z',
    };
    const childDir = faceToDir[placingProfile.face] ?? 'Y';
    const childLen = 100; // default child length (same as ghost)
    const halfLen = childLen / 2;

    // Child centre = ghost position + half length pushed out along face normal
    const sign = placingProfile.face.startsWith('+') ? 1 : -1;
    const axis = placingProfile.face[1].toLowerCase() as 'x' | 'y' | 'z';
    const childPos = { ...placingProfile.position };
    childPos[axis] += sign * halfLen;

    // Parent offset along parent's axis
    const parentAxis = parent.direction.toLowerCase() as 'x' | 'y' | 'z';
    const offset = Math.round(placingProfile.position[parentAxis] - parent.position[parentAxis]);

    const child: DiyProfile = {
      id: uid(),
      seq: ++_seq,
      profileSize: placingProfile.size,
      length: childLen,
      position: childPos,
      direction: childDir,
      parentId: placingProfile.parentId,
      parentFace: placingProfile.face,
      parentOffset: offset,
    };

    set((s) => ({
      profiles: [...s.profiles, child],
      selectedProfileId: child.id,
      // No `mode` to restore — see `startPlacingProfile`. The child becomes the
      // selection, so the ghost is gone by the same rule it always was: it
      // belongs to the selected profile, and that is now this child.
      placingProfile: null,
      cameraFocus: { x: childPos.x * 0.001, y: childPos.y * 0.001, z: childPos.z * 0.001 },
    }));
    return child;
  },

  // Clears the ghost only. `mode` is left alone on purpose: this is now called
  // from a pointer-out, and forcing `'idle'` there would cancel an unrelated
  // gesture (a stretch in progress) because the pointer happened to leave a bar.
  cancelPlacing: () => set({ placingProfile: null }),

  // Brackets
  addBracket: (b) =>
    set((s) => ({ brackets: [...s.brackets, b], selectedBracketId: b.id })),

  updateBracket: (id, patch) =>
    set((s) => ({
      brackets: s.brackets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),

  removeBracket: (id) =>
    set((s) => ({
      brackets: s.brackets.filter((b) => b.id !== id),
      // A kit bound to this bracket loses its seat — drop it too, never leave
      // fasteners floating with no joint to sit in.
      kitInstances: s.kitInstances.filter((k) => k.bracketId !== id),
      selectedBracketId: s.selectedBracketId === id ? null : s.selectedBracketId,
      selectedKitId:
        s.selectedKitId && s.kitInstances.some((k) => k.id === s.selectedKitId && k.bracketId === id)
          ? null
          : s.selectedKitId,
    })),

  selectBracket: (id) => set({ selectedBracketId: id, selectedProfileId: null, selectedScrewId: null, selectedKitId: null }),

  editingBracketId: null,
  openBracketEditor: (id) => set({ editingBracketId: id }),

  // ---- Accessory kits ----
  kitInstances: [],
  selectedKitId: null,
  showKitFasteners: true,
  showKitNuts: true,

  bindKit: (kitId, bracketId) => {
    // A kit is only meaningful on a real corner joint: its fasteners are seated
    // in the bracket's local frame, so the bracket must already exist and be
    // oriented. Both entrances place the bracket first and bind second — this
    // action never places anything itself, which is what keeps hardware from
    // ever hanging off a bracket that isn't there yet.
    //
    // Whether the kit FITS the bracket is the callers' gate (`kitFitReason`
    // against `bracket.size`), not this one: the refusal names the sizes, so it
    // belongs where it can be shown to the user.
    if (!accessoryKitById(kitId)) return false;
    if (!get().brackets.some((b) => b.id === bracketId)) return false;
    const existing = get().kitInstances.find((k) => k.bracketId === bracketId);
    if (existing && existing.kitId === kitId) {
      // Already bound — just surface it rather than stacking duplicates.
      set({ selectedKitId: existing.id, selectedProfileId: null, selectedBracketId: null, selectedScrewId: null });
      return true;
    }
    if (existing) {
      // ONE KIT PER JOINT. A bracket has a fixed set of seats, so a second kit
      // would drive its bolts into holes the first kit already fills. Binding a
      // different kit to the same bracket therefore REPLACES the old one
      // (keeping the instance id so the tree row and selection survive).
      const swapped: DiyKitInstance = { ...existing, kitId };
      set((s) => ({
        kitInstances: s.kitInstances.map((k) => (k.id === existing.id ? swapped : k)),
        selectedKitId: swapped.id,
        selectedProfileId: null,
        selectedBracketId: null,
        selectedScrewId: null,
      }));
      return true;
    }
    const instance: DiyKitInstance = { id: uid(), kitId, bracketId, enabled: true };
    set((s) => ({
      kitInstances: [...s.kitInstances, instance],
      // Selecting the new kit deselects the bracket it sits on, so only one
      // property panel is ever open.
      selectedKitId: instance.id,
      selectedProfileId: null,
      selectedBracketId: null,
      selectedScrewId: null,
    }));
    return true;
  },

  removeKitInstance: (id) =>
    set((s) => ({
      kitInstances: s.kitInstances.filter((k) => k.id !== id),
      selectedKitId: s.selectedKitId === id ? null : s.selectedKitId,
    })),

  selectKit: (id) => set({ selectedKitId: id, selectedProfileId: null, selectedBracketId: null, selectedScrewId: null }),

  setShowKitFasteners: (v) => set({ showKitFasteners: v }),
  setShowKitNuts: (v) => set({ showKitNuts: v }),

  // ---- Screw ghost ----
  ghostScrew: null,
  ghostProfile: null,

  updateGhostScrew: (data) => set({ ghostScrew: data }),
  updateGhostProfile: (data) => set({ ghostProfile: data }),

  placeScrew: (patch) => {
    const { ghostScrew } = get();
    if (!ghostScrew) return;
    const screw: DiyScrew = {
      id: uid(),
      position: ghostScrew.position,
      rotation: ghostScrew.rotation,
      size: ghostScrew.size,
      // The standard comes from the dragged card, so a card in the 沉头 group
      // lands a countersunk screw. The LENGTH is still the app's default: the
      // card picks a standard and a thread, and the length is the one thing left
      // for the property panel. Both expressions match the placement ghost's
      // (see DiyScrewPlacementGhost), which is what keeps the ghost from
      // promising something the drop does not produce.
      family: ghostScrew.family,
      length: patch?.length ?? defaultScrewLength(ghostScrew.family, ghostScrew.size),
      profileId: ghostScrew.profileId,
      enabled: true,
    };
    set((s) => ({
      screws: [...s.screws, screw],
      selectedScrewId: screw.id,
      // Mutual selection: placing a screw deselects any profile/bracket.
      selectedProfileId: null,
      selectedBracketId: null,
      hand: null,
      ghostScrew: null,
    }));
  },

  // Screws CRUD
  addScrew: (s) =>
    set((st) => ({
      screws: [...st.screws, s],
      selectedScrewId: s.id,
      selectedProfileId: null,
      selectedBracketId: null,
      selectedKitId: null,
    })),

  updateScrew: (id, patch) =>
    set((st) => ({
      screws: st.screws.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)),
    })),

  removeScrew: (id) =>
    set((st) => ({
      screws: st.screws.filter((sc) => sc.id !== id),
      selectedScrewId: st.selectedScrewId === id ? null : st.selectedScrewId,
    })),

  selectScrew: (id) =>
    set({ selectedScrewId: id, selectedProfileId: null, selectedBracketId: null, selectedKitId: null }),

  getProfilesByParent: (parentId) =>
    get().profiles.filter((p) => p.parentId === parentId),

  getDescendantIds: (profileId) => {
    const result: string[] = [];
    const queue = [profileId];
    while (queue.length > 0) {
      const pid = queue.shift()!;
      const children = get().profiles.filter((p) => p.parentId === pid);
      for (const c of children) {
        result.push(c.id);
        queue.push(c.id);
      }
    }
    return result;
  },
}));
