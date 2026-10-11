import { useMemo } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { DEFAULT_SCREW_FAMILY, screwDims } from './fastenerDims';
import { ScrewMesh as ScrewStlMesh } from './FastenerStl';
import type { DiyScrew } from '../types/furniture';
import { useDiyMoveDrag, consumeJustDragged } from './useDiyMoveDrag';

const M = 0.001;

/** One screw instance: the catalog part, plus a wireframe selection box. */
const ScrewMesh: React.FC<{ screw: DiyScrew; isSelected: boolean }> = ({ screw, isSelected }) => {
  const selectScrew = useDiyStore((s) => s.selectScrew);
  const hand = useDiyStore((s) => s.hand);
  const beginMoveDrag = useDiyMoveDrag();
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
  // At least 12 mm across: this box is the screw's whole click target, and the
  // head it would otherwise hug is 8 mm — under two pixels at the default view,
  // where the brackets beside it are 30. A screw you cannot hit is a screw you
  // cannot select, and this one has a property panel and a move-drag behind it.
  const boxW = Math.max(headD, 12, 2 * headH);

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
        // In hand → the viewer's click places at the ghost; the click ending a
        // move-drag → the drag's, not a selection toggle.
        if (hand) return;
        if (consumeJustDragged(screw.id)) return;
        selectScrew(isSelected ? null : screw.id);
      }}
      // Only an already-selected screw can be dragged.
      onPointerDown={isSelected ? (e) => beginMoveDrag(e, { kind: 'screw', id: screw.id }) : undefined}
    >
      <ScrewStlMesh family={family} size={screw.size} length={screw.length} />

      {/* ALWAYS mounted, and drawn only when selected. An invisible mesh is
          still raycast, so this box is what makes a placed screw clickable: the
          catalog STL underneath has its `raycast` disabled on purpose (see
          `FastenerStl`) to keep fasteners from punching holes in the bracket
          they sit in, which left the group with nothing to hit until it was
          already selected — a screw could be placed but never picked again, so
          never moved, re-specified or deleted. */}
      <mesh position={[0, 0, boxCenterZ]} renderOrder={2} visible={isSelected}>
        <boxGeometry args={[boxW, boxW, Math.max(10, boxLen)]} />
        <meshBasicMaterial color="#88ccff" wireframe transparent opacity={0.5} depthTest />
      </mesh>
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
