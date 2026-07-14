import { useMemo, Suspense, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import type { FurnitureModel, Component } from '../types/furniture';
import { TEMPLATE_LAYOUTS } from '../types/furniture';
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
  /** Scale factor along local Z (extrusion axis). */
  zScale?: number;
  /** Additional non-uniform scale for tabletop (XY in STL local). */
  xyScale?: [number, number];
  /** Override solver pose with a direct Three.js world position (meters). */
  worldPosition?: [number, number, number];
}

const StlPart: React.FC<StlPartProps> = ({
  url,
  part,
  isSelected,
  onClick,
  materialProps,
  zScale = 1,
  xyScale,
  worldPosition,
}) => {
  const geometry = useLoader(STLLoader, url);

  // Clone + center + scale (XY for tabletop, Z for extrusions).
  const clonedGeometry = useMemo(() => {
    const g = geometry.clone();
    const pos = g.getAttribute('position');

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const sx = xyScale ? xyScale[0] : 1;
    const sy = xyScale ? xyScale[1] : 1;

    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        (pos.getX(i) - cx) * sx,
        (pos.getY(i) - cy) * sy,
        (pos.getZ(i) - cz) * zScale,
      );
    }
    pos.needsUpdate = true;

    return g;
  }, [geometry, zScale, xyScale]);

  const pose = part.pose;

  // Position: use worldPosition if provided, otherwise derive from solver pose.
  const position: [number, number, number] = useMemo(
    () => worldPosition ?? [
      (pose?.x ?? 0) * MM_TO_M,
      (pose?.z ?? 0) * MM_TO_M,
      (pose?.y ?? 0) * MM_TO_M,
    ],
    [pose, worldPosition],
  );

  // Rotation: always from solver pose (orienting beams horizontal, legs vertical).
  const rotation: [number, number, number] = useMemo(() => {
    const coordQ = new Quaternion().setFromEuler(
      new Euler(-Math.PI / 2, 0, 0, 'XYZ'),
    );
    const solverQ = new Quaternion().setFromEuler(
      new Euler(pose?.roll ?? 0, pose?.pitch ?? 0, pose?.yaw ?? 0, 'ZYX'),
    );
    const worldQ = coordQ.clone().multiply(solverQ);
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
  layout: { insetRatioX: number; insetRatioZ: number; profileSize: number };
}

const ProceduralPart: React.FC<ProceduralPartProps> = ({
  part,
  model,
  isSelected,
  onClick,
  layout,
}) => {
  const width = getParam(model, 'width', 1200);
  const depth = getParam(model, 'depth', 600);
  const height = getParam(model, 'height', 750);
  const thickness = getParam(model, 'tabletop_thickness', 18);

  const { insetRatioX, insetRatioZ, profileSize } = layout;
  const ps = mm(profileSize);
  const insetX = mm(width * insetRatioX);
  const insetZ = mm(depth * insetRatioZ);
  const frameW = mm(width) - insetX * 2;
  const frameD = mm(depth) - insetZ * 2;

  const materialProps =
    MATERIALS[part.material || 'wood'] || MATERIALS.wood;

  const geometry = useMemo(() => {
    switch (part.partType) {
      case 'tabletop':
        return new THREE.BoxGeometry(mm(width), mm(thickness), mm(depth));

      case 'leg':
        return new THREE.BoxGeometry(ps, mm(height - thickness) - ps, ps);

      case 'beam': {
        const isWidthBeam = part.id.includes('front') || part.id.includes('back');
        const longDim = Math.max(frameW, frameD);
        const shortDim = Math.min(frameW, frameD);
        const isLong = (isWidthBeam && frameW >= frameD) || (!isWidthBeam && frameD > frameW);
        const len = isLong ? longDim : shortDim - 2 * ps;
        return new THREE.BoxGeometry(len, ps, ps);
      }

      default:
        return new THREE.BoxGeometry(0.05, 0.05, 0.05);
    }
  }, [part.partType, part.id, part.material, width, depth, height, thickness, frameW, frameD, ps]);

  const position = useMemo((): [number, number, number] => {
    const h = mm(height);
    const t = mm(thickness);
    const legH = h - t - ps;
    const beamY = h - t - ps / 2;
    const lx = mm(width) / 2 - insetX - ps / 2;
    const lz = mm(depth) / 2 - insetZ - ps / 2;

    switch (part.partType) {
      case 'tabletop':
        return [0, h - t / 2, 0];

      case 'leg': {
        if (part.id.includes('front_left')) return [lx, legH / 2, lz];
        if (part.id.includes('front_right')) return [-lx, legH / 2, lz];
        if (part.id.includes('back_left')) return [lx, legH / 2, -lz];
        if (part.id.includes('back_right')) return [-lx, legH / 2, -lz];
        return [0, legH / 2, 0];
      }

      case 'beam': {
        // Beam outer face at frame boundary, center inset by half profile
        const bz = mm(depth) / 2 - insetZ - ps / 2;
        const bx = mm(width) / 2 - insetX - ps / 2;
        if (part.id === 'beam_front') return [0, beamY, bz];
        if (part.id === 'beam_back') return [0, beamY, -bz];
        if (part.id === 'beam_left') return [bx, beamY, 0];
        if (part.id === 'beam_right') return [-bx, beamY, 0];
        return [0, beamY, 0];
      }

      default:
        return [0, 0, 0];
    }
  }, [part.partType, part.id, width, depth, height, thickness, ps, insetX, insetZ]);

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

/**
 * Frame-style furniture layout with configurable inset.
 *
 *   - Beams form a perimeter frame flush to tabletop bottom,
 *     inset from edges by `insetRatio * width` / `insetRatio * depth`.
 *   - Legs sit under the beam frame corners.
 *   - Tabletop unchanged.
 *
 * All positions are Three.js world coords (meters), Y=up.
 */
function computeFrameLayout(
  model: FurnitureModel,
  part: Component,
  layout: { insetRatioX: number; insetRatioZ: number; profileSize: number },
): { worldPosition: [number, number, number]; zScale: number; xyScale?: [number, number] } | null {
  const w = getParam(model, 'width', 1200);
  const d = getParam(model, 'depth', 600);
  const h = getParam(model, 'height', 750);
  const tt = getParam(model, 'tabletop_thickness', 18);
  const ps = layout.profileSize;

  // Beam/leg frame inset from each edge
  const insetX = w * layout.insetRatioX;
  const insetZ = d * layout.insetRatioZ;
  const frameW = w - insetX * 2;
  const frameD = d - insetZ * 2;

  // Backend uses "extrusion_length" (solver-only) or "length" (full build).
  const extrusionLen = part.dimensions?.extrusion_length ?? part.dimensions?.length;

  // --- Tabletop ---
  if (part.partType === 'tabletop') {
    // Scale STL to match current width/depth/thickness.
    const origW = part.dimensions?.width ?? part.dimensions?.tabletop_width ?? w;
    const origD = part.dimensions?.depth ?? part.dimensions?.tabletop_depth ?? d;
    const origT = part.dimensions?.thickness ?? part.dimensions?.tabletop_thickness ?? tt;
    return {
      worldPosition: [0, mm(h - tt / 2), 0],
      zScale: origT > 0 ? tt / origT : 1,
      xyScale: origW > 0 && origD > 0 ? [w / origW, d / origD] : undefined,
    };
  }

  // --- Beams: perimeter frame at tabletop bottom, inset from edges ---
  if (part.partType === 'beam' && extrusionLen) {
    const isWidthBeam = part.id.includes('front') || part.id.includes('back');
    const beamY = mm(h - tt - ps / 2); // flush to tabletop bottom

    // Picture-frame: long beams span frame, short beams fit between.
    const longDim = Math.max(frameW, frameD);
    const shortDim = Math.min(frameW, frameD);
    const isLong = (isWidthBeam && frameW >= frameD) || (!isWidthBeam && frameD > frameW);
    const targetLen = isLong ? longDim : shortDim - 2 * ps;

    // Beam outer face at frame boundary, center inset by half profile
    const beamZ = d / 2 - insetZ - ps / 2;
    const beamX = w / 2 - insetX - ps / 2;
    let bx = 0, bz = 0;
    if (part.id === 'beam_front')  bz = mm(beamZ);
    if (part.id === 'beam_back')   bz = -mm(beamZ);
    if (part.id === 'beam_left')   bx = mm(beamX);
    if (part.id === 'beam_right')  bx = -mm(beamX);

    return {
      worldPosition: [bx, beamY, bz],
      zScale: targetLen / extrusionLen,
    };
  }

  // --- Legs: from ground to beam bottom, at frame corners ---
  if (part.partType === 'leg' && extrusionLen) {
    const legH = h - tt - ps;
    const lx = w / 2 - insetX - ps / 2;
    const lz = d / 2 - insetZ - ps / 2;

    let px = 0, pz = 0;
    if (part.id.includes('front_left'))  { px = mm(lx); pz = mm(lz); }
    if (part.id.includes('front_right')) { px = -mm(lx); pz = mm(lz); }
    if (part.id.includes('back_left'))   { px = mm(lx); pz = -mm(lz); }
    if (part.id.includes('back_right'))  { px = -mm(lx); pz = -mm(lz); }

    return {
      worldPosition: [px, mm(legH / 2), pz],
      zScale: legH / extrusionLen,
    };
  }

  return null;
}


const PartRenderer: React.FC<PartRendererProps> = ({
  part,
  model,
  isSelected,
  onClick,
}) => {
  const materialProps =
    MATERIALS[part.material || 'wood'] || MATERIALS.wood;

  // Get live layout params from store (template defaults + user adjustments)
  const cp = useModelStore((s) => s.currentParams);
  const layoutCfg = {
    insetRatioX: cp.insetRatioX,
    insetRatioZ: cp.insetRatioZ,
    profileSize: 30,
  };

  if (part.stlUrl) {
    const layout = computeFrameLayout(model, part, layoutCfg);

    return (
      <Suspense key={part.stlUrl} fallback={null}>
        <StlPart
          url={part.stlUrl}
          part={part}
          isSelected={isSelected}
          onClick={onClick}
          materialProps={materialProps}
          zScale={layout?.zScale ?? 1}
          xyScale={layout?.xyScale}
          worldPosition={layout?.worldPosition}
        />
      </Suspense>
    );
  }

  return (
    <ProceduralPart
      part={part}
      model={model}
      isSelected={isSelected}
      onClick={onClick}
      layout={layoutCfg}
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

  // Debug: log all layout positions when model changes
  const loggedRef = useRef(false);
  if (!loggedRef.current || model.id !== loggedRef.current) {
    (loggedRef as React.MutableRefObject<string>).current = model.id;
    const templateId = useModelStore.getState().currentParams.templateId;
    const dbgLayout = TEMPLATE_LAYOUTS[templateId] || TEMPLATE_LAYOUTS['basic-desk'];
    console.group('[WoodCraft Layout] ' + model.id + ' template=' + templateId);
    for (const c of model.components.filter((c) => c.visible)) {
      const l = computeFrameLayout(model, c, dbgLayout);
      console.log(
        c.name.padEnd(20),
        'pos:', l?.worldPosition?.map((v) => v.toFixed(3)),
        'zScale:', l?.zScale?.toFixed(3),
        'stl:', c.stlUrl ? 'yes' : 'no',
      );
    }
    console.groupEnd();
  }

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
