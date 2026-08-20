import { create } from 'zustand';
import type { MutableRefObject } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type {
  DiyProfile,
  DiyBracket,
  DiyMode,
  ProfileSize,
  AxisDir,
  FaceDir,
  BracketFacePick,
} from '../types/furniture';
import { PROFILE_DIMS } from '../types/furniture';
import { centeredJointPosition } from '../diy/diyJointGeometry';

let _nextId = 1;
function uid(): string {
  return `diy_${_nextId++}_${Date.now().toString(36)}`;
}

interface DiyState {
  profiles: DiyProfile[];
  brackets: DiyBracket[];
  selectedProfileId: string | null;
  selectedBracketId: string | null;
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
  /** Drop: place the bracket at the ghost position, optionally with computed rotation/connections/position. */
  placeBracket: (patch?: {
    rotation?: DiyBracket['rotation'];
    connectedProfiles?: string[];
    /** Override the placement position (mm) — used to land exactly on a joint corner. */
    position?: { x: number; y: number; z: number };
  }) => void;
  /** Cancel the drag (left viewport / Escape). */
  cancelDraggingBracket: () => void;

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
  pickBracketFace: (info: BracketFacePick) => 'first' | 'placed' | 'rejected' | 'no_overlap';
  /** Cancel two-face bracket placement. */
  cancelBracketFacePicking: () => void;
  /**
   * Auto-algorithm reference bracket rendered translucent blue next to a
   * manually placed bracket, so the two can be compared side by side.
   */
  autoRefBracket: DiyBracket | null;
  setAutoRefBracket: (b: DiyBracket | null) => void;

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
  selectedProfileId: null,
  selectedBracketId: null,
  mode: 'idle',
  stretchProfileId: null,
  stretchEnd: null,
  attachParentId: null,
  attachFace: null,
  attachHitPos: null,

  addRootProfile: (size, pos, dir) => {
    const p: DiyProfile = {
      id: uid(),
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
    // Also remove brackets referencing removed profiles
    set((s) => ({
      profiles: s.profiles.filter((p) => !allToRemove.has(p.id)),
      brackets: s.brackets.filter(
        (b) => !b.connectedProfiles.some((pid) => allToRemove.has(pid)),
      ),
      selectedProfileId: s.selectedProfileId && allToRemove.has(s.selectedProfileId) ? null : s.selectedProfileId,
    }));
  },

  selectProfile: (id) => set({ selectedProfileId: id, selectedBracketId: null }),

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

  placeBracket: (patch?: {
    rotation?: DiyBracket['rotation'];
    connectedProfiles?: string[];
    position?: { x: number; y: number; z: number };
  }) => {
    const { ghostBracket, profiles } = get();
    if (!ghostBracket) return;
    const parent = profiles.find((p) => p.id === ghostBracket.profileId);
    const size = ghostBracket.size;
    const bracket: DiyBracket = {
      id: uid(),
      position: patch?.position ?? ghostBracket.position,
      rotation: patch?.rotation ?? { roll: 0, pitch: 0, yaw: 0 },
      anchorPosition: { x: 0, y: 0, z: 0 },
      anchorRotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedProfiles: patch?.connectedProfiles ?? (parent ? [parent.id] : []),
      enabled: true,
      size,
    };
    set((s) => ({
      brackets: [...s.brackets, bracket],
      selectedBracketId: bracket.id,
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
    const pos = centeredJointPosition(pa, a.normal, pb, info.normal);
    if (!pos) return 'no_overlap';

    // Rotation: R·(1,0,0)=n1, R·(0,1,0)=n2 — the same convention the backend
    // uses for a placed bracket, so the flush corner bracket matches.
    const nx = new THREE.Vector3(a.normal.x, a.normal.y, a.normal.z);
    const ny = new THREE.Vector3(info.normal.x, info.normal.y, info.normal.z);
    const nz = new THREE.Vector3().crossVectors(nx, ny);
    const rotM = new THREE.Matrix4().makeBasis(nx, ny, nz);
    const eul = new THREE.Euler().setFromRotationMatrix(rotM, 'XYZ');

    const dimOf = (id: string) => {
      const p = s.profiles.find((q) => q.id === id);
      return p ? (PROFILE_DIMS[p.profileSize] ?? 30) : 30;
    };

    const bracket: DiyBracket = {
      id: uid(),
      // 0.01 mm precision keeps the mounting faces flush without float noise.
      position: {
        x: Math.round(pos.x * 100) / 100,
        y: Math.round(pos.y * 100) / 100,
        z: Math.round(pos.z * 100) / 100,
      },
      rotation: {
        roll: THREE.MathUtils.radToDeg(eul.x),
        pitch: THREE.MathUtils.radToDeg(eul.y),
        yaw: THREE.MathUtils.radToDeg(eul.z),
      },
      anchorPosition: { x: 0, y: 0, z: 0 },
      anchorRotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedProfiles: [a.profileId, info.profileId],
      enabled: true,
      size: Math.max(dimOf(a.profileId), dimOf(info.profileId)),
    };

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
      selectedBracketId: s.selectedBracketId === id ? null : s.selectedBracketId,
    })),

  selectBracket: (id) => set({ selectedBracketId: id, selectedProfileId: null }),

  editingBracketId: null,
  openBracketEditor: (id) => set({ editingBracketId: id }),

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
