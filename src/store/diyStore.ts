import { create } from 'zustand';
import type { MutableRefObject } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type {
  DiyProfile,
  DiyBracket,
  DiyScrew,
  DiyScrewGhost,
  DiyMode,
  ProfileSize,
  AxisDir,
  FaceDir,
  BracketFacePick,
  DiyKitInstance,
} from '../types/furniture';
import { DEFAULT_BRACKET_STL_URL, PROFILE_DIMS } from '../types/furniture';
import { CAST_CONNECTOR, CONNECTORS } from '../diy/connectors';
import { DEFAULT_SCREW_FAMILY, defaultScrewLength } from '../diy/fastenerDims';
import { jointFitInfo, cornerBracketFits } from '../diy/diyJointGeometry';
import { bracketAtHint, eulerFromNormals } from '../diy/diyCornerGeometry';
import type { CornerHint } from '../diy/diyCornerGeometry';
import { accessoryKitById } from '../utils/accessoryKits';

let _nextId = 1;
function uid(): string {
  return `diy_${_nextId++}_${Date.now().toString(36)}`;
}
/** Stable per-profile creation sequence (structure-tree numbering). */
let _seq = 0;

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
 * A corner bracket for a pair of mounting faces — the ONE builder behind every
 * way a bracket gets placed at a joint: a dropped drag, a manual two-face pick,
 * and a click on a corner hint.
 *
 * `pickBracketFace` used to inline this rotation/rounding block. Copying it a
 * third time for the corner-click path is how the three entrances drift into
 * placing subtly different parts at subtly different poses, which is the exact
 * complaint that started this rewrite.
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

  // ---- Bracket drag-and-drop placement ----
  /** True while a bracket is being dragged from the sidebar over the 3D view. */
  isDraggingBracket: boolean;
  /** Ghost bracket shown at the nearest corner snap point during drag (mm). */
  ghostBracket: { position: { x: number; y: number; z: number }; size: number; profileId: string } | null;
  /** Called when the user starts dragging a bracket over the 3D viewport. */
  startDraggingBracket: () => void;
  /** Update ghost position (mouse move during drag). Null = no valid snap target. */
  updateGhostBracket: (data: { position: { x: number; y: number; z: number }; size: number; profileId: string } | null) => void;
  /**
   * Drop: place an UNORIENTED bracket at the ghost position.
   *
   * This is the fallback for a drop with no joint under it. Anything that lands
   * on a real joint goes through `placeBracketAtHint` instead — it takes the
   * corner's own faces and size, so position, rotation and size all agree by
   * construction. There is deliberately no way to pass those in here: a second
   * route to a joint-accurate bracket is how the two used to disagree.
   */
  placeBracket: (patch?: {
    /** Connector catalog id to stamp on the new bracket. */
    connectorId?: string;
  }) => void;
  /** Cancel the drag (left viewport / Escape). */
  cancelDraggingBracket: () => void;

  // ---- Screw drag-and-drop placement ----
  /** True while a screw is being dragged from the sidebar over the 3D view. */
  isDraggingScrew: boolean;
  /** Ghost screw shown on the hovered profile face during drag (mm + deg). */
  ghostScrew: DiyScrewGhost | null;
  /** Called when the user starts dragging a screw over the 3D viewport. */
  startDraggingScrew: () => void;
  /** Update ghost during mouse move. Null = no valid face under cursor. */
  updateGhostScrew: (data: DiyScrewGhost | null) => void;
  /** Drop: place the screw at the ghost position. */
  placeScrew: (patch?: { length?: number }) => void;
  /** Cancel the screw drag. */
  cancelDraggingScrew: () => void;

  // Screw CRUD
  addScrew: (s: DiyScrew) => void;
  updateScrew: (id: string, patch: Partial<DiyScrew>) => void;
  removeScrew: (id: string) => void;
  selectScrew: (id: string | null) => void;

  // ---- Bracket two-face placement (manual: pick two perpendicular faces) ----
  /** First picked face while placing a bracket by clicking two faces. */
  bracketFaceA: BracketFacePick | null;
  /** Enter two-face bracket placement mode (clear any first pick). */
  startBracketFacePicking: () => void;
  /**
   * Register a picked face. With no first pick yet, stores it (returns 'first').
   * Otherwise validates perpendicularity and places the bracket at the line
   * where the two face planes meet. Returns the outcome for the caller to
   * surface errors.
   */
  pickBracketFace: (info: BracketFacePick) => 'first' | 'placed' | 'rejected' | 'no_overlap' | 'no_fit';
  /** Cancel two-face bracket placement. */
  cancelBracketFacePicking: () => void;
  /**
   * Auto-algorithm reference bracket rendered translucent blue next to a
   * manually placed bracket, so the two can be compared side by side.
   */
  autoRefBracket: DiyBracket | null;
  setAutoRefBracket: (b: DiyBracket | null) => void;

  // ---- Corner-hint click placement ----
  /**
   * The connector the next corner-hint click will place, or null for the
   * default bracket. Arming is NOT a mode: it changes nothing about what the
   * pointer does, only which part the orange hints would drop if clicked.
   */
  armedConnectorId: string | null;
  /**
   * Arm a connector. Passing the already-armed id disarms it (clicking the
   * card twice is how you put it back down); passing null always clears.
   */
  armConnector: (id: string | null) => void;
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
      length: 100,
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

  selectProfile: (id) => set({ selectedProfileId: id, selectedBracketId: null, selectedScrewId: null, selectedKitId: null }),

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

  // ---- Bracket drag-and-drop ----
  isDraggingBracket: false,
  ghostBracket: null,
  bracketFaceA: null,
  autoRefBracket: null,
  placingProfile: null,
  cameraFocus: null,

  clearCameraFocus: () => set({ cameraFocus: null }),

  showCornerHints: false,
  setShowCornerHints: (v) => set({ showCornerHints: v }),

  startDraggingBracket: () => set({ isDraggingBracket: true, ghostBracket: null }),

  updateGhostBracket: (data) => set({ ghostBracket: data }),

  placeBracket: (patch?: { connectorId?: string }) => {
    const { ghostBracket, profiles } = get();
    if (!ghostBracket) return;
    const parent = profiles.find((p) => p.id === ghostBracket.profileId);
    const size = ghostBracket.size;
    const bracket: DiyBracket = {
      id: uid(),
      connectorId: patch?.connectorId ?? DEFAULT_BRACKET_CONNECTOR_ID,
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
      isDraggingBracket: false,
      ghostBracket: null,
      autoRefBracket: null,
    }));
  },

  cancelDraggingBracket: () => set({ isDraggingBracket: false, ghostBracket: null }),

  // ---- Bracket two-face placement ----
  startBracketFacePicking: () =>
    set({ mode: 'placing_bracket_faces', bracketFaceA: null, autoRefBracket: null }),
  cancelBracketFacePicking: () =>
    set({ mode: 'idle', bracketFaceA: null, autoRefBracket: null }),
  setAutoRefBracket: (b) => set({ autoRefBracket: b }),

  armedConnectorId: null,
  armConnector: (id) =>
    set((s) => ({
      // Same id again = put it down. `id === null` must clear unconditionally
      // (Escape), so it cannot go through the same comparison.
      armedConnectorId: id !== null && s.armedConnectorId === id ? null : id,
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
    const sitting = bracketAtHint(get().brackets, hint);
    if (sitting) {
      set((s) => ({
        brackets: s.brackets.map((b) =>
          b.id === sitting.id ? { ...b, connectorId: connectorId ?? DEFAULT_BRACKET_CONNECTOR_ID } : b,
        ),
        selectedBracketId: sitting.id,
        selectedProfileId: null,
        selectedScrewId: null,
        selectedKitId: null,
        isDraggingBracket: false,
        ghostBracket: null,
        autoRefBracket: null,
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
      connectorId: connectorId ?? DEFAULT_BRACKET_CONNECTOR_ID,
    });
    set((s) => ({
      brackets: [...s.brackets, bracket],
      selectedBracketId: bracket.id,
      // Mutual selection: placing a bracket deselects any profile/screw/kit.
      selectedProfileId: null,
      selectedScrewId: null,
      selectedKitId: null,
      // The drag path routes its drop through here when it lands on a joint, so
      // this has to finish the drag the way `placeBracket` does. A click has no
      // drag to finish and these are already at rest.
      isDraggingBracket: false,
      ghostBracket: null,
      autoRefBracket: null,
    }));
    return bracket.id;
  },

  pickBracketFace: (info) => {
    const s = get();
    if (!s.bracketFaceA) {
      set({ bracketFaceA: info });
      return 'first';
    }
    const a = s.bracketFaceA;

    // The two mounting faces of a corner bracket are perpendicular.
    const dotN =
      a.normal.x * info.normal.x +
      a.normal.y * info.normal.y +
      a.normal.z * info.normal.z;
    if (Math.abs(dotN) > 0.05) return 'rejected';

    // Position = CENTER of the joint, independent of where the mouse clicked.
    // Shared with the auto preview (computeCornerHints), so a manual two-face
    // placement always lands exactly on a preview bracket.
    const pa = s.profiles.find((p) => p.id === a.profileId);
    const pb = s.profiles.find((p) => p.id === info.profileId);
    if (!pa || !pb) return 'rejected';
    const fit = jointFitInfo(pa, a.normal, pb, info.normal);
    if (!fit) return 'no_overlap';

    const dimOf = (id: string) => {
      const p = s.profiles.find((q) => q.id === id);
      return p ? (PROFILE_DIMS[p.profileSize] ?? 30) : 30;
    };
    const size = Math.max(dimOf(a.profileId), dimOf(info.profileId));

    // Reject a placement whose mounting faces don't have enough room for the
    // bracket (joint too close to a profile end, or a too-short profile) — the
    // bracket would visibly stick out past the profile.
    if (!cornerBracketFits(fit, size)) return 'no_fit';

    // Manual two-face placement drops the same default bracket a corner hint
    // does — the two ways in must not place different parts. Both go through
    // `jointBracket`, so they cannot even if someone edits one of them later.
    const bracket = jointBracket({
      idA: a.profileId,
      idB: info.profileId,
      faceA: a.normal,
      faceB: info.normal,
      size,
      position: fit.position,
    });

    set((st) => ({
      brackets: [...st.brackets, bracket],
      selectedBracketId: bracket.id,
      bracketFaceA: null,
      mode: 'idle',
    }));
    return 'placed';
  },

  // ---- Click-to-place child profile ----
  startPlacingProfile: (parentId, face, pos, size) =>
    set({ placingProfile: { parentId, face, position: pos, size }, mode: 'placing_child' }),

  updatePlacingPosition: (pos) =>
    set((s) => ({
      placingProfile: s.placingProfile ? { ...s.placingProfile, position: pos } : null,
    })),

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
      placingProfile: null,
      mode: 'idle',
      cameraFocus: { x: childPos.x * 0.001, y: childPos.y * 0.001, z: childPos.z * 0.001 },
    }));
    return child;
  },

  cancelPlacing: () => set({ placingProfile: null, mode: 'idle' }),

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

  // ---- Screw drag-and-drop ----
  isDraggingScrew: false,
  ghostScrew: null,

  startDraggingScrew: () => set({ isDraggingScrew: true, ghostScrew: null }),

  updateGhostScrew: (data) => set({ ghostScrew: data }),

  placeScrew: (patch) => {
    const { ghostScrew } = get();
    if (!ghostScrew) return;
    const screw: DiyScrew = {
      id: uid(),
      position: ghostScrew.position,
      rotation: ghostScrew.rotation,
      size: ghostScrew.size,
      // The drag payload carries a size only, so the screw lands on the app's
      // default standard at the catalog's default length for it — the same pair
      // the placement ghost draws.
      family: DEFAULT_SCREW_FAMILY,
      length: patch?.length ?? defaultScrewLength(DEFAULT_SCREW_FAMILY, ghostScrew.size),
      profileId: ghostScrew.profileId,
      enabled: true,
    };
    set((s) => ({
      screws: [...s.screws, screw],
      selectedScrewId: screw.id,
      // Mutual selection: placing a screw deselects any profile/bracket.
      selectedProfileId: null,
      selectedBracketId: null,
      isDraggingScrew: false,
      ghostScrew: null,
    }));
  },

  cancelDraggingScrew: () => set({ isDraggingScrew: false, ghostScrew: null }),

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
