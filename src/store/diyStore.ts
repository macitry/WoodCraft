import { create } from 'zustand';
import * as THREE from 'three';
import { fetchBracketRotation } from '../api/modelApi';
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

/** Compute quaternion that maps two source vectors to two target vectors (orthonormal). */
function quatFromTwoVectors(
  s1: THREE.Vector3, s2: THREE.Vector3,
  t1: THREE.Vector3, t2: THREE.Vector3,
): THREE.Quaternion {
  // Build orthonormal frames
  const s3 = new THREE.Vector3().crossVectors(s1, s2).normalize();
  const t3 = new THREE.Vector3().crossVectors(t1, t2).normalize();
  const mS = new THREE.Matrix3().set(
    s1.x, s2.x, s3.x,
    s1.y, s2.y, s3.y,
    s1.z, s2.z, s3.z,
  );
  const mT = new THREE.Matrix3().set(
    t1.x, t2.x, t3.x,
    t1.y, t2.y, t3.y,
    t1.z, t2.z, t3.z,
  );
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix3().multiplyMatrices(mT, mS.transpose()),
  );
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

  // Two-face bracket placement (legacy Ctrl+click)
  bracketFace1: { profileId: string; face: FaceDir; hitPos: { x: number; y: number; z: number }; worldNormal: [number, number, number] } | null;
  bracketFace2: { profileId: string; face: FaceDir; hitPos: { x: number; y: number; z: number }; worldNormal: [number, number, number] } | null;
  selectBracketFace: (profileId: string, face: FaceDir, hitPos: { x: number; y: number; z: number }, worldNormal: [number, number, number]) => void;
  clearBracketFaces: () => void;

  // Attach target: double-click face → purple highlight → place connector from sidebar
  attachTarget: { profileId: string; face: FaceDir; hitPos: { x: number; y: number; z: number } } | null;
  setAttachTargetFromFace: (profileId: string, face: FaceDir, hitPos: { x: number; y: number; z: number }) => void;
  clearAttachTarget: () => void;

  // Place bracket on current attach target
  placeBracketOnTarget: () => void;
  setAttachTarget: (parentId: string, face: FaceDir, hitPos: { x: number; y: number; z: number }) => void;
  clearAttach: () => void;

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

  bracketFace1: null,
  bracketFace2: null,

  selectBracketFace: (profileId, face, hitPos, worldNormal) => {
    const s = get();
    console.log('[Bracket] Face selected:', { profileId: profileId.slice(-6), face, worldNormal });
    if (!s.bracketFace1) {
      set({ bracketFace1: { profileId, face, hitPos, worldNormal }, bracketFace2: null });
      console.log('[Bracket] First face stored.');
    } else if (s.bracketFace1.profileId !== profileId || s.bracketFace1.face !== face) {
      const f1 = s.bracketFace1;
      const f1Axis = f1.face[1].toLowerCase() as 'x' | 'y' | 'z';
      const f2Axis = face[1].toLowerCase() as 'x' | 'y' | 'z';

      // Must be perpendicular faces (different axes)
      if (f1Axis === f2Axis) {
        console.warn('[Bracket] Cannot place on parallel faces. Pick faces with different normals.');
        set({ bracketFace1: { profileId, face, hitPos }, bracketFace2: null }); // reset to this as first
        return;
      }

      set({ bracketFace2: { profileId, face, hitPos } });

      // Get profile dimension for cube size
      const p1 = s.profiles.find((p) => p.id === f1.profileId);
      const p2 = s.profiles.find((p) => p.id === profileId);
      const dim = p1?.profileSize ? ({ '2020': 20, '3030': 30, '4040': 40 }[p1.profileSize] ?? 30) : 30;
      const half = Math.round(dim / 2);
      const f1Sign = f1.face.startsWith('+') ? 1 : -1;
      const f2Sign = face.startsWith('+') ? 1 : -1;

      // Bracket at intersection of two faces:
      // - Face axes: position = face hit + push out by half cube size
      // - Shared axis: use profile center (not click position) for alignment
      const bp = { x: 0, y: 0, z: 0 };
      const sharedAxis = (['x','y','z'] as const).find((a) => a !== f1Axis && a !== f2Axis)!;
      for (const ax of ['x', 'y', 'z'] as const) {
        if (ax === f1Axis) bp[ax] = f1.hitPos[ax] + f1Sign * half;
        else if (ax === f2Axis) bp[ax] = hitPos[ax] + f2Sign * half;
        else bp[ax] = (p2 ?? p1)!.position[sharedAxis]; // shared axis: align to profile
      }

      // Send actual world-space normals to backend
      const n1 = f1.worldNormal;
      const n2 = worldNormal;
      console.log('[Bracket] World normals:', 'f1=', n1, 'f2=', n2);

      // Create bracket with placeholder rotation, then fetch real rotation from backend
      const bracketId = uid();
      const rot = { roll: 0, pitch: 0, yaw: 0 };

      try {
        const bracket: DiyBracket = {
          id: bracketId,
          position: bp,
          rotation: rot,
          anchorPosition: { x: 0, y: 0, z: 0 },
          anchorRotation: { roll: 0, pitch: 0, yaw: 0 },
          connectedProfiles: [f1.profileId, profileId],
          enabled: true,
          size: dim,
        };
        set((st) => ({
          brackets: [...st.brackets, bracket],
          selectedBracketId: bracket.id,
          bracketFace1: null,
          bracketFace2: null,
        }));
        console.log('[Bracket] Created:', bracketId.slice(-6), 'faces:', f1.face, face);

        // Fetch real rotation from backend
        fetchBracketRotation(n1, n2).then((result) => {
          const realRot = { roll: result.roll, pitch: result.pitch, yaw: result.yaw };
          console.log('[Bracket Rot] Backend:', realRot, 'R=', result.rotation_matrix);
          get().updateBracket(bracketId, { rotation: realRot });
        }).catch((err) => {
          console.error('[Bracket Rot] Failed:', err);
        });
      } catch (err) {
        console.error('[Bracket] Error creating bracket:', err);
      }
    } else {
      set({ bracketFace1: null, bracketFace2: null });
    }
  },

  clearBracketFaces: () => set({ bracketFace1: null, bracketFace2: null }),

  attachTarget: null,
  setAttachTargetFromFace: (profileId, face, hitPos) =>
    set({ attachTarget: { profileId, face, hitPos } }),
  clearAttachTarget: () => set({ attachTarget: null }),

  placeBracketOnTarget: () => {
    const { attachTarget, profiles } = get();
    if (!attachTarget) return;
    const parent = profiles.find((p) => p.id === attachTarget.profileId);
    if (!parent) return;
    const dim = { '2020': 20, '3030': 30, '4040': 40 }[parent.profileSize] ?? 30;
    const half = Math.round(dim / 2);
    const axis = attachTarget.face[1].toLowerCase() as 'x' | 'y' | 'z';
    const sign = attachTarget.face.startsWith('+') ? 1 : -1;
    const bp = { ...attachTarget.hitPos };
    bp[axis] += sign * half;

    const bracket: DiyBracket = {
      id: uid(),
      position: bp,
      rotation: { roll: 0, pitch: 0, yaw: 0 },
      anchorPosition: { x: 0, y: 0, z: 0 },
      anchorRotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedProfiles: [attachTarget.profileId],
      enabled: true,
      size: dim,
    };
    set((s) => ({
      brackets: [...s.brackets, bracket],
      selectedBracketId: bracket.id,
      attachTarget: null,
    }));
    console.log('[Bracket] Placed on face:', attachTarget.face, 'at', bp);
  },

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
