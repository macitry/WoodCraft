import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useModelStore } from '../store/modelStore';

/**
 * The room the desk stands in: a floor and two walls meeting in the corner the
 * camera is NOT looking from, so from the default view the desk reads as
 * furniture in a room rather than a part on a grid.
 *
 * Everything here is scenery. It is not in the model, not in the BOM, not in
 * any export, and it changes no geometry — hence `showRoom` in the store being a
 * view flag beside `showFasteners` rather than anything on the model.
 */

/** Below the existing shadow catcher, which sits at y = -0.01 (see ModelLoader's
 *  GroundPlane). The 10 mm gap is far past what this camera's depth range can
 *  confuse, and keeping the floor strictly underneath is what lets that plane go
 *  on being the scene's only shadow receiver. */
const FLOOR_Y = -0.02;
/** A standard ceiling height — the walls have to reach above the eye-line or the
 *  corner does not read as a corner. */
const WALL_H = 2.7;
/** Wall spacing, in metres. The desk spans about 1.2 × 0.6 m, so this leaves it
 *  roughly 1.5 m of clearance — a room, not a warehouse. */
const ROOM = 4.2;
/** The floor runs this much further than the walls, on the two open sides only.
 *  A floor cut off flush with the wall line stops dead inside the frame and the
 *  eye reads the edge as a cut, not a floor; extending it the way the room is
 *  open puts that edge off-screen. The two closed sides stay flush with the
 *  walls they meet. */
const FLOOR_OVERHANG = 2;
/** How much image-based lighting to fold in. The existing rig (ambient 0.4 + key
 *  2.5 + fill 0.8 + rim 1.2) was tuned with no environment at all, so a full-
 *  strength cube would flatten it; this is a fill, not a replacement. */
const ENV_INTENSITY = 0.35;

const WALL_COLOR = '#2b2a37';
const FLOOR_COLOR = '#3c3a44';

/** One wall. `rotation` turns the plane's +Z normal to point into the room. */
const Wall: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation,
}) => (
  <mesh
    position={position}
    rotation={rotation}
    userData={{ wcRoom: 'room' }}
  >
    <planeGeometry args={[ROOM, WALL_H]} />
    <meshStandardMaterial color={WALL_COLOR} roughness={0.95} metalness={0} />
  </mesh>
);

/**
 * Image-based lighting, baked offline from three's procedural room: no HDRI file
 * to fetch, no network, a cubemap of a few ms at mount.
 *
 * This is what makes the connectors legible. The angle brackets are
 * `metalness: 0.9`, and a metal with no environment has nothing to reflect — its
 * faces render near-black no matter how many directional lights point at it.
 *
 * Deliberately the copy from `three` itself, not the one in `three-stdlib`: the
 * stdlib scene predates r155's light units and drives its room light at
 * intensity 5, which under this renderer bakes to essentially black.
 */
const RoomEnvironmentLight: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const target = pmrem.fromScene(envScene, 0.04);

    scene.environment = target.texture;
    scene.environmentIntensity = ENV_INTENSITY;
    pmrem.dispose();
    envScene.dispose();

    return () => {
      // Turn the room off and the desk must look exactly as it did before this
      // feature existed — including its black metal, which is the honest
      // "no environment" appearance this rig was built around.
      scene.environment = null;
      scene.environmentIntensity = 1;
      target.dispose();
    };
  }, [gl, scene]);

  return null;
};

const RoomScene: React.FC = () => {
  const showRoom = useModelStore((s) => s.showRoom);
  if (!showRoom) return null;

  return (
    <group>
      <RoomEnvironmentLight />

      {/* Floor. Faces up, so orbiting below it culls it rather than blocking the
          desk. It does NOT receive shadows: the transparent shadow catcher at
          y = -0.01 is still the only receiver, and if both did, the contact
          shadow would be laid down twice. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[FLOOR_OVERHANG / 2, FLOOR_Y, FLOOR_OVERHANG / 2]}
        userData={{ wcRoom: 'room' }}
      >
        <planeGeometry args={[ROOM + FLOOR_OVERHANG, ROOM + FLOOR_OVERHANG]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.85} metalness={0} />
      </mesh>

      {/* The corner, at -X / -Z, i.e. behind the desk from the default camera at
          [3, 2, 4]. Both walls are single-sided with their normals pointing into
          the room, so whichever one ends up between the camera and the desk
          shows a backface and is culled: the room is always a cutaway, from
          every orbit angle, and can never hide the thing it exists to show. */}
      <Wall position={[0, FLOOR_Y + WALL_H / 2, -ROOM / 2]} />
      <Wall position={[-ROOM / 2, FLOOR_Y + WALL_H / 2, 0]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
};

export default RoomScene;
