import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';

const M = 0.001;

/**
 * Stretch gizmo — spherical handles at each end of the selected profile.
 * Drag to extend/shrink length.
 *
 * Currently works with onPointerDown/onPointerMove on the handle mesh.
 * Simplified: clicking a handle enters stretch mode, scrolling adjusts length.
 */
const DiyStretchGizmo: React.FC = () => {
  const mode = useDiyStore((s) => s.mode);
  const stretchProfileId = useDiyStore((s) => s.stretchProfileId);
  const profiles = useDiyStore((s) => s.profiles);
  const updateProfileLength = useDiyStore((s) => s.updateProfileLength);
  const setStretchProfile = useDiyStore((s) => s.setStretchProfile);

  const profile = profiles.find((p) => p.id === stretchProfileId);
  if (!profile) return null;

  const dim = PROFILE_DIMS[profile.profileSize] ?? 30;
  const len = Math.max(1, profile.length || 0);
  const halfLen = (len * M) / 2;
  const radius = Math.max(0.005, (dim * M) / 2 + 0.012);
  const pos: [number, number, number] = [
    M * profile.position.x,
    M * profile.position.y,
    M * profile.position.z,
  ];
  const axIdx = profile.direction === 'X' ? 0 : profile.direction === 'Y' ? 1 : 2;

  const endOffset = (sign: number): [number, number, number] => {
    const v: [number, number, number] = [0, 0, 0];
    v[axIdx] = sign * halfLen;
    return v;
  };

  const startPos: [number, number, number] = [
    pos[0] + endOffset(-1)[0],
    pos[1] + endOffset(-1)[1],
    pos[2] + endOffset(-1)[2],
  ];
  const endPos: [number, number, number] = [
    pos[0] + endOffset(1)[0],
    pos[1] + endOffset(1)[1],
    pos[2] + endOffset(1)[2],
  ];

  return (
    <group>
      {/* Start handle (red) */}
      <mesh
        position={startPos}
        onClick={(e) => {
          e.stopPropagation();
          if (mode === 'stretching' && stretchProfileId === profile.id) {
            setStretchProfile(null, null);
          } else {
            setStretchProfile(profile.id, 'start');
          }
        }}
      >
        <sphereGeometry args={[radius, 16, 16]} />
        <meshStandardMaterial
          color={mode === 'stretching' && stretchProfileId === profile.id ? '#ff4400' : '#ff6644'}
          emissive={mode === 'stretching' ? '#ff4400' : '#000000'}
          emissiveIntensity={mode === 'stretching' ? 0.4 : 0}
          roughness={0.2}
        />
      </mesh>

      {/* End handle (green) */}
      <mesh
        position={endPos}
        onClick={(e) => {
          e.stopPropagation();
          if (mode === 'stretching' && stretchProfileId === profile.id) {
            setStretchProfile(null, null);
          } else {
            setStretchProfile(profile.id, 'end');
          }
        }}
      >
        <sphereGeometry args={[radius, 16, 16]} />
        <meshStandardMaterial
          color={mode === 'stretching' && stretchProfileId === profile.id ? '#44ff00' : '#66ff44'}
          emissive={mode === 'stretching' ? '#44ff00' : '#000000'}
          emissiveIntensity={mode === 'stretching' ? 0.4 : 0}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
};

export default DiyStretchGizmo;
