import { useRef, useCallback, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { PROFILE_DIMS } from '../types/furniture';

const M = 0.001;

const DiyStretchGizmo: React.FC = () => {
  const { camera, gl } = useThree();
  const selectedProfileId = useDiyStore((s) => s.selectedProfileId);
  const profiles = useDiyStore((s) => s.profiles);
  const updateProfileLength = useDiyStore((s) => s.updateProfileLength);
  const controlsRef = useDiyStore((s) => s.controlsRef);

  const dragRef = useRef(false);

  const profile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const dim = (profile ? PROFILE_DIMS[profile.profileSize] : null) ?? 30;
  const len = Math.max(1, profile?.length ?? 0);
  const halfLen = (len * M) / 2;
  const radius = (dim * M) * 0.35; // 70% of half-dim = 35% of full dim

  const pos: [number, number, number] = profile
    ? [M * profile.position.x, M * profile.position.y, M * profile.position.z]
    : [0, 0, 0];
  const axIdx = profile?.direction === 'X' ? 0 : profile?.direction === 'Y' ? 1 : 2;
  const axVec = useMemo(() => {
    const v = new THREE.Vector3();
    if (profile) v.setComponent(axIdx, 1);
    return v;
  }, [profile, axIdx]);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(), []);

  const handlePointerDown = useCallback(
    () => (e: any) => {
      if (!profile) return;
      e.stopPropagation();
      dragRef.current = true;

      // Disable orbit controls during drag
      if (controlsRef?.current) {
        controlsRef.current.enabled = false;
      }

      const canvas = gl.domElement;
      const fixedEnd = new THREE.Vector3(...pos).addScaledVector(axVec, -halfLen);
      const startLen = len;

      // Capture initial mouse hit to compute delta
      const rect0 = canvas.getBoundingClientRect();
      const p0 = new THREE.Vector2(
        ((e.nativeEvent.clientX - rect0.left) / rect0.width) * 2 - 1,
        -((e.nativeEvent.clientY - rect0.top) / rect0.height) * 2 + 1,
      );
      raycaster.setFromCamera(p0, camera);
      plane.setFromNormalAndCoplanarPoint(axVec, fixedEnd);
      const hit0 = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, hit0);
      const startDist = hit0 ? fixedEnd.distanceTo(hit0) / M : startLen;

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        ev.preventDefault();
        ev.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        plane.setFromNormalAndCoplanarPoint(axVec, fixedEnd);
        const hit = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, hit);
        if (hit) {
          const curDist = fixedEnd.distanceTo(hit) / M;
          const delta = curDist - startDist; // 1:1 mouse tracking
          const rawLen = Math.max(10, Math.round(startLen + delta));
          const newLen = Math.round(rawLen / 10) * 10; // snap to 10mm
          updateProfileLength(profile.id, newLen);
        }
      };
      const onUp = () => {
        dragRef.current = false;
        if (controlsRef?.current) {
          controlsRef.current.enabled = true;
        }
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointerleave', onUp);
      };
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerleave', onUp);
    },
    [profile, gl, camera, pos, axVec, halfLen, len, updateProfileLength, raycaster, plane, controlsRef],
  );

  if (!profile) return null;

  // Arrow position: beyond the profile end face by half the arrow length
  const arrowHeight = radius * 2.5;
  const endPos: [number, number, number] = [pos[0], pos[1], pos[2]];
  endPos[axIdx] += halfLen + arrowHeight * 0.5;

  // Rotate arrow to point along profile axis (cone default: +Y)
  const arrowRot: [number, number, number] =
    axIdx === 0 ? [0, 0, -Math.PI / 2] :  // X axis: cone Y → X
    axIdx === 1 ? [0, 0, 0] :              // Y axis: cone Y stays Y
    [Math.PI / 2, 0, 0];                   // Z axis: cone Y → Z

  return (
    <mesh position={endPos} rotation={arrowRot} onPointerDown={handlePointerDown()}>
      <coneGeometry args={[radius * 0.8, radius * 2.5, 8]} />
      <meshStandardMaterial color="#ffaa00" roughness={0.2} />
    </mesh>
  );
};

export default DiyStretchGizmo;
