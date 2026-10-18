import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { RoomEnvironment, STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import {
  applyBoardUVs,
  buildBoardMaterials,
  METRE_FRAME,
  useBoardMaps,
} from '../materials/boardMaterial';
import { boardById } from '../materials/boardRegistry';

/**
 * The desk on the cover.
 *
 * It is built here rather than fetched from the backend on purpose: a cover
 * page has to be the first thing a stranger sees, and it must not wait for a
 * solver, a cache or a server that is not running on their laptop. The whole
 * scene is a handful of boxes and one real 30 × 30 extrusion profile — the file
 * already ships in `public/profiles`, and using it is what makes the legs read
 * as aluminium rather than as grey bars.
 *
 * The proportions are the sample list's: a 600 mm deep top, 18 mm thick, on a
 * flush 3030 frame at 750 mm. The width is a prop because the cover's control
 * changes it — a 1200, 1500 or 1800 mm desk is the same model at three lengths,
 * and the list below the hero recalculates with it.
 *
 * The rail lengths match the solver: legs at 732 mm, side rails at 540, long
 * rails at width − 60. A cover that shows one length and lists another is a
 * cover that has already broken its promise, so the frame is cut to the same
 * numbers as the BOM, not merely eyeballed.
 */

const TOP_D = 0.6;
const TOP_T = 0.018;
/** Oak by default, because the sample list is oak; the two have to be the same
 *  desk for the width control to mean anything. */
const HERO_BOARD = 'oak';
const HEIGHT = 0.75;
const SECTION = 0.03;

/** A WebGL failure must cost the hero's picture, not the page. */
class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * A neutral studio in a box, generated at runtime. Without an environment map
 * a metalness of 0.8 renders almost black; `RoomEnvironment` is three's own
 * little photo studio and needs no HDR file, so the aluminium gets highlights
 * without the cover acquiring a network dependency.
 */
const StudioEnvironment: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.38;
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
};

/**
 * The tabletop is the only surface with a grain, so it is the only one that
 * needs the board pipeline. `applyBoardUVs` is what puts the bake's tile at the
 * right scale when the board widens from 1200 to 1800 mm; without it the rings
 * would stretch with the geometry.
 */
const Tabletop: React.FC<{ width: number }> = ({ width }) => {
  const board = boardById(HERO_BOARD);
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const maps = useBoardMaps(HERO_BOARD, maxAnisotropy);

  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(width, TOP_T, TOP_D);
    applyBoardUVs(g, board, METRE_FRAME);
    return g;
  }, [board, width]);

  const materials = useMemo(
    () =>
      maps
        ? buildBoardMaterials(
          geometry,
          maps,
          { metalness: 0.02, emissive: '#000000', emissiveIntensity: 0 },
          METRE_FRAME,
        )
        : null,
    [maps, geometry],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    if (!materials) return;
    return () => {
      new Set(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  return (
    <mesh geometry={geometry} position={[0, HEIGHT - TOP_T / 2, 0]} castShadow receiveShadow>
      {materials ? (
        materials.map((m, i) => <primitive key={i} object={m} attach={`material-${i}`} />)
      ) : (
        <meshStandardMaterial color={board.color} metalness={0.02} roughness={0.6} />
      )}
    </mesh>
  );
};

/**
 * One shared, centred metre of a real 3030 extrusion.
 *
 * The shipped STL is authored 1000 mm long along Z and sits at an arbitrary
 * XY offset (its own CAD origin, not the part's centre), so it is recentred
 * and scaled to metres ONCE. Each bar then scales its local Z to the length it
 * needs and rotates the axis into place. Sharing the geometry keeps eight bars
 * at one copy of 12k triangles rather than eight.
 */
function useProfileGeometry(): THREE.BufferGeometry {
  const loaded = useLoader(STLLoader, '/profiles/profile_3030.stl');

  const geometry = useMemo(() => {
    const g = loaded.clone();
    g.computeBoundingBox();
    if (g.boundingBox) {
      const centre = new THREE.Vector3();
      g.boundingBox.getCenter(centre);
      g.translate(-centre.x, -centre.y, -centre.z);
    }
    g.scale(0.001, 0.001, 0.001);
    return g;
  }, [loaded]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

interface BarProps {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position: [number, number, number];
  axis: 'x' | 'y' | 'z';
  length: number;
}

const Bar: React.FC<BarProps> = ({ geometry, material, position, axis, length }) => {
  const rotation: [number, number, number] =
    axis === 'y' ? [-Math.PI / 2, 0, 0] : axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0];

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={[1, 1, length]}
      castShadow
      receiveShadow
    />
  );
};

const Desk: React.FC<{ width: number }> = ({ width }) => {
  const profile = useProfileGeometry();
  const aluminium = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c3c7cd',
        metalness: 0.82,
        roughness: 0.34,
        envMapIntensity: 1.15,
      }),
    [],
  );
  useEffect(() => () => aluminium.dispose(), [aluminium]);

  // The frame sits flush under the top, so its outer width is the top's width.
  // Rails span between the legs' inner faces: width − 2 × 30 mm, which is the
  // solver's 1140 / 1440 / 1740 mm at the three cover widths.
  const frameW = width;
  const frameD = TOP_D;
  const legX = frameW / 2 - SECTION / 2;
  const legZ = frameD / 2 - SECTION / 2;
  const railY = HEIGHT - TOP_T - SECTION / 2;
  const railLengthX = frameW - 2 * SECTION;
  const railLengthZ = frameD - 2 * SECTION;

  return (
    <group>
      <Tabletop width={width} />

      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Bar
            key={`leg-${sx}-${sz}`}
            geometry={profile}
            material={aluminium}
            position={[sx * legX, (HEIGHT - TOP_T) / 2, sz * legZ]}
            axis="y"
            length={HEIGHT - TOP_T}
          />
        )),
      )}

      {[-1, 1].map((sz) => (
        <Bar
          key={`rail-x-${sz}`}
          geometry={profile}
          material={aluminium}
          position={[0, railY, sz * legZ]}
          axis="x"
          length={railLengthX}
        />
      ))}

      {[-1, 1].map((sx) => (
        <Bar
          key={`rail-z-${sx}`}
          geometry={profile}
          material={aluminium}
          position={[sx * legX, railY, 0]}
          axis="z"
          length={railLengthZ}
        />
      ))}
    </group>
  );
};

