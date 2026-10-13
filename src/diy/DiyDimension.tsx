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
/** A measured stretch shorter than this is not drawn at all (mm). A child pushed
 *  flush with the end of its parent closes one of the two gaps of its chain to
 *  nothing, and a zero-length dimension line with two arrowheads on it is a
 *  smudge over the joint rather than a reading. */
const MIN_SPAN_MM = 0.5;

/** One measured stretch, in mm, along the axis the annotation is drawn on, with
 *  the zero at the near end of the bar being measured against. */
interface Span {
  from: number;
  to: number;
}

/**
 * A live dimension annotation beside a part, in the manner of a CAD drawing:
 * a dimension line with an arrowhead at each end, thin extension lines running
 * back to the two things being measured, and the number in the middle.
 *
 * There are two kinds, and the difference between them is the DATUM:
 *
 * - `length` — the profile's own two end faces, which for a post is its height.
 *   Published while the stretch handle is being dragged (`DiyStretchGizmo`).
 * - `anchor` — a child sliding along the parent it is bolted to, measured
 *   against that parent's two ends: how far the child sits from one end, and how
 *   far from the other. Two spans, drawn as a chain (`useDiyMoveDrag`).
 *
 * The ground is deliberately not a datum. It was, for the vertical half of the
 * `anchor` case, and it is the wrong one twice over: a rail pinned 40 mm below
 * the top of its post reads as "40 from the top" and as "560 from the floor",
 * and only the first of those is the number the user is choosing — the second
 * even changes if the post is made taller. It is also a datum that does not
 * exist at all for a child sliding along a horizontal beam, which is why that
 * slide used to show nothing.
 *
 * WHICH ONE IS ON SCREEN IS DECIDED BY THE STORE, and so is how long it lives:
 * the annotation belongs to a SELECTED profile (`selectProfile` clears it), so
 * letting go of the mouse does not take the number away, but clicking anything
 * else does. See `diyStore.dimension`.
 *
 * Everything except the spans themselves is recomputed against the camera every
 * frame, which is what puts the line off to the SCREEN-RIGHT of the measured
 * axis (`side` below) rather than at a fixed world offset that would bury it in
 * the solid from half the viewing angles — and, for a vertical axis, what keeps
 * the line horizontal on screen, lying beside the post the way a drawing has it.
 */
