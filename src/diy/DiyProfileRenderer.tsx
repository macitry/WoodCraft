import { useMemo, Suspense, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { useModelStore } from '../store/modelStore';
import { PROFILE_DIMS } from '../types/furniture';
import type { BracketFacePick } from '../types/furniture';
import { findCornerAt, eulerFromNormals } from './DiyCornerHints';
import { fetchBracketRotation } from '../api/modelApi';
import { logDiyBracket } from './diyLog';
import { ProfileStl } from './ProfileStl';
import { t } from '../i18n';

const M = 0.001;

/**
 * Box overlay with per-face hover highlight.
 * Hovered face = brighter blue.
 */
const FaceBox: React.FC<{
  size: [number, number, number];
  isSelected: boolean;
  hoveredFace: number;
  onHoverFace: (faceIdx: number) => void;
}> = ({ size, isSelected, hoveredFace, onHoverFace }) => {
  const baseColor = isSelected ? '#5599cc' : '#335577';
  const hoverColor = isSelected ? '#aaddff' : '#6699bb';

  const materials = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const isHov = i === hoveredFace;
      return new THREE.MeshBasicMaterial({
        color: isHov ? hoverColor : baseColor,
        transparent: true,
        opacity: isHov ? 0.55 : 0.18,
        depthTest: true,
      });
    }), [hoveredFace, baseColor, hoverColor]);

  return (
    <mesh
      renderOrder={1}
      onPointerMove={(e) => {
        e.stopPropagation();
        // BoxGeometry: each face has 2 triangles, faceIndex maps to face 0-5
        const fi = e.faceIndex != null ? Math.floor(e.faceIndex / 2) : -1;
        onHoverFace(fi);
      }}
      onPointerOut={() => onHoverFace(-1)}
    >
      <boxGeometry args={size} />
      {materials.map((mat, i) => (
        <primitive key={i} object={mat} attach={`material-${i}`} />
      ))}
    </mesh>
  );
};

/** Combined: face-highlight box + STL model inside. */
const ProfileMesh: React.FC<{
  profile: { id: string; profileSize: string; length: number; position: { x: number; y: number; z: number }; direction: string };
  isSelected: boolean;
  onClick: (e: any) => void;
  onDoubleClick?: (e: any) => void;
}> = ({ profile: p, isSelected, onClick, onDoubleClick }) => {
  const dim = PROFILE_DIMS[p.profileSize] ?? 30;
  const lenM = M * Math.max(10, p.length);
  const dimM = M * dim;

  const size: [number, number, number] =
    p.direction === 'X' ? [lenM, dimM, dimM] :
    p.direction === 'Y' ? [dimM, lenM, dimM] :
    [dimM, dimM, lenM];

  // Slightly larger highlight box to prevent overlap with STL
  const pad = M * 0.5; // 0.5mm per side
  const hlSize: [number, number, number] = [size[0] + pad, size[1] + pad, size[2] + pad];

  const pos: [number, number, number] = [M * p.position.x, M * p.position.y, M * p.position.z];

  const [hoveredFace, setHoveredFace] = useState(-1);

  return (
    <group position={pos} onClick={onClick} onDoubleClick={onDoubleClick} name={p.id}>
      <FaceBox size={hlSize} isSelected={isSelected} hoveredFace={hoveredFace} onHoverFace={setHoveredFace} />
      <Suspense fallback={null}>
        <ProfileStl profileSize={p.profileSize} length={p.length} direction={p.direction} />
      </Suspense>
    </group>
  );
};

/** Face info extracted from a raycast click on a profile mesh. */
interface FaceClickInfo {
  /** Dominant-axis face name, e.g. "+X". */
  face: string;
  /** Outward unit normal in world mm frame. */
  normal: { x: number; y: number; z: number };
  /** Hit position rounded to integer mm (used by child-profile placement). */
  hitPos: { x: number; y: number; z: number };
  /** Hit position at full precision mm (used by bracket face picking). */
  hitRaw: { x: number; y: number; z: number };
}

function getFaceInfo(e: any): FaceClickInfo | null {
  const n = e.face?.normal?.clone();
  if (!n) return null;
  const wn = n.applyMatrix3(new THREE.Matrix3().getNormalMatrix((e.object as THREE.Mesh).matrixWorld)).normalize();
  const abs = [Math.abs(wn.x), Math.abs(wn.y), Math.abs(wn.z)];
  const mi = abs.indexOf(Math.max(...abs));
  const sgn = [wn.x, wn.y, wn.z][mi] > 0 ? '+' : '-';
  const p = e.point as THREE.Vector3;
  return {
    face: `${sgn}${['X', 'Y', 'Z'][mi]}`,
    normal: { x: wn.x, y: wn.y, z: wn.z },
    hitPos: { x: Math.round(p.x * 1000), y: Math.round(p.y * 1000), z: Math.round(p.z * 1000) },
    hitRaw: { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000 },
  };
}

