import { useMemo, Suspense, useState } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';
import type { FaceDir } from '../types/furniture';
import { ProfileStl } from './ProfileStl';
import { useDiyMoveDrag, consumeJustDragged } from './useDiyMoveDrag';
import { getFacePlane, snapToFace, getFreeAxis } from './diyFacePlane';

const M = 0.001;

/**
 * Box overlay with per-face hover highlight.
 * Hovered face = brighter blue.
 *
 * The highlight is the ONLY thing the hover does now. The box is also what the
 * ray hits first — it is padded `M * 0.5` on each side and therefore encloses
 * `ProfileStl` — but it forwards no gesture of its own: `pointermove` only tints
 * the face under the pointer, and r3f bubbles every click up to the group, which
 * is where both the selection and the double-click live.
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
      onPointerOut={() => {
        onHoverFace(-1);
      }}
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
  onDoubleClick: (e: any) => void;
  onPointerDown?: (e: any) => void;
}> = ({ profile: p, isSelected, onClick, onDoubleClick, onPointerDown }) => {
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
    <group
      position={pos}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      name={p.id}
    >
      <FaceBox
        size={hlSize}
        isSelected={isSelected}
        hoveredFace={hoveredFace}
        onHoverFace={setHoveredFace}
      />
      <Suspense fallback={null}>
        <ProfileStl profileSize={p.profileSize} length={p.length} direction={p.direction} />
      </Suspense>
    </group>
  );
};

/**
 * Which of the six faces of the box the ray came back through, e.g. `"+Z"`.
 *
 * The hit normal is pushed through the target mesh's own `matrixWorld` — it
 * arrives in LOCAL space — and then read for its DOMINANT axis only. The vector
 * itself goes no further.
 */
function faceFromHit(e: any): FaceDir | null {
  const n = e.face?.normal?.clone();
  if (!n) return null;
  const wn = n.applyMatrix3(new THREE.Matrix3().getNormalMatrix((e.object as THREE.Mesh).matrixWorld)).normalize();
  const abs = [Math.abs(wn.x), Math.abs(wn.y), Math.abs(wn.z)];
  const mi = abs.indexOf(Math.max(...abs));
  const sgn = [wn.x, wn.y, wn.z][mi] > 0 ? '+' : '-';
  return `${sgn}${['X', 'Y', 'Z'][mi]}` as FaceDir;
}

const DiyProfileRenderer: React.FC = () => {
  const profiles = useDiyStore((s) => s.profiles);
  const selId = useDiyStore((s) => s.selectedProfileId);
  const select = useDiyStore((s) => s.selectProfile);
  const extendFromFace = useDiyStore((s) => s.extendFromFace);
  const hand = useDiyStore((s) => s.hand);
  const beginMoveDrag = useDiyMoveDrag();

  if (profiles.length === 0) return null;

  return (
    <group>
      {profiles.map((p) => {
        const isSel = selId === p.id;

        /**
         * A single click only ever SELECTS. It used to be the second half of a
         * hover gesture as well, which meant resting the pointer on a bar armed
         * a child-profile ghost, and any click that followed — including the one
         * that ended a move-drag — could commit it. Placing is now the
         * double-click below, so nothing is armed between events and this
         * handler has one job.
         */
        const handleClick = (e: any) => {
          e.stopPropagation();
          // A part is in hand: this click belongs to the viewer, which places at
          // the ghost. r3f's stopPropagation only stops other r3f handlers — it
          // does not stop the DOM event reaching DiyViewer's own click handler —
          // so the two placement paths have to be gated apart explicitly.
          if (hand) return;
          // The click that ends a move-drag is the drag's, not a selection toggle.
          if (consumeJustDragged(p.id)) return;
          if (!faceFromHit(e)) return;

          if (!isSel) select(p.id);
        };

        /**
         * Double-click on a face grows a child profile from that point.
         *
         * Which coordinates the pointer actually gets to choose is `getFacePlane`
         * + `getFreeAxis` + `snapToFace`, and the rule is per kind of face:
         *
         *   side face  — 10 mm grid along the parent's own axis, clamped a margin
         *                 inside the face, centred across it;
         *   END face   — pinned to the face centre, whatever the pointer hit.
         *
         * The end face is the one that had to be told: the child carries the
         * parent's cross-section, so on the face it grows from it is exactly the
         * face's size, and letting the pointer slide it within ±15 mm put a
         * 3030 child 10 mm off its parent's centreline with half of it hanging
         * over the edge — an end-to-end joint that visibly did not line up.
         *
         * Selection is NOT required. Two clicks arrive before a double-click, so
         * requiring it would depend on the re-render from the first click having
         * landed before the second event is dispatched — a race for nothing. The
         * first click selects the bar anyway, so the result is the same.
         */
        const handleDoubleClick = (e: any) => {
          e.stopPropagation();
          if (hand) return;
          const face = faceFromHit(e);
          if (!face) return;

          const fp = getFacePlane(p, face, PROFILE_DIMS[p.profileSize] ?? 30);
          // `snapToFace` projects onto the face: the component along the normal
          // is thrown away, so it does not matter that the hit landed on the
          // padded highlight box rather than on the profile surface.
          const snapped = snapToFace((e.point as THREE.Vector3).clone(), fp, getFreeAxis(fp, p.direction));
          extendFromFace(p.id, face, {
            x: Math.round(snapped.x * 1000),
            y: Math.round(snapped.y * 1000),
            z: Math.round(snapped.z * 1000),
          }, p.profileSize);
        };

        return (
          <ProfileMesh
            key={p.id}
            profile={p}
            isSelected={isSel}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            // Only a part that is already selected may be dragged — see the
            // rationale in `useDiyMoveDrag`.
            onPointerDown={isSel ? (e) => beginMoveDrag(e, { kind: 'profile', id: p.id }) : undefined}
          />
        );
      })}
    </group>
  );
};

export default DiyProfileRenderer;
