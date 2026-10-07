import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BracketInstance } from '../types/furniture';
import { bracketStlUrl } from '../types/furniture';
import { useModelStore } from '../store/modelStore';
import { HARDWARE_TONE, SCREW_SERIES, accessoryKitById, jointFasteners } from '../utils/accessoryKits';
import { useKitLayoutFor } from '../store/kitLayoutStore';
import type { LocalFastener } from '../utils/accessoryKits';
import { CoverMesh, ScrewMesh, TNutMesh } from '../diy/FastenerStl';
import { DEFAULT_SCREW_FAMILY } from '../diy/fastenerDims';

const MM_TO_M = 0.001;

/** The catalog part for a fastener. Geometry comes from the baked STL (shared by
 *  `useLoader` per URL), so there is no prototype cache any more — but the parts
 *  are still NOT pickable: the bracket itself is what the user selects and drags,
 *  and a fastener that swallowed that click would be a hole in its hit area. */
const FastenerStl: React.FC<{ fastener: LocalFastener; ghosted: boolean }> = ({
  fastener,
  ghosted,
}) => {
  const { spec } = fastener;
  const size = spec.size ?? 'M6';
  if (spec.kind === 't_nut') {
    return (
      <TNutMesh
        size={size}
        series={SCREW_SERIES}
        family={spec.tnutFamily}
        color={HARDWARE_TONE.t_nut}
        ghost={ghosted}
      />
    );
  }
  // A cover is neither a screw nor a nut — it has no size, no length and no
  // family, so there is nothing for the screw branch to read off it.
  if (spec.kind === 'cover') {
    return <CoverMesh uid={spec.uid} color={HARDWARE_TONE.cover} />;
  }
  return (
    <ScrewMesh
      family={spec.family ?? DEFAULT_SCREW_FAMILY}
      size={size}
      length={spec.length ?? 0}
      color={HARDWARE_TONE[spec.kind]}
    />
  );
};

const FastenerMesh: React.FC<{ fastener: LocalFastener; ghosted: boolean; bracketId: string }> = ({
  fastener,
  ghosted,
  bracketId,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { position, rotation } = fastener;

  // Dev-only: expose the mounted node so a headless check can prove the fastener
  // really is a DESCENDANT of its bracket's transform group (rather than a
  // sibling that happens to land nearby). Asserting the parent chain is the only
  // way to actually test the nesting this design depends on.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const obj = groupRef.current;
    if (!obj) return;
    const w = window as unknown as { __wcFastenerNodes?: unknown[] };
    const rec = {
      bracketId,
      object: obj,
      local: position,
      /** Closest ancestor group carrying this bracket's tag. */
      bracketGroup: (() => {
        let p: THREE.Object3D | null = obj.parent;
        while (p) {
          if (p.userData?.wcBracketId === bracketId) return p;
          p = p.parent;
        }
        return null;
      })(),
    };
    (w.__wcFastenerNodes ??= []).push(rec);
    return () => {
      const list = w.__wcFastenerNodes ?? [];
      const i = list.indexOf(rec);
      if (i >= 0) list.splice(i, 1);
    };
  }, [bracketId, position]);

  return (
    <group
      ref={groupRef}
      // The bracket group's space is METRES (its STL child carries the mm→m
      // scale), so a local offset authored in mm must be converted here — the
      // fastener's own mm-sized geometry is then sized by the same MM_TO_M.
      position={[position[0] * MM_TO_M, position[1] * MM_TO_M, position[2] * MM_TO_M]}
      rotation={rotation as unknown as [number, number, number]}
      scale={MM_TO_M}
    >
      <FastenerStl fastener={fastener} ghosted={ghosted} />
    </group>
  );
};

/**
 * The bolts (and optionally the T-nuts) for one bracket joint.
 *
 * MUST be rendered INSIDE the bracket's own <group position rotation>, never as
 * a sibling with a recomputed transform: `BracketInstance.rotation` is documented
 * as intrinsic ZYX but is consumed by three as its default XYZ order, so any
 * re-derivation in one order or the other drifts on multi-axis brackets. Nested,
 * the fasteners inherit the bracket's matrix verbatim and cannot disagree with it.
 */
export const FastenerSet: React.FC<{ bracket: BracketInstance }> = ({ bracket }) => {
  const activeKitId = useModelStore((s) => s.activeKitId);
  const showFasteners = useModelStore((s) => s.showFasteners);
  const showInternalFasteners = useModelStore((s) => s.showInternalFasteners);

  const kit = accessoryKitById(activeKitId);
  // THIS bracket's connector — its own `stlUrl`, or the default bracket's when it
  // has none. Resolved once, through the same helper `ModelLoader` draws the mesh
  // with, because the seats and the mesh have to be the same part: a bracket that
  // fell back to the default MESH while seating hardware on the unknown-url
  // PATTERN would draw bolts through a plate that has no holes there.
  const stlUrl = bracketStlUrl(bracket);
  // The user's per-part edits, resolved through that same url — which is what
  // scopes the edits (see `kitLayoutKey`, keyed on the hole pattern).
  const layout = useKitLayoutFor(activeKitId, stlUrl);
  const fasteners = useMemo(
    () => (kit ? jointFasteners(kit, stlUrl, 1, layout) : []),
    [kit, stlUrl, layout],
  );
  const shown = showFasteners
    ? fasteners.filter((f) => !f.internal || showInternalFasteners)
    : [];

  // Dev-only: how many fasteners are actually mounted, for headless assertions.
  // Increment/decrement so StrictMode's double-invoke and unmounts stay netted.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcFastenerCount?: number };
    w.__wcFastenerCount = (w.__wcFastenerCount ?? 0) + shown.length;
    return () => {
      w.__wcFastenerCount = (w.__wcFastenerCount ?? 0) - shown.length;
    };
  }, [shown.length]);

  if (shown.length === 0) return null;
  return (
    <group>
      {shown.map((f) => (
        // `f.key` (the seat), not the index: after an add or a delete an index
        // would make React reuse a node for a different part.
        <FastenerMesh key={f.key} fastener={f} ghosted={f.internal} bracketId={bracket.id} />
      ))}
    </group>
  );
};
