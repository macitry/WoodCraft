import { useCallback, useMemo, type FC } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { LocalFastener } from '../utils/accessoryKits';
import { useKitLayoutStore } from '../store/kitLayoutStore';

const M = 0.001;

/**
 * 1 mm, deliberately not the 10 mm the profile tools snap to: the unit here is a
 * bolt sitting in a slot, not an extrusion on a grid. It is also literally the
 * unit of the numbers in the panel, because the editor previews at scale 1.
 */
const SNAP_MM = 1;

/** Where the pointer grabs an axis: the cone's centre, 8 mm out from the part.
 *  Sized against the parts being moved (an M6 bolt is 18 mm end to end), not
 *  against the scene: an arrow big enough to look tidy on an empty viewport
 *  swallows the thing it is meant to position. */
const ARM_M = 0.008;
const CONE_M = 0.003;
const SHAFT_M = 0.0012;
/** The shaft stops where the cone starts, so the arrow spans 0 → ARM + CONE. */
const SHAFT_LEN_M = ARM_M - CONE_M;

const AXES: { index: 0 | 1 | 2; dir: THREE.Vector3; color: string }[] = [
  { index: 0, dir: new THREE.Vector3(1, 0, 0), color: '#e06a6a' },
  { index: 1, dir: new THREE.Vector3(0, 1, 0), color: '#5fc47d' },
  { index: 2, dir: new THREE.Vector3(0, 0, 1), color: '#5b93e0' },
];

/** Pointer position in normalised device coordinates. */
const ndc = (e: { clientX: number; clientY: number }, rect: DOMRect) =>
  new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );

export interface PartDragGizmoProps {
  fastener: LocalFastener;
  /** The part's UNEDITED seat position (catalog mm) — the delta's origin. */
  base: [number, number, number];
  setKey: string;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  /** Orbit is disabled mid-drag, so the scene must not treat the release as a
   *  click on empty space and drop the selection. */
  onDragChange: (dragging: boolean) => void;
}

/**
 * Three axis arrows that drag the selected part, 1 mm at a time.
 *
 * Drag maths: the pointer ray is intersected with the plane that CONTAINS the
 * axis and faces the camera, and the hit is projected onto the axis. (The
 * existing DiyStretchGizmo instead makes the axis the plane's normal and then
 * measures a distance within that plane, so motion across the axis leaks into
 * the value; projecting onto the axis does not.) Axes are the assembly's own —
 * the editor runs at the identity transform with no parent rotation, so local
 * and world axes coincide and no part rotation has to be folded in.
 */
const PartDragGizmo: FC<PartDragGizmoProps> = ({
  fastener,
  base,
  setKey,
  controlsRef,
  onDragChange,
}) => {
  const { camera, gl } = useThree();
  const setPartPosition = useKitLayoutStore((s) => s.setPartPosition);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(), []);

  // Recomputed per render rather than memoised: `fastener` is rebuilt by
  // jointFasteners on every layout change, so a dependency on it would never hit
  // the cache anyway. One Vector3 is not worth chasing.
  const start = new THREE.Vector3(
    fastener.position[0],
    fastener.position[1],
    fastener.position[2],
  ).multiplyScalar(M);

  const onDown = useCallback(
    (axis: THREE.Vector3, index: 0 | 1 | 2) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      // Dev-only, same convention as `__wcFastenerCount`: a headless test can
      // then tell "the pointer missed the arrow" from "the drag maths is wrong",
      // which are otherwise the same symptom — nothing moves.
      if (import.meta.env.DEV) {
        const w = window as unknown as { __wcKitDragStarts?: number };
        w.__wcKitDragStarts = (w.__wcKitDragStarts ?? 0) + 1;
      }

      // A plane through the part containing the axis, tilted to face the camera.
      // Looking straight down the axis leaves no such plane, so that case is a
      // no-op rather than a jump.
      const normal = camera.getWorldDirection(new THREE.Vector3());
      normal.addScaledVector(axis, -normal.dot(axis));
      if (normal.lengthSq() < 1e-8) return;
      plane.setFromNormalAndCoplanarPoint(normal.normalize(), start);

      const canvas = gl.domElement;
      const rect0 = canvas.getBoundingClientRect();
      raycaster.setFromCamera(ndc(e.nativeEvent, rect0), camera);
      const hit0 = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit0)) return;
      const t0 = hit0.sub(start).dot(axis);

      const startValue = fastener.position.slice() as [number, number, number];

      if (controlsRef.current) controlsRef.current.enabled = false;
      onDragChange(true);

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        raycaster.setFromCamera(ndc(ev, rect), camera);
        const hit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, hit)) return;
        // Travel along the axis since the drag began, in catalog mm.
        const deltaMm = (hit.sub(start).dot(axis) - t0) / M;
        const next = startValue.slice() as [number, number, number];
        next[index] = Math.round((startValue[index] + deltaMm) / SNAP_MM) * SNAP_MM;
        setPartPosition(setKey, fastener.key, base, next);
      };

      const onUp = () => {
        if (controlsRef.current) controlsRef.current.enabled = true;
        onDragChange(false);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointerleave', onUp);
      };

      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerleave', onUp);
    },
    [camera, gl, plane, raycaster, start, setKey, base, fastener.key, fastener.position, setPartPosition, controlsRef, onDragChange],
  );

  return (
    <group>
      {AXES.map(({ index, dir, color }) => {
        // Cylinder and cone both default to +Y; rotate each onto its own axis.
        const rot: [number, number, number] =
          index === 0 ? [0, 0, -Math.PI / 2] : index === 1 ? [0, 0, 0] : [Math.PI / 2, 0, 0];
        const mid = dir.clone().multiplyScalar(SHAFT_LEN_M / 2);
        const tip = dir.clone().multiplyScalar(ARM_M);
        const mat = (
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.35} />
        );
        return (
          <group key={index} position={[start.x, start.y, start.z]} onPointerDown={onDown(dir, index)}>
            {/* The meshes are not optional: R3F's `<coneGeometry>` inside a plain
                `<group>` attaches the geometry to the Group itself, and a Group
                neither draws nor raycasts — the arrow would be invisible AND
                undraggable, silently. */}
            <mesh position={[mid.x, mid.y, mid.z]} rotation={rot}>
              <cylinderGeometry args={[SHAFT_M, SHAFT_M, SHAFT_LEN_M, 8]} />
              {mat}
            </mesh>
            <mesh position={[tip.x, tip.y, tip.z]} rotation={rot}>
              <coneGeometry args={[CONE_M, CONE_M * 2, 12]} />
              {mat}
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

export default PartDragGizmo;
