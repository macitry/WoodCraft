import { useMemo, Suspense, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import { useDiyStore } from '../store/diyStore';
import { useModelStore } from '../store/modelStore';
import { PROFILE_DIMS } from '../types/furniture';
import type { BracketFacePick } from '../types/furniture';
import { findCornerAt, eulerFromNormals } from './DiyCornerHints';
import { fetchBracketRotation } from '../api/modelApi';
import { logDiyBracket } from './diyLog';

const M = 0.001;

const COLORS: Record<string, string> = {
  '2020': '#8a8a8a',
  '3030': '#a0a0a0',
  '4040': '#b8b8b8',
};

const STL_URLS: Record<string, string> = {
  '2020': '/profiles/profile_2020.stl',
  '3030': '/profiles/profile_3030.stl',
  '4040': '/profiles/profile_4040.stl',
};

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

/**
 * STL model of the actual aluminum extrusion profile.
 * Loaded from DXF-extruded STL, scaled to match dimensions.
 */
const ProfileStl: React.FC<{
  profileSize: string;
  length: number;
  direction: string;
}> = ({ profileSize, length, direction }) => {
  const url = STL_URLS[profileSize] || STL_URLS['3030'];
  const geom = useLoader(STLLoader, url);
  const dim = PROFILE_DIMS[profileSize] ?? 30;
  const lenM = M * Math.max(10, length);

  const cloned = useMemo(() => {
    const g = geom.clone();
    // Center vertices
    const pos = g.getAttribute('position');
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz);
    }
    pos.needsUpdate = true;
    return g;
  }, [geom]);

  // Scale: mm→m, and stretch Z axis to match user length (ref=1000mm)
  const scaleZ = lenM / (1000 * M);
  const scale: [number, number, number] = [M, M, M * scaleZ];

  // Coordinate conversion Z-up → Y-up, then to direction
  const coordQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'));
  const dirE = new THREE.Euler(
    direction === 'Z' ? Math.PI / 2 : 0, 0,
    direction === 'X' ? -Math.PI / 2 : 0, 'YXZ',
  );
  const dirQ = new THREE.Quaternion().setFromEuler(dirE);
  const finalQ = dirQ.clone().multiply(coordQ);
  const finalE = new THREE.Euler().setFromQuaternion(finalQ, 'YXZ');

  return (
    <mesh geometry={cloned} rotation={[finalE.x, finalE.y, finalE.z]} scale={scale}>
      <meshStandardMaterial color="#a0a0a0" metalness={0.7} roughness={0.35} />
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

  console.log(
    '%c[角码对比] 手动·两面对齐 vs 自动·角码提示',
    'color:#ff8844;font-weight:bold',
    {
      '位置·手动(mm)': placed.position,
      '位置·自动(mm)': corner?.position ?? '无角码提示',
      '位置偏差Δ(mm)': delta ?? '无角码提示',
      '面1法向·手动': first.normal,
      '面1法向·自动': corner?.faceA ?? '—',
      '面2法向·手动': second.normal,
      '面2法向·自动': corner?.faceB ?? '—',
      '欧拉·手动(deg)': placed.rotation,
      '欧拉·自动(deg)': corner ? toDeg(eulerFromNormals(corner.faceA, corner.faceB)) : '无角码提示',
    },
  );

  // Show the auto-algorithm result as a translucent blue reference bracket
  // beside the manual one, so the difference is visible in the viewport.
  if (corner) {
    const autoE = eulerFromNormals(corner.faceA, corner.faceB);
    useDiyStore.getState().setAutoRefBracket({
      id: 'auto-ref',
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
      '%c[角码对比] 后端(同一组手动法向)',
      'color:#66ccff;font-weight:bold',
      { '后端Euler(deg)': bdeg, '与手动一致': agree },
    );
  } catch (err) {
    console.warn('[角码对比] 后端请求失败', err);
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
      if (status === 'rejected') {
        useModelStore.getState().setError(
          '两个面必须相互垂直(90°)。角码安装在两个互相垂直的型材面上,请点另一个垂直的面。',
        );
        return;
      }
      if (status === 'no_overlap') {
        useModelStore.getState().setError(
          '这两个面没有相交区域,请点相邻的两个型材面。',
        );
        return;
      }
      if (status === 'no_fit') {
        useModelStore.getState().setError(
          '这个位置的面不够放角码:角码会伸出型材。请换一个离型材端部更远的位置。',
        );
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
