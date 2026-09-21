import React, { useEffect, useMemo } from 'react';
import { useDiyStore } from '../store/diyStore';
import { connectorById } from './connectors';
import type { DiyBracket } from '../types/furniture';
import { SCREW_SERIES, accessoryKitById, jointFasteners } from '../utils/accessoryKits';
import { useKitLayoutFor } from '../store/kitLayoutStore';
import type { LocalFastener } from '../utils/accessoryKits';
import { ScrewMesh, TNutMesh } from './FastenerStl';
import { DEFAULT_SCREW_FAMILY } from './fastenerDims';

const M = 0.001;

const TONE = {
  socket_screw: '#c8c8c8',
  // Steel, like the socket screws and like the BOM's material column: the brass
  // tone this had was the 木螺钉's, and it is now a steel machine screw — one
  // that would also read as a T-nut, which really is brass.
  countersunk_screw: '#c8c8c8',
  t_nut: '#b08d57',
} as const;

/**
 * One fastener. Position in mm (the store's own unit), geometry from the baked
 * catalog STL, and NOT pickable — the bracket is the click target here.
 *
 * `scale={M}` is the CALLER's half of the mm→m contract in `FastenerStl.tsx`: the
 * anchor group this sits in is in scene metres (the connector STL normalises
 * itself, and the offsets are already ×M), while the baked geometry is in mm. It
 * is easy to lose — the procedural prototypes this replaced carried their own
 * scale inside `<primitive>`, so nothing here looked like it needed one.
 */
const KitFastener: React.FC<{ fastener: LocalFastener; ghosted: boolean }> = ({ fastener, ghosted }) => {
  const { spec } = fastener;
  const [x, y, z] = fastener.position;
  const size = spec.size ?? 'M6';
  return (
    <group
      position={[x * M, y * M, z * M]}
      rotation={fastener.rotation as unknown as [number, number, number]}
      scale={M}
    >
      {spec.kind === 't_nut' ? (
        <TNutMesh size={size} series={SCREW_SERIES} color={TONE.t_nut} ghost={ghosted} />
      ) : (
        <ScrewMesh
          family={spec.family ?? DEFAULT_SCREW_FAMILY}
          size={size}
          length={spec.length ?? 0}
          color={TONE[spec.kind]}
        />
      )}
    </group>
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
