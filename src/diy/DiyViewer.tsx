import { useRef, useCallback, useEffect, useState, type DragEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { useDiyStore } from '../store/diyStore';
import type { ProfileSize, AxisDir, ScrewSize } from '../types/furniture';
import { findNearestSnap } from './DiySnap';
import { findCornerAt } from './DiyCornerHints';
import { bracketAtHint } from './diyCornerGeometry';
import { DEFAULT_BRACKET_CONNECTOR_ID } from '../store/diyStore';
import { connectorById } from './connectors';
import { connectorLabel } from '../i18n/names';
import { raycastScrewTarget } from './DiyScrewRaycast';
import DiyScene from './DiyScene';
import * as THREE from 'three';
import { useT } from '../i18n';

const M = 0.001;

/**
 * Screw sizes are carried as their own dataTransfer type
 * (`application/diy-screw-M5`) so the size is readable during dragover —
 * `dataTransfer.getData` only works in the drop event.
 *
 * Note: browsers normalize custom MIME types to lowercase (Chrome lowercases
 * them in `types`), so the size suffix is matched case-insensitively.
 */
const SCREW_TYPE_PREFIX = 'application/diy-screw-';
const screwSizeFromTypes = (types: readonly string[]): ScrewSize | null => {
  const t = types.find((x) => x.toLowerCase().startsWith(SCREW_TYPE_PREFIX));
  if (!t) return null;
  const size = t.slice(SCREW_TYPE_PREFIX.length).toUpperCase() as ScrewSize;
  return size === 'M4' || size === 'M5' || size === 'M6' ? size : null;
};

/**
 * 3D viewport for the DIY builder.
 *
 * Handles HTML5 drag-and-drop from the sidebar library:
 *   - Profiles → raycast against ground plane, place root at grid-snapped position
 *   - Brackets  → raycast, find nearest profile corner (endpoint), show ghost, snap on drop
 *   - Screws    → raycast against profile faces, show ghost, place oriented on the face
 */
const DiyViewer: React.FC = () => {
  const t = useT();
  const addRootProfile = useDiyStore((s) => s.addRootProfile);
  const profiles = useDiyStore((s) => s.profiles);
  const startDraggingBracket = useDiyStore((s) => s.startDraggingBracket);
  const updateGhostBracket = useDiyStore((s) => s.updateGhostBracket);
  const placeBracket = useDiyStore((s) => s.placeBracket);
  const placeBracketAtHint = useDiyStore((s) => s.placeBracketAtHint);
  const cancelDraggingBracket = useDiyStore((s) => s.cancelDraggingBracket);
  const startDraggingScrew = useDiyStore((s) => s.startDraggingScrew);
  const updateGhostScrew = useDiyStore((s) => s.updateGhostScrew);
  const placeScrew = useDiyStore((s) => s.placeScrew);
  const cancelDraggingScrew = useDiyStore((s) => s.cancelDraggingScrew);
  const bindKit = useDiyStore((s) => s.bindKit);

  // Transient toast for kit drops that had nowhere valid to land. A kit needs a
  // real corner, and silently doing nothing looks like a broken drag.
  const [kitHint, setKitHint] = useState<string | null>(null);
  useEffect(() => {
    if (!kitHint) return;
    const t = setTimeout(() => setKitHint(null), 2600);
    return () => clearTimeout(t);
  }, [kitHint]);

  // The armed connector changes what a corner-click drops, so it has to be
  // visible somewhere the user is looking — the corner ghosts themselves say
  // WHERE, this says WHAT. Escape puts it back down, the same key that cancels
  // every other DIY gesture.
  const armedConnectorId = useDiyStore((s) => s.armedConnectorId);
  const armConnector = useDiyStore((s) => s.armConnector);
  useEffect(() => {
    if (!armedConnectorId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') armConnector(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armedConnectorId, armConnector]);

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

  // Clean up bracket/screw drag state when the drag ends anywhere on the page
  useEffect(() => {
    const onDragEnd = () => {
      cancelDraggingBracket();
      cancelDraggingScrew();
    };
    document.addEventListener('dragend', onDragEnd);
    return () => document.removeEventListener('dragend', onDragEnd);
  }, [cancelDraggingBracket, cancelDraggingScrew]);

  // ---- event handlers ----

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    // A kit drop rides the same ghost as a bracket drop: it needs a corner.
    if (
      e.dataTransfer.types.includes('application/diy-bracket') ||
      e.dataTransfer.types.includes('application/diy-kit')
    ) {
      startDraggingBracket(); // idempotent — safe to call every frame
      const ray = getMouseRay(e);
      if (ray) updateBracketGhost(ray);
      return;
    }

    const screwSize = screwSizeFromTypes(e.dataTransfer.types);
    if (screwSize) {
      startDraggingScrew(); // idempotent — safe to call every frame
      const ray = getMouseRay(e);
      if (ray) updateGhostScrew(raycastScrewTarget(ray, profilesRef.current, screwSize));
    }
  }, [getMouseRay, updateBracketGhost, startDraggingBracket, startDraggingScrew, updateGhostScrew]);

  /**
   * Place a bracket at the ghost position, auto-oriented at a profile corner.
   *
   * Finds the nearest corner hint; if one exists, asks the backend for the
   * rotation that maps the two mounting faces onto the bracket plate normals,
   * converts the returned matrix to Euler angles using THREE's own 'XYZ'
   * convention (the same one the renderer applies), and stores the result.
   * Falls back to an unrotated bracket when there is no corner or the call
   * fails. `connectorId` (from the drop payload) stamps which catalog entry
   * the new bracket renders.
   */
  const placeBracketAtGhost = useCallback((connectorId?: string) => {
    const ghost = useDiyStore.getState().ghostBracket;
    if (!ghost) return;
    const corner = findCornerAt(profilesRef.current, ghost.position);
    if (corner) {
      // Land exactly on the joint corner, so position and orientation always
      // come from the same corner. This used to ask the backend for the same
      // rotation `eulerFromNormals` computes locally — a network round-trip
      // whose only other contribution was a `catch` that placed an unrotated
      // bracket, i.e. a bracket at an orientation nobody asked for. The dev
      // comparison harness in DiyProfileRenderer already asserts the two agree.
      placeBracketAtHint(corner, connectorId);
      return;
    }
    // The ghost follows the pointer over the whole profile, not just its
    // corners, so a drop on a bare face has no joint to orient to. That case
    // still places the unrotated bracket it always did.
    placeBracket({ connectorId: connectorId || DEFAULT_BRACKET_CONNECTOR_ID });
  }, [placeBracket, placeBracketAtHint]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();

    // ---- accessory-kit drop ----
    // A kit is hardware bound to a joint, so unlike a bracket it has no
    // unoriented fallback: refuse anything that is not a real corner rather
    // than pinning screws to a bracket that was never rotated into place.
    if (e.dataTransfer.types.includes('application/diy-kit')) {
      const kitId = e.dataTransfer.getData('application/diy-kit');
      const ghost = useDiyStore.getState().ghostBracket;
      const corner = ghost ? findCornerAt(profilesRef.current, ghost.position) : null;
      if (!corner) {
        cancelDraggingBracket();
        setKitHint(t('diy.kitOnlyOnCorner'));
        return;
      }
      void (() => {
        // A kit hangs off a BRACKET, so on a corner that already carries one the
        // kit binds to that bracket — placing first would be wrong twice over:
        // `placeBracketAtHint` now swaps the occupant's part rather than adding a
        // bracket, and the part it swaps in is the default, i.e. a kit drop would
        // silently replace the connector the user chose.
        let target = bracketAtHint(useDiyStore.getState().brackets, corner)?.id;
        if (!target) {
          // Synchronous now that placement resolves its rotation locally — there
          // is nothing left to await. The bracket is in the store by the next line.
          placeBracketAtGhost();
          // Placing sets selectedBracketId to the bracket it just made.
          target = useDiyStore.getState().selectedBracketId ?? undefined;
        }
        if (!target || !bindKit(kitId, target)) {
          setKitHint(t('diy.kitPlaceFailed'));
          return;
        }
        setKitHint(null);
      })();
      return;
    }

    // ---- bracket drop ----
    // dataTransfer.getData is only readable on drop — carry the catalog id
    // (set by DiyProfileLibrary on dragstart) so the placed bracket renders
    // the dragged connector model.
    if (e.dataTransfer.types.includes('application/diy-bracket')) {
      const cid = e.dataTransfer.getData('application/diy-bracket') || 'corner_bracket';
      void placeBracketAtGhost(cid);
      return;
    }

    // ---- screw drop (size/orientation already baked into ghostScrew) ----
    if (screwSizeFromTypes(e.dataTransfer.types)) {
      placeScrew();
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
      addRootProfile(size, { x: px, y: 50, z: pz }, 'Y' as AxisDir);
    }
  }, [addRootProfile, placeBracketAtGhost, placeScrew, getMouseRay, bindKit, cancelDraggingBracket, t]);

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
          {t('diy.dropHint')}
        </div>
      </div>

      {/* Armed-connector banner. The ghosts show WHERE it will land; this says
          WHAT is in hand, so the click target is never a guess. */}
      {armedConnectorId && (
        <div
          data-diy-armed={armedConnectorId}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded
            bg-wood-700/85 border border-wood-500 text-wood-50 text-xs pointer-events-none"
        >
          {t('diy.armBanner', { name: connectorLabel(connectorById(armedConnectorId)) })}
        </div>
      )}

      {/* Kit-drop toast */}
      {kitHint && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded
          bg-amber-900/80 border border-amber-700 text-amber-100 text-xs pointer-events-none">
          {kitHint}
        </div>
      )}
    </div>
  );
};

export default DiyViewer;
