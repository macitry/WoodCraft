import { Suspense, useEffect, useMemo, useRef, type FC } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Html, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { ConnectorStl } from '../diy/DiyBracketStl';
import { ProfileStl } from '../diy/ProfileStl';
import ProfileBoundary from './ProfileBoundary';
import PartDragGizmo from './PartDragGizmo';
import { buildScrewGroup } from '../diy/DiyScrewGeometry';
import { buildTNutGroup } from '../diy/DiyNutGeometry';
import { PROFILE_DIMS } from '../types/furniture';
import { connectorByStlUrl } from '../diy/connectors';
import type { AccessoryKit, HardwareKind, KitLayout, LocalFastener } from '../utils/accessoryKits';
import { jointFasteners } from '../utils/accessoryKits';

const M = 0.001;

const TONE: Record<HardwareKind, string> = {
  socket_screw: '#c8c8c8',
  wood_screw: '#b98a4a',
  t_nut: '#b08d57',
};

/**
 * One geometry/material set per distinct spec, cloned per part.
 *
 * Unlike the two production viewers this cache does NOT neuter `raycast`:
 * picking a part is the whole point of the editor, so the meshes must stay
 * hittable. `clone()` shares geometry and material by reference, so a selection
 * highlight must CLONE the material too — mutating the shared one would light up
 * every part of that spec in the scene.
 */
const prototypes = new Map<string, THREE.Object3D>();

function prototypeFor(f: LocalFastener): THREE.Object3D {
  const { spec } = f;
  const key = `${spec.kind}|${spec.size ?? ''}|${spec.length ?? ''}|${f.internal ? 'g' : 's'}`;
  let proto = prototypes.get(key);
  if (!proto) {
    const size = spec.size ?? 'M6';
    proto =
      spec.kind === 't_nut'
        ? buildTNutGroup(size, { color: TONE.t_nut, ghost: f.internal })
        : buildScrewGroup(size, spec.length ?? 18, { color: TONE[spec.kind] });
    prototypes.set(key, proto);
  }
  return proto;
}

/** Light one part up without touching the shared material. */
function useHighlight(obj: THREE.Object3D, on: boolean): void {
  useEffect(() => {
    if (!on) return;
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      // Cyan, not the amber used for warnings: the T-nuts are brass, and an
      // amber highlight would read as one of them.
      mat.emissive = new THREE.Color('#22d3ee');
      mat.emissiveIntensity = 0.75;
      swapped.push([mesh, mesh.material]);
      mesh.material = mat;
    });
    return () => {
      for (const [mesh, original] of swapped) {
        const owned = mesh.material as THREE.Material;
        mesh.material = original;
        owned.dispose();
      }
    };
  }, [obj, on]);
}

/**
 * One piece of hardware, positioned in the assembly's own millimetre space.
 *
 * The editor previews a connector at `size = extMm`, which makes the catalog
 * scale IDENTITY here: a seat position read from `jointFasteners` is already the
 * number shown in the property panel, and the only conversion is mm → metres.
 * (No `scale` prop, unlike the two production viewers.)
 */
const PartMesh: FC<{
  fastener: LocalFastener;
  selected: boolean;
  onPick: (key: string) => void;
}> = ({ fastener, selected, onPick }) => {
  const obj = useMemo(() => prototypeFor(fastener).clone(), [fastener]);
  useHighlight(obj, selected);
  const [x, y, z] = fastener.position;
  return (
    <primitive
      object={obj}
      position={[x * M, y * M, z * M]}
      rotation={fastener.rotation as unknown as [number, number, number]}
      scale={M}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onPick(fastener.key);
      }}
    />
  );
};

