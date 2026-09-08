import { Suspense, useEffect } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { ConnectorStl } from './DiyBracketStl';
import { connectorById } from './connectors';
import type { DiyConnector } from './connectors';

const M = 0.001;

/**
 * Bounding-wireframe spec for a connector, in *display* millimetres (i.e. the
 * catalog's natural boxMm scaled by size/extMm so it matches the scaled mesh).
 *
 * - cast `corner_bracket`: legacy box — the plate body is a `size` cube whose
 *   spine sits at the origin and body extends +x/+y by 9.5/21·size.
 * - imported connectors: tight bbox from `boxMm` (mounting faces on x=0/y=0,
 *   z centred), so the highlight hugs the real MayTec model.
 */
const wireframeSpec = (cc: DiyConnector, size: number): { args: [number, number, number]; pos: [number, number, number] } => {
  const sc = size / cc.extMm;
  if (cc.id === 'corner_bracket') {
    const off = 9.5 * sc;
    return { args: [size, size, size], pos: [off, off, 0] };
  }
  const mn = cc.boxMm.min;
  const mx = cc.boxMm.max;
  return {
    args: [(mx[0] - mn[0]) * sc, (mx[1] - mn[1]) * sc, (mx[2] - mn[2]) * sc],
    pos: [((mx[0] + mn[0]) / 2) * sc, ((mx[1] + mn[1]) / 2) * sc, ((mx[2] + mn[2]) / 2) * sc],
  };
};

/** Wireframe box showing the connector boundary (scaled to the placed size). */
const BracketWireframe: React.FC<{ connector: DiyConnector; size: number; isSelected: boolean }> = ({ connector, size, isSelected }) => {
  const { args, pos } = wireframeSpec(connector, size);
  return (
    <mesh position={[pos[0] * M, pos[1] * M, pos[2] * M]} renderOrder={1}>
      <boxGeometry args={[args[0] * M, args[1] * M, args[2] * M]} />
      <meshBasicMaterial
        color={isSelected ? '#88ccff' : '#4488aa'}
        wireframe
        transparent
        opacity={isSelected ? 0.6 : 0.3}
        depthTest
      />
    </mesh>
  );
};

const DiyBracketRenderer: React.FC = () => {
  const brackets = useDiyStore((s) => s.brackets);
  const selectedBracketId = useDiyStore((s) => s.selectedBracketId);
  const selectBracket = useDiyStore((s) => s.selectBracket);
  const autoRefBracket = useDiyStore((s) => s.autoRefBracket);

  // Log when selected bracket changes
  useEffect(() => {
    if (!selectedBracketId) return;
    const b = brackets.find((x) => x.id === selectedBracketId);
    if (b) {
      console.log('[Bracket Selected]', b.id.slice(-6),
        'pos:', b.position, 'rot:', b.rotation,
        'anchor:', b.anchorPosition, b.anchorRotation,
        'faces:', b.connectedProfiles.map((p) => p.slice(-6)));
    }
  }, [selectedBracketId, brackets]);

  return (
    <group>
      {brackets
        .filter((b) => b.enabled)
        .map((b) => {
          const isSel = b.id === selectedBracketId;
          const cc = connectorById(b.connectorId);
          return (
            <group
              key={b.id}
              position={[M * b.position.x, M * b.position.y, M * b.position.z]}
              rotation={[
                THREE.MathUtils.degToRad(b.rotation.roll),
                THREE.MathUtils.degToRad(b.rotation.pitch),
                THREE.MathUtils.degToRad(b.rotation.yaw),
              ]}
              onClick={(e) => { e.stopPropagation(); selectBracket(isSel ? null : b.id); }}
            >
              {/* Anchor offset: local transform inside world transform */}
              <group
                position={[M * b.anchorPosition.x, M * b.anchorPosition.y, M * b.anchorPosition.z]}
                rotation={[
                  THREE.MathUtils.degToRad(b.anchorRotation.roll),
                  THREE.MathUtils.degToRad(b.anchorRotation.pitch),
                  THREE.MathUtils.degToRad(b.anchorRotation.yaw),
                ]}
              >
                <BracketWireframe connector={cc} size={b.size} isSelected={isSel} />
                <Suspense fallback={null}>
                  <ConnectorStl url={cc.stlUrl} size={b.size} color={cc.color} />
                </Suspense>
              </group>
            </group>
          );
        })}

      {/* Auto-algorithm reference bracket (translucent blue) for comparing
          against a manually placed bracket during debugging. Renders whatever
          connector the reference carries (always cast in practice). */}
      {autoRefBracket && (() => {
        const acc = connectorById(autoRefBracket.connectorId);
        const spec = wireframeSpec(acc, autoRefBracket.size);
        return (
          <group
            position={[
              M * autoRefBracket.position.x,
              M * autoRefBracket.position.y,
              M * autoRefBracket.position.z,
            ]}
            rotation={[
              THREE.MathUtils.degToRad(autoRefBracket.rotation.roll),
              THREE.MathUtils.degToRad(autoRefBracket.rotation.pitch),
              THREE.MathUtils.degToRad(autoRefBracket.rotation.yaw),
            ]}
            renderOrder={6}
          >
            <mesh
              position={[spec.pos[0] * M, spec.pos[1] * M, spec.pos[2] * M]}
              renderOrder={6}
            >
              <boxGeometry args={[spec.args[0] * M, spec.args[1] * M, spec.args[2] * M]} />
              <meshBasicMaterial color="#44aaff" wireframe transparent opacity={0.5} />
            </mesh>
            <Suspense fallback={null}>
              <ConnectorStl url={acc.stlUrl} size={autoRefBracket.size} color="#44aaff" opacity={0.4} metalness={0.2} />
            </Suspense>
          </group>
        );
      })()}
    </group>
  );
};

export default DiyBracketRenderer;