/**
 * Manual two-face placement → compare against the auto corner-hint pipeline.
 *
 * Ground truth: the bracket is placed where the two clicked face planes meet.
 * We log the auto corner hint (findCornerAt) at the same joint, plus what the
 * backend returns for the same normals, so a mismatch between the two methods
 * is visible in the console.
 */
async function runFaceComparison(first: BracketFacePick, second: BracketFacePick) {
  const state = useDiyStore.getState();
  const placed = state.brackets[state.brackets.length - 1];
  if (!placed) return;

  const corner = findCornerAt(state.profiles, placed.position);
  const toDeg = (e: THREE.Euler) => ({
    roll: +THREE.MathUtils.radToDeg(e.x).toFixed(2),
    pitch: +THREE.MathUtils.radToDeg(e.y).toFixed(2),
    yaw: +THREE.MathUtils.radToDeg(e.z).toFixed(2),
  });

  const delta = corner
    ? {
        x: +(placed.position.x - corner.position.x).toFixed(2),
        y: +(placed.position.y - corner.position.y).toFixed(2),
        z: +(placed.position.z - corner.position.z).toFixed(2),
      }
    : null;

  // Dev-only comparison harness. Its keys are deliberately NOT dictionary
  // entries: nothing here is drawn, so a translated key would only mean the log
  // reads one way and the code that greps it reads another. English because the
  // values beside these keys — `normal`, `rotation`, `Euler` — already are.
  console.log(
    '%c[corner-compare] manual face-pair vs auto corner hint',
    'color:#ff8844;font-weight:bold',
    {
      'pos.manual(mm)': placed.position,
      'pos.auto(mm)': corner?.position ?? 'no corner hint',
      'delta(mm)': delta ?? 'no corner hint',
      'face1.normal.manual': first.normal,
      'face1.normal.auto': corner?.faceA ?? '—',
      'face2.normal.manual': second.normal,
      'face2.normal.auto': corner?.faceB ?? '—',
      'euler.manual(deg)': placed.rotation,
      'euler.auto(deg)': corner ? toDeg(eulerFromNormals(corner.faceA, corner.faceB)) : 'no corner hint',
    },
  );

  // Show the auto-algorithm result as a translucent blue reference bracket
  // beside the manual one, so the difference is visible in the viewport.
  if (corner) {
    const autoE = eulerFromNormals(corner.faceA, corner.faceB);
    useDiyStore.getState().setAutoRefBracket({
      id: 'auto-ref',
      connectorId: 'corner_bracket',
      position: { x: corner.position.x, y: corner.position.y, z: corner.position.z },
      rotation: {
        roll: THREE.MathUtils.radToDeg(autoE.x),
        pitch: THREE.MathUtils.radToDeg(autoE.y),
        yaw: THREE.MathUtils.radToDeg(autoE.z),
      },
      anchorPosition: { x: 0, y: 0, z: 0 },
      anchorRotation: { roll: 0, pitch: 0, yaw: 0 },
      connectedProfiles: [corner.profileIdA, corner.profileIdB],
      enabled: true,
      size: placed.size,
    });
  }

  // Persistent record: position + pose + the two double-clicked faces.
  const profOf = (id: string) => {
    const p = state.profiles.find((q) => q.id === id);
    return p
      ? { id: p.id, size: p.profileSize, direction: p.direction, length: p.length, position: p.position }
      : null;
  };
  logDiyBracket('bracket_placed', {
    method: 'two_face_doubleclick',
    position: placed.position,
    rotation: placed.rotation,
    size: placed.size,
    faces: [
      { ...first, profile: profOf(first.profileId) },
      { ...second, profile: profOf(second.profileId) },
    ],
    connectedProfiles: placed.connectedProfiles,
  });

  // Cross-check: the backend given the same two normals must agree with the
  // local euler — if not, the rotation convention differs somewhere.
  try {
    const res = await fetchBracketRotation(
      [first.normal.x, first.normal.y, first.normal.z],
      [second.normal.x, second.normal.y, second.normal.z],
    );
    const m = new THREE.Matrix4().set(
      res.rotation_matrix[0][0], res.rotation_matrix[1][0], res.rotation_matrix[2][0], 0,
      res.rotation_matrix[0][1], res.rotation_matrix[1][1], res.rotation_matrix[2][1], 0,
      res.rotation_matrix[0][2], res.rotation_matrix[1][2], res.rotation_matrix[2][2], 0,
      0, 0, 0, 1,
    );
    const be = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
    const bdeg = toDeg(be);
    const agree =
      Math.abs(bdeg.roll - placed.rotation.roll) < 0.5 &&
      Math.abs(bdeg.pitch - placed.rotation.pitch) < 0.5 &&
      Math.abs(bdeg.yaw - placed.rotation.yaw) < 0.5;
    console.log(
      '%c[corner-compare] backend, same manual normals',
      'color:#66ccff;font-weight:bold',
      { 'backend.euler(deg)': bdeg, 'agreesWithManual': agree },
    );
  } catch (err) {
    console.warn('[corner-compare] backend request failed', err);
  }
}

