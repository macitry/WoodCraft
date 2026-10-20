// ---------------------------------------------------------------------------
// The assembled position of every frame piece, in metres, Y-up.
//
// Lives apart from `ModelLoader` because it has a second caller: the assembly
// plan needs the same final positions the renderer draws, and importing them
// out of the component module would both pull React into a pure module and
// break the file's fast-refresh contract (a component file exporting a plain
// function). Duplicating the layout instead is exactly the kind of drift this
// project has been bitten by before.
// ---------------------------------------------------------------------------

import type { Component, FurnitureModel } from '../types/furniture';

/** Get a parameter value by ID, with a fallback default. */
export function getParam(model: FurnitureModel, id: string, fallback: number): number {
  return model.parameters.find((p) => p.id === id)?.value ?? fallback;
}

/** Convert mm to scene units (meters). */
export function mm(millimeters: number): number {
  return millimeters / 1000;
}

/**
 * Frame-style furniture layout with configurable inset.
 *
 * All positions are Three.js world coords (meters), Y=up.
 */
export function computeFrameLayout(
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
    // Both pairs fit between the legs — the solver's `- 2 * ps` on each.
    const targetLen = (isWidthBeam ? frameW : frameD) - 2 * ps;
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
    const legH = h - tt;
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
    // The ratio is measured on the clear leg below the rail band, one section
    // shorter than the leg itself — the solver's `clear_leg`.
    const clearLeg = h - tt - ps;
    const ratio = layout.crossBeamHeightRatio;
    const beamCY = Math.max(ps / 2, ratio * (clearLeg - ps / 2));
    const beamY = mm(beamCY);

    const isFrontBack = part.id.includes('front') || part.id.includes('back');
    // Each rail spans its own dimension and fits between the legs.
    const targetLen = (isFrontBack ? frameW : frameD) - 2 * ps;

    if (isFrontBack) {
      // Span between front/back legs (runs left-right, along the width)
      const legZ = d / 2 - insetZ - ps / 2;
      const bz = part.id.includes('front') ? mm(legZ) : -mm(legZ);
      return { worldPosition: [0, beamY, bz], zScale: targetLen / (extrusionLen || targetLen) };
    } else {
      // Span between left/right legs (runs front-back, along the depth)
      const legX = w / 2 - insetX - ps / 2;
      const bx = part.id.includes('left') ? mm(legX) : -mm(legX);
      return { worldPosition: [bx, beamY, 0], zScale: targetLen / (extrusionLen || targetLen) };
    }
  }

  return null;
}
