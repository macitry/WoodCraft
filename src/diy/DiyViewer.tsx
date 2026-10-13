import { useRef, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useDiyStore, ROOT_PROFILE_LENGTH } from '../store/diyStore';
import type { ProfileSize, AxisDir, DiyHand, DiyProfileGhost, DiyBracketGhost } from '../types/furniture';
import { PROFILE_DIMS } from '../types/furniture';
import { findCornerAt } from './DiyCornerHints';
import { bracketAtHint } from './diyCornerGeometry';
import { connectorById } from './connectors';
import { connectorLabel, kitName } from '../i18n/names';
import { raycastScrewTarget } from './DiyScrewRaycast';
import { SCREW_FAMILIES, accessoryKitById } from '../utils/accessoryKits';
import { allCornerHints, cornerHintUnderPointer, freeCornerHints } from './diyBracketTarget';
import DiyScene from './DiyScene';
import { backgroundById } from './diyBackgrounds';
import DiyToolbar from './DiyToolbar';
import * as THREE from 'three';
import { useT } from '../i18n';

/** Placement grid on the ground plane (mm). */
const GRID_MM = 10;

/**
 * How far the pointer may travel between press and release and still count as a
 * click.
 *
 * Holding a part deliberately does NOT take the camera away — you want to look
 * at the joint you are about to fill from another angle while the ghost follows
 * the pointer. That makes an orbit-drag and a placement click the same gesture
 * as far as the browser is concerned, so the only thing that separates them is
 * distance: past this many pixels it was a camera move, and the release places
 * nothing.
 */
const CLICK_SLOP_PX = 5;

/** Y=0 ground plane the profile ghost is tracked on. */
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * Whether this browser has ever had a part in the scene.
 *
 * The idle hint's first-run state. Until the builder has been used once the
 * hint sits in the MIDDLE of the empty stage, where it cannot be missed; from
 * the first placed part onwards it moves to the bottom and stays out of the
 * way. Which of the two is right is a fact about the user rather than about
 * this page load — a reload is not a first run — so it is remembered.
 *
 * Bare localStorage, both directions guarded, like `diy.leftW` (DiyPage) and the
 * background. A blocked store costs the user the quieter hint, never the page:
 * unwritable means it reads back false forever and the hint simply stays
 * centred, which is the behaviour this page had before any of it.
 */
const HINT_SEEN_KEY = 'diy.hintSeen';

function readHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markHintSeen(): void {
  try {
    localStorage.setItem(HINT_SEEN_KEY, '1');
  } catch {
    // Nothing to do and nothing to say.
  }
}

/**
 * 3D viewport for the DIY builder.
 *
 * Placement is a two-click gesture: picking a card from the sidebar puts a part
 * in hand (`hand` in the store), a ghost of it follows the pointer across the
 * scene, and a second click — on the scene — commits it. Moving a part already
 * on the assembly is a press-and-drag on it, and lives in `useDiyMoveDrag` on
 * the renderers; this component only owns the in-hand half.
 *
 * The pointer work is all here because the pointer is over the whole viewport,
 * not over any one part: a ghost has to appear over bare ground, over a face
 * with no profile under it, and at a corner with three profiles competing for
 * the ray. Which of those the pointer is on is decided by the raycast each
 * branch below runs, not by which mesh happened to be hit first.
 */
