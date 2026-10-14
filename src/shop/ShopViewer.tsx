import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import Lighting from '../viewer/Lighting';
import { useT } from '../i18n';
import { PROFILE_DIMS, type ProfileSize } from '../types/furniture';
import type { ShopModel, ShopPart, ShopPose } from './shopApi';

/**
 * The customer page's 3D view.
 *
 * It is small on purpose, and it is NOT `FurnitureViewer`. That component, and
 * `Scene` and `ModelLoader` underneath it, is the professional editor's viewer:
 * it subscribes to `useModelStore` for the selected component, the bracket
 * instances, the drilled holes and the mate workflow, and it decides where each
 * part goes from `TEMPLATE_LAYOUTS` plus the current parameters. Handing a
 * customer that chain would hand them the whole editor to get a picture out of
 * it.
 *
 * What it renders instead is what the SERVER says: nine parts, each with a
 * `pose`, placed where the pose puts them. Two kinds of part arrive through the
 * same door and it does not much care which it got:
 *
 *   - a finished one, with an `stl_url` — draw the mesh;
 *   - a solver-only one, with `stl_url: null` — draw a BOX of the same size.
 *
 * The second is what makes the right-hand pane follow a slider. It needs no
 * furniture knowledge at all: `_solver_only_generate` in server.py already
 * returns every part's real pose and real dimensions, and
 * `desk_builder.py` extrudes along Z with `direction="symmetric"` and then
 * centres the solid, so a centred box built in the same local frame lands
 * exactly where the real extrusion will. Hence "section in XY, length along Z"
 * in `boxSize` below — it is the same convention, not a guess.
 */

/** The server measures in millimetres; the scene is in metres. */
const MM = 0.001;

/** What to draw for a part with no cross-section of its own. Every real profile
 *  is in `PROFILE_DIMS`; this only catches a section the backend adds before
 *  the front end learns about it. */
const FALLBACK_SECTION_MM = 30;

/**
 * Where a part sits and which way it faces.
 *
 * The pose mapping is copied from `ModelLoader.tsx`, and it is not a
 * reinvention: the server is Z-up and three.js is Y-up, so the server's `y`
 * lands on the scene's `z` and the server's `z` on the scene's `y`. The Euler
 * is `ZYX` for the same reason — that is the order the rest of this codebase
 * reads the server's angles in, and two viewers disagreeing about it would be a
 * bug that only shows up on a part rotated on two axes at once.
 */
function usePartTransform(pose: ShopPose | null) {
  return useMemo(() => {
    const position = new THREE.Vector3(
      (pose?.x ?? 0) * MM,
      (pose?.z ?? 0) * MM,
      (pose?.y ?? 0) * MM,
    );
    // TWO rotations, not one, and the missing half is invisible until you look
    // at the render: the solver's angles turn a part within a Z-up frame, but
    // the STL's own triangles are in that Z-up frame too. Rotating the mesh by
    // the solver's angles alone leaves every board standing on its edge and
    // every leg pointing sideways. The −90° about X is the Z-up → Y-up change
    // of basis, applied OUTSIDE the solver's rotation — hence a quaternion
    // product rather than a summed Euler, which would compose them in the
    // wrong order. Same two lines as `ModelLoader.tsx`.
    const coordQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'));
    const solverQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pose?.roll ?? 0, pose?.pitch ?? 0, pose?.yaw ?? 0, 'ZYX'),
    );
    const world = new THREE.Euler().setFromQuaternion(coordQ.multiply(solverQ), 'XYZ');
    return { position, rotation: world };
  }, [pose]);
}

/** Wood for the top, aluminium for everything else. Both the mesh and the box
 *  use these, so the moment a real STL replaces a box nothing about the part's
 *  colour or finish moves — only its detail. */
function usePartMaterial(part: ShopPart) {
  const board = part.partType === 'tabletop';
  return board
    ? { color: '#c0986e', metalness: 0.04, roughness: 0.62 }
    : { color: '#b9bcc2', metalness: 0.55, roughness: 0.42 };
}

