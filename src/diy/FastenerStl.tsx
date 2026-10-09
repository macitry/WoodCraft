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
  type TNutFamily,
} from './fasteners';
import { coverById } from './connectors';

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

/** Draw order for the one mode that ignores the profile in front of it. Above
 *  the profile bars (0) and the brackets (1) it is meant to be seen across. */
const X_RAY_DRAW_ORDER = 7;

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
  /** Which T-nut the catalog holds for that (size, series) — a plain block or a
   *  spring nut. Defaulted rather than required so the half-dozen callers that
   *  only ever meant "a T-nut" keep drawing the plain block they always drew; the
   *  catalog holds an M6 in BOTH for the same slot, so a default is not a
   *  placeholder here, it is a choice. */
  family?: TNutFamily;
  color?: string;
  opacity?: number;
  /**
   * Draw the nut through the profile it is seated in, by dropping the depth test
   * and drawing late.
   *
   * OFF everywhere a nut is shown as it actually is. A T-nut lives inside the
   * slot, behind the aluminium, so a depth-tested one is invisible from most
   * angles — and that is CORRECT, not a bug to be worked around: the part is
   * where the BOM says it is, and you see it when the slot mouth happens to face
   * you. Setting this in a viewer trades that truth for a nut painted on top of
   * the profile, which reads as a component floating in the metal.
   *
   * The exception is `kits/KitEditorScene`, whose subject IS this hardware: an
   * editor that cannot show two of the five parts it is editing is not usable.
   */
  xray?: boolean;
  pickable?: boolean;
}

const TNutMesh_ = ({ part, ...props }: TNutMeshProps & { part: BakedTNut }) => {
  const geometry = useLoader(STLLoader, part.stlUrl);
  const xray = props.xray ?? false;
  const opacity = props.opacity ?? 1;
  return (
    <mesh
      geometry={geometry}
      // See `xray`: without this the profile covers the nut it is meant to show.
      renderOrder={props.renderOrder ?? (xray ? X_RAY_DRAW_ORDER : 0)}
      {...(props.pickable ? {} : { raycast: NO_PICK })}
    >
      <meshStandardMaterial
        color={props.color ?? '#b08d57'}
        metalness={0.75}
        roughness={0.45}
        transparent={opacity < 1}
        opacity={opacity}
        depthTest={!xray}
        depthWrite={!xray}
        emissive={props.emissive ?? '#000000'}
        emissiveIntensity={props.emissiveIntensity ?? 0.75}
      />
    </mesh>
  );
};

export const TNutMesh: FC<TNutMeshProps> = (props) => (
  <Suspense fallback={null}>
    <TNutMesh_ {...props} part={findTNut(props.size, props.series, props.family)} />
  </Suspense>
);

export interface CoverMeshProps extends MeshProps {
  /** Catalog id of the cover (1.46.204.2828A). */
  uid?: string;
  color?: string;
  metalness?: number;
  roughness?: number;
}

const CoverMesh_ = ({ part, ...props }: CoverMeshProps & { part: { stlUrl: string } }) => {
  const geometry = useLoader(STLLoader, part.stlUrl);
  return (
    <mesh
      geometry={geometry}
      renderOrder={props.renderOrder ?? 0}
      {...(props.pickable ? {} : { raycast: NO_PICK })}
    >
      <meshStandardMaterial
        color={props.color ?? '#9aa0a6'}
        // Die-cast zinc with a powder coat: duller and less metallic than the
        // steel of the screws it hides, which is what makes the cap read as a cap.
        metalness={props.metalness ?? 0.35}
        roughness={props.roughness ?? 0.55}
        emissive={props.emissive ?? '#000000'}
        emissiveIntensity={props.emissiveIntensity ?? 0.75}
      />
    </mesh>
  );
};

/**
 * An angle cover — a CONNECTOR-catalog part, not a fastener, which is why it
 * loads from `/connectors/` and is addressed by catalog id rather than by
 * (family, size, length).
 *
 * An id the catalog does not hold draws NOTHING rather than falling back to some
 * other cap: a cover is cosmetic, and the wrong cap over a joint is worse than an
 * uncovered joint. The position it is drawn at is the caller's business (the
 * cover's baked frame already shares the bracket's own origin).
 */
export const CoverMesh: FC<CoverMeshProps> = (props) => {
  const part = coverById(props.uid);
  if (!part) return null;
  return (
    <Suspense fallback={null}>
      <CoverMesh_ {...props} part={part} />
    </Suspense>
  );
};