/**
 * The two extrusions the joint is bolted into.
 *
 * Runner A runs along +X with its slot face on y=0; runner B runs along +Y with
 * its face on x=0 — the two faces the connector's plates bear against. Which
 * runner goes where is fixed by the seats, not by taste: `jointSeats`
 * interleaves leg-by-leg, so a two-bolt kit puts one bolt on each leg —
 * `bolt|x|8|0` at [8, 3, 0] driving along −Y, and `bolt|y|8|0` at [3, 8, 0]
 * driving along −X. A bolt driving −Y enters the runner whose slot mouth faces
 * +Y, and that runner necessarily runs along X. Its T-nut lands at (8, −8, 0),
 * i.e. inside that runner's slot rather than buried in solid material.
 *
 * Still knowingly imperfect, but no longer mis-sized: `PROFILE_DIMS` has no
 * 21 mm entry, so these are 30 mm bars while the cast bracket is 21 mm — the
 * same visual mismatch the main configurator has. The picker can widen them,
 * which widens the mismatch with it; left as-is rather than papered over.
 *
 * Opaque on purpose. The placeholders these replaced were 24%-opacity boxes, and
 * that trick does not survive contact with a real profile: three.js does not
 * depth-sort triangles within one geometry, and an ASCII STL arrives as a
 * non-indexed `BufferGeometry` (3030 is 4128 faces = 12384 vertices), so with
 * `depthWrite: false` the slot mouths and lips all bleed into each other and the
 * very detail being shown is erased. The repo's answer for "see inside a solid"
 * is the ghost mechanism instead — `depthTest/depthWrite = !ghost` plus
 * `renderOrder`, see `DiyNutGeometry` — and every T-nut here already carries
 * `ghost: f.internal`, so it draws over these bars regardless of their depth.
 *
 * `ProfileStl` centres its mesh on all three axes, extrusion axis included, so
 * each bar spans ±length/2 and needs a group to put it where the box used to be.
 * The offsets below reproduce the old spans exactly: A x ∈ [0, run], y ∈ [−size, 0].
 */
const PROFILE_COLOR = '#9fb0c0';

const Extrusions: FC<{ profileSize: string; sizeMm: number; runMm: number }> = ({
  profileSize,
  sizeMm,
  runMm,
}) => (
  <>
    <group position={[(runMm / 2) * M, (-sizeMm / 2) * M, 0]}>
      <ProfileStl
        profileSize={profileSize}
        length={runMm}
        direction="X"
        color={PROFILE_COLOR}
        metalness={0.35}
        roughness={0.45}
      />
    </group>
    <group position={[(-sizeMm / 2) * M, (runMm / 2) * M, 0]}>
      <ProfileStl
        profileSize={profileSize}
        length={runMm}
        direction="Y"
        color={PROFILE_COLOR}
        metalness={0.35}
        roughness={0.45}
      />
    </group>
  </>
);

/**
 * Dev-only: hands the camera to the page so a headless test can project a part
 * to screen coordinates and drive a real pointer drag, rather than asserting the
 * drag maths by calling the store itself. Same convention as `__wcFastenerCount`.
 */
const DevCameraProbe: FC = () => {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcKitEditorCamera?: unknown };
    w.__wcKitEditorCamera = camera;
    return () => {
      delete w.__wcKitEditorCamera;
    };
  }, [camera]);
  return null;
};

export interface KitEditorSceneProps {
  kit: AccessoryKit;
  /** The connector whose hole pattern the edits are keyed on. */
  stlUrl: string;
  /** Which extrusion to draw the assembly with. PREVIEW ONLY — it must never
   *  reach `jointFasteners` or the layout key, or the count stops matching the
   *  schedule. See the page's `?profile=` handling. */
  profileSize: string;
  layout: KitLayout | null;
  selectedPartKey: string | null;
  onSelect: (partKey: string | null) => void;
  /** Unedited seat positions, so the drag stores a delta against the seat. */
  baseByKey: Map<string, [number, number, number]>;
  setKey: string;
}

/**
 * The editor's own viewport: a real connector, the two extrusions it joins and
 * the hardware, at catalog scale under the identity transform.
 *
 * Deliberately standalone — it does NOT read `diyStore` or `modelStore`, so
 * selecting a part here cannot disturb either mode's state. The production
 * viewers' fastener renderers are not reused because they set
 * `raycast = () => null`; picking is the point here.
 */
