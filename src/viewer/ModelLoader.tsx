import { useMemo, Suspense } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import type { FurnitureModel, Component } from '../types/furniture';
import { useModelStore } from '../store/modelStore';

const { Euler, Quaternion } = THREE;

/**
 * Hybrid 3D model loader for furniture.
 *
 * - Parts with `stlUrl` (from successful backend CAD build) → load STL mesh
 * - Parts without `stlUrl` → fall back to procedural BoxGeometry
 *
 * Backend STL coordinates are in mm; we scale to meters (0.001x).
 */

interface ModelLoaderProps {
  model: FurnitureModel;
}

/** Scale factor: backend STL is in mm, scene uses meters. */
const MM_TO_M = 0.001;

/** Get a parameter value by ID, with a fallback default. */
function getParam(model: FurnitureModel, id: string, fallback: number): number {
  return model.parameters.find((p) => p.id === id)?.value ?? fallback;
}

/** Convert mm to scene units (meters). */
function mm(millimeters: number): number {
  return millimeters / 1000;
}

// PBR material definitions
const MATERIALS: Record<string, THREE.MeshStandardMaterialProps> = {
  aluminum: { color: '#b8b8b8', metalness: 0.85, roughness: 0.3 },
  steel: { color: '#707070', metalness: 0.9, roughness: 0.25 },
  wood: { color: '#c4a46c', metalness: 0.0, roughness: 0.55 },
  plywood: { color: '#c4a46c', metalness: 0.0, roughness: 0.55 },
  mdf: { color: '#b8a080', metalness: 0.0, roughness: 0.6 },
  oak: { color: '#a07848', metalness: 0.0, roughness: 0.5 },
  walnut: { color: '#5c3a1e', metalness: 0.05, roughness: 0.45 },
};

// ============================================================
// STL Part — loads a mesh from the backend
// ============================================================

interface StlPartProps {
  url: string;
  part: Component;
  isSelected: boolean;
  onClick: () => void;
  materialProps: THREE.MeshStandardMaterialProps;
}

