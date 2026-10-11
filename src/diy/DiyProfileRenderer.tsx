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
 * It is also the ONLY thing under the pointer that answers for a profile. The
 * box is padded `M * 0.5` on each side and therefore encloses `ProfileStl`, so a
 * ray from outside stops on the box first; `stopPropagation` then keeps the
 * STL's own hit from being reported as a second one. Every face-shaped gesture
 * in this file comes through here, which is why the callbacks are named for the
 * face rather than for the box.
 */
const FaceBox: React.FC<{
  size: [number, number, number];
  isSelected: boolean;
  hoveredFace: number;
  onHoverFace: (faceIdx: number) => void;
  onFaceMove?: (e: any) => void;
  onFaceOut?: () => void;
}> = ({ size, isSelected, hoveredFace, onHoverFace, onFaceMove, onFaceOut }) => {
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
        onFaceMove?.(e);
      }}
      onPointerOut={() => {
        onHoverFace(-1);
        onFaceOut?.();
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
  onPointerDown?: (e: any) => void;
  onFaceMove?: (e: any) => void;
  onFaceOut?: () => void;
}> = ({ profile: p, isSelected, onClick, onPointerDown, onFaceMove, onFaceOut }) => {
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
      onPointerDown={onPointerDown}
      name={p.id}
    >
      <FaceBox
        size={hlSize}
        isSelected={isSelected}
        hoveredFace={hoveredFace}
        onHoverFace={setHoveredFace}
        onFaceMove={onFaceMove}
        onFaceOut={onFaceOut}
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
  const startPlacingProfile = useDiyStore((s) => s.startPlacingProfile);
  const updatePlacingPosition = useDiyStore((s) => s.updatePlacingPosition);
  const cancelPlacing = useDiyStore((s) => s.cancelPlacing);
  const placingProfile = useDiyStore((s) => s.placingProfile);
  const hand = useDiyStore((s) => s.hand);
  const movingPart = useDiyStore((s) => s.movingPart);
  const beginMoveDrag = useDiyMoveDrag();

  if (profiles.length === 0) return null;

  return (
    <group>
      {profiles.map((p) => {
        const isSel = selId === p.id;
        // The face this profile is currently offering to grow a child on. The
        // ghost is transient — it lives exactly as long as the pointer rests on
        // the face — so this is a hover state, not a mode.
        const armedFace = placingProfile?.parentId === p.id ? placingProfile.face : null;

        /**
         * Put the child-profile ghost on the face under the pointer, or walk it
         * along that face if it is already there.
         *
         * This replaces the old Shift+click. The gesture the user asked for is
         * "hover the face, then click to place", and it is layered on the click
         * that already means SELECT — so the ghost only ever appears on the
         * profile that is ALREADY selected. Hovering any other bar does nothing,
         * which is the price of not stealing the selection click.
         *
         * The snap is the same one the ghost used to do: 10 mm along the face,
         * clamped a margin inside its edges, and locked to the parent's own axis
         * on a side face (only `u` or only `v`). Doing it here rather than inside
         * the ghost means the position the pointer produces and the position the
         * store commits are one computation.
         */
        const armChild = (e: any) => {
          if (hand) return;
          if (movingPart) return;
          e.stopPropagation();
          const face = faceFromHit(e);
          if (!face) return;

          const fp = getFacePlane(p, face, PROFILE_DIMS[p.profileSize] ?? 30);
          // `snapToFace` projects onto the face: the component along the normal
          // is thrown away, so it does not matter that the hit landed on the
          // padded highlight box rather than on the profile surface.
          const snapped = snapToFace((e.point as THREE.Vector3).clone(), fp, getFreeAxis(fp, p.direction));
          const pos = {
            x: Math.round(snapped.x * 1000),
            y: Math.round(snapped.y * 1000),
            z: Math.round(snapped.z * 1000),
          };

          // `startPlacing` only on a real change of face — it resets the ghost,
          // and a move within one face is a follow, not a new gesture.
          if (armedFace === face) updatePlacingPosition(pos);
          else startPlacingProfile(p.id, face, pos, p.profileSize);
        };

        /** Pointer left this profile: there is no face under it any more. */
        const disarm = () => {
          if (armedFace) cancelPlacing();
        };

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

          if (!isSel) { select(p.id); return; }

          // Selected: the click is the second half of the hover gesture, and the
          // ghost is already sitting on the face under the pointer. Read it from
          // the store rather than from this render's closure — the arm happened
          // on pointerdown, one event ago, and that re-render may not have landed
          // yet.
          const st = useDiyStore.getState();
          if (st.placingProfile?.parentId === p.id) st.confirmPlacingProfile();
        };

        return (
          <ProfileMesh
            key={p.id}
            profile={p}
            isSelected={isSel}
            onClick={handleClick}
            onFaceMove={isSel ? armChild : undefined}
            onFaceOut={armedFace ? disarm : undefined}
            // Only a part that is already selected may be dragged — see the
            // rationale in `useDiyMoveDrag`.
            //
            // The press also arms the ghost, because a click with no pointer
            // travel in between produces no `pointermove` at all: select a bar
            // and click the same spot again without moving the mouse, and the
            // hover would never have had its chance. A press that turns into a
            // drag takes it back — `armChild` refuses while `movingPart` is set,
            // and the ghost hides itself for the same reason.
            onPointerDown={isSel ? (e) => { armChild(e); beginMoveDrag(e, { kind: 'profile', id: p.id }); } : undefined}
          />
        );
      })}
    </group>
  );
};

export default DiyProfileRenderer;
