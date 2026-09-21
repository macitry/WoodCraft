import { useMemo } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { DEFAULT_SCREW_FAMILY, screwDims } from './fastenerDims';
import { ScrewMesh as ScrewStlMesh } from './FastenerStl';
import type { DiyScrew } from '../types/furniture';

const M = 0.001;

/** One screw instance: the catalog part, plus a wireframe selection box. */
const ScrewMesh: React.FC<{ screw: DiyScrew; isSelected: boolean }> = ({ screw, isSelected }) => {
  const selectScrew = useDiyStore((s) => s.selectScrew);
  const family = screw.family ?? DEFAULT_SCREW_FAMILY;
  // Sized from the BAKED part, not from a declared table: the box has to frame
  // what is actually drawn, including a length that snapped to another nominal.
  const { part, headD, headH } = useMemo(
    () => screwDims(family, screw.size, screw.length),
    [family, screw.size, screw.length],
  );
  // Wireframe box around the whole screw: head at z < 0, shaft out to `length`.
  const boxMin = Math.min(part.boxMm.min[2], 0);
  const boxCenterZ = (boxMin + part.boxMm.max[2]) / 2;
  const boxLen = part.boxMm.max[2] - boxMin;
  const boxW = Math.max(headD, 7, 2 * headH);

  return (
    <group
      position={[M * screw.position.x, M * screw.position.y, M * screw.position.z]}
      rotation={[
        THREE.MathUtils.degToRad(screw.rotation.roll),
        THREE.MathUtils.degToRad(screw.rotation.pitch),
        THREE.MathUtils.degToRad(screw.rotation.yaw),
      ]}
      scale={M}
      onClick={(e) => {
        e.stopPropagation();
        selectScrew(isSelected ? null : screw.id);
      }}
    >
      <ScrewStlMesh family={family} size={screw.size} length={screw.length} />

      {isSelected && (
        <mesh position={[0, 0, boxCenterZ]} renderOrder={2}>
          <boxGeometry args={[boxW, boxW, Math.max(10, boxLen)]} />
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
