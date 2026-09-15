import { Suspense, useEffect, useMemo, useRef, type FC } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { ConnectorStl } from '../diy/DiyBracketStl';
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
 * The two extrusion placeholders the joint is bolted into.
 *
 * Runner A runs along +X with its slot face on y=0; runner B runs along +Y with
 * its face on x=0 — the two faces the connector's plates bear against. The
 * orientation is not arbitrary: the default pattern puts two seats 7 mm apart
 * along x (8 and 15), and two bolts can only share one slot if that slot runs
 * along x. So the runner the leg-x bolts enter must run along x, and its slot
 * mouth must face the bolt — which is exactly where a T-nut ends up.
 *
 * Display only, and knowingly imperfect: `PROFILE_DIMS` has no 21 mm entry, so
 * these are 30 mm 3030 bars while the cast bracket is 21 mm — the same visual
 * mismatch the main configurator has. Left as-is rather than papered over.
 */
const ProfilePlaceholders: FC<{ size: number; lengthMm: number }> = ({ size, lengthMm }) => {
  const box = (center: [number, number, number], dims: [number, number, number]) => (
    <mesh position={[center[0] * M, center[1] * M, center[2] * M]}>
      <boxGeometry args={[dims[0] * M, dims[1] * M, dims[2] * M]} />
      <meshStandardMaterial
        color="#9fb0c0"
        metalness={0.3}
        roughness={0.6}
        transparent
        opacity={0.24}
        depthWrite={false}
      />
    </mesh>
  );
  return (
    <>
      {/* A: x ∈ [0, length], y ∈ [-size, 0] */}
      {box([lengthMm / 2, -size / 2, 0], [lengthMm, size, size])}
      {/* B: y ∈ [0, length], x ∈ [-size, 0] */}
      {box([-size / 2, lengthMm / 2, 0], [size, lengthMm, size])}
    </>
  );
};

export interface KitEditorSceneProps {
  kit: AccessoryKit;
  /** The connector whose hole pattern the edits are keyed on. */
  stlUrl: string;
  layout: KitLayout | null;
  selectedPartKey: string | null;
  onSelect: (partKey: string | null) => void;
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
  layout,
  selectedPartKey,
  onSelect,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const cc = connectorByStlUrl(stlUrl);
  const fasteners = useMemo(() => jointFasteners(kit, stlUrl, 1, layout), [kit, stlUrl, layout]);
  // One profile size for both placeholders; 3030 unless the connector is bigger.
  const profileMm = PROFILE_DIMS['3030'];
  const runMm = Math.max(4 * profileMm, 4 * cc.extMm);

  return (
    <Canvas
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: 'srgb' }}
      camera={{ position: [0.13, 0.1, 0.15], fov: 40, near: 0.001, far: 10 }}
      style={{ width: '100%', height: '100%' }}
      // A pick that lands on nothing clears the selection — otherwise the panel
      // keeps editing a part the user can no longer see is chosen.
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#151a21']} />
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

      <ProfilePlaceholders size={profileMm} lengthMm={runMm} />
      <Suspense fallback={null}>
        {/* Low metalness on purpose: the scene has no environment map, so a
            0.9-metalness material renders as a black blob and hides the parts
            this page exists to show. */}
        <ConnectorStl url={cc.stlUrl} size={cc.extMm} color="#98a2ac" metalness={0.35} roughness={0.45} />
      </Suspense>
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
    </Canvas>
  );
};

export default KitEditorScene;
