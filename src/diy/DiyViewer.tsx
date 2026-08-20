import { useRef, useCallback, useEffect, type DragEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { useDiyStore } from '../store/diyStore';
import type { ProfileSize, AxisDir } from '../types/furniture';
import { findNearestSnap } from './DiySnap';
import { findCornerAt } from './DiyCornerHints';
import { fetchBracketRotation } from '../api/modelApi';
import DiyScene from './DiyScene';
import * as THREE from 'three';

const M = 0.001;

/**
 * 3D viewport for the DIY builder.
 *
 * Handles HTML5 drag-and-drop from the sidebar library:
 *   - Profiles → raycast against ground plane, place root at grid-snapped position
 *   - Brackets  → raycast, find nearest profile corner (endpoint), show ghost, snap on drop
 */
const DiyViewer: React.FC = () => {
  const addRootProfile = useDiyStore((s) => s.addRootProfile);
  const profiles = useDiyStore((s) => s.profiles);
  const startDraggingBracket = useDiyStore((s) => s.startDraggingBracket);
  const updateGhostBracket = useDiyStore((s) => s.updateGhostBracket);
  const placeBracket = useDiyStore((s) => s.placeBracket);
  const cancelDraggingBracket = useDiyStore((s) => s.cancelDraggingBracket);

  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Keep a ref to profiles so dragover callback always reads the latest array
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  /** Build a THREE.Ray from the mouse position in the drag event. */
  const getMouseRay = useCallback((e: DragEvent): THREE.Ray | null => {
    if (!containerRef.current || !cameraRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    return raycaster.ray;
  }, []);

  // ---- bracket ghost update during drag ----
  const updateBracketGhost = useCallback((ray: THREE.Ray) => {
    const profs = profilesRef.current;
    const sizeMap: Record<string, number> = { '2020': 20, '3030': 30, '4040': 40 };

    // Cast against a plane at average profile height so the hit is near the profiles
    const avgY = profs.length > 0
      ? profs.reduce((s, p) => s + p.position.y, 0) / profs.length * M
      : 0.5; // default ~0.5m if no profiles
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -avgY);
    const hit = new THREE.Vector3();
    ray.intersectPlane(plane, hit);

    if (!hit) {
      updateGhostBracket(null);
      return;
    }

    const snap = findNearestSnap(hit, profs, null, ['endpoint']);
    if (snap) {
      const endpointPos = {
        x: Math.round(snap.point.x * 1000),
        y: Math.round(snap.point.y * 1000),
        z: Math.round(snap.point.z * 1000),
      };
      // Snap the ghost to the nearest *valid* joint hint, not just any
      // profile endpoint. An endpoint away from the joint's centered hint
      // position is up to ~30 mm from it; placing there while orienting for
      // the hint would leave the bracket floating off the faces.
      const corner = findCornerAt(profs, endpointPos);
      if (corner) {
        const prof = profs.find((p) => p.id === corner.profileIdA);
        const size = prof ? (sizeMap[prof.profileSize] ?? 30) : 30;
        updateGhostBracket({
          position: corner.position,
          size: Math.max(size, corner.size),
          profileId: corner.profileIdA,
        });
      } else {
        const prof = profs.find((p) => p.id === snap.profileId);
        const size = prof ? (sizeMap[prof.profileSize] ?? 30) : 30;
        updateGhostBracket({
          position: endpointPos,
          size,
          profileId: snap.profileId,
        });
      }
    } else {
      updateGhostBracket(null);
    }
  }, [updateGhostBracket]);

  // Clean up bracket drag state when the drag ends anywhere on the page
  useEffect(() => {
    const onDragEnd = () => cancelDraggingBracket();
    document.addEventListener('dragend', onDragEnd);
    return () => document.removeEventListener('dragend', onDragEnd);
  }, [cancelDraggingBracket]);

  // ---- event handlers ----

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    if (e.dataTransfer.types.includes('application/diy-bracket')) {
      startDraggingBracket(); // idempotent — safe to call every frame
      const ray = getMouseRay(e);
      if (ray) updateBracketGhost(ray);
    }
  }, [getMouseRay, updateBracketGhost, startDraggingBracket]);

  /**
   * Place a bracket at the ghost position, auto-oriented at a profile corner.
   *
   * Finds the nearest corner hint; if one exists, asks the backend for the
   * rotation that maps the two mounting faces onto the bracket plate normals,
   * converts the returned matrix to Euler angles using THREE's own 'XYZ'
   * convention (the same one the renderer applies), and stores the result.
   * Falls back to an unrotated bracket when there is no corner or the call
   * fails.
   */
  const placeBracketAtGhost = useCallback(async () => {
    const ghost = useDiyStore.getState().ghostBracket;
    if (!ghost) {
      placeBracket();
      return;
    }
    const corner = findCornerAt(profilesRef.current, ghost.position);
    if (!corner) {
      placeBracket();
      return;
    }
    try {
      const res = await fetchBracketRotation(
        [corner.faceA.x, corner.faceA.y, corner.faceA.z],
        [corner.faceB.x, corner.faceB.y, corner.faceB.z],
      );
      // Backend returns the rotation as row-major; THREE's Matrix4.set is
      // column-major, so transpose on the way in.
      const m = new THREE.Matrix4().set(
        res.rotation_matrix[0][0], res.rotation_matrix[1][0], res.rotation_matrix[2][0], 0,
        res.rotation_matrix[0][1], res.rotation_matrix[1][1], res.rotation_matrix[2][1], 0,
        res.rotation_matrix[0][2], res.rotation_matrix[1][2], res.rotation_matrix[2][2], 0,
        0, 0, 0, 1,
      );
      const euler = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
      placeBracket({
        // Land exactly on the joint corner the rotation was computed for, so
        // position and orientation always come from the same corner.
        position: corner.position,
        rotation: {
          roll: THREE.MathUtils.radToDeg(euler.x),
          pitch: THREE.MathUtils.radToDeg(euler.y),
          yaw: THREE.MathUtils.radToDeg(euler.z),
        },
        connectedProfiles: [corner.profileIdA, corner.profileIdB],
      });
    } catch {
      placeBracket();
    }
  }, [placeBracket]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();

    // ---- bracket drop ----
    if (e.dataTransfer.types.includes('application/diy-bracket')) {
      void placeBracketAtGhost();
      return;
    }

    // ---- profile drop (existing behaviour) ----
    const size = e.dataTransfer.getData('application/diy-profile') as ProfileSize;
    if (!size || !containerRef.current || !cameraRef.current) return;

    const ray = getMouseRay(e);
    if (!ray) return;

    // Cast against Y=0 ground plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    ray.intersectPlane(plane, hit);

    if (hit) {
      // Snap to 10 mm grid, place vertical, bottom on ground
      const px = Math.round(hit.x * 1000 / 10) * 10;
      const pz = Math.round(hit.z * 1000 / 10) * 10;
      const dim = ({ '2020': 20, '3030': 30, '4040': 40 } as Record<string, number>)[size] ?? 30;
      addRootProfile(size, { x: px, y: 50, z: pz }, 'Y' as AxisDir);
    }
  }, [addRootProfile, placeBracketAtGhost, getMouseRay]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative bg-[#1a1a2e]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Canvas
        shadows="soft"
        gl={{ antialias: true, toneMapping: 3, toneMappingExposure: 1.0, outputColorSpace: 'srgb' }}
        camera={{ position: [3, 2.5, 5], fov: 50, near: 0.05, far: 100 }}
        style={{ width: '100%', height: '100%' }}
      >
        <DiyScene onCameraReady={(cam) => { cameraRef.current = cam; }} />
      </Canvas>

      {/* Drop hint */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
        <div className="text-neutral-700 text-sm">
          Drag profile or bracket from library here
        </div>
      </div>
    </div>
  );
};

export default DiyViewer;
