import * as THREE from 'three';
import type { ScrewSize } from '../types/furniture';

export interface TNutGroupOpts {
  color?: string;
  opacity?: number;
  /**
   * X-ray mode. A T-nut lives INSIDE the profile's slot, behind opaque aluminium,
   * so with normal depth testing it is never visible however it is coloured —
   * an "x-ray" toggle that only lowered opacity would draw nothing on screen.
   * Ghosted nuts therefore also drop depth testing and draw late, so they show
   * through the profile that contains them.
   */
  ghost?: boolean;
}

/** Slot-block dimensions per thread size (mm): [across the slot, along the slot,
 *  block thickness]. Sized to the slot cavity of the matching series. */
const TNUT_BLOCK_DIMS: Record<ScrewSize, [number, number, number]> = {
  M4: [8, 12, 4],
  M5: [9, 14, 4.5],
  M6: [10, 16, 5],
};

/**
 * Build a procedural T-slot nut (槽内螺母 / T 型螺母) as a THREE.Group.
 *
 * Local space matches buildScrewGroup: MILLIMETRES, axis +Z, origin at the point
 * the part is seated against. The block sits at z ∈ [0, blockT] with the threaded
 * boss continuing to +Z, so a T-nut sharing a bolt's rotation drops straight into
 * the same slot, one step further along the bolt's axis.
 *
 * Local X spans ACROSS the slot (the direction the slot lips grip), local Y spans
 * ALONG the slot — which is why a caller can reuse the bolt's orientation verbatim.
 */
export function buildTNutGroup(size: ScrewSize, opts?: TNutGroupOpts): THREE.Group {
  const [blockW, blockL, blockT] = TNUT_BLOCK_DIMS[size];
  const color = opts?.color ?? '#b08d57';
  const ghost = opts?.ghost ?? false;
  const opacity = opts?.opacity ?? (ghost ? 0.45 : 1);
  const transparent = opacity < 1;

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.75,
    roughness: 0.45,
    transparent,
    opacity,
    // See `ghost`: without this the nut is hidden by the profile around it.
    depthTest: !ghost,
    depthWrite: !ghost,
  });

  const group = new THREE.Group();

  // Slot block — the part that wedges into the profile's T-slot cavity.
  const block = new THREE.Mesh(new THREE.BoxGeometry(blockW, blockL, blockT), material);
  block.position.z = blockT / 2;
  group.add(block);

  // Threaded boss, slightly narrower so the block reads as a flange.
  const bossH = Math.max(4, blockT);
  const boss = new THREE.Mesh(
    new THREE.CylinderGeometry(blockW * 0.32, blockW * 0.32, bossH, 24),
    material,
  );
  boss.position.z = blockT + bossH / 2;
  boss.rotation.x = Math.PI / 2;
  group.add(boss);

  if (ghost) {
    // Draw after the opaque scene so the ghost is never buried by it.
    group.renderOrder = 7;
    group.traverse((o) => { o.renderOrder = 7; });
  }

  return group;
}