const DiyDimension: React.FC = () => {
  const camera = useThree((s) => s.camera);
  const dimension = useDiyStore((s) => s.dimension);
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const profiles = useDiyStore((s) => s.profiles);

  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const tipARefs = useRef<(THREE.Mesh | null)[]>([]);
  const tipBRefs = useRef<(THREE.Mesh | null)[]>([]);
  const labelRefs = useRef<(THREE.Group | null)[]>([]);
  /** The frame's standoff + span signature, so the vertex rewrite runs when the
   *  scales change or a span is rebuilt — and not on every other frame. */
  const appliedKey = useRef('');

  const profileId = dimension?.profileId ?? null;
  const kind = dimension?.kind ?? 'length';
  // The selection IS the lifetime: a dimension outlives its drag but not the
  // moment the user turns to another part, and one comparison says both.
  const profile = profileId && profileId === selectedProfileId
    ? profiles.find((p) => p.id === profileId) ?? null
    : null;
  // For a slide, the child carries the parent's id and the parent carries the
  // axis, the length and the origin — a rail sliding along a 600 mm beam is
  // positioned against THAT beam, not against its own 300 mm of length.
  const parent = kind === 'anchor' && profile?.parentId
    ? profiles.find((p) => p.id === profile.parentId) ?? null
    : null;

  /** The bar the annotation is drawn against — the part itself, or a child's parent. */
  const datum = kind === 'anchor' ? parent : profile;
  const axis = (datum?.direction.toLowerCase() ?? 'y') as 'x' | 'y' | 'z';

  const spans = useMemo<Span[]>(() => {
    if (!datum || !profile) return [];
    if (kind === 'anchor') {
      const L = datum.length;
      // Where the child's centre sits on the parent, measured from the parent's
      // near end.
      const c = profile.position[axis] - datum.position[axis] + L / 2;
      // The child runs ACROSS the parent on every axis that slides — it is
      // butted into a SIDE face, so its own direction is not the parent's — and
      // the stretch of it that consumes the parent's length is therefore its
      // cross-section, not its length.
      const thick = profile.direction.toLowerCase() === axis
        ? profile.length
        : PROFILE_DIMS[profile.profileSize] ?? 30;
      const half = thick / 2;
      // Both ends of the parent are the datum, so the child gets a number on
      // each side of it: the two gaps a fitter setting this joint would measure.
      return [
        { from: 0, to: Math.max(0, c - half) },
        { from: Math.min(L, c + half), to: L },
      ];
    }
    // A stretch: the profile's own two end faces. The 1 mm floor keeps the
    // drawing alive for a profile squeezed to nothing, where a dimension line
    // collapsing to a point would leave two arrowheads on top of each other.
    return [{ from: 0, to: Math.max(1, datum.length) }];
  }, [datum, profile, kind, axis]);

  // Degenerate spans are dropped rather than drawn: see MIN_SPAN_MM. With a
  // single span this is always the one span, so nothing changes for a stretch.
  const drawn = useMemo(
    () => spans.filter((s) => s.to - s.from > MIN_SPAN_MM),
    [spans],
  );
  const spanKey = drawn.map((s) => `${s.from}/${s.to}`).join('|');

  // The world point the drawing's origin sits on: the near end of the bar being
  // measured against. `length` is centred on the profile's own position, so it
  // backs off half of it.
  const back = (datum?.length ?? 0) / 2;
  const ox = (datum?.position.x ?? 0) - (axis === 'x' ? back : 0);
  const oy = (datum?.position.y ?? 0) - (axis === 'y' ? back : 0);
  const oz = (datum?.position.z ?? 0) - (axis === 'z' ? back : 0);

  // How far the metal reaches sideways toward the camera: the section is square,
  // so the worst case is its diagonal, and below that distance an annotation
  // would start inside the solid. A sliding child's own section counts too — a
  // 4040 rail on a 2020 post is the wide thing at this joint.
  const datumSec = datum ? PROFILE_DIMS[datum.profileSize] ?? 30 : 30;
  const childSec = kind === 'anchor' && profile ? PROFILE_DIMS[profile.profileSize] ?? 30 : 0;
  const reach = Math.max(datumSec, childSec) * M * 0.5 * Math.SQRT2 + 0.004;

  // The drawing in its own frame: +X is the lateral offset, +Y runs along the
  // measured axis. One block of six vertices per span — two extension lines and
  // the dimension line between them — built once per span set. The frame loop
  // below only rewrites the x-coordinates the zoom scale moves, which is cheaper
  // than rebuilding a geometry every frame and keeps the shape in one place.
  const verts = useMemo(() => {
    const arr = new Float32Array(drawn.length * 18);
    drawn.forEach((s, i) => {
      const a = s.from * M;
      const b = s.to * M;
      const o = i * 18;
      arr[o + 0] = INNER; arr[o + 1] = a; arr[o + 2] = 0;       // extension line, near end
      arr[o + 3] = OFF * 1.15; arr[o + 4] = a; arr[o + 5] = 0;
      arr[o + 6] = INNER; arr[o + 7] = b; arr[o + 8] = 0;       // ...and its pair
      arr[o + 9] = OFF * 1.15; arr[o + 10] = b; arr[o + 11] = 0;
      arr[o + 12] = OFF; arr[o + 13] = a; arr[o + 14] = 0;      // the dimension line itself
      arr[o + 15] = OFF; arr[o + 16] = b; arr[o + 17] = 0;
    });
    return arr;
  }, [drawn]);

  const tmp = useMemo(() => ({
    camDir: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    side: new THREE.Vector3(),
    zAxis: new THREE.Vector3(),
    basis: new THREE.Matrix4(),
  }), []);

  useFrame(() => {
    const g = groupRef.current;
    if (!g || drawn.length === 0) return;

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

    g.position.set(ox * M, oy * M, oz * M);
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

    // Keyed on the span set as well as the scales: rebuilding `verts` (a new
    // span, a resized parent) resets it to its base sizes, and a cache that only
    // remembered the scales would consider this frame's numbers unchanged and
    // leave the drawing at its base size for a frame.
    const key = `${spanKey}|${inner.toFixed(6)}|${outer.toFixed(6)}|${off.toFixed(6)}`;
    if (appliedKey.current !== key) {
      appliedKey.current = key;
      for (let i = 0; i < drawn.length; i++) {
        const o = i * 18;
        verts[o + 0] = inner; verts[o + 3] = outer;
        verts[o + 6] = inner; verts[o + 9] = outer;
        verts[o + 12] = off; verts[o + 15] = off;
      }
      const attr = lineRef.current?.geometry.getAttribute('position');
      if (attr) attr.needsUpdate = true;
    }

    // Tips on the dimension line, bodies pointing outward into it — the way a
    // drawing has them, and the way that keeps them out of the numberless middle
    // of a short span.
    const arrowH = ARROW_H * k;
    drawn.forEach((s, i) => {
      const a = s.from * M;
      const b = s.to * M;
      const tipA = tipARefs.current[i];
      const tipB = tipBRefs.current[i];
      tipA?.position.set(off, a + arrowH / 2, 0);
      tipB?.position.set(off, b - arrowH / 2, 0);
      tipA?.scale.setScalar(k);
      tipB?.scale.setScalar(k);
      labelRefs.current[i]?.position.set(off, (a + b) / 2, 0);
    });
  });

  if (!profile || !datum || drawn.length === 0) return null;

  return (
    <group ref={groupRef}>
      {/* Annotations are an overlay, not scenery: `depthTest` is off so a
          dimension is never chewed up by the part it is measuring or by whatever
          is behind it. It is offset laterally, so in practice there is nothing it
          should have been hidden behind. */}
      <lineSegments ref={lineRef} frustumCulled={false} renderOrder={20}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[verts, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={INK} toneMapped={false} depthTest={false} depthWrite={false} />
      </lineSegments>

      {drawn.map((_, i) => (
        <mesh
          key={`ta${i}`}
          ref={(el) => { tipARefs.current[i] = el; }}
          rotation={[0, 0, Math.PI]}
          renderOrder={21}
        >
          <coneGeometry args={[ARROW_R, ARROW_H, 8]} />
          <meshBasicMaterial color={INK} toneMapped={false} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
      {drawn.map((_, i) => (
        <mesh key={`tb${i}`} ref={(el) => { tipBRefs.current[i] = el; }} renderOrder={21}>
          <coneGeometry args={[ARROW_R, ARROW_H, 8]} />
          <meshBasicMaterial color={INK} toneMapped={false} depthTest={false} depthWrite={false} />
        </mesh>
      ))}

      {/* Plain DOM, so the numbers stay legible at any zoom and in any language:
          a bare figure and the unit, which needs no translation. Each span's
          number sits in its own gap, which is what says which end it belongs to
          — the alternative, an arrow or a word per number, needs a language. */}
      {drawn.map((s, i) => (
        <group key={`l${i}`} ref={(el) => { labelRefs.current[i] = el; }}>
          <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div className="whitespace-nowrap rounded bg-neutral-900/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-amber-300">
              {Math.round(s.to - s.from)} mm
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
};

export default DiyDimension;
