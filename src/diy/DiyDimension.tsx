import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';

const M = 0.001;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** The amber the stretch handle already uses: the annotation and the handle that
 *  produces it are one gesture, and they should not look like two features. */
const INK = '#ffaa00';

/**
 * Sizes are given for a camera REF_DIST away and scaled from there, so what the
 * annotation takes up on SCREEN does not change as the user zooms. That is what
 * a CAD dimension layer does, and it is the difference between a number beside
 * the part and a number sitting on top of it: the same 60 mm standoff that reads
 * well in a close-up is one pixel at the far end of the zoom range.
 *
 * Measured against the reference: 60 mm is about 16 px, and an 8 px arrowhead is
 * 30 mm.
 */
const REF_DIST = 2.5;
/** Lateral standoff of the dimension line from the axis (metres at REF_DIST). */
const OFF = 0.06;
/** Where an extension line starts, clear of the part (metres at REF_DIST). */
const INNER = 0.022;
/** Arrowhead, half of it either side of the dimension line's end. */
const ARROW_H = 0.03;
const ARROW_R = 0.012;
/** Zoom multiplier, clamped so a very close view does not shrink it to nothing
 *  and a very distant one does not push it off the screen. */
const K_MIN = 0.5;
const K_MAX = 5;

/**
 * A live dimension annotation beside a profile, in the manner of a CAD drawing:
 * a dimension line with an arrowhead at each end, thin extension lines running
 * back to the two things being measured, and the number in the middle.
 *
 * It measures one of two spans (`DiyDimension`):
 *
 * - `length` — the profile's own two end faces, which for a post is its height.
 *   Drawn while the stretch handle is being dragged (`DiyStretchGizmo`).
 * - `height` — the ground plane up to the profile's axis, which is the choice a
 *   rail makes while it slides up its post (`useDiyMoveDrag`).
 *
 * WHICH ONE IS ON SCREEN IS DECIDED BY THE STORE, and so is how long it lives:
 * the annotation belongs to a SELECTED profile (`selectProfile` clears it), so
 * letting go of the mouse does not take the number away, but clicking anything
 * else does. See `diyStore.dimension`.
 *
 * Everything except the span itself is recomputed against the camera every
 * frame, which is what puts the line off to the SCREEN-RIGHT of the measured
 * axis (`side` below) rather than at a fixed world offset that would bury it in
 * the solid from half the viewing angles — and, for the vertical cases, what
 * keeps the line horizontal on screen, lying beside the post the way a drawing
 * has it.
 */