/** The finished part: the server's own mesh, in millimetres. */
const StlPart: React.FC<{ part: ShopPart }> = ({ part }) => {
  const geometry = useLoader(STLLoader, part.stlUrl as string);
  const transform = usePartTransform(part.pose);
  const material = usePartMaterial(part);

  return (
    <mesh
      geometry={geometry}
      position={transform.position}
      rotation={transform.rotation}
      scale={[MM, MM, MM]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial {...material} />
    </mesh>
  );
};

/**
 * The part as the solver describes it: a box with the right size and the right
 * pose. It is deliberately the same finish as the mesh, because this is what a
 * customer watches while they drag a slider — see the module comment.
 *
 * Returns null when there is nothing to size the box from, which is the honest
 * answer: a zero-size box would render as a speck and read as a bug.
 */
function boxSize(part: ShopPart): [number, number, number] | null {
  const dims = part.dimensions ?? {};

  // The answer carries all four dimension fields for every part, with the ones
  // that do not apply left at zero — so `tabletop` is the discriminator, not
  // the presence of a key.
  const length = dims.extrusion_length ?? 0;
  if (part.partType !== 'tabletop' && length > 0) {
    const section = PROFILE_DIMS[part.profile as ProfileSize] ?? FALLBACK_SECTION_MM;
    // Section in XY, length along Z: the axis `pipeline(..., direction=
    // "symmetric")` extrudes along, so the box occupies the same local frame
    // the extrusion's STL will.
    return [section * MM, section * MM, length * MM];
  }

  const w = (dims.tabletop_width ?? 0) * MM;
  const d = (dims.tabletop_depth ?? 0) * MM;
  const t = (dims.tabletop_thickness ?? 0) * MM;
  if (w <= 0 || d <= 0 || t <= 0) return null;
  return [w, d, t];
}

const BoxPart: React.FC<{ part: ShopPart }> = ({ part }) => {
  const transform = usePartTransform(part.pose);
  const material = usePartMaterial(part);
  const size = useMemo(() => boxSize(part), [part]);
  if (!size) return null;

  return (
    <mesh
      position={transform.position}
      rotation={transform.rotation}
      castShadow
      receiveShadow
    >
      <boxGeometry args={size} />
      <meshStandardMaterial {...material} />
    </mesh>
  );
};

/**
 * One part of the model, whichever kind of answer we got for it.
 *
 * The two cases have to be two components rather than one `if` inside a single
 * component, because `StlPart` calls `useLoader` — a hook, so it cannot sit
 * behind a condition.
 */
const Part: React.FC<{ part: ShopPart }> = ({ part }) =>
  part.stlUrl ? <StlPart part={part} /> : <BoxPart part={part} />;

const FOV = 42;

/** How much bigger than the starting size the frame is cut for — see `frameFor`. */
const FRAME_HEADROOM = 1.5;

/** The view is a fixed three-quarter one: the camera sits along this vector
 *  from the middle of the model, and only its DISTANCE varies. */
const VIEW_DIR = new THREE.Vector3(1, 0.62, 1).normalize();

/** The view's own screen axes, so the model's outline can be measured along
 *  them instead of guessed at. Signs do not matter — only magnitudes are used. */
const SCREEN_RIGHT = new THREE.Vector3()
  .crossVectors(VIEW_DIR, new THREE.Vector3(0, 1, 0))
  .normalize();
const SCREEN_UP = new THREE.Vector3().crossVectors(SCREEN_RIGHT, VIEW_DIR).normalize();

interface Frame {
  target: [number, number, number];
  position: [number, number, number];
}

/**
 * Where the camera goes, worked out from the model's own dimensions AND from
 * the shape of the canvas it is going into.
 *
 * The origin the server uses is the TOP of the tabletop and everything hangs
 * below it, so the model occupies `y ∈ [-height, 0]` — which means its centre,
 * and the point worth looking at, is `-height / 2`, and the box of half-extents
 * `(w/2, h/2, d/2)` is CENTRED on the target. That is what makes the sums below
 * this short.
 *
 * WHY IT IS NOT A BOUNDING SPHERE. The first version of this fitted the
 * sphere through the model's diagonal to the vertical field of view, which is
 * what the professional editor's viewer does — and it is wrong here, because
 * the two viewers do not have the same window. That one is wide; this one is
 * the right-hand column of a two-column page, roughly 650 × 780, and a sphere
 * fitted to the vertical field of view overflows a portrait one. Measured in
 * the browser: an 1800 mm desk ran off both edges, its tabletop clipped by the
 * frame on the left and the right. So the outline is projected onto the view's
 * own screen axes and fitted to whichever of the two fields of view is tighter,
 * and the distance is measured to the model's MIDDLE — the near corner, which
 * is what actually clips, sits `halfD` closer than that.
 *
 * WITH HEADROOM, because the camera is deliberately frozen (below): a frame
 * fitted tightly to the size the sliders start at would walk the desk out of
 * itself on the first drag upward — measured in the browser, a desk taken from
 * 1200 to 1800 ran straight off the right-hand edge. `FRAME_HEADROOM` is how much
 * bigger than the starting size the frame is cut for.
 *
 * The obvious alternative — fit the whole slider range, 600 to 3000, so nothing
 * can ever clip — was tried and is worse: it puts the starting desk at a third
 * of the canvas width, floating in the middle of nothing. A range of five to one
 * cannot be framed usefully. This trades the far end for a picture of the actual
 * furniture at the size it actually starts at — and the far end turns out to be
 * further off than the factor suggests: swept in the browser at 1.5, a 1200 mm
 * desk on a 649 × 774 canvas runs 398 px wide at 1669 mm, 509 px at 2269, and
 * only reaches the frame at about 2570 mm, a bit over twice the starting width.
 * The scroll wheel undoes anything past that.
 *
 * `aspect` is passed in rather than read here because at the moment this is
 * first computed the canvas has not been measured yet; `onCreated` fills in the
 * real one.
 */
function frameFor(dims: Record<string, number> | null, aspect: number): Frame {
  const w = (dims?.width ?? 1200) * MM;
  const d = (dims?.depth ?? 600) * MM;
  const h = (dims?.height ?? 750) * MM;

  const target = new THREE.Vector3(0, -h / 2, 0);
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;

  const tanV = Math.tan((FOV / 2) * (Math.PI / 180));
  // Guarded: a canvas in a collapsed column reports a zero height for a frame,
  // and 0/0 here would put the camera at infinity.
  const tanH = tanV * Math.max(0.25, aspect);

  const halfW =
    hx * Math.abs(SCREEN_RIGHT.x) + hy * Math.abs(SCREEN_RIGHT.y) + hz * Math.abs(SCREEN_RIGHT.z);
  const halfH =
    hx * Math.abs(SCREEN_UP.x) + hy * Math.abs(SCREEN_UP.y) + hz * Math.abs(SCREEN_UP.z);
  const halfD =
    hx * Math.abs(VIEW_DIR.x) + hy * Math.abs(VIEW_DIR.y) + hz * Math.abs(VIEW_DIR.z);

  // A touch more air on top of the headroom, so the thing does not touch the
  // edges of the frame even at exactly `FRAME_HEADROOM`.
  const distance = (Math.max(halfW / tanH, halfH / tanV) + halfD) * FRAME_HEADROOM * 1.04;

  return {
    target: [target.x, target.y, target.z],
    position: [
      target.x + VIEW_DIR.x * distance,
      target.y + VIEW_DIR.y * distance,
      target.z + VIEW_DIR.z * distance,
    ],
  };
}

/**
 * Turns a failed STL fetch into a sentence.
 *
 * `useLoader` throws when a fetch rejects. The canvas's own code does not
 * swallow that: `@react-three/fiber` catches it inside its renderer and
 * re-throws it from the `Canvas` component itself (`if (error) throw error` in
 * its source), so it arrives here as an ordinary render error. With no boundary
 * at all it would reach the root and take the page down — a blank page because
 * one `.stl` 404'd. That is not hypothetical here: the server's
 * `_cleanup_old_models` deletes old output directories, and a model whose files
 * disappear while the customer is still looking at it is exactly that shape.
 *
 * The state is the id that FAILED rather than a boolean, and that is what makes
 * it self-clearing: a box part fetches nothing, so the next solve for a new size
 * renders cleanly and the fallback simply is not selected any more. Storing a
 * boolean would need a separate reset on every prop change, which is a second
 * render per drag for no gain. `componentDidCatch` rather than
 * `getDerivedStateFromError` because the latter cannot see the props, and the
 * prop is the whole point.
 */
class ViewerBoundary extends Component<
  { modelId: string; fallback: ReactNode; children: ReactNode },
  { failedFor: string | null }
> {
  state: { failedFor: string | null } = { failedFor: null };

  componentDidCatch() {
    this.setState({ failedFor: this.props.modelId });
  }

  render() {
    return this.state.failedFor === this.props.modelId ? this.props.fallback : this.props.children;
  }
}

const ShopViewer: React.FC<{ model: ShopModel }> = ({ model }) => {
  const t = useT();

  /**
   * The frame is computed ONCE per mount, and that is load-bearing rather than
   * an optimisation. If the camera re-fitted every time `model.dimensions`
   * changed, it would pull back by exactly as much as the desk grew, and the
   * desk would sit there looking the same size all through a drag. Watching it
   * change size is the feature; the camera has to hold still while it does. The
   * shell remounts this component per piece of furniture — `ShopShell.tsx` —
   * which is what gives a new one a fresh frame.
   *
   * And the fit is finished in `onCreated` rather than here, because the canvas
   * has no measurable shape until it exists. `onCreated` runs before the first
   * frame is drawn, so the one that reaches the screen is already the right one.
   */
  const frame = useRef<Frame | null>(null);
  if (frame.current === null) frame.current = frameFor(model.dimensions, 1);
  const frozen = frame.current;

  return (
    <ViewerBoundary
      modelId={model.modelId}
      fallback={<div className="shop-view-error">{t('shop.view.stlFailed')}</div>}
    >
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: frozen.position, fov: FOV, near: 0.05, far: 60 }}
        onCreated={({ camera, size }) => {
          const fitted = frameFor(model.dimensions, size.width / Math.max(1, size.height));
          camera.position.set(fitted.position[0], fitted.position[1], fitted.position[2]);
          camera.lookAt(fitted.target[0], fitted.target[1], fitted.target[2]);
          camera.updateProjectionMatrix();
        }}
      >
        <color attach="background" args={['#14141d']} />
        <Lighting />
        <Suspense fallback={null}>
          <group>
            {model.parts.map((part) => (
              <Part key={part.name} part={part} />
            ))}
          </group>
        </Suspense>
        <OrbitControls
          makeDefault
          target={frozen.target}
          enableDamping
          dampingFactor={0.08}
          minDistance={0.35}
          maxDistance={14}
          maxPolarAngle={Math.PI * 0.495}
        />
      </Canvas>
    </ViewerBoundary>
  );
};

export default ShopViewer;