const KitEditorScene: FC<KitEditorSceneProps> = ({
  kit,
  stlUrl,
  profileSize,
  layout,
  selectedPartKey,
  onSelect,
  baseByKey,
  setKey,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  // A drag ends with the pointer over empty space, which R3F reports as a miss —
  // without this the release would drop the very selection being dragged.
  const draggingRef = useRef(false);
  const cc = connectorByStlUrl(stlUrl);
  const fasteners = useMemo(() => jointFasteners(kit, stlUrl, 1, layout), [kit, stlUrl, layout]);

  // Dev-only, same convention as `__wcFastenerCount` / `__wcDiyFastenerCount`:
  // this page's whole promise is that the list, the canvas and the export agree,
  // so a test must be able to count the CANVAS rather than read the list and
  // assume the two match. Assignment, not accumulation — unlike the production
  // viewers there is exactly one scene per page, and `fasteners` already has the
  // layout applied (a removed part is gone from it, not filtered out here).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcKitEditorCount?: number };
    w.__wcKitEditorCount = fasteners.length;
  }, [fasteners.length]);
  // The extrusion LENGTH is pinned to the 3030 baseline and deliberately not to
  // `profileSize`: `runMm` sets how big the assembly is, so letting a preview
  // setting drive it would turn "switch to 4040" into a 120 → 160 mm rescale of
  // the whole scene rather than a wider bar. Only the cross-section follows the
  // picker. `PROFILE_DIMS` has no 21 mm entry, so a small connector still gets
  // 30 mm bars — the same mismatch the main configurator has.
  const runMm = Math.max(4 * PROFILE_DIMS['3030'], 4 * cc.extMm);
  const sizeMm = PROFILE_DIMS[profileSize as keyof typeof PROFILE_DIMS] ?? PROFILE_DIMS['3030'];

  return (
    <Canvas
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: 'srgb' }}
      camera={{ position: [0.13, 0.1, 0.15], fov: 40, near: 0.001, far: 10 }}
      style={{ width: '100%', height: '100%' }}
      // A pick that lands on nothing clears the selection — otherwise the panel
      // keeps editing a part the user can no longer see is chosen.
      onPointerMissed={() => {
        if (!draggingRef.current) onSelect(null);
      }}
    >
      <color attach="background" args={['#151a21']} />
      <DevCameraProbe />
      <ambientLight intensity={0.55} />
      <directionalLight position={[0.15, 0.25, 0.2]} intensity={1.9} color="#fff8ee" />
      <directionalLight position={[-0.2, -0.1, -0.15]} intensity={0.5} color="#dce8ff" />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        minDistance={0.02}
        maxDistance={1.2}
        target={[0.01, 0.01, 0]}
      />
      <axesHelper args={[M * runMm * 0.35]} />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport />
      </GizmoHelper>

      {/* Low metalness on purpose, for the extrusions as much as the connector:
          the scene has no environment map, so a 0.9-metalness material renders
          as a black blob and hides the parts this page exists to show. This is
          why `ProfileStl`'s own 0.7 default is overridden here. */}
      <ProfileBoundary
        fallback={
          <Html center>
            <div className="px-3 py-2 rounded bg-red-950/80 text-red-200 text-xs whitespace-nowrap">
              型材模型加载失败，装配体只剩五金件
            </div>
          </Html>
        }
      >
        <Suspense fallback={null}>
          <Extrusions profileSize={profileSize} sizeMm={sizeMm} runMm={runMm} />
          <ConnectorStl url={cc.stlUrl} size={cc.extMm} color="#98a2ac" metalness={0.35} roughness={0.45} />
        </Suspense>
      </ProfileBoundary>
      {/* Every part, internal ones included: the two production viewers hide
          T-nuts behind a display toggle, but here the list beside the canvas
          promises the count the scene draws, and a part you cannot see is a part
          you cannot tune. */}
      {fasteners.map((f) => (
        <PartMesh
          key={f.key}
          fastener={f}
          selected={f.key === selectedPartKey}
          onPick={onSelect}
        />
      ))}
      {(() => {
        const picked = fasteners.find((f) => f.key === selectedPartKey);
        if (!picked || layout?.parts[selectedPartKey ?? '']?.removed) return null;
        return (
          <PartDragGizmo
            fastener={picked}
            base={baseByKey.get(picked.key) ?? [0, 0, 0]}
            setKey={setKey}
            controlsRef={controlsRef}
            onDragChange={(d) => {
              draggingRef.current = d;
            }}
          />
        );
      })()}
    </Canvas>
  );
};

export default KitEditorScene;