const StlPart: React.FC<StlPartProps> = ({
  url,
  part,
  isSelected,
  onClick,
  materialProps,
}) => {
  const geometry = useLoader(STLLoader, url);

  // Clone + center the geometry.
  // STL profiles may have arbitrary DXF origins; we center XY (perpendicular to Z extrusion).
  const clonedGeometry = useMemo(() => {
    const g = geometry.clone();

    // Compute XY bounding box center
    const pos = g.getAttribute('position');
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Translate to center XY at origin (keep Z unchanged — extrusion axis)
    for (let i = 0; i < pos.count; i++) {
      pos.setXY(i, pos.getX(i) - cx, pos.getY(i) - cy);
    }
    pos.needsUpdate = true;

    return g;
  }, [geometry]);

  // STL geometry is in Solver coords: X=right, Y=forward, Z=up (mm)
  // Three.js world coords:     X=right, Y=up,      Z=toward_camera
  //
  // Composition:  coord_rot * solver_rot  (quaternion multiply)
  // - coord_rot: -90° around X maps STL axes to Three.js world axes
  // - solver_rot: the URDF joint rpy (roll/pitch/yaw, ZYX Euler in solver frame)

  const pose = part.pose;
  const position: [number, number, number] = useMemo(
    () => [
      (pose?.x ?? 0) * MM_TO_M,  // Solver X → World X (right)
      (pose?.z ?? 0) * MM_TO_M,  // Solver Z → World Y (up)
      (pose?.y ?? 0) * MM_TO_M,  // Solver Y → World Z (forward)
    ],
    [pose],
  );

  const rotation: [number, number, number] = useMemo(() => {
    // Coordinate conversion quaternion: -90° around X
    const coordQ = new Quaternion().setFromEuler(
      new Euler(-Math.PI / 2, 0, 0, 'XYZ'),
    );

    // Solver rotation quaternion (URDF rpy = ZYX Euler in solver frame)
    const solverQ = new Quaternion().setFromEuler(
      new Euler(
        pose?.roll ?? 0,
        pose?.pitch ?? 0,
        pose?.yaw ?? 0,
        'ZYX',
      ),
    );

    // Compose: first solver rotation, then coordinate conversion
    const worldQ = coordQ.clone().multiply(solverQ);

    // Convert to Euler XYZ for Three.js
    const euler = new Euler().setFromQuaternion(worldQ, 'XYZ');
    return [euler.x, euler.y, euler.z];
  }, [pose]);

  return (
    <mesh
      geometry={clonedGeometry}
      position={position}
      rotation={rotation}
      scale={[MM_TO_M, MM_TO_M, MM_TO_M]}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      name={part.id}
    >
      <meshStandardMaterial
        {...materialProps}
        emissive={isSelected ? '#ffffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.15 : 0}
      />
    </mesh>
  );
};

// ============================================================
// Procedural Part — fallback when no STL available
// ============================================================

interface ProceduralPartProps {
  part: Component;
  model: FurnitureModel;
  isSelected: boolean;
  onClick: () => void;
}

const ProceduralPart: React.FC<ProceduralPartProps> = ({
  part,
  model,
  isSelected,
  onClick,
}) => {
  const width = getParam(model, 'width', 1200);
  const depth = getParam(model, 'depth', 600);
  const height = getParam(model, 'height', 750);
  const thickness = getParam(model, 'tabletop_thickness', 18);

  const materialProps =
    MATERIALS[part.material || 'wood'] || MATERIALS.wood;

  const geometry = useMemo(() => {
    switch (part.partType) {
      case 'tabletop':
        return new THREE.BoxGeometry(mm(width), mm(thickness), mm(depth));

      case 'leg': {
        const ps = mm(part.material === 'aluminum' ? 30 : 40);
        return new THREE.BoxGeometry(ps, mm(height - thickness), ps);
      }

      case 'beam': {
        const ps = mm(part.material === 'aluminum' ? 30 : 40);
        const isWidth = part.id.includes('front') || part.id.includes('back');
        const len = isWidth
          ? mm(width) - mm(30) * 2
          : mm(depth) - mm(30) * 2;
        return new THREE.BoxGeometry(len, ps, ps);
      }

      default:
        return new THREE.BoxGeometry(0.05, 0.05, 0.05);
    }
  }, [part.partType, part.id, part.material, width, depth, height, thickness]);

  const position = useMemo((): [number, number, number] => {
    const w = mm(width);
    const d = mm(depth);
    const h = mm(height);
    const t = mm(thickness);
    const ps = mm(part.material === 'aluminum' ? 30 : 40);
    const lh = h - t;

    switch (part.partType) {
      case 'tabletop':
        return [0, h - t / 2, 0];

      case 'leg': {
        const ox = w / 2 - ps / 2;
        const oz = d / 2 - ps / 2;
        if (part.id.includes('front_left')) return [ox, lh / 2, oz];
        if (part.id.includes('front_right')) return [-ox, lh / 2, oz];
        if (part.id.includes('back_left')) return [ox, lh / 2, -oz];
        if (part.id.includes('back_right')) return [-ox, lh / 2, -oz];
        return [0, lh / 2, 0];
      }

      case 'beam': {
        const ox = w / 2 - ps / 2;
        const oz = d / 2 - ps / 2;
        const ty = h - t - ps / 2;
        if (part.id === 'beam_front') return [0, ty, oz];
        if (part.id === 'beam_back') return [0, ty, -oz];
        if (part.id === 'beam_left') return [ox, ty, 0];
        if (part.id === 'beam_right') return [-ox, ty, 0];
        return [0, ty, 0];
      }

      default:
        return [0, 0, 0];
    }
  }, [part.partType, part.id, part.material, width, depth, height, thickness]);

  return (
    <mesh
      geometry={geometry}
      position={position}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      name={part.id}
    >
      <meshStandardMaterial
        {...materialProps}
        emissive={isSelected ? '#ffffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.15 : 0}
      />
    </mesh>
  );
};

// ============================================================
// StlPartLoader — with Suspense boundary
// ============================================================

interface PartRendererProps {
  part: Component;
  model: FurnitureModel;
  isSelected: boolean;
  onClick: () => void;
}

const PartRenderer: React.FC<PartRendererProps> = ({
  part,
  model,
  isSelected,
  onClick,
}) => {
  const materialProps =
    MATERIALS[part.material || 'wood'] || MATERIALS.wood;

  // Has STL → load real mesh
  if (part.stlUrl) {
    return (
      <Suspense fallback={null}>
        <StlPart
          url={part.stlUrl}
          part={part}
          isSelected={isSelected}
          onClick={onClick}
          materialProps={materialProps}
        />
      </Suspense>
    );
  }

  // No STL → procedural fallback
  return (
    <ProceduralPart
      part={part}
      model={model}
      isSelected={isSelected}
      onClick={onClick}
    />
  );
};

// ============================================================
// Ground Plane
// ============================================================

const GroundPlane: React.FC = () => {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]}
      receiveShadow
    >
      <planeGeometry args={[10, 10]} />
      <shadowMaterial transparent opacity={0.2} />
    </mesh>
  );
};

// ============================================================
// ModelLoader — main export
// ============================================================

const ModelLoader: React.FC<ModelLoaderProps> = ({ model }) => {
  const selectedComponentId = useModelStore((s) => s.selectedComponentId);
  const selectComponent = useModelStore((s) => s.selectComponent);

  const visibleParts = model.components.filter((c) => c.visible);

  return (
    <group>
      <GroundPlane />

      {visibleParts.map((part) => (
        <PartRenderer
          key={part.id}
          part={part}
          model={model}
          isSelected={selectedComponentId === part.id}
          onClick={() =>
            selectComponent(
              selectedComponentId === part.id ? null : part.id,
            )
          }
        />
      ))}
    </group>
  );
};

export default ModelLoader;
