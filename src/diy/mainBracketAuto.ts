// ============================================================
// Main-frame auto bracket placement — reuses the DIY corner logic.
//
// The DIY editor computes corner brackets by treating every aluminum
// extrusion as an axis-aligned profile and finding centered joints
// between perpendicular faces. The main frame's beams / legs / cross
// beams are exactly such an axis-aligned frame, so we map them into
// DiyProfile[] and run the same pipeline.
//
// Convention: the TOP beams sit flush under the tabletop and are fixed
// by other means (screws/glue) — joints between two top beams get no
// bracket. Everything else (leg tops, cross-beam-to-leg) does.
// ============================================================

import type { BracketInstance, Component, DiyProfile, FurnitureModel } from '../types/furniture';
import { computeCornerHints, eulerFromNormals } from './diyCornerGeometry';
import { jointFitInfo, cornerBracketFits } from './diyJointGeometry';

/** Frontend-only layout + dimension params the frame math needs. */
export interface MainFrameParams {
  templateId: string;
  width: number;
  depth: number;
  height: number;
  tabletopThickness: number;
  insetRatioX: number;
  insetRatioZ: number;
  crossBeamHeightRatio: number;
}

/** Profile size used for all main-frame extrusions (matches the frontend). */
const PROFILE_SIZE = 30;

/** Axis direction of an aluminum component, from its id (matches the renderer). */
function profileDirection(part: Component): DiyProfile['direction'] {
  if (part.partType === 'leg') return 'Y';
  return part.id.includes('front') || part.id.includes('back') ? 'X' : 'Z';
}

interface AluminumProfile {
  id: string;
  partType: string;
  direction: DiyProfile['direction'];
  length: number;
  position: { x: number; y: number; z: number };
}

/**
 * Axis-aligned world geometry (mm) of an aluminum component, matching where
 * the renderer actually draws it (ModelLoader computeFrameLayout).
 *
 * Returns null for non-extrusion parts (tabletop etc.).
 */
function aluminumComponentProfile(
  part: Component,
  p: MainFrameParams,
): AluminumProfile | null {
  const ps = PROFILE_SIZE;
  const ix = p.insetRatioX * p.width;
  const iz = p.insetRatioZ * p.depth;
  const frameW = p.width - ix * 2;
  const frameD = p.depth - iz * 2;
  const longDim = Math.max(frameW, frameD);
  const shortDim = Math.min(frameW, frameD);
  const beamY = p.height - p.tabletopThickness - ps / 2;
  const legH = p.height - p.tabletopThickness - ps;
  const bx = p.width / 2 - ix - ps / 2;
  const bz = p.depth / 2 - iz - ps / 2;
  const id = part.id;
  const dir = profileDirection(part);

  if (part.partType === 'leg') {
    const pos = { x: bx, y: legH / 2, z: bz };
    if (id.includes('front_right')) pos.x = -bx;
    if (id.includes('back_left')) pos.z = -bz;
    if (id.includes('back_right')) { pos.x = -bx; pos.z = -bz; }
    return { id, partType: 'leg', direction: dir, length: legH, position: pos };
  }

  if (part.partType === 'beam') {
    const isWidthBeam = id.includes('front') || id.includes('back');
    const isLong = (isWidthBeam && frameW >= frameD) || (!isWidthBeam && frameD > frameW);
    const len = isLong ? longDim : shortDim - 2 * ps;
    const pos = { x: 0, y: beamY, z: 0 };
    if (id.includes('front')) pos.z = bz;
    if (id.includes('back')) pos.z = -bz;
    if (id.includes('left')) pos.x = bx;
    if (id.includes('right')) pos.x = -bx;
    return { id, partType: 'beam', direction: dir, length: len, position: pos };
  }

  if (part.partType === 'cross_beam') {
    const ratio = p.crossBeamHeightRatio;
    const beamCY = Math.max(ps / 2, ratio * (legH - ps / 2));
    const isFrontBack = id.includes('front') || id.includes('back');
    const len = isFrontBack ? longDim - 2 * ps : shortDim - 2 * ps;
    const pos = { x: 0, y: beamCY, z: 0 };
    if (id.includes('front')) pos.z = bz;
    if (id.includes('back')) pos.z = -bz;
    if (id.includes('left')) pos.x = bx;
    if (id.includes('right')) pos.x = -bx;
    return { id, partType: 'cross_beam', direction: dir, length: len, position: pos };
  }

  return null;
}

/**
 * Compute the auto bracket set for the current model + params.
 *
 * Reuses computeCornerHints (same centered joints + fit filter as the DIY
 * editor), then drops joints between two top beams (fixed to the tabletop by
 * other means) and keeps one bracket per joint position.
 */