/**
 * A slow, bounded turn rather than a full rotation: the desk should read as a
 * three-quarter view that breathes, not as a turntable. Pointer parallax adds a
 * little and is clamped so the composition never leaves the frame.
 */
const Spinner: React.FC<{ children: ReactNode; animate: boolean }> = ({ children, animate }) => {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g || !animate) return;
    // Smaller than it was before the desk could reach 1800 mm: at full width
    // the rotated diagonal is the widest thing in the scene, and 0.26 rad put
    // a corner outside the frame.
    const target = Math.sin(state.clock.elapsedTime * 0.24) * 0.16 + state.pointer.x * 0.1;
    g.rotation.y += (target - g.rotation.y) * Math.min(1, delta * 2.4);
  });

  return <group ref={group}>{children}</group>;
};

const HeroDesk: React.FC<{ widthMm: number }> = ({ widthMm }) => {
  const animate = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  return (
    <QuietBoundary>
      <Canvas
        className="hero-canvas"
        shadows="soft"
        dpr={[1, 2]}
        // Framed for the widest desk the control can ask for (1800 mm), with
        // just enough margin for the slow turn. At 1200 the desk is smaller in
        // the same frame, which is the point: the change has to be visible.
        camera={{ position: [2.2, 1.37, 2.38], fov: 30, near: 0.05, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, 0.4, 0);
          // Oak is much paler than the walnut this scene was lit for; pulling
          // the exposure down keeps the grain from blowing out to cream.
          gl.toneMappingExposure = 0.86;
        }}
      >
        <Suspense fallback={null}>
          <StudioEnvironment />
          <ambientLight intensity={0.26} />
          <hemisphereLight args={['#cdd6e0', '#1a120c', 0.5]} />
          <directionalLight
            position={[3.2, 5, 2.8]}
            intensity={1.9}
            color="#fff4e2"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-bias={-0.0004}
          >
            <orthographicCamera attach="shadow-camera" args={[-2, 2, 2, -2, 0.1, 10]} />
          </directionalLight>
          <directionalLight position={[-3.5, 2.2, 1.5]} intensity={0.6} color="#dce8ff" />
          <directionalLight position={[0, 3, -4]} intensity={1.25} color="#ffffff" />
          <pointLight position={[-1.4, 0.8, 1.2]} intensity={0.55} color="#d8a86b" distance={4} decay={2} />

          <Spinner animate={animate}>
            <Desk width={widthMm / 1000} />
          </Spinner>

          <ContactShadows
            position={[0, 0.001, 0]}
            opacity={0.52}
            scale={3.4}
            blur={2.8}
            far={1.2}
            resolution={512}
            color="#000000"
          />
        </Suspense>
      </Canvas>
    </QuietBoundary>
  );
};

export default HeroDesk;
