import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BracketInstance } from '../types/furniture';
import { useModelStore } from '../store/modelStore';
import { accessoryKitById, jointFasteners } from '../utils/accessoryKits';
import { useKitLayoutFor } from '../store/kitLayoutStore';
import type { HardwareKind, LocalFastener } from '../utils/accessoryKits';
import { buildScrewGroup } from '../diy/DiyScrewGeometry';
import { buildTNutGroup } from '../diy/DiyNutGeometry';

const MM_TO_M = 0.001;

/** Base colour per hardware kind — bolts read as steel, T-nuts as brass. */
const TONE: Record<HardwareKind, string> = {
  socket_screw: '#c8c8c8',
  wood_screw: '#b98a4a',
  t_nut: '#b08d57',
};

/**
 * Prototype cache: one geometry/material set per distinct hardware spec, cloned
 * per instance. `Object3D.clone()` shares geometry + material by reference, so
 * 16 brackets x 4 pieces costs 4 material sets, not 64.
 */
const prototypes = new Map<string, THREE.Object3D>();

function prototypeFor(f: LocalFastener, ghosted: boolean): THREE.Object3D {
  const key = `${f.spec.kind}|${f.spec.size ?? ''}|${f.spec.length ?? ''}|${ghosted ? 'g' : 's'}`;
  let proto = prototypes.get(key);
  if (!proto) {
    const spec = f.spec;
    const size = spec.size ?? 'M6';
    proto =
      spec.kind === 't_nut'
        ? buildTNutGroup(size, { color: TONE.t_nut, ghost: ghosted })
        : buildScrewGroup(size, spec.length ?? 18, { color: TONE[spec.kind] });
    // Fasteners must never steal the bracket's click — the bracket itself is
    // what the user selects and drags.
    proto.traverse((o) => {
      (o as THREE.Mesh).raycast = () => null;
    });
    prototypes.set(key, proto);
  }
  return proto;
}

const FastenerMesh: React.FC<{ fastener: LocalFastener; ghosted: boolean; bracketId: string }> = ({
  fastener,
  ghosted,
  bracketId,
}) => {
  const obj = useMemo(() => prototypeFor(fastener, ghosted).clone(), [fastener, ghosted]);
  const { position, rotation } = fastener;

  // Dev-only: expose the mounted node so a headless check can prove the fastener
  // really is a DESCENDANT of its bracket's transform group (rather than a
  // sibling that happens to land nearby). Asserting the parent chain is the only
  // way to actually test the nesting this design depends on.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
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
  }, [obj, bracketId, position]);

  return (
    <primitive
      object={obj}
      // The bracket group's space is METRES (its STL child carries the mm→m
      // scale), so a local offset authored in mm must be converted here — the
      // fastener's own mm-sized geometry is then sized by the same MM_TO_M.
      position={[position[0] * MM_TO_M, position[1] * MM_TO_M, position[2] * MM_TO_M]}
      rotation={rotation as unknown as [number, number, number]}
      scale={MM_TO_M}
    />
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
  // The user's per-part edits, resolved through THIS bracket's connector — the
  // same stlUrl the seats are derived from, which is what scopes the edits.
  const layout = useKitLayoutFor(activeKitId, bracket.stlUrl);
  const fasteners = useMemo(
    () => (kit ? jointFasteners(kit, bracket.stlUrl, 1, layout) : []),
    [kit, bracket.stlUrl, layout],
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
