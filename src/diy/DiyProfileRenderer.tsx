import { useMemo, Suspense, useState } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';

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
}> = ({ profile: p, isSelected, onClick }) => {
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
    <group position={pos} onClick={onClick} name={p.id}>
      <FaceBox size={hlSize} isSelected={isSelected} hoveredFace={hoveredFace} onHoverFace={setHoveredFace} />
      <Suspense fallback={null}>
        <ProfileStl profileSize={p.profileSize} length={p.length} direction={p.direction} />
      </Suspense>
    </group>
  );
};

const DiyProfileRenderer: React.FC = () => {
  const profiles = useDiyStore((s) => s.profiles);
  const selId = useDiyStore((s) => s.selectedProfileId);
  const select = useDiyStore((s) => s.selectProfile);
  const startPlacingProfile = useDiyStore((s) => s.startPlacingProfile);
  const placingProfile = useDiyStore((s) => s.placingProfile);

  if (profiles.length === 0) return null;

  const getFaceInfo = (e: any) => {
    const n = e.face?.normal?.clone();
    if (!n) return null;
    const wn = n.applyMatrix3(new THREE.Matrix3().getNormalMatrix((e.object as THREE.Mesh).matrixWorld)).normalize();
    const abs = [Math.abs(wn.x), Math.abs(wn.y), Math.abs(wn.z)];
    const mi = abs.indexOf(Math.max(...abs));
    const sgn = [wn.x, wn.y, wn.z][mi] > 0 ? '+' : '-';
    return {
      face: `${sgn}${['X','Y','Z'][mi]}`,
      hitPos: { x: Math.round((e.point as THREE.Vector3).x * 1000), y: Math.round((e.point as THREE.Vector3).y * 1000), z: Math.round((e.point as THREE.Vector3).z * 1000) },
    };
  };

  return (
    <group>
      {profiles.map((p) => {
        const isSel = selId === p.id;
        const isPlacing = placingProfile?.parentId === p.id;

        const handleClick = (e: any) => {
          e.stopPropagation();
          if (!isSel) { select(p.id); return; }
          // If already placing, let DiyPlacingGhost handle confirm/cancel
          if (placingProfile) return;
          // Shift+Click face → enter placing mode
          if (!e.nativeEvent?.shiftKey) return;
          const info = getFaceInfo(e);
          if (!info) return;
          startPlacingProfile(p.id, info.face as any, info.hitPos, p.profileSize);
        };
        return <ProfileMesh key={p.id} profile={p} isSelected={isSel || isPlacing} onClick={handleClick} />;
      })}
    </group>
  );
};

export default DiyProfileRenderer;
