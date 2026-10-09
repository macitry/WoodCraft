import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * What each scene is lit by.
 *
 * The bedroom renders `viewer/Lighting.tsx` verbatim — the rig the page has
 * always had — and that file is deliberately not parameterised to serve the
 * other three. Its whole value is that the bedroom, and only the bedroom, gives
 * back the desk's original rendering exactly, and a `scale` prop threaded
 * through six lights would be a standing invitation for the DIY viewer, which
 * shares it, to drift away from the main one. The three new rigs are their own components because
 * they differ in direction, colour temperature and shape, not in level: a
 * config object that covered all of them would be longer than the JSX it
 * replaced.
 *
 * Every rig still has exactly ONE shadow-casting light, aimed so the desk's
 * contact shadow falls where the old key put it. That shadow is what makes the
 * desk stand on the floor rather than hover over it, and it is the one thing no
 * rig can do without.
 *
 * WHY THE NEW RIGS ARE AN ORDER OF MAGNITUDE DIMNER THAN THE OLD ONE, and it is
 * not a taste call. `viewer/Lighting.tsx` was tuned against `#3c3a44` floors and
 * `#2b2a37` walls — albedos around 0.05 in linear light — so it can afford an
 * irradiance around 1.4 and still land the render in the middle of the tone
 * curve. The new scenes are what a room looks like: plaster at 0.87, concrete at
 * 0.30, oak at 0.62. Under the old rig's numbers those come out at x ≈ 1.5,
 * where three's Cineon curve is already flat — the surface is not merely bright,
 * it is CLIPPED, and a clipped surface has no colour left: the warm oak floor
 * renders as neutral white, indistinguishable from the plaster wall beside it.
 * (Measured, not guessed: the floor sampled `rgb(237,236,235)` against a tile
 * whose own mean is `rgb(207,179,138)`.) Halving the exposure would have fixed
 * the clipping and left the bedroom wrong, since the two share a renderer and
 * a tone curve — the light has to be right for the surface it falls on.
 *
 * So the rule for the three new rigs is: total irradiance of about 0.25
 * (workshop) to 0.5 (daylight), which is what a bright surface needs to sit
 * below the curve's knee, with the key at roughly twice everything else added
 * together so the room still has a direction and the desk still has a shadow.
 */

const KeyLight: React.FC<{
  position: [number, number, number];
  intensity: number;
  color: string;
}> = ({ position, intensity, color }) => (
  <directionalLight
    position={position}
    intensity={intensity}
    color={color}
    castShadow
    // The same shadow camera the original key light uses: a 20 m square and a
    // 50 m far plane, which between them hold the whole room and keep the
    // shadow map's texels about 10 mm wide where the desk stands.
    shadow-mapSize-width={2048}
    shadow-mapSize-height={2048}
    shadow-camera-far={50}
    shadow-camera-left={-10}
    shadow-camera-right={10}
    shadow-camera-top={10}
    shadow-camera-bottom={-10}
    shadow-bias={-0.0001}
  />
);

/**
 * Image-based lighting, baked offline from three's procedural room: no HDRI file
 * to fetch, no network, a cubemap of a few ms at mount.
 *
 * This is what makes the connectors legible. The angle brackets are
 * `metalness: 0.9`, and a metal with no environment has nothing to reflect — its
 * faces render near-black no matter how many directional lights point at it.
 * Which is also why every scene has one, at its own strength, and why turning
 * scenes off takes it away again: with no environment the metal goes back to
 * being black, and that is the honest appearance of the original rig.
 *
 * Deliberately the copy from `three` itself, not the one in `three-stdlib`: the
 * stdlib scene predates r155's light units and drives its room light at
 * intensity 5, which under this renderer bakes to essentially black.
 *
 * One environment for all four scenes, scaled per scene, rather than a bespoke
 * cube each: this is a neutral fill, and what distinguishes the scenes is the
 * rig and the shell. Re-baked on every switch — a few ms, against a panel the
 * user has just opened on purpose — and disposed on the way out, so turning
 * scenes off leaves no environment behind.
 */
export const SceneEnvironment: React.FC<{ intensity: number }> = ({ intensity }) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const target = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    envScene.dispose();

    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      target.dispose();
    };
  }, [gl, scene]);

  // Separated from the bake above so that changing a scene's strength does not
  // rebuild its cubemap.
  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);

  return null;
};

// ============================================================ the rigs

/**
 * Daylight. A warm sun from high on the open side, and a lot of sky: the sun
 * gives the desk a direction to sit in, and the ambient plus the bright
 * hemisphere are what actually make the room read as day rather than as a
 * single spotlight in the dark.
 *
 * The sun comes from -X/+Z — over the camera's left shoulder — so the desk's
 * shadow falls away to the right and back, where the camera can see it. Lit
 * from the camera's side instead, the shadow hides behind the desk and the
 * whole room flattens.
 */
export const DaylightRig: React.FC = () => (
  <>
    <ambientLight intensity={0.10} color="#fff6ec" />
    <KeyLight position={[-3, 9, 6]} intensity={1.0} color="#fff3dd" />
    <directionalLight position={[6, 3, 2]} intensity={0.12} color="#eaf1ff" />
    <directionalLight position={[0, -1, 0]} intensity={0.06} color="#d8c9a8" />
    <hemisphereLight args={['#cfe3ff', '#c2a878', 0.15]} />
  </>
);

/**
 * A studio. Broad, even, and deliberately without a strong direction: the light
 * is meant to describe the desk's shape and nothing else, which is what a
 * product shot is for.
 *
 * The one light that is not even is the rim from behind. On a white sweep, a
 * pale desk's back edge has nothing to separate it from the background, and
 * this is what draws the line.
 */
export const StudioRig: React.FC = () => (
  <>
    <ambientLight intensity={0.28} color="#ffffff" />
    <KeyLight position={[2, 6, 7]} intensity={0.7} color="#ffffff" />
    <directionalLight position={[0, 9, 0]} intensity={0.4} color="#ffffff" />
    <directionalLight position={[0, 3.5, -7]} intensity={0.6} color="#ffffff" />
    <directionalLight position={[0, -1, 0]} intensity={0.1} color="#e8e8e8" />
  </>
);

/**
 * A workshop. Cooler and harder than the daylight room, and dimmer — a top
 * light and a window, not a sun.
 *
 * It is the scene the floor lamp is pointed at. With a cool rig and dark
 * concrete, the lamp's warm pool is the one place in the frame where two
 * colour temperatures meet, and that is what makes the scene read as a room
 * with work in it rather than as a dark room.
 */
export const WorkshopRig: React.FC = () => (
  <>
    <ambientLight intensity={0.06} color="#cfd8e2" />
    <KeyLight position={[7, 8, 4]} intensity={0.45} color="#eef3ff" />
    <directionalLight position={[-6, 2, -3]} intensity={0.08} color="#cfd9ea" />
    <directionalLight position={[0, -1, 0]} intensity={0.04} color="#8a8175" />
    <hemisphereLight args={['#8fa6c4', '#2f2b26', 0.1]} />
  </>
);
