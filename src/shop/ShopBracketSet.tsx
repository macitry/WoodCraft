import { Suspense } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { bracketStlUrl, type BracketInstance } from '../types/furniture';
import { DEFAULT_ACCESSORY_KIT_ID } from '../utils/accessoryKits';
import { FastenerSetFor } from '../viewer/FastenerParts';

/** The server measures in millimetres; the scene is in metres. */
const MM = 0.001;

/**
 * One corner bracket, drawn exactly where the editor draws it.
 *
 * The bracket's own STL is in millimetres like every other part on this page,
 * so it carries the mm→m scale on the mesh; the group carries the pose. The
 * fasteners nest INSIDE that group on purpose — see `FastenerSetFor` for why
 * the transform must be inherited rather than recomputed.
 */
const BracketPart: React.FC<{ bracket: BracketInstance }> = ({ bracket }) => {
  const geometry = useLoader(STLLoader, bracketStlUrl(bracket));

  return (
    <group
      position={[
        bracket.position.x * MM,
        bracket.position.y * MM,
        bracket.position.z * MM,
      ]}
      // The stored field is documented as intrinsic ZYX but three consumes it
      // as its default XYZ order. That is what the editor does too, and the
      // two views must agree — do not "fix" it here.
      rotation={[
        THREE.MathUtils.degToRad(bracket.rotation.roll),
        THREE.MathUtils.degToRad(bracket.rotation.pitch),
        THREE.MathUtils.degToRad(bracket.rotation.yaw),
      ]}
      userData={{ wcBracketId: bracket.id }}
    >
      <mesh geometry={geometry} scale={[MM, MM, MM]} castShadow receiveShadow>
        <meshStandardMaterial color="#707070" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* The shop has no kit picker and no per-part edits: the same default
          kit the editor starts on, at its preset layout. */}
      <FastenerSetFor
        bracket={bracket}
        kitId={DEFAULT_ACCESSORY_KIT_ID}
        showFasteners
        showInternalFasteners
        layout={null}
      />
    </group>
  );
};

/**
 * The hardware set for the whole piece.
 *
 * `dropY` moves the editor's floor-based frame down to this scene's
 * tabletop-top origin; see `shopBrackets`. The nested `Suspense` is load-bearing
 * twice over: the bracket STL is a network fetch, and the fasteners fetch their
 * own meshes. Without it a slow `.stl` would suspend the desk itself, and the
 * customer would watch their furniture disappear while a bracket loaded.
 */
const ShopBracketSet: React.FC<{ brackets: BracketInstance[]; dropY: number }> = ({
  brackets,
  dropY,
}) => {
  if (brackets.length === 0) return null;
  return (
    <group position={[0, dropY, 0]}>
      <Suspense fallback={null}>
        {brackets.map((bracket) => (
          <BracketPart key={bracket.id} bracket={bracket} />
        ))}
      </Suspense>
    </group>
  );
};

export default ShopBracketSet;
