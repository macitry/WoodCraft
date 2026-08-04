import { create } from 'zustand';
import type { MutableRefObject } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type {
  DiyProfile,
  DiyBracket,
  DiyMode,
  ProfileSize,
  AxisDir,
  FaceDir,
} from '../types/furniture';

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
  /** Drop: place the bracket at the ghost position. */
  placeBracket: () => void;
  /** Cancel the drag (left viewport / Escape). */
  cancelDraggingBracket: () => void;

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
    set((s) => ({ profiles: [...s.profiles, p], selectedProfileId: p.id }));
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
  placingProfile: null,

  startDraggingBracket: () => set({ isDraggingBracket: true, ghostBracket: null }),

  updateGhostBracket: (data) => set({ ghostBracket: data }),

  placeBracket: () => {
    const { ghostBracket, profiles } = get();
    if (!ghostBracket) return;
    const parent = profiles.find((p) => p.id === ghostBracket.profileId);
    const size = ghostBracket.size;
    const bracket: DiyBracket = {
      id: uid(),
      position: ghostBracket.position,
      rotation: { roll: 0, pitch: 0, yaw: 0 },
      anchorPosition: { x: 0, y: 0, z: 0 },
      anchorRotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedProfiles: parent ? [parent.id] : [],
      enabled: true,
      size,
    };
    set((s) => ({
      brackets: [...s.brackets, bracket],
      selectedBracketId: bracket.id,
      isDraggingBracket: false,
      ghostBracket: null,
    }));
  },

  cancelDraggingBracket: () => set({ isDraggingBracket: false, ghostBracket: null }),

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
    const dim = ({ '2020': 20, '3030': 30, '4040': 40 } as Record<string, number>)[placingProfile.size] ?? 30;
    const halfDim = dim / 2;

    // Child centre = ghost position + half profile pushed out from the face
    const sign = placingProfile.face.startsWith('+') ? 1 : -1;
    const axis = placingProfile.face[1].toLowerCase() as 'x' | 'y' | 'z';
    const childPos = { ...placingProfile.position };
    childPos[axis] += sign * halfDim;

    // Parent offset along parent's axis
    const parentAxis = parent.direction.toLowerCase() as 'x' | 'y' | 'z';
    const offset = Math.round(placingProfile.position[parentAxis] - parent.position[parentAxis]);

    const child: DiyProfile = {
      id: uid(),
      profileSize: placingProfile.size,
      length: 100,
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
      mode: 'stretching',
      stretchProfileId: child.id,
      stretchEnd: 'end',
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
