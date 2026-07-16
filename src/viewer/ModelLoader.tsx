import { useMemo, Suspense, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three-stdlib';
import type { FurnitureModel, Component, TabletopHole } from '../types/furniture';
import type { DxfTabletopShape } from '../utils/dxfImport';
import { TEMPLATE_LAYOUTS } from '../types/furniture';
import { useModelStore } from '../store/modelStore';

const { Euler, Quaternion } = THREE;

/**
 * Hybrid 3D model loader for furniture.
 *
 * - Parts with `stlUrl` (from successful backend CAD build) → load STL mesh
 * - Parts without `stlUrl` → fall back to procedural geometry
 * - Tabletop with user holes → always procedural ExtrudeGeometry (true cutouts)
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
// Tabletop geometry with real holes (ExtrudeGeometry + Shape.holes)
// ============================================================

/**
 * Build a tabletop BufferGeometry with actual cylindrical cutouts.
 *
 * Uses THREE.ExtrudeGeometry with a Shape containing circular holes.
 * The resulting geometry has proper walls inside each hole, visible
 * from any camera angle — not just a surface decal.
 *
 * @param w   Tabletop width in meters
 * @param d   Tabletop depth in meters
 * @param t   Tabletop thickness in meters
 * @param holes Array of hole definitions (coordinates in mm, radius in mm)
 */
function createHoledTabletopGeometry(
  w: number,
  d: number,
  t: number,
  holes: TabletopHole[],
): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;

  // Outer shape (tabletop outline in XY)
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hd);
  shape.lineTo(hw, -hd);
  shape.lineTo(hw, hd);
  shape.lineTo(-hw, hd);
  shape.closePath();

  // Each hole as a circular Path → Shape.holes
  for (const hole of holes) {
    const hr = mm(hole.radius);
    const hx = mm(hole.x);
    const hy = mm(hole.y);
    const holePath = new THREE.Path();
    // absarc(cx, cy, radius, startAngle, endAngle, clockwise)
    holePath.absarc(hx, hy, hr, 0, Math.PI * 2, true);
    shape.holes.push(holePath);
  }

  // Extrude along Z by thickness.
  // Shape lives in XY; after extrude, the solid occupies Z ∈ [0, t].
  // We then rotate so it lies flat on XZ (thickness → Y).
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: t,
    bevelEnabled: false,
  });

  // Rotate -90° around X:  X→X,  Y→Z,  Z→-Y
  geom.rotateX(-Math.PI / 2);
  // Now: X = width, Y ∈ [-t, 0], Z = depth.
  // Translate Y so the geometry is centered at origin.
  geom.translate(0, t / 2, 0);
  // Now: X ∈ [-hw, hw], Y ∈ [-t/2, t/2], Z ∈ [-hd, hd] — matches BoxGeometry.

  geom.computeVertexNormals();
  return geom;
}

/**
 * Build a tabletop BufferGeometry from a DXF-imported shape.
 *
 * Converts DXF outline + holes (mm) to a Three.js ExtrudeGeometry.
 * The shape is centered at origin and oriented flat (Y = thickness).
 */