const DiyDimension: React.FC = () => {
  const camera = useThree((s) => s.camera);
  const dimension = useDiyStore((s) => s.dimension);
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const profiles = useDiyStore((s) => s.profiles);

  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const tipARef = useRef<THREE.Mesh>(null);
  const tipBRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<THREE.Group>(null);

  const profileId = dimension?.profileId ?? null;
  const kind = dimension?.kind ?? 'length';
  // The selection IS the lifetime: a dimension outlives its drag but not the
  // moment the user turns to another part, and one comparison says both.
  const profile = profileId && profileId === selectedProfileId
    ? profiles.find((p) => p.id === profileId) ?? null
    : null;

  const axis: 'x' | 'y' | 'z' = kind === 'height'
    ? 'y'
    : (profile?.direction.toLowerCase() as 'x' | 'y' | 'z' | undefined) ?? 'y';

  /** What the label reads, in mm. */
  const span = !profile ? 0
    : kind === 'height' ? Math.max(0, profile.position.y)
    : Math.max(1, profile.length);
  /** The same span in the scene's units, which is what the drawing is built in. */
  const spanM = span * M;

  // The far end of the span, as an offset back from the profile's own position.
  // `length` is centred on that position, so it backs off half of it; `height`
  // is measured up from the ground, so it backs off the whole of it — which is
  // precisely what puts the first extension line on the floor.
  const back = kind === 'height' ? span : span / 2;
  const ax = (profile?.position.x ?? 0) - (axis === 'x' ? back : 0);
  const ay = (profile?.position.y ?? 0) - (axis === 'y' ? back : 0);
  const az = (profile?.position.z ?? 0) - (axis === 'z' ? back : 0);

  const dim = (profile ? PROFILE_DIMS[profile.profileSize] : null) ?? 30;
  // How far the part itself reaches sideways toward the camera: the section is
  // square, so the worst case is its diagonal, and below that distance an
  // annotation would start inside the metal.
  const reach = (dim * M * 0.5) * Math.SQRT2 + 0.004;

  // The drawing in its own frame: +X is the lateral offset, +Y runs along the
  // measured axis. Built once per span — the frame loop below only rewrites the
  // three x-coordinates that the zoom scale moves, which is cheaper than
  // rebuilding a geometry every frame and keeps the shape in one place.
  const verts = useMemo(() => new Float32Array([
    INNER, 0, 0, OFF * 1.15, 0, 0,               // extension line at the near end
    INNER, spanM, 0, OFF * 1.15, spanM, 0,       // ...and at the far end
    OFF, 0, 0, OFF, spanM, 0,                    // the dimension line itself
  ]), [spanM]);

  const tmp = useMemo(() => ({
    camDir: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    side: new THREE.Vector3(),
    zAxis: new THREE.Vector3(),
    basis: new THREE.Matrix4(),
  }), []);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    const camDir = camera.getWorldDirection(tmp.camDir);
    const axisVec = tmp.axis.set(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0,
    );

    // Which way is "to the right" on screen, in world space: `camDir × up` is the
    // camera's own +X axis. Projected off the measured axis it is the direction
    // that pushes the line sideways on screen, so it goes beside the part rather
    // than behind it — and it is perpendicular to the view, so the part can never
    // stand between the camera and its own dimension.
    const side = tmp.side.crossVectors(camDir, WORLD_UP).addScaledVector(
      axisVec,
      -tmp.side.dot(axisVec),
    );
    // Looking straight down a vertical axis (or straight along a horizontal one)
    // there is no screen-right left over perpendicular to it: the axis is a
    // single point on screen and the offset has to come from world up instead.
    if (side.lengthSq() < 1e-6) {
      side.copy(WORLD_UP).addScaledVector(axisVec, -WORLD_UP.dot(axisVec));
    }
    // Both degenerate — looking straight down at a vertical dimension. Any
    // perpendicular will do, and the annotation is edge-on and unreadable anyway.
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();

    g.position.set(ax * M, ay * M, az * M);
    g.quaternion.setFromRotationMatrix(
      tmp.basis.makeBasis(side, axisVec, tmp.zAxis.crossVectors(side, axisVec)),
    );

    // Everything below is in metres at the camera's distance, so the drawing
    // keeps its size on screen. `reach` is a floor on both: zoomed right in, the
    // part is wider on screen than the standoff and the annotation has to give
    // way, or it would be drawn across the profile it measures.
    const k = THREE.MathUtils.clamp(
      camera.position.distanceTo(g.position) / REF_DIST, K_MIN, K_MAX,
    );
    const inner = Math.max(INNER * k, reach);
    const off = Math.max(OFF * k, inner + 0.01);
    const outer = off * 1.15;

    // Compared against the buffer itself rather than a remembered copy: a new
    // span rebuilds `verts` at its base sizes, and a cache of the last frame's
    // numbers would then be equal to this frame's and skip the rewrite.
    if (verts[0] !== inner || verts[3] !== outer || verts[12] !== off) {
      verts[0] = inner; verts[3] = outer;
      verts[6] = inner; verts[9] = outer;
      verts[12] = off; verts[15] = off;
      const attr = lineRef.current?.geometry.getAttribute('position');
      if (attr) attr.needsUpdate = true;
    }

    const arrowH = ARROW_H * k;
    tipARef.current?.position.set(off, arrowH / 2, 0);
    tipBRef.current?.position.set(off, spanM - arrowH / 2, 0);
    tipARef.current?.scale.setScalar(k);
    tipBRef.current?.scale.setScalar(k);
    labelRef.current?.position.set(off, spanM / 2, 0);
  });

  if (!profile) return null;

  return (
    <group ref={groupRef}>
      {/* Annotations are an overlay, not scenery: `depthTest` is off so the
          dimension is never chewed up by the ground plane it starts on (the
          first extension line of a height sits exactly on the floor) or by the
          part it is measuring. It is offset laterally, so in practice there is
          nothing it should have been hidden behind. */}
      <lineSegments ref={lineRef} frustumCulled={false} renderOrder={20}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[verts, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={INK} toneMapped={false} depthTest={false} depthWrite={false} />
      </lineSegments>

      {/* Tips on the dimension line, bodies pointing outward into it — the way a
          drawing has them, and the way that keeps them out of the numberless
          middle of a short span. Dropped for a span of nothing (a rail sitting
          on the floor), where the two would only overlap. */}
      {spanM > 0.001 && (
        <>
          <mesh ref={tipARef} rotation={[0, 0, Math.PI]} renderOrder={21}>
            <coneGeometry args={[ARROW_R, ARROW_H, 8]} />
            <meshBasicMaterial color={INK} toneMapped={false} depthTest={false} depthWrite={false} />
          </mesh>
          <mesh ref={tipBRef} renderOrder={21}>
            <coneGeometry args={[ARROW_R, ARROW_H, 8]} />
            <meshBasicMaterial color={INK} toneMapped={false} depthTest={false} depthWrite={false} />
          </mesh>
        </>
      )}

      {/* Plain DOM, so the number stays legible at any zoom and in any language:
          a bare figure and the unit, which needs no translation. */}
      <group ref={labelRef}>
        <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded bg-neutral-900/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-amber-300">
            {Math.round(span)} mm
          </div>
        </Html>
      </group>
    </group>
  );
};

export default DiyDimension;