const DiyViewer: React.FC = () => {
  const t = useT();
  const background = useDiyStore((s) => s.background);
  const bg = backgroundById(background);
  const addRootProfile = useDiyStore((s) => s.addRootProfile);
  const profiles = useDiyStore((s) => s.profiles);
  const updateGhostBracket = useDiyStore((s) => s.updateGhostBracket);
  const placeBracket = useDiyStore((s) => s.placeBracket);
  const placeBracketAtHint = useDiyStore((s) => s.placeBracketAtHint);
  const updateGhostScrew = useDiyStore((s) => s.updateGhostScrew);
  const placeScrew = useDiyStore((s) => s.placeScrew);
  const updateGhostProfile = useDiyStore((s) => s.updateGhostProfile);
  const bindKit = useDiyStore((s) => s.bindKit);
  const pickUpHand = useDiyStore((s) => s.pickUpHand);
  const hand = useDiyStore((s) => s.hand);

  // Read once, on the first render — see `HINT_SEEN_KEY`. The setter is not just
  // bookkeeping for the next visit: it is what moves the hint this time.
  const [hintSeen, setHintSeen] = useState(readHintSeen);

  /**
   * Placing anything at all retires the centred hint, permanently.
   *
   * Recorded on the way UP — on the first part appearing — and not when the hint
   * is first drawn. A flag set the moment it appeared would move it to the
   * bottom on the very next render, and the user would watch it jump; tying it
   * to the first part instead means the centred version stays put for as long as
   * the stage is empty and the builder is new, and is only ever seen on that
   * first empty stage.
   */
  useEffect(() => {
    if (hintSeen || profiles.length === 0) return;
    markHintSeen();
    setHintSeen(true);
  }, [hintSeen, profiles.length]);

  // Transient toast for kit placements that had nowhere valid to land. A kit
  // needs a real corner, and silently doing nothing looks like a broken click.
  const [kitHint, setKitHint] = useState<string | null>(null);
  useEffect(() => {
    if (!kitHint) return;
    const t = setTimeout(() => setKitHint(null), 2600);
    return () => clearTimeout(t);
  }, [kitHint]);

  // Escape puts the part back down, the same key that cancels every other DIY
  // gesture.
  useEffect(() => {
    if (!hand) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pickUpHand(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hand, pickUpHand]);

  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  /** Where the current press started, for the click/orbit distance test. */
  const pressAt = useRef<{ x: number; y: number } | null>(null);

  // Keep a ref to profiles so the pointer callbacks always read the latest array
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  /** Build a THREE.Ray from a viewport-relative pointer position. */
  const getMouseRay = useCallback((clientX: number, clientY: number): THREE.Ray | null => {
    if (!containerRef.current || !cameraRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    return raycaster.ray;
  }, []);

  /**
   * Ghost for a profile about to be placed: on the ground, grid-snapped,
   * standing.
   *
   * Ground-only and vertical, which is what a root profile is — the ghost is a
   * promise about what the click builds, and `addRootProfile` builds a vertical
   * post of `ROOT_PROFILE_LENGTH` centred on the position. Heights are derived
   * from that same constant so a preview cannot stand at a height the click
   * does not produce.
   */
  const profileGhostAt = useCallback((ray: THREE.Ray, size: ProfileSize): DiyProfileGhost | null => {
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(GROUND_PLANE, hit)) return null;
    return {
      position: {
        x: Math.round(hit.x * 1000 / GRID_MM) * GRID_MM,
        y: ROOT_PROFILE_LENGTH / 2,
        z: Math.round(hit.z * 1000 / GRID_MM) * GRID_MM,
      },
      size,
      direction: 'Y' as AxisDir,
    };
  }, []);

  /**
   * Ghost for a 三通件: free placement on the ground, at the pointer.
   *
   * The one connector that is NOT a joint part, and therefore the one that gets
   * a pointer-following ghost like a profile instead of a corner preview like an
   * angle. Three profiles butt into a cube, one per face, so there is no pair of
   * mounting faces to solve an orientation from and no corner to snap to — the
   * part is dropped where the user puts it and moved afterwards by dragging.
   *
   * `y = ext/2` rests the baked mesh on the ground: the eight cubes are baked
   * centred on their own origin (see the bake script's PRESETS), so half an edge
   * is what lifts one clear of y=0. `size = extMm` keeps `ConnectorStl`'s
   * ext→size scale at 1:1, i.e. a 30 cube is drawn 30 mm across, and leaves the
   * bracket's own `size` meaning what the property panel says it does.
   */
  const nodeGhostAt = useCallback((ray: THREE.Ray, connectorId: string): DiyBracketGhost | null => {
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(GROUND_PLANE, hit)) return null;
    const ext = connectorById(connectorId).extMm;
    return {
      position: {
        x: Math.round(hit.x * 1000 / GRID_MM) * GRID_MM,
        y: ext / 2,
        z: Math.round(hit.z * 1000 / GRID_MM) * GRID_MM,
      },
      size: ext,
      // No parent, so `placeBracket` records no joint — a node is not bolted to
      // anything, and `connectedProfiles: []` is what every joint rule already
      // reads as "the solver never posed this one".
      profileId: '',
    };
  }, []);

  /**
   * Ghost for a connector or a kit: the joint the pointer is over.
   *
   * Only a joint. A bracket has no meaningful pose anywhere else, and the
   * orange corner ghosts — which are the actual click targets for the part in
   * hand — are drawn on exactly this set, so the preview and the target cannot
   * disagree about where a click would land.
   */
  const updateBracketGhostAt = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const st = useDiyStore.getState();
    // The same joint set the corner ghosts are drawn from, including the kit's
    // exception — a kit belongs on a joint that already has its bracket, so the
    // preview has to appear there too or it would promise a landing spot it then
    // refuses. See `DiyCornerHints`.
    const corner = cornerHintUnderPointer(
      st.hand?.kind === 'kit' ? allCornerHints(st.profiles) : freeCornerHints(st.profiles, st.brackets),
      cameraRef.current!,
      container.getBoundingClientRect(),
      clientX,
      clientY,
    );
    if (!corner) {
      updateGhostBracket(null);
      return;
    }
    const prof = st.profiles.find((p) => p.id === corner.profileIdA);
    const size = prof ? PROFILE_DIMS[prof.profileSize] : 30;
    updateGhostBracket({
      position: corner.position,
      size: Math.max(size, corner.size),
      profileId: corner.profileIdA,
    });
  }, [updateGhostBracket]);

  /** Refresh whichever ghost the part in hand owns. */
  const trackGhost = useCallback((clientX: number, clientY: number) => {
    const held = useDiyStore.getState().hand;
    if (!held) return;
    // A 三通件 follows the pointer like a profile; every other connector — and a
    // kit — previews the joint under it. Which of the two a held connector is
    // depends on the catalog entry, so it is asked rather than assumed.
    if (held.kind === 'connector') {
      if (connectorById(held.connectorId).kind === 'node') {
        const ray = getMouseRay(clientX, clientY);
        if (ray) updateGhostBracket(nodeGhostAt(ray, held.connectorId));
      } else {
        updateBracketGhostAt(clientX, clientY);
      }
      return;
    }
    if (held.kind === 'kit') {
      updateBracketGhostAt(clientX, clientY);
      return;
    }
    const ray = getMouseRay(clientX, clientY);
    if (!ray) return;
    if (held.kind === 'profile') updateGhostProfile(profileGhostAt(ray, held.size));
    else updateGhostScrew(raycastScrewTarget(ray, profilesRef.current, held.size, held.family));
  }, [getMouseRay, profileGhostAt, nodeGhostAt, updateBracketGhostAt, updateGhostScrew, updateGhostProfile, updateGhostBracket]);

  // ---- event handlers ----

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pressAt.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    trackGhost(e.clientX, e.clientY);
  }, [trackGhost]);

  /**
   * Place a bracket at the ghost position, auto-oriented at a profile corner.
   *
   * Finds the nearest corner hint; if one exists, the corner supplies both the
   * position and the rotation that maps its two mounting faces onto the bracket
   * plate normals. Falls back to an unrotated bracket when there is no corner.
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
      // bracket, i.e. a bracket at an orientation nobody asked for.
      placeBracketAtHint(corner, connectorId);
      return;
    }
    // No connector named: the store falls back to the user's last choice before
    // the factory default, so this is a plain pass-through.
    placeBracket({ connectorId });
  }, [placeBracket, placeBracketAtHint]);

  /**
   * Place an accessory kit at the corner under the pointer.
   *
   * A kit is hardware bound to a joint, so unlike a bracket it has no
   * unoriented fallback: refuse anything that is not a real corner rather than
   * pinning screws to a bracket that was never rotated into place.
   */
  const placeKitAtGhost = useCallback((kitId: string) => {
    const ghost = useDiyStore.getState().ghostBracket;
    const corner = ghost ? findCornerAt(profilesRef.current, ghost.position) : null;
    if (!corner) {
      setKitHint(t('diy.kitOnlyOnCorner'));
      return;
    }
    // A kit hangs off a BRACKET, so on a corner that already carries one the
    // kit binds to that bracket — placing first would be wrong twice over:
    // `placeBracketAtHint` now swaps the occupant's part rather than adding a
    // bracket, and the part it swaps in is the default, i.e. a kit click would
    // silently replace the connector the user chose.
    let target = bracketAtHint(useDiyStore.getState().brackets, corner)?.id;
    if (!target) {
      // Synchronous now that placement resolves its rotation locally — there is
      // nothing left to await. The bracket is in the store by the next line.
      placeBracketAtGhost();
      // Placing sets selectedBracketId to the bracket it just made.
      target = useDiyStore.getState().selectedBracketId ?? undefined;
    }
    if (!target || !bindKit(kitId, target)) {
      setKitHint(t('diy.kitPlaceFailed'));
      return;
    }
    // `bindKit` is a plain binding — it places nothing, so it does not consume
    // what is in hand the way the placement actions do. Do it here: on a corner
    // that already carried a bracket no placement ran, and without this the next
    // click would bind a second kit.
    pickUpHand(null);
    setKitHint(null);
  }, [bindKit, placeBracketAtGhost, pickUpHand, t]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const held = useDiyStore.getState().hand;
    // Nothing in hand: this click belongs to selection / the corner ghosts, and
    // is none of this handler's business.
    if (!held) return;

    const press = pressAt.current;
    pressAt.current = null;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP_PX) return;

    switch (held.kind) {
      case 'profile': {
        // Place what the ghost is showing. It is normally there — the pointer
        // had to move over the scene to get here — but a click straight out of
        // the sidebar never fired a pointermove, so fall back to the click's
        // own ray.
        const ghost = useDiyStore.getState().ghostProfile
          ?? (() => {
            const ray = getMouseRay(e.clientX, e.clientY);
            return ray ? profileGhostAt(ray, held.size) : null;
          })();
        if (!ghost) return;
        // `direction` rides along on the ghost rather than being assumed here,
        // so the post that appears is the one that was drawn.
        addRootProfile(held.size, ghost.position, ghost.direction);
        return;
      }
      case 'connector': {
        // An angle bracket is placed by clicking one of the orange corner
        // ghosts, which are meshes at the joints and own that click — placing it
        // here as well would place two. Nothing more to do for one.
        if (connectorById(held.connectorId).kind !== 'node') return;
        // A 三通件 has no corner to own its click: it goes where the pointer is.
        // The ghost is normally there — the pointer had to move over the scene
        // to get here — but a click straight out of the sidebar never fired a
        // pointermove, so fall back to the click's own ray, exactly as the
        // profile case above does.
        //
        // Deliberately NOT `placeBracketAtGhost`: that path looks for a joint
        // under the ghost and would hand a cube the two-face pose of the nearest
        // corner. A node is placed by the store's unoriented path, which is what
        // leaves `connectedProfiles` empty — see `nodeGhostAt`.
        const ghost = useDiyStore.getState().ghostBracket
          ?? (() => {
            const ray = getMouseRay(e.clientX, e.clientY);
            return ray ? nodeGhostAt(ray, held.connectorId) : null;
          })();
        if (!ghost) return;
        updateGhostBracket(ghost);
        placeBracket({ connectorId: held.connectorId });
        return;
      }
      case 'kit':
        // Only reached when the click missed every corner ghost: a corner click
        // binds the kit and clears the hand, so by the time this handler runs
        // the `!held` guard above has already returned. This is the "nothing
        // there to hang it on" case, and it owes the user a reason.
        placeKitAtGhost(held.kitId);
        return;
      case 'screw':
        // Standard, size and orientation are already resolved into `ghostScrew`
        // by the pointermove that drew it.
        placeScrew();
        return;
    }
  }, [addRootProfile, getMouseRay, profileGhostAt, nodeGhostAt, updateGhostBracket, placeBracket,
      placeBracketAtGhost, placeKitAtGhost, placeScrew]);

  /** What is in hand, in words — the banner names the part the click will place. */
  const handLabel = (h: DiyHand): string => {
    switch (h.kind) {
      case 'profile':
        return t('diy.captionProfile', { size: h.size, dim: PROFILE_DIMS[h.size] });
      case 'connector':
        return connectorLabel(connectorById(h.connectorId));
      case 'screw':
        return t('diy.captionScrew', { std: SCREW_FAMILIES[h.family].std, size: h.size });
      case 'kit': {
        const kit = accessoryKitById(h.kitId);
        return kit ? kitName(kit) : h.kitId;
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950">
      {/* Outside `containerRef` on purpose. That div is where placement clicks
          are caught, so a control sharing its pixels would place a part every
          time it was pressed — and a click on a toolbar button does not bubble
          here, because this is its sibling. */}
      <DiyToolbar />

      <div
        ref={containerRef}
        // The stage. `background` is inline rather than a Tailwind class because
        // it is chosen at runtime, and it is HERE rather than in the scene
        // because the canvas is transparent and this is what shows through it.
        data-diy-stage
        style={{ background: bg.css }}
        // `min-h-0` so the canvas — not the strip — gives up the space when the
        // pane is short; without it a flex child refuses to shrink below its
        // content and the strip is pushed off the bottom.
        className="flex-1 min-h-0 relative"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
      >
        <Canvas
          shadows="soft"
          // `alpha` is what lets the stage above show through, so the backdrop
          // can be a CSS gradient. Without it three clears every frame to an
          // opaque colour of its own and the stage is never seen.
          gl={{
            alpha: true,
            antialias: true,
            toneMapping: 3,
            toneMappingExposure: 1.0,
            outputColorSpace: 'srgb',
          }}
          camera={{ position: [3, 2.5, 5], fov: 50, near: 0.05, far: 100 }}
          style={{ width: '100%', height: '100%' }}
        >
          <DiyScene onCameraReady={(cam) => { cameraRef.current = cam; }} />
        </Canvas>

        {/* Idle hint. Three things it is not always doing. It is gone as soon as
            a part is in hand — the ghost that follows the pointer answers "what
            now" better than a line of text — and gone once the stage has
            anything on it, because a builder with parts on it is not waiting for
            instructions.
            The third is where it sits: centred for a browser that has never
            placed anything, where the first run cannot miss it, and along the
            bottom from then on, where it is still there to be read without
            standing in the middle of the model.
            The ink is one shade for both, chosen against the two ends of the
            background range rather than the dark one it was picked for: it is
            read on the page's navy AND on the studio white. */}
        {!hand && profiles.length === 0 && (
          <div
            data-diy-idle-hint={hintSeen ? 'bottom' : 'centre'}
            className={`absolute pointer-events-none flex justify-center z-10 ${
              hintSeen ? 'inset-x-0 bottom-4' : 'inset-0 items-center'
            }`}
          >
            <div className="text-neutral-500 text-sm">
              {t('diy.dropHint')}
            </div>
          </div>
        )}

        {/* In-hand banner. The ghost shows WHERE the part will land; this says
            WHAT is in hand, so the click target is never a guess. */}
        {hand && (
          <div
            data-diy-hand={hand.kind}
            data-diy-armed={hand.kind === 'connector' ? hand.connectorId : undefined}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded
              bg-wood-700/85 border border-wood-500 text-wood-50 text-xs pointer-events-none"
          >
            {t('diy.handBanner', { name: handLabel(hand) })}
          </div>
        )}

        {/* Kit-placement toast */}
        {kitHint && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded
            bg-amber-900/80 border border-amber-700 text-amber-100 text-xs pointer-events-none">
            {kitHint}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiyViewer;
