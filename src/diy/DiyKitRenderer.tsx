import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { connectorById } from './connectors';
import type { DiyBracket } from '../types/furniture';
import { accessoryKitById, jointFasteners } from '../utils/accessoryKits';
import { useKitLayoutFor } from '../store/kitLayoutStore';
import type { LocalFastener } from '../utils/accessoryKits';
import { buildScrewGroup } from './DiyScrewGeometry';
import { buildTNutGroup } from './DiyNutGeometry';

const M = 0.001;

const TONE = { socket_screw: '#c8c8c8', wood_screw: '#b98a4a', t_nut: '#b08d57' } as const;

/** Prototype cache — clones share geometry and material. */
const prototypes = new Map<string, THREE.Object3D>();

function prototypeFor(f: LocalFastener, ghosted: boolean): THREE.Object3D {
  const spec = f.spec;
  const key = `${spec.kind}|${spec.size ?? ''}|${spec.length ?? ''}|${ghosted ? 'g' : 's'}`;
  let proto = prototypes.get(key);
  if (!proto) {
    const size = spec.size ?? 'M6';
    proto =
      spec.kind === 't_nut'
        ? buildTNutGroup(size, { color: TONE.t_nut, ghost: ghosted })
        : buildScrewGroup(size, spec.length ?? 18, { color: TONE[spec.kind] });
    proto.traverse((o) => {
      (o as THREE.Mesh).raycast = () => null;
    });
    prototypes.set(key, proto);
  }
  return proto;
}

/** One fastener, in the ANCHOR group's millimetre space (see DiyKitGroup). */
const KitFastener: React.FC<{ fastener: LocalFastener; ghosted: boolean }> = ({ fastener, ghosted }) => {
  const obj = useMemo(() => prototypeFor(fastener, ghosted).clone(), [fastener, ghosted]);
  const [x, y, z] = fastener.position;
  return (
    <primitive
      object={obj}
      position={[x * M, y * M, z * M]}
      rotation={fastener.rotation as unknown as [number, number, number]}
      scale={M}
    />
  );
};

/**
 * The hardware for one kit instance.
 *
 * MUST be rendered INSIDE the bracket's inner ANCHOR group — the same group the
 * connector STL lives in, and the only frame in which a catalog-unit local
 * offset is meaningful. Nesting (rather than recomputing a world transform in
 * the store) means the fasteners inherit the bracket's exact matrix, including
 * the ZYX-documented-but-XYZ-rendered rotation. DiyBracketRenderer mounts this;
 * it is not a sibling of the bracket.
 */
const KitGroup: React.FC<{ bracket: DiyBracket; kitId: string }> = ({ bracket, kitId }) => {
  const showFasteners = useDiyStore((s) => s.showKitFasteners);
  const showNuts = useDiyStore((s) => s.showKitNuts);

  const kit = accessoryKitById(kitId);
  const cc = connectorById(bracket.connectorId);
  // The DIY viewer draws the connector at `size`, so the catalog-unit seats must
  // be scaled by the same ratio or they drift off the plate.
  const scale = bracket.size / cc.extMm;

  // Resolved per kit INSTANCE (this bracket's connector): the edits are keyed on
  // the hole pattern, so two instances on different connectors can differ.
  const layout = useKitLayoutFor(kitId, cc.stlUrl);
  const fasteners = useMemo(
    () => (kit ? jointFasteners(kit, cc.stlUrl, scale, layout) : []),
    [kit, cc.stlUrl, scale, layout],
  );
  const shown = showFasteners ? fasteners.filter((f) => !f.internal || showNuts) : [];

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcDiyFastenerCount?: number };
    w.__wcDiyFastenerCount = (w.__wcDiyFastenerCount ?? 0) + shown.length;
    return () => {
      w.__wcDiyFastenerCount = (w.__wcDiyFastenerCount ?? 0) - shown.length;
    };
  }, [shown.length]);

  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((f) => (
        // `f.key` (the seat), not the index — see the main renderer.
        <KitFastener key={f.key} fastener={f} ghosted={f.internal} />
      ))}
    </>
  );
};

export default KitGroup;
