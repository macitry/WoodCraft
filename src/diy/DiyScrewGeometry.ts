import * as THREE from 'three';
import type { ScrewSize } from '../types/furniture';
import { SCREW_HEAD_DIMS } from '../types/furniture';

export interface ScrewGroupOpts {
  color?: string;
  opacity?: number;
}

/**
 * Build a procedural socket-head screw (hex head + shaft) as a THREE.Group.
 *
 * Local space is in MILLIMETRES with the origin at the shoulder — the head's
 * inner face, i.e. the point that rests on the profile face. The head occupies
 * z ∈ [-headH, 0] (outside the profile), the shaft z ∈ [0, length-headH] (into
 * the profile), so the screw axis is +Z. The caller scales by MM_TO_M and
 * orients +Z along the face-inward normal.
 */
export function buildScrewGroup(
  size: ScrewSize,
  length: number,
  opts?: ScrewGroupOpts,
): THREE.Group {
  const { headD, headH } = SCREW_HEAD_DIMS[size];
  const shaftD = Number(size.replace('M', ''));
  const shaftLen = Math.max(0, length - headH);
  const color = opts?.color ?? '#c8c8c8';
  const opacity = opts?.opacity ?? 1;
  const transparent = opacity < 1;

  const metal = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.85,
    roughness: 0.32,
    transparent,
    opacity,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: '#222222',
    metalness: 0.4,
    roughness: 0.8,
    transparent,
    opacity,
  });

  const group = new THREE.Group();

  // Hex socket head (cylinder axis Y -> +Z via rotation.x = +90°).
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(headD / 2, headD / 2, headH, 32),
    metal,
  );
  head.position.z = -headH / 2;
  head.rotation.x = Math.PI / 2;
  group.add(head);

  // Hex socket recess on the head top face. Slightly proud of the top so it
  // reads as an indentation without z-fighting the coplanar head face.
  const hexR = headD * 0.32;
  const hexDepth = Math.max(0.8, headH * 0.28);
  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(hexR, hexR, hexDepth, 6),
    dark,
  );
  socket.position.z = -headH + hexDepth / 2 + 0.03;
  socket.rotation.x = Math.PI / 2;
  group.add(socket);

  // Shaft (from the shoulder at z=0 down into the profile).
  if (shaftLen > 0) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftD / 2, shaftD / 2, shaftLen, 24),
      metal,
    );
    shaft.position.z = shaftLen / 2;
    shaft.rotation.x = Math.PI / 2;
    group.add(shaft);
  }

  return group;
}