function createDxfTabletopGeometry(
  dxf: DxfTabletopShape,
  thickness: number, // meters
): THREE.BufferGeometry {
  const t = thickness;
  const { outline, holes, bounds } = dxf;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  // Build outline Shape (XY plane, center at origin)
  const shape = new THREE.Shape();
  shape.moveTo(mm(outline[0].x) - mm(cx), mm(outline[0].y) - mm(cy));
  for (let i = 1; i < outline.length; i++) {
    shape.lineTo(mm(outline[i].x) - mm(cx), mm(outline[i].y) - mm(cy));
  }
  shape.closePath();

  // Add DXF holes
  for (const holePts of holes) {
    const holePath = new THREE.Path();
    holePath.moveTo(mm(holePts[0].x) - mm(cx), mm(holePts[0].y) - mm(cy));
    for (let i = 1; i < holePts.length; i++) {
      holePath.lineTo(mm(holePts[i].x) - mm(cx), mm(holePts[i].y) - mm(cy));
    }
    holePath.closePath();
    shape.holes.push(holePath);
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: t,
    bevelEnabled: false,
  });

  // Rotate -90° X → flat on XZ, thickness along Y
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, t / 2, 0);
  geom.computeVertexNormals();
  return geom;
}

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

  const position: [number, number, number] = useMemo(
    () => worldPosition ?? [
      (pose?.x ?? 0) * MM_TO_M,
      (pose?.z ?? 0) * MM_TO_M,
      (pose?.y ?? 0) * MM_TO_M,
    ],
    [pose, worldPosition],
  );

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
  layout: { insetRatioX: number; insetRatioZ: number; profileSize: number; crossBeamHeightRatio: number };
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
  const holes = useModelStore((s) => s.holes);

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
        if (holes.length > 0) {
          return createHoledTabletopGeometry(mm(width), mm(depth), mm(thickness), holes);
        }
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

      case 'cross_beam': {
        const longDim = Math.max(frameW, frameD);
        return new THREE.BoxGeometry(longDim - 2 * ps, ps, ps);
      }

      default:
        return new THREE.BoxGeometry(0.05, 0.05, 0.05);
    }
  }, [part.partType, part.id, part.material, width, depth, height, thickness, frameW, frameD, ps, holes]);

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
        const bz = mm(depth) / 2 - insetZ - ps / 2;
        const bx = mm(width) / 2 - insetX - ps / 2;
        if (part.id === 'beam_front') return [0, beamY, bz];
        if (part.id === 'beam_back') return [0, beamY, -bz];
        if (part.id === 'beam_left') return [bx, beamY, 0];
        if (part.id === 'beam_right') return [-bx, beamY, 0];
        return [0, beamY, 0];
      }

      case 'cross_beam': {
        const legH = h - t - ps;
        const ratio = layout.crossBeamHeightRatio;
        const beamCY = Math.max(ps / 2, ratio * (legH - ps / 2));
        const isFrontBack = part.id.includes('front') || part.id.includes('back');
        if (isFrontBack) {
          const bz = mm(depth) / 2 - insetZ - ps / 2;
          return part.id.includes('front') ? [0, beamCY, bz] : [0, beamCY, -bz];
        } else {
          const bx = mm(width) / 2 - insetX - ps / 2;
          return part.id.includes('left') ? [bx, beamCY, 0] : [-bx, beamCY, 0];
        }
      }

      default:
        return [0, 0, 0];
    }
  }, [part.partType, part.id, width, depth, height, thickness, ps, insetX, insetZ, frameW, layout.crossBeamHeightRatio]);

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
 * All positions are Three.js world coords (meters), Y=up.
 */
