import { Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import Lighting from '../viewer/Lighting';
import type { ShopModel, ShopPart } from './shopApi';

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
 * What it renders instead is what the SERVER says: nine parts, each with an
 * `stl_url` and a `pose`, placed where the pose puts them. The transform below
 * is the one `ModelLoader` already works in — see the notes on `Part`.
 */

/** The server measures in millimetres; the scene is in metres. */
const MM = 0.001;

/**
 * One part of the model.
 *
 * The pose mapping is copied from `ModelLoader.tsx`, and it is not a
 * reinvention: the server is Z-up and three.js is Y-up, so the server's `y`
 * lands on the scene's `z` and the server's `z` on the scene's `y`. The Euler
 * is `ZYX` for the same reason — that is the order the rest of this codebase
 * reads the server's angles in, and two viewers disagreeing about it would be a
 * bug that only shows up on a part rotated on two axes at once.
 */
const Part: React.FC<{ part: ShopPart }> = ({ part }) => {
  const geometry = useLoader(STLLoader, part.stlUrl as string);
  const pose = part.pose;

  const transform = useMemo(() => {
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

  const board = part.partType === 'tabletop';

  return (
    <mesh
      geometry={geometry}
      position={transform.position}
      rotation={transform.rotation}
      scale={[MM, MM, MM]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={board ? '#c0986e' : '#b9bcc2'}
        metalness={board ? 0.04 : 0.55}
        roughness={board ? 0.62 : 0.42}
      />
    </mesh>
  );
};

/**
 * Where to put the camera, worked out from the model's own dimensions.
 *
 * The origin the server uses is the TOP of the tabletop, and everything hangs
 * below it — the legs reach `y = -height`. So the point worth looking at is
 * `-height / 2`, not the origin, and the distance is the one that fits the
 * model's bounding sphere inside the field of view. Deriving it beats a
 * constant: the next piece of furniture will not be 1200 × 600 × 750, and a
 * hard-coded camera would frame that one badly.
 */
function useFraming(model: ShopModel) {
  return useMemo(() => {
    const dims = model.dimensions ?? {};
    const w = (dims.width ?? 1200) * MM;
    const d = (dims.depth ?? 600) * MM;
    const h = (dims.height ?? 750) * MM;

    const fov = 42;
    const radius = 0.5 * Math.hypot(w, d, h);
    // A little air around it, so the thing does not touch the edges of the
    // frame at the default zoom.
    const distance = (radius / Math.sin((fov / 2) * (Math.PI / 180))) * 1.08;

    const target: [number, number, number] = [0, -h / 2, 0];
    const direction = new THREE.Vector3(1, 0.62, 1).normalize();
    const position: [number, number, number] = [
      target[0] + direction.x * distance,
      target[1] + direction.y * distance,
      target[2] + direction.z * distance,
    ];
    return { target, position, fov, distance };
  }, [model.dimensions]);
}

const ShopViewer: React.FC<{ model: ShopModel }> = ({ model }) => {
  const frame = useFraming(model);
  const parts = useMemo(
    () => model.parts.filter((p) => p.stlUrl !== null),
    [model.parts],
  );

  return (
    // Keyed by model id: a new model is a new scene, and remounting is how the
    // camera goes back to the framing above instead of staying wherever the
    // user happened to leave the previous one.
    <Canvas
      key={model.modelId}
      shadows="soft"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: frame.position, fov: frame.fov, near: 0.05, far: 60 }}
    >
      <color attach="background" args={['#14141d']} />
      <Lighting />
      <Suspense fallback={null}>
        <group>
          {parts.map((part) => (
            <Part key={part.name} part={part} />
          ))}
        </group>
      </Suspense>
      <OrbitControls
        makeDefault
        target={frame.target}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.35}
        maxDistance={14}
        maxPolarAngle={Math.PI * 0.495}
      />
    </Canvas>
  );
};

export default ShopViewer;
