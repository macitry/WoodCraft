import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import { useDiyStore } from '../store/diyStore';
import { buildScrewGroup } from './DiyScrewGeometry';
import { SCREW_HEAD_DIMS } from '../types/furniture';
import type { DiyScrew } from '../types/furniture';

const M = 0.001;

/** STL screw model (entry point for real models) — centred, scaled to ~8mm. */
const ScrewStl: React.FC<{ url: string }> = ({ url }) => {
  const geom = useLoader(STLLoader, url);

  const cloned = useMemo(() => {
    const g = geom.clone();
    const pos = g.getAttribute('position');
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const s = ext > 0 ? M * 8 / ext : M;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (pos.getX(i) - cx) * s, (pos.getY(i) - cy) * s, (pos.getZ(i) - cz) * s);
    }
    pos.needsUpdate = true;
    return g;
  }, [geom]);

  return (
    <mesh geometry={cloned}>
      <meshStandardMaterial color="#c8c8c8" metalness={0.85} roughness={0.32} />
    </mesh>
  );
};

/** One screw instance: procedural geometry (or stlUrl override) + selection box. */
const ScrewMesh: React.FC<{ screw: DiyScrew; isSelected: boolean }> = ({ screw, isSelected }) => {
  const selectScrew = useDiyStore((s) => s.selectScrew);
  const group = useMemo(
    () => buildScrewGroup(screw.size, screw.length),
    [screw.size, screw.length],
  );
  const { headD, headH } = SCREW_HEAD_DIMS[screw.size];
  // Wireframe box around the whole screw (head + shaft).
  const boxCenterZ = (screw.length - 2 * headH) / 2;
  const boxW = Math.max(headD, 7);

  return (
    <group
      position={[M * screw.position.x, M * screw.position.y, M * screw.position.z]}
      rotation={[
        THREE.MathUtils.degToRad(screw.rotation.roll),
        THREE.MathUtils.degToRad(screw.rotation.pitch),
        THREE.MathUtils.degToRad(screw.rotation.yaw),
      ]}
      onClick={(e) => {
        e.stopPropagation();
        selectScrew(isSelected ? null : screw.id);
      }}
    >
      {screw.stlUrl ? (
        <Suspense fallback={null}>
          <ScrewStl url={screw.stlUrl} />
        </Suspense>
      ) : (
        <primitive object={group} scale={M} />
      )}

      {isSelected && (
        <mesh position={[0, 0, M * boxCenterZ]} renderOrder={2}>
          <boxGeometry args={[M * boxW, M * boxW, M * Math.max(10, screw.length)]} />
          <meshBasicMaterial color="#88ccff" wireframe transparent opacity={0.5} depthTest />
        </mesh>
      )}
    </group>
  );
};

const DiyScrewRenderer: React.FC = () => {
  const screws = useDiyStore((s) => s.screws);
  const selectedScrewId = useDiyStore((s) => s.selectedScrewId);

  return (
    <group>
      {screws
        .filter((s) => s.enabled)
        .map((s) => (
          <ScrewMesh key={s.id} screw={s} isSelected={s.id === selectedScrewId} />
        ))}
    </group>
  );
};

export default DiyScrewRenderer;
