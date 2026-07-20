import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useModelStore } from '../store/modelStore';
import type { BracketInstance, MateHit } from '../types/furniture';

/**
 * Handles both Snap Mode (one-click place) and Mate Mode (two-click face-to-face).
 *
 * Mate workflow (SolidWorks-style):
 *   1. Select bracket in editor → click [Mate]
 *   2. Click on bracket surface → captures source face (highlighted)
 *   3. Click on target part surface → captures target face
 *   4. Auto-compute: rotation aligns faces flush, position snaps to target
 */
const PlacementOverlay: React.FC = () => {
  const { camera, scene, gl } = useThree();

  const placementMode = useModelStore((s) => s.placementMode);
  const mateState = useModelStore((s) => s.mateState);
  const mateBracketId = useModelStore((s) => s.mateBracketId);

  const placementRef = useRef(placementMode);
  placementRef.current = placementMode;
  const mateStateRef = useRef(mateState);
  mateStateRef.current = mateState;

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();

    const handler = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);

      // Collect all meshes
      const targets: THREE.Object3D[] = [];
      const meshesByObject: Map<THREE.Object3D, THREE.Mesh> = new Map();
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const name = obj.name || '';
        if (name === '' || name.startsWith('ground') || name.startsWith('grid')) return;
        targets.push(obj);
        meshesByObject.set(obj, obj);
      });

      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length === 0) return;

      const hit = hits[0];
      const mesh = meshesByObject.get(hit.object);
      if (!mesh) return;

      const point = hit.point.clone();
      const normal = hit.face?.normal?.clone() ?? new THREE.Vector3(0, 1, 0);

      // Transform normal to world space
      hit.object.updateWorldMatrix(true, false);
      const worldNormal = normal
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
        .normalize();

      const objectName = mesh.name || 'unknown';

      const mateHit: MateHit = {
        point: [point.x, point.y, point.z],
        normal: [worldNormal.x, worldNormal.y, worldNormal.z],
        objectName,
      };

      // --- Snap Mode: one-click place ---
      if (placementRef.current && mateStateRef.current === 'idle') {
        const state = useModelStore.getState();
        const idx = state.brackets.length;

        // Normal → Euler
        const defaultDir = new THREE.Vector3(0, -1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(defaultDir, worldNormal);
        const euler = new THREE.Euler().setFromQuaternion(quat, 'ZYX');

        const newBracket: BracketInstance = {
          id: `bracket_snap_${Date.now()}`,
          name: `角铁-${objectName}#${idx + 1}`,
          position: {
            x: Math.round(point.x * 1000),
            y: Math.round(point.y * 1000),
            z: Math.round(point.z * 1000),
          },
          rotation: {
            roll: Math.round(THREE.MathUtils.radToDeg(euler.x)),
            pitch: Math.round(THREE.MathUtils.radToDeg(euler.y)),
            yaw: Math.round(THREE.MathUtils.radToDeg(euler.z)),
          },
          connectedParts: [objectName],
          enabled: true,
        };
        state.addBracket(newBracket);
        state.selectBracket(newBracket.id);
        return;
      }

      // --- Mate Mode: two-step face selection ---
      // Step 1: select source face (on bracket)
      if (mateStateRef.current === 'selecting_source_face') {
        useModelStore.getState().setMateSourceHit(mateHit);
        return;
      }

      // Step 2: select target face (on target part)
      if (mateStateRef.current === 'selecting_target_face') {
        useModelStore.getState().setMateTargetHit(mateHit);
        return;
      }
    };

    canvas.addEventListener('click', handler);
    return () => canvas.removeEventListener('click', handler);
  }, [camera, scene, gl.domElement]);

  // Cursor feedback
  useEffect(() => {
    const canvas = gl.domElement;
    if (placementMode || mateState !== 'idle') {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
    return () => { canvas.style.cursor = ''; };
  }, [placementMode, mateState, gl.domElement]);

  return null;
};

export default PlacementOverlay;
