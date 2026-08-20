import { Suspense, useEffect } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { CornerBracketStl } from './DiyBracketStl';

const M = 0.001;

/**
 * Bracket plate extends from its spine (local origin) along +x/+y by
 * 9.5·scale from the raw STL — so the bounding wireframe is centered there,
 * not on the spine.
 */
const bodyOffset = (size: number) => (9.5 * size) / 21;

/** Wireframe cube showing bracket boundary */
const BracketWireframe: React.FC<{ size: number; isSelected: boolean }> = ({ size, isSelected }) => {
  const s = M * size;
  const off = M * bodyOffset(size);
  return (
    <mesh position={[off, off, 0]} renderOrder={1}>
      <boxGeometry args={[s, s, s]} />
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
                <BracketWireframe size={b.size} isSelected={isSel} />
                <Suspense fallback={null}>
                  <CornerBracketStl size={b.size} />
                </Suspense>
              </group>
            </group>
          );
        })}

      {/* Auto-algorithm reference bracket (translucent blue) for comparing
          against a manually placed bracket during debugging. */}
      {autoRefBracket && (
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
          <mesh position={[M * bodyOffset(autoRefBracket.size), M * bodyOffset(autoRefBracket.size), 0]} renderOrder={6}>
            <boxGeometry args={[M * autoRefBracket.size, M * autoRefBracket.size, M * autoRefBracket.size]} />
            <meshBasicMaterial color="#44aaff" wireframe transparent opacity={0.5} />
          </mesh>
          <Suspense fallback={null}>
            <CornerBracketStl size={autoRefBracket.size} color="#44aaff" opacity={0.4} metalness={0.2} />
          </Suspense>
        </group>
      )}
    </group>
  );
};

export default DiyBracketRenderer;