function computeFrameLayout(
  model: FurnitureModel,
  part: Component,
  layout: { insetRatioX: number; insetRatioZ: number; profileSize: number; crossBeamHeightRatio: number },
): { worldPosition: [number, number, number]; zScale: number; xyScale?: [number, number] } | null {
  const w = getParam(model, 'width', 1200);
  const d = getParam(model, 'depth', 600);
  const h = getParam(model, 'height', 750);
  const tt = getParam(model, 'tabletop_thickness', 18);
  const ps = layout.profileSize;

  const insetX = w * layout.insetRatioX;
  const insetZ = d * layout.insetRatioZ;
  const frameW = w - insetX * 2;
  const frameD = d - insetZ * 2;

  const extrusionLen = part.dimensions?.extrusion_length ?? part.dimensions?.length;

  // --- Tabletop ---
  if (part.partType === 'tabletop') {
    const origW = part.dimensions?.width ?? part.dimensions?.tabletop_width ?? w;
    const origD = part.dimensions?.depth ?? part.dimensions?.tabletop_depth ?? d;
    const origT = part.dimensions?.thickness ?? part.dimensions?.tabletop_thickness ?? tt;
    return {
      worldPosition: [0, mm(h - tt / 2), 0],
      zScale: origT > 0 ? tt / origT : 1,
      xyScale: origW > 0 && origD > 0 ? [w / origW, d / origD] : undefined,
    };
  }

  // --- Beams ---
  if (part.partType === 'beam' && extrusionLen) {
    const isWidthBeam = part.id.includes('front') || part.id.includes('back');
    const beamY = mm(h - tt - ps / 2);
    const longDim = Math.max(frameW, frameD);
    const shortDim = Math.min(frameW, frameD);
    const isLong = (isWidthBeam && frameW >= frameD) || (!isWidthBeam && frameD > frameW);
    const targetLen = isLong ? longDim : shortDim - 2 * ps;
    const beamZ = d / 2 - insetZ - ps / 2;
    const beamX = w / 2 - insetX - ps / 2;
    let bx = 0, bz = 0;
    if (part.id === 'beam_front')  bz = mm(beamZ);
    if (part.id === 'beam_back')   bz = -mm(beamZ);
    if (part.id === 'beam_left')   bx = mm(beamX);
    if (part.id === 'beam_right')  bx = -mm(beamX);
    return { worldPosition: [bx, beamY, bz], zScale: targetLen / extrusionLen };
  }

  // --- Legs ---
  if (part.partType === 'leg' && extrusionLen) {
    const legH = h - tt - ps;
    const lx = w / 2 - insetX - ps / 2;
    const lz = d / 2 - insetZ - ps / 2;
    let px = 0, pz = 0;
    if (part.id.includes('front_left'))  { px = mm(lx); pz = mm(lz); }
    if (part.id.includes('front_right')) { px = -mm(lx); pz = mm(lz); }
    if (part.id.includes('back_left'))   { px = mm(lx); pz = -mm(lz); }
    if (part.id.includes('back_right'))  { px = -mm(lx); pz = -mm(lz); }
    return { worldPosition: [px, mm(legH / 2), pz], zScale: legH / extrusionLen };
  }

  // --- Cross beams: additional horizontal rails between leg pairs ---
  if (part.partType === 'cross_beam' && extrusionLen) {
    const legH = h - tt - ps;
    const ratio = layout.crossBeamHeightRatio;
    const beamCY = Math.max(ps / 2, ratio * (legH - ps / 2));
    const beamY = mm(beamCY);

    const isFrontBack = part.id.includes('front') || part.id.includes('back');

    if (isFrontBack) {
      // Span between front/back legs (runs left-right, long dimension)
      const longDim = Math.max(w - insetX * 2, d - insetZ * 2);
      const targetLen = longDim - 2 * ps;
      const legZ = d / 2 - insetZ - ps / 2;
      const bz = part.id.includes('front') ? mm(legZ) : -mm(legZ);
      return { worldPosition: [0, beamY, bz], zScale: targetLen / (extrusionLen || targetLen) };
    } else {
      // Span between left/right legs (runs front-back, short dimension)
      const shortDim = Math.min(w - insetX * 2, d - insetZ * 2);
      const targetLen = shortDim - 2 * ps;
      const legX = w / 2 - insetX - ps / 2;
      const bx = part.id.includes('left') ? mm(legX) : -mm(legX);
      return { worldPosition: [bx, beamY, 0], zScale: targetLen / (extrusionLen || targetLen) };
    }
  }

  return null;
}


// ============================================================
// DxfTabletopPart — renders imported DXF tabletop shape
// ============================================================

interface DxfTabletopPartProps {
  dxf: DxfTabletopShape;
  model: FurnitureModel;
  isSelected: boolean;
  onClick: () => void;
  materialProps: THREE.MeshStandardMaterialProps;
}