const DiyProfileRenderer: React.FC = () => {
  const profiles = useDiyStore((s) => s.profiles);
  const selId = useDiyStore((s) => s.selectedProfileId);
  const select = useDiyStore((s) => s.selectProfile);
  const startPlacingProfile = useDiyStore((s) => s.startPlacingProfile);
  const placingProfile = useDiyStore((s) => s.placingProfile);
  const mode = useDiyStore((s) => s.mode);
  const pickBracketFace = useDiyStore((s) => s.pickBracketFace);
  const startBracketFacePicking = useDiyStore((s) => s.startBracketFacePicking);
  const cancelBracketFacePicking = useDiyStore((s) => s.cancelBracketFacePicking);

  // Escape cancels two-face bracket placement.
  useEffect(() => {
    if (mode !== 'placing_bracket_faces') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelBracketFacePicking();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, cancelBracketFacePicking]);

  const handleBracketFacePick = useCallback(
    async (second: BracketFacePick) => {
      const first = useDiyStore.getState().bracketFaceA;
      const status = pickBracketFace(second);
      // Module `t`, not the hook's: the message is composed here and stored in
      // the store, so it is a value written at pick time rather than a label
      // that re-renders. A hook handle captured in this `useCallback` would go
      // stale the moment the language changed.
      if (status === 'rejected') {
        useModelStore.getState().setError(t('diy.errNotPerpendicular'));
        return;
      }
      if (status === 'no_overlap') {
        useModelStore.getState().setError(t('diy.errNoOverlap'));
        return;
      }
      if (status === 'no_fit') {
        useModelStore.getState().setError(t('diy.errNoFit'));
        return;
      }
      if (status === 'placed' && first) {
        useModelStore.getState().setError(null); // clear stale error banners
        await runFaceComparison(first, second);
      }
    },
    [pickBracketFace],
  );

  if (profiles.length === 0) return null;

  return (
    <group>
      {profiles.map((p) => {
        const isSel = selId === p.id;
        const isPlacing = placingProfile?.parentId === p.id;

        const handleClick = (e: any) => {
          e.stopPropagation();
          const info = getFaceInfo(e);
          if (!info) return;

          if (mode === 'placing_bracket_faces') {
            // Skip the 2nd click of a double-click — onDoubleClick owns it.
            if ((e.nativeEvent as PointerEvent)?.detail > 1) return;
            void handleBracketFacePick({
              profileId: p.id,
              face: info.face,
              normal: info.normal,
              hit: info.hitRaw,
            });
            return;
          }

          if (!isSel) { select(p.id); return; }
          // If already placing, let DiyPlacingGhost handle confirm/cancel
          if (placingProfile) return;
          // Shift+Click face → enter placing mode
          if (!e.nativeEvent?.shiftKey) return;
          startPlacingProfile(p.id, info.face as any, info.hitPos, p.profileSize);
        };

        // Double-click a face starts two-face bracket placement and records
        // that face as the first pick (the user's original "依次双击两个面").
        const handleDoubleClick = (e: any) => {
          e.stopPropagation();
          if (mode !== 'idle') return;
          const info = getFaceInfo(e);
          if (!info) return;
          startBracketFacePicking();
          pickBracketFace({ profileId: p.id, face: info.face, normal: info.normal, hit: info.hitRaw });
        };

        return (
          <ProfileMesh
            key={p.id}
            profile={p}
            isSelected={isSel || isPlacing}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          />
        );
      })}
    </group>
  );
};

export default DiyProfileRenderer;
