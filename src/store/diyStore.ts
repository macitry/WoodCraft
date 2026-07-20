import { create } from 'zustand';
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
  removeProfile: (id: string) => void;
  selectProfile: (id: string | null) => void;
  setStretchProfile: (id: string | null, end: 'start' | 'end' | null) => void;
  updateProfileLength: (id: string, length: number) => void;
  setMode: (mode: DiyMode) => void;
  setAttachTarget: (parentId: string, face: FaceDir, hitPos: { x: number; y: number; z: number }) => void;
  clearAttach: () => void;

  // Bracket actions
  addBracket: (b: DiyBracket) => void;
  updateBracket: (id: string, patch: Partial<DiyBracket>) => void;
  removeBracket: (id: string) => void;
  selectBracket: (id: string | null) => void;

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
      length: Math.max(20, 500),
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
      length: 300, // default child length
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
      profiles: s.profiles.map((p) =>
        p.id === id ? { ...p, length: Math.max(20, Math.round(length || 20)) } : p,
      ),
    })),

  setMode: (mode) => set({ mode }),

  setAttachTarget: (parentId, face, hitPos) =>
    set({
      attachParentId: parentId,
      attachFace: face,
      attachHitPos: hitPos,
      mode: 'selecting_direction',
    }),

  clearAttach: () =>
    set({
      attachParentId: null,
      attachFace: null,
      attachHitPos: null,
      mode: 'idle',
    }),

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
