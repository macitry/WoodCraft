import { Suspense, type FC } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import type { ScrewSize } from '../types/furniture';
import {
  findScrew,
  findTNut,
  type BakedScrew,
  type BakedTNut,
  type ScrewFamily,
} from './fasteners';

/**
 * Hardware geometry, straight from the MayCad catalog.
 *
 * These replace the hand-modelled cylinders-and-boxes the app used to draw for a
 * bolt or a T-nut (`buildScrewGroup` / `buildTNutGroup`). The baked meshes are
 * already in the app's own frame — MILLIMETRES, the part's mating plane on z=0,
 * axis +Z into the material (see `fasteners.ts`) — so nothing here rescales,
 * recentres or reorients.
 *
 * The mm→m scale stays the CALLER's business, exactly as it was for the
 * procedural groups these replace: every call site already sits inside a
 * `scale={0.001}` node, and the alternative (scaling here and rescaling the
 * positions that go with it) would have meant rewriting five frames to no
 * benefit. Forgotten, the part is 1000x too big — loud, not silent.
 *
 * A `part` (not a size) is what gets passed in: the table is the only thing that
 * knows which catalog part a given (family, size, length) is, and a length the
 * catalog does not hold resolves to the nearest one INSIDE `findScrew` rather
 * than arriving here as a missing part.
 */

/** Never a click target. The production viewers keep the bracket itself as the
 *  thing the user selects and drags; a fastener that swallowed that click would
 *  be an invisible hole in the bracket's hit area. */
const NO_PICK = () => null;

/** What a screw and a T-nut both take. */
interface MeshProps {
  /** Self-illumination, for the editor's selection highlight. A prop rather than
   *  a post-hoc material clone (`useHighlight`) because each mesh owns its
   *  material here: there is no shared one to protect, and mutating the mesh's
   *  own material would be the same code with more steps. */
  emissive?: string;
  emissiveIntensity?: number;
  /** Draw order. Only the drag ghost uses it, to land on top of the profile it
   *  is being placed against. */
  renderOrder?: number;
  /** Off by default; only the editor, where picking a part is the point. */
  pickable?: boolean;
}

export interface ScrewMeshProps extends MeshProps {
  family: ScrewFamily;
  size: ScrewSize;
  /** Catalog nominal length (mm). Snapped to the nearest baked part. */
  length: number;
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
}

const ScrewMesh_ = ({ part, ...props }: ScrewMeshProps & { part: BakedScrew }) => {
  const geometry = useLoader(STLLoader, part.stlUrl);
  return (
    <mesh
      geometry={geometry}
      renderOrder={props.renderOrder ?? 0}
      {...(props.pickable ? {} : { raycast: NO_PICK })}
    >
      <meshStandardMaterial
        color={props.color ?? '#c8c8c8'}
        metalness={props.metalness ?? 0.85}
        roughness={props.roughness ?? 0.32}
        transparent={(props.opacity ?? 1) < 1}
        opacity={props.opacity ?? 1}
        // Always a colour, never `undefined`: see EmissiveProps.
        emissive={props.emissive ?? '#000000'}
        emissiveIntensity={props.emissiveIntensity ?? 0.75}
      />
    </mesh>
  );
};

export const ScrewMesh: FC<ScrewMeshProps> = (props) => (
  // Own Suspense boundary: this module is dropped into four different scenes and
  // an unresolved loader would otherwise blow up whichever of them forgot one.
  <Suspense fallback={null}>
    <ScrewMesh_ {...props} part={findScrew(props.family, props.size, props.length)} />
  </Suspense>
);

export interface TNutMeshProps extends MeshProps {
  size: ScrewSize;
  /** Profile series whose slot the block fits (SCREW_SERIES). Required: the
   *  thread size does not determine it, and a guessed series would draw a nut
   *  whose name is a lie. */
  series: number;
  color?: string;
  opacity?: number;
  /**
   * X-ray mode. A T-nut lives INSIDE the profile's slot, behind opaque
   * aluminium, so with normal depth testing it is never visible however it is
   * coloured — an "x-ray" toggle that only lowered opacity would draw nothing on
   * screen. Ghosted nuts therefore also drop depth testing and draw late, so
   * they show through the profile that contains them.
   */
  ghost?: boolean;
  pickable?: boolean;
}

const TNutMesh_ = ({ part, ...props }: TNutMeshProps & { part: BakedTNut }) => {
  const geometry = useLoader(STLLoader, part.stlUrl);
  const ghost = props.ghost ?? false;
  const opacity = props.opacity ?? (ghost ? 0.45 : 1);
  return (
    <mesh
      geometry={geometry}
      // See `ghost`: without this the nut is hidden by the profile around it.
      renderOrder={props.renderOrder ?? (ghost ? 7 : 0)}
      {...(props.pickable ? {} : { raycast: NO_PICK })}
    >
      <meshStandardMaterial
        color={props.color ?? '#b08d57'}
        metalness={0.75}
        roughness={0.45}
        transparent={opacity < 1}
        opacity={opacity}
        depthTest={!ghost}
        depthWrite={!ghost}
        emissive={props.emissive ?? '#000000'}
        emissiveIntensity={props.emissiveIntensity ?? 0.75}
      />
    </mesh>
  );
};

export const TNutMesh: FC<TNutMeshProps> = (props) => (
  <Suspense fallback={null}>
    <TNutMesh_ {...props} part={findTNut(props.size, props.series)} />
  </Suspense>
);