export function autoGenerateBrackets(
  model: FurnitureModel | null,
  p: MainFrameParams,
): BracketInstance[] {
  if (!model) return [];

  const profiles: DiyProfile[] = [];
  const partTypeByProfile: Record<string, string> = {};
  const partNameById: Record<string, string> = {};
  let seq = 1;

  for (const part of model.components) {
    if (!part.visible) continue;
    const info = aluminumComponentProfile(part, p);
    if (!info) continue;
    profiles.push({
      id: part.id,
      seq: seq++,
      profileSize: '3030',
      length: Math.round(info.length),
      position: {
        x: Math.round(info.position.x),
        y: Math.round(info.position.y),
        z: Math.round(info.position.z),
      },
      direction: info.direction,
      parentId: null,
      parentFace: null,
      parentOffset: 0,
    });
    partTypeByProfile[part.id] = info.partType;
    partNameById[part.id] = part.name;
  }

  const hints = computeCornerHints(profiles);

  // --- Perpendicular corner pass (leg ↔ beam alongside) ---
  // The coplanar pass above only sees joints where a beam's bottom face presses
  // against the leg's TOP (the full-length front/back beam passing over the
  // leg). But the SHORT side beam runs ALONGSIDE the leg: its bottom face meets
  // the leg's inner side face at a right angle — a perpendicular joint the
  // coplanar check misses. Each leg therefore gets TWO brackets: one under the
  // beam passing over it, one at the side corner where the alongside beam's
  // underside meets the leg's inner face. `jointFitInfo` / `cornerBracketFits`
  // already handle perpendicular mounting faces, so we just enumerate the leg's
  // four side faces against the beam's bottom face and keep what fits.
  for (const leg of profiles) {
    if (partTypeByProfile[leg.id] !== 'leg') continue;
    const sideNormals = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    ];
    for (const beam of profiles) {
      if (partTypeByProfile[beam.id] === 'leg') continue; // only horizontal beams/cross beams
      if (beam.direction === leg.direction) continue; // parallel — no corner
      const size = PROFILE_SIZE;
      for (const n of sideNormals) {
        // Beam's underside face (normal -Y) × a leg side face.
        const fit = jointFitInfo(beam, { x: 0, y: -1, z: 0 }, leg, n);
        if (!fit || !cornerBracketFits(fit, size)) continue;
        hints.push({
          position: {
            x: Math.round(fit.position.x),
            y: Math.round(fit.position.y),
            z: Math.round(fit.position.z),
          },
          size,
          profileIdA: beam.id,
          profileIdB: leg.id,
          faceA: { x: 0, y: -1, z: 0 },
          faceB: n,
        });
      }
    }
  }

  // --- Dedupe by position ---
  // The same physical joint can be reached from two different beams (e.g. the
  // leg's side corner sits under BOTH the full-length front beam's edge and the
  // short side beam's edge). One bracket per position.
  const seenPos = new Set<string>();
  const unique: typeof hints = [];
  for (const h of hints) {
    const key = `${h.position.x},${h.position.y},${h.position.z}`;
    if (seenPos.has(key)) continue;
    seenPos.add(key);
    unique.push(h);
  }

  // --- One bracket per joint position ---
  // `unique` already holds one entry per physical bracket location, so no
  // further merging. Note: a cross beam (加强横梁) pressing its END face against
  // a tall leg face yields TWO valid brackets — one at the beam's bottom edge
  // and one at its top edge — and both are kept on purpose. There is no
  // "keep the lowest" merge here; every joint gets its brackets.
  const brackets: BracketInstance[] = [];
  let idx = 1;
  for (const h of unique) {
    // Top beams are fixed to the tabletop by other means — no brackets between
    // two top beams (beam_front/back/left/right corners).
    if (partTypeByProfile[h.profileIdA] === 'beam' && partTypeByProfile[h.profileIdB] === 'beam') {
      continue;
    }

    const e = eulerFromNormals(h.faceA, h.faceB);
    const nameA = partNameById[h.profileIdA] ?? h.profileIdA;
    const nameB = partNameById[h.profileIdB] ?? h.profileIdB;
    brackets.push({
      id: `bracket_auto_${idx}`,
      name: `角码-自动#${idx}(${nameA}/${nameB})`,
      position: { x: h.position.x, y: h.position.y, z: h.position.z },
      rotation: {
        roll: Math.round((e.x * 180) / Math.PI * 100) / 100,
        pitch: Math.round((e.y * 180) / Math.PI * 100) / 100,
        yaw: Math.round((e.z * 180) / Math.PI * 100) / 100,
      },
      connectedParts: [h.profileIdA, h.profileIdB],
      enabled: true,
      size: h.size,
    });
    idx += 1;
  }

  return brackets;
}