const DxfTabletopPart: React.FC<DxfTabletopPartProps> = ({
  dxf,
  model,
  isSelected,
  onClick,
  materialProps,
}) => {
  const h = getParam(model, 'height', 750);
  const tt = getParam(model, 'tabletop_thickness', 18);
  const geometry = useMemo(
    () => createDxfTabletopGeometry(dxf, mm(tt)),
    [dxf, tt],
  );
  const posY = mm(h - tt / 2);

  return (
    <mesh
      geometry={geometry}
      position={[0, posY, 0]}
      castShadow
      receiveShadow
      onClick={(e) => { e.stopPropagation(); onClick(); }}
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
// BracketPart — renders a single corner bracket gusset
// ============================================================

interface BracketPartProps {
  part: Component;
  model: FurnitureModel;
  isSelected: boolean;
  onClick: () => void;
  materialProps: THREE.MeshStandardMaterialProps;
  layout: { insetRatioX: number; insetRatioZ: number; profileSize: number };
}

/** Compute bracket position + scale from bracket ID.
 *  Triangle in ExtrudeGeometry XY, extrude Z. After -PI/2 X rotation:
 *    local X→world X, local Y→world Z, local Z→world -Y.
 *  So the triangle fills world +X,+Z quadrant from its corner.
 *  We use mesh scale to mirror for different corners (no yaw rot needed).
 *
 *  Position: bracket top (beam top), extrusion goes downward filling beam height.
 */
function getBracketPose(
  id: string, model: FurnitureModel,
  w: number, d: number, h: number, tt: number, ps: number, ix: number, iz: number,
): { pos: [number, number, number]; scale: [number, number, number] } {
  const beamTopY = mm(h - tt);  // bracket top = tabletop bottom = beam top
  const innerX = mm(ix - ps / 2);
  const innerZ = mm(iz - ps / 2);
  const s = mm(ps);

  // Scale: mirror X / Z to point triangle legs inward
  // Default (+X,+Z). Flips: front→-Z, back→+Z, left→-X, right→+X
  const isFront = id.includes('fl') || id.includes('fr');
  const isBack  = id.includes('bl') || id.includes('br');
  const isLeft  = id.includes('fl') || id.includes('bl');
  const isRight = id.includes('fr') || id.includes('br');

  const sx = isLeft ? -1 : 1;   // left corners: triangle goes -X (inward)
  const sz = isFront ? 1 : -1;  // front corners: triangle goes +Z? hmm

  // For corner brackets: at the inner corner, legs along beam faces inward
  if (id.startsWith('bracket_corner')) {
    // Corner triangle fills: left→-X, right→+X, front→-Z (inward), back→+Z (inward)
    const scaleX = id.includes('_fl') || id.includes('_bl') ? -1 : 1;
    const scaleZ = id.includes('_fr') || id.includes('_br') ? 1 : -1;
    // Front corners: inward along Z is -Z, so scaleZ = -1. Back: +Z, so scaleZ = 1.
    // Actually: front-left = -X,-Z → scale [-1,1,-1]. front-right = +X,-Z → [1,1,-1].
    // back-left = -X,+Z → [-1,1,1]. back-right = +X,+Z → [1,1,1].
    const sx2 = id.includes('_fl') || id.includes('_bl') ? -1 : 1;
    const sz2 = id.includes('_fl') || id.includes('_fr') ? -1 : 1;
    return { pos: [sx2 < 0 ? innerX : -innerX, beamTopY, sz2 > 0 ? innerZ : -innerZ], scale: [sx2, 1, sz2] };
  }

  // Leg top brackets: offset from corner, same scale logic
  const sx3 = id.includes('_fl') || id.includes('_bl') ? -1 : 1;
  const sz3 = id.includes('_fl') || id.includes('_fr') ? -1 : 1;

  // Offset: shift along beam direction
  let ox = 0, oz = 0;
  if (id.includes('_front') || id.includes('_back')) ox = sx3 < 0 ? -s : s;
  if (id.includes('_left') || id.includes('_right')) oz = sz3 > 0 ? -s : s;

  const px = sx3 < 0 ? innerX : -innerX;
  const pz = sz3 > 0 ? innerZ : -innerZ;

  return { pos: [px + ox, beamTopY, pz + oz], scale: [sx3, 1, sz3] };
}

const BracketPart: React.FC<BracketPartProps> = ({
  part, model, isSelected, onClick, materialProps, layout,
}) => {
  const w = getParam(model, 'width', 1200);
  const d = getParam(model, 'depth', 600);
  const hh = getParam(model, 'height', 750);
  const tt = getParam(model, 'tabletop_thickness', 18);
  const ps = layout.profileSize;
  const ix = w / 2 - layout.insetRatioX * w - ps / 2;
  const iz = d / 2 - layout.insetRatioZ * d - ps / 2;

  const { pos, scale } = getBracketPose(part.id, model, w, d, hh, tt, ps, ix, iz);
  const size = mm(ps);
  const height = mm(ps);

  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(size, 0);
    shape.lineTo(0, size);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  }, [size, height]);

  // Triangle in XY → rotate -PI/2 X to make horizontal in XZ.
  // Scale mirrors for the correct corner quadrant (scale handles direction).
  // Position at beam top (tabletop bottom), extrusion goes downward.
  return (
    <mesh
      geometry={geom}
      position={pos}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={scale}
      castShadow
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <meshStandardMaterial
        {...materialProps}
        emissive={isSelected ? '#ffffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.15 : 0}
      />
    </mesh>
  );
};


const PartRenderer: React.FC<PartRendererProps> = ({
  part,
  model,
  isSelected,
  onClick,
}) => {
  const materialProps =
    MATERIALS[part.material || (part.partType === 'cross_beam' ? 'aluminum' : part.partType === 'bracket' ? 'steel' : 'wood')] || MATERIALS.wood;

  const cp = useModelStore((s) => s.currentParams);
  const holes = useModelStore((s) => s.holes);
  const dxfTabletop = useModelStore((s) => s.dxfTabletop);
  const layoutCfg = {
    insetRatioX: cp.insetRatioX,
    insetRatioZ: cp.insetRatioZ,
    profileSize: 30,
    crossBeamHeightRatio: cp.crossBeamHeightRatio,
  };

  // When DXF tabletop shape is imported, use custom ExtrudeGeometry
  if (part.partType === 'tabletop' && dxfTabletop) {
    return (
      <DxfTabletopPart
        dxf={dxfTabletop}
        model={model}
        isSelected={isSelected}
        onClick={onClick}
        materialProps={materialProps}
      />
    );
  }

  // When tabletop has user holes, use procedural ExtrudeGeometry with cutouts
  // Bracket parts — render procedural gusset
  if (part.partType === 'bracket') {
    return <BracketPart part={part} model={model} isSelected={isSelected} onClick={onClick} materialProps={materialProps} layout={layoutCfg} />;
  }

  const hasTabletopHoles = part.partType === 'tabletop' && holes.length > 0;

  if (part.stlUrl && !hasTabletopHoles) {
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

// ============================================================
// Corner brackets — L-shaped connectors at beam/leg joints
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

  // Debug logging
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

  // Debug: log bracket positions
  const bracketParts = visibleParts.filter((c) => c.partType === 'bracket');
  if (bracketParts.length > 0 && model.id !== (loggedRef as React.MutableRefObject<string>).current.split(':')[0]) {
    console.group('[WoodCraft Brackets] ' + model.id);
    const bbW = getParam(model, 'width', 1200);
    const bbD = getParam(model, 'depth', 600);
    const bbH = getParam(model, 'height', 750);
    const bbTt = getParam(model, 'tabletop_thickness', 18);
    const bbPs = useModelStore.getState().currentParams.insetRatioX !== undefined ? 30 : 30;
    const bbIx = bbW / 2 - useModelStore.getState().currentParams.insetRatioX * bbW - bbPs / 2;
    const bbIz = bbD / 2 - useModelStore.getState().currentParams.insetRatioZ * bbD - bbPs / 2;
    for (const bp of bracketParts) {
      const bpPose = getBracketPose(bp.id, model, bbW, bbD, bbH, bbTt, bbPs, bbIx, bbIz);
      console.log(bp.name.padEnd(20), 'pos:', bpPose.pos.map((v) => v.toFixed(4)), 'scale:', bpPose.scale);
    }
    console.groupEnd();
  }

  const templateId = useModelStore((s) => s.currentParams.templateId);

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
