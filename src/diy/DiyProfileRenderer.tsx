import { useMemo, Suspense } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';
import type { FaceDir } from '../types/furniture';

const M = 0.001;
const REFERENCE_LENGTH = 1000; // mm — all profile STLs are 1000mm long

const COLORS: Record<string, string> = {
  '2020': '#8a8a8a',
  '3030': '#a0a0a0',
  '4040': '#b8b8b8',
};

/** STL URL for each profile size. */
const PROFILE_STL: Record<string, string> = {
  '2020': '/profiles/profile_2020.stl',
  '3030': '/profiles/profile_3030.stl',
  '4040': '/profiles/profile_4040.stl',
};

/**
 * Renders a single profile using the real DXF-extruded STL model.
 * Scales the STL (1000mm reference) along the profile axis to match the user length.
 */
const ProfileMesh: React.FC<{
  profile: { id: string; profileSize: string; length: number; position: { x: number; y: number; z: number }; direction: string };
  isSelected: boolean;
  onClick: (e: any) => void;
}> = ({ profile: p, isSelected, onClick }) => {
  const stlUrl = PROFILE_STL[p.profileSize] || PROFILE_STL['3030'];
  const geom = useLoader(STLLoader, stlUrl);
  const cloned = useMemo(() => geom.clone(), [geom]);

  const dim = PROFILE_DIMS[p.profileSize] ?? 30;
  const axIdx = p.direction === 'X' ? 0 : p.direction === 'Y' ? 1 : 2;
  const scale: [number, number, number] = [M, M, M];
  scale[axIdx] *= (p.length / REFERENCE_LENGTH);

  // Step 1: convert backend Z-up → Three.js Y-up (rotate -90° around X)
  const coordQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'),
  );
  // Step 2: rotate Y-up (Z-aligned after conversion) to the desired direction
  const dirQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      p.direction === 'Y' ? Math.PI / 2 : 0,   // Y stays Y (vertical)
      p.direction === 'Z' ? Math.PI / 2 : 0,   // put into Z
      p.direction === 'X' ? Math.PI / 2 : 0,   // put into X
      'XYZ',
    ),
  );
  const combinedQ = coordQ.clone().multiply(dirQ);
  const euler = new THREE.Euler().setFromQuaternion(combinedQ, 'XYZ');
  const rot: [number, number, number] = [euler.x, euler.y, euler.z];

  const pos: [number, number, number] = [
    M * p.position.x,
    M * p.position.y,
    M * p.position.z,
  ];

  return (
    <mesh
      geometry={cloned}
      position={pos}
      rotation={rot}
      scale={scale}
      castShadow
      receiveShadow
      name={p.id}
      onClick={onClick}
    >
      <meshStandardMaterial
        color={isSelected ? '#d4a574' : (COLORS[p.profileSize] || '#a0a0a0')}
        metalness={0.7}
        roughness={0.35}
        emissive={isSelected ? '#ffffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.12 : 0}
      />
    </mesh>
  );
};

/** Fallback box when STL can't be loaded. */
const ProfileBox: React.FC<{
  profile: { id: string; profileSize: string; length: number; position: { x: number; y: number; z: number }; direction: string };
  isSelected: boolean;
  onClick: (e: any) => void;
}> = ({ profile: p, isSelected, onClick }) => {
  const dim = PROFILE_DIMS[p.profileSize] ?? 30;
  const len = Math.max(1, p.length || 0);
  const size: [number, number, number] =
    p.direction === 'X' ? [M * len, M * dim, M * dim] :
    p.direction === 'Y' ? [M * dim, M * len, M * dim] :
    [M * dim, M * dim, M * len];
  const pos: [number, number, number] = [M * p.position.x, M * p.position.y, M * p.position.z];

  return (
    <mesh position={pos} castShadow receiveShadow name={p.id} onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={isSelected ? '#d4a574' : (COLORS[p.profileSize] || '#a0a0a0')}
        metalness={0.7}
        roughness={0.35}
        emissive={isSelected ? '#ffffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.12 : 0}
      />
    </mesh>
  );
};

/** Wraps ProfileMesh in Suspense with ProfileBox fallback. */
const DiyProfileRenderer: React.FC = () => {
  const profiles = useDiyStore((s) => s.profiles);
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const selectProfile = useDiyStore((s) => s.selectProfile);
  const setAttachTarget = useDiyStore((s) => s.setAttachTarget);
  const mode = useDiyStore((s) => s.mode);

  if (profiles.length === 0) return null;

  return (
    <group>
      {profiles.map((p) => {
        const isSel = selectedProfileId === p.id;

        const handleClick = (e: any) => {
          e.stopPropagation();
          if (mode === 'idle') {
            const normal = e.face?.normal?.clone();
            if (normal) {
              const worldNormal = normal
                .applyMatrix3(new THREE.Matrix3().getNormalMatrix((e.object as THREE.Mesh).matrixWorld))
                .normalize();
              const absN = [Math.abs(worldNormal.x), Math.abs(worldNormal.y), Math.abs(worldNormal.z)];
              const maxI = absN.indexOf(Math.max(...absN));
              const sign = [worldNormal.x, worldNormal.y, worldNormal.z][maxI] > 0 ? '+' : '-';
              const axes = ['X', 'Y', 'Z'];
              const face: FaceDir = `${sign}${axes[maxI]}` as FaceDir;
              const hitPos = {
                x: Math.round((e.point as THREE.Vector3).x * 1000),
                y: Math.round((e.point as THREE.Vector3).y * 1000),
                z: Math.round((e.point as THREE.Vector3).z * 1000),
              };
              setAttachTarget(p.id, face, hitPos);
            } else {
              selectProfile(isSel ? null : p.id);
            }
          } else {
            selectProfile(isSel ? null : p.id);
          }
        };

        return (
          <Suspense key={p.id} fallback={<ProfileBox profile={p} isSelected={isSel} onClick={handleClick} />}>
            <ProfileMesh profile={p} isSelected={isSel} onClick={handleClick} />
          </Suspense>
        );
      })}
    </group>
  );
};

export default DiyProfileRenderer;
