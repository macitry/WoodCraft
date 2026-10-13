import { useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { cornerHintUnderPointer, freeCornerHints } from './diyBracketTarget';
import { connectorById } from './connectors';
import { PROFILE_DIMS } from '../types/furniture';
import type { DiyMovingPart } from '../types/furniture';

const M = 0.001;

/** Position grid a moved profile lands on (mm) — the same one placement uses. */
const GRID_MM = 10;

/** Pointer travel that turns a press into a drag. */
const DRAG_THRESHOLD_PX = 4;

/** How long after a drag the click it produced stays suppressed (ms). */
const DRAG_SUPPRESS_MS = 500;

/**
 * The part the last completed move-drag moved.
 *
 * A release at the end of a drag still fires a `click` on the part, and r3f's
 * `onClick` would read it as "the user clicked the part just dragged" and toggle
 * its selection off. The renderers ask `consumeJustDragged(id)` first and drop
 * that one click.
 *
 * Keyed by part id and time-boxed rather than a plain boolean: a boolean set
 * during a drag would also swallow the next unrelated click if the release
 * landed off the part, and a click on a DIFFERENT part is a new gesture that has
 * every right to be honoured.
 */
let lastDrag = { id: '', at: 0 };

/** True — once — if `id` was just dragged, i.e. the click arriving now is that drag's. */
export function consumeJustDragged(id: string): boolean {
  const isDragClick = lastDrag.id === id && performance.now() - lastDrag.at < DRAG_SUPPRESS_MS;
  if (isDragClick) lastDrag = { id: '', at: 0 };
  return isDragClick;
}

/**
 * Press-and-drag to move a part that is already on the assembly.
 *
 * Only a part that is already SELECTED can be dragged. On a viewport full of
 * profiles, letting any left-press grab whatever is under it would make orbiting
 * a way to pull the assembly apart — the camera and the assembly would both be
 * riding the same button, with nothing to tell them apart. Requiring a click
 * first costs one gesture and makes the two unambiguous.
 *
 * The gesture follows `DiyStretchGizmo`, the one drag in this scene that is
 * known to work against OrbitControls: take the pointer on pointerdown, disable
 * the controls, listen on the canvas, give them back on pointerup.
 *
 * Each kind moves by its own placement rule rather than a second set of rules —
 * see `translateProfile` and `moveBracket`, and the slide rules below, which a
 * screw and a child profile share: one degree of freedom, along the axis of the
 * part they are bolted to.
 */
export function useDiyMoveDrag() {
  const { camera, gl } = useThree();
  const setMovingPart = useDiyStore((s) => s.setMovingPart);
  const translateProfile = useDiyStore((s) => s.translateProfile);
  const moveBracket = useDiyStore((s) => s.moveBracket);
  const updateBracket = useDiyStore((s) => s.updateBracket);
  const updateScrew = useDiyStore((s) => s.updateScrew);
  const setDimension = useDiyStore((s) => s.setDimension);
  const controlsRef = useDiyStore((s) => s.controlsRef);

  return useCallback((e: any, part: DiyMovingPart) => {
    const st = useDiyStore.getState();
    // A press while a part is in hand is the placement click, not a move.
    if (st.hand) return;

    // r3f calls an ancestor's handler once per intersected descendant, so the
    // press that grabbed the FaceBox arrives again as the press that grabbed the
    // STL inside it. Both would attach a move listener and apply every move
    // twice — measured: a 120 px drag moved the post 1530 mm instead of 575 mm,
    // and since each listener snapped its own copy of the delta against the same
    // origin the result also fell off the 10 mm grid. `handleClick` is immune for
    // the same reason this line exists: it stops the event first.
    e.stopPropagation();

    const native = e.nativeEvent as PointerEvent;
    const startX = native.clientX;
    const startY = native.clientY;

    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    /** Ray through a viewport-relative pointer position. */
    const rayAt = (cx: number, cy: number): THREE.Ray => {
      const rect = canvas.getBoundingClientRect();
      const p = new THREE.Vector2(
        ((cx - rect.left) / rect.width) * 2 - 1,
        -((cy - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(p, camera);
      return raycaster.ray;
    };

    // Snapshot what the move is measured against. It has to be read ONCE:
    // `translateProfile` mutates the very position a per-move delta would be
    // recomputed from, and a delta measured against a moving origin drifts.
    const startProfile = part.kind === 'profile'
      ? st.profiles.find((p) => p.id === part.id) ?? null
      : null;
    const startScrew = part.kind === 'screw'
      ? st.screws.find((s) => s.id === part.id) ?? null
      : null;
    const startBracket = part.kind === 'bracket'
      ? st.brackets.find((b) => b.id === part.id) ?? null
      : null;
    if (part.kind === 'profile' && !startProfile) return;
    if (part.kind === 'screw' && !startScrew) return;
    if (part.kind === 'bracket' && !startBracket) return;

    // A CHILD profile is bolted to a face of its parent, so it may travel in one
    // direction only: along the parent's axis. That is the sole direction that
    // keeps it on the face it grew from — `parentOffset` records exactly this
    // coordinate — and every other direction peels it off the joint it belongs
    // to and leaves it floating in space with a face it no longer touches.
    const parentProfile = startProfile?.parentId
      ? st.profiles.find((p) => p.id === startProfile.parentId) ?? null
      : null;
    const parentAxis = parentProfile
      ? (parentProfile.direction.toLowerCase() as 'x' | 'y' | 'z')
      : null;
    // The letter in `parentFace` is the face NORMAL axis. When it is also the
    // parent's own axis the child sits on an END face — stacked on the end, not
    // butted into a side — and there the one direction that would move it along
    // the parent is the one pointing straight off the face. Nothing keeps such a
    // child on its face, so it does not move at all.
    const faceAxis = startProfile?.parentFace
      ? (startProfile.parentFace[1].toLowerCase() as 'x' | 'y' | 'z')
      : null;
    if (parentAxis !== null && faceAxis === parentAxis) return;
    const slideAxis = parentAxis && faceAxis !== null ? parentAxis : null;
    const axisVec = new THREE.Vector3(
      slideAxis === 'x' ? 1 : 0,
      slideAxis === 'y' ? 1 : 0,
      slideAxis === 'z' ? 1 : 0,
    );

    // The plane the pointer is tracked on. A root profile is dragged across the
    // ground: horizontal, through its own centre, so the pointer tracks it 1:1
    // and its height never changes. A sliding child is dragged ALONG its
    // parent's axis, so its plane has to CONTAIN that axis — and, of the planes
    // that do, the one facing the camera most squarely, because a plane seen
    // edge-on is grazed by the ray and a graze sends the hit point kilometres
    // away. The other kinds are not plane-tracked at all: a bracket snaps
    // between real corners and a screw between real faces.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const origin = new THREE.Vector3();
    let haveStart = false;
    if (startProfile) {
      origin.set(startProfile.position.x * M, startProfile.position.y * M, startProfile.position.z * M);
      if (slideAxis) {
        const camDir = camera.getWorldDirection(new THREE.Vector3());
        // Cameras look down the axis from directly above (or along it) in a top
        // view: the component perpendicular to the axis vanishes, there is no
        // plane to track on, and the axis is a single point on screen anyway.
        const n = camDir.addScaledVector(axisVec, -camDir.dot(axisVec));
        if (n.lengthSq() < 1e-6) return;
        plane.setFromNormalAndCoplanarPoint(n.normalize(), origin);
      } else {
        plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
      }
    }
    const startHit = new THREE.Vector3();
    haveStart = startProfile ? rayAt(startX, startY).intersectPlane(plane, startHit) !== null : false;

    // ---- a 三通件 is dragged across the ground, like a root profile --------
    //
    // It is the one bracket with no joint to snap to: `freeCornerHints` offers
    // the free joints and `moveBracket` re-derives a two-face pose from the one
    // under the pointer, neither of which means anything for a cube dropped
    // where the user put it. So it gets the profile's rule instead — track the
    // pointer on a horizontal plane through the part's own centre, snap the
    // centre to the grid, keep the height.
    //
    // `nodeBracket` is non-null exactly when the drag may proceed, the same
    // single-flag shape the screw slide above uses, so `applyBracket` cannot be
    // reached with a half-built setup.
    const nodeBracket = startBracket && connectorById(startBracket.connectorId).kind === 'node'
      ? startBracket
      : null;
    const nodePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const nodeStartHit = new THREE.Vector3();
    if (nodeBracket) {
      nodePlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(
          nodeBracket.position.x * M,
          nodeBracket.position.y * M,
          nodeBracket.position.z * M,
        ),
      );
      if (!rayAt(startX, startY).intersectPlane(nodePlane, nodeStartHit)) return;
    }

    // ---- a screw slides along the axis of the profile it is mounted on ------
    //
    // One degree of freedom, for the same reason a sliding child profile has
    // one: the face a screw sits on is part of what the screw IS. Its
    // `profileId` and its `rotation` both describe that face, and a free
    // raycast drag rewrites both — the nearest-face rule flips the screw onto a
    // neighbouring profile, or onto a different side of the same bar, the
    // moment the pointer crosses an edge. Nothing in the gesture says the user
    // meant that; what they are doing is sliding a screw along its slot.
    const AXES = ['x', 'y', 'z'] as const;
    const screwProfile = startScrew
      ? st.profiles.find((p) => p.id === startScrew.profileId) ?? null
      : null;
    // Non-null exactly when the screw may slide at all — the single "ready"
    // flag, so there is no way to reach `applyScrew` with a half-built setup.
    let screwAxis: 'x' | 'y' | 'z' | null = null;
    const screwAxisVec = new THREE.Vector3();
    const screwPlane = new THREE.Plane();
    const screwStartHit = new THREE.Vector3();
    if (startScrew && screwProfile) {
      // Which way the shaft points. `raycastScrewTarget` builds the pose by
      // rotating local +Z onto the face normal, so the dominant axis of the
      // rotated +Z names the face the screw is seated on. Only the axis is read,
      // never the sign: a screw standing proud of the +Z face and one buried in
      // it are on the same face either way.
      const eul = new THREE.Euler(
        THREE.MathUtils.degToRad(startScrew.rotation.roll),
        THREE.MathUtils.degToRad(startScrew.rotation.pitch),
        THREE.MathUtils.degToRad(startScrew.rotation.yaw),
        'XYZ',
      );
      const shaft = new THREE.Vector3(0, 0, 1).applyEuler(eul);
      const abs = [Math.abs(shaft.x), Math.abs(shaft.y), Math.abs(shaft.z)];
      const faceAxis = AXES[abs.indexOf(Math.max(...abs))];
      const profileAxis = screwProfile.direction.toLowerCase() as 'x' | 'y' | 'z';
      // An END face is the degenerate case: its normal IS the profile's axis, so
      // the face has no extent along that axis and sliding would walk the screw
      // off the end and then into the middle of the bar. It does not move at
      // all — the same call the child-profile slide above makes for a child
      // butted onto an end face, and for the same reason.
      if (faceAxis === profileAxis) return;

      screwAxisVec.set(
        profileAxis === 'x' ? 1 : 0,
        profileAxis === 'y' ? 1 : 0,
        profileAxis === 'z' ? 1 : 0,
      );
      // The same "of the planes that contain the axis, the one facing the camera
      // most squarely" choice the child-profile slide makes above: a plane seen
      // edge-on is grazed by the ray, and a graze sends the hit point away at
      // kilometres per pixel.
      const camDir = camera.getWorldDirection(new THREE.Vector3());
      const n = camDir.addScaledVector(screwAxisVec, -camDir.dot(screwAxisVec));
      if (n.lengthSq() < 1e-6) return;
      screwPlane.setFromNormalAndCoplanarPoint(
        n.normalize(),
        new THREE.Vector3(
          startScrew.position.x * M,
          startScrew.position.y * M,
          startScrew.position.z * M,
        ),
      );
      if (!rayAt(startX, startY).intersectPlane(screwPlane, screwStartHit)) return;
      screwAxis = profileAxis;
    }

    /** What `translateProfile` has been asked for so far, in mm. */
    let applied = { x: 0, y: 0, z: 0 };
    /** Where `updateScrew` last put the screw, along its one axis (mm). */
    let lastScrew = startScrew && screwAxis ? startScrew.position[screwAxis] : 0;
    /** Where `updateBracket` last put a dragged 三通件, on the ground (mm). */
    let lastNode = { x: nodeBracket ? nodeBracket.position.x : 0, z: nodeBracket ? nodeBracket.position.z : 0 };
    let dragging = false;

    const applyProfile = (ev: PointerEvent) => {
      if (!startProfile || !haveStart) return;
      const hit = new THREE.Vector3();
      if (!rayAt(ev.clientX, ev.clientY).intersectPlane(plane, hit)) return;

      // Snap the CENTRE, not the delta: a delta snapped to 10 mm keeps whatever
      // sub-grid offset the profile already had, and a post placed on the grid
      // would drift off it after its first move.
      const total = { x: 0, y: 0, z: 0 };
      if (slideAxis && parentProfile) {
        // One degree of freedom. The pointer's travel is measured ALONG the
        // parent's axis — the other two components of the same hit point are
        // deliberately thrown away, which is what "only along the face" means in
        // practice: moving the pointer sideways does not move the part.
        const along = (hit.x - startHit.x) * axisVec.x
          + (hit.y - startHit.y) * axisVec.y
          + (hit.z - startHit.z) * axisVec.z;
        const start = startProfile.position[slideAxis];
        let v = Math.round((start + along * 1000) / GRID_MM) * GRID_MM;
        // Keep it on the face: the part must stay within the parent's extent.
        // Its extent along THIS axis is its cross-section, not its length — it
        // runs across the parent here, so a 3030 post contributes 30 mm, and the
        // length that matters is the parent's.
        const half = (PROFILE_DIMS[startProfile.profileSize] ?? 30) / 2;
        const lo = parentProfile.position[slideAxis] - parentProfile.length / 2 + half;
        const hi = parentProfile.position[slideAxis] + parentProfile.length / 2 - half;
        // Clamped AFTER the snap, so pushing past an end parks the child FLUSH
        // with it — a real position (a rail level with the top of its post) that
        // the grid cannot express, since half a profile is not a whole grid step.
        // Snapping the limits instead would hold the child 5 mm short of the end
        // forever, which is the one place it most wants to sit.
        v = Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi));
        total[slideAxis] = v - start;
      } else {
        total.x = Math.round((startProfile.position.x + (hit.x - startHit.x) * 1000) / GRID_MM) * GRID_MM
          - startProfile.position.x;
        total.z = Math.round((startProfile.position.z + (hit.z - startHit.z) * 1000) / GRID_MM) * GRID_MM
          - startProfile.position.z;
      }

      const step = {
        x: total.x - applied.x,
        y: total.y - applied.y,
        z: total.z - applied.z,
      };
      if (step.x === 0 && step.y === 0 && step.z === 0) return;
      applied = total;
      translateProfile(part.id, step);
    };

    const applyBracket = (ev: PointerEvent) => {
      if (nodeBracket) {
        const hit = new THREE.Vector3();
        if (!rayAt(ev.clientX, ev.clientY).intersectPlane(nodePlane, hit)) return;
        // Snapped like a placed node, and measured against the SNAPSHOT position
        // rather than the live one — the same reason `applyProfile` keeps a
        // delta: a total measured against a part that has already moved drags
        // further every frame.
        const x = Math.round((nodeBracket.position.x + (hit.x - nodeStartHit.x) * 1000) / GRID_MM) * GRID_MM;
        const z = Math.round((nodeBracket.position.z + (hit.z - nodeStartHit.z) * 1000) / GRID_MM) * GRID_MM;
        if (x === lastNode.x && z === lastNode.z) return;
        lastNode = { x, z };
        // x/z only: the ground plane has no height in it, and a node sits where
        // it was dropped. Height is the property panel's, not this gesture's.
        updateBracket(part.id, {
          position: { x, y: nodeBracket.position.y, z },
        });
        return;
      }
      const st = useDiyStore.getState();
      // The joints the bracket may move to: free ones, plus the one it is
      // sitting on (which is not free — it is the bracket's own).
      const hints = freeCornerHints(
        st.profiles,
        st.brackets.filter((b) => b.id !== part.id),
      );
      const corner = cornerHintUnderPointer(
        hints,
        camera,
        canvas.getBoundingClientRect(),
        ev.clientX,
        ev.clientY,
      );
      // No joint under the pointer: the bracket stays where it is. Re-anchoring
      // it to a bare stretch of profile would leave it floating off the joint it
      // is bolted across, with no second face to orient to.
      if (!corner) return;
      moveBracket(part.id, corner);
    };

    const applyScrew = (ev: PointerEvent) => {
      if (!startScrew || !screwProfile || !screwAxis) return;
      const hit = new THREE.Vector3();
      if (!rayAt(ev.clientX, ev.clientY).intersectPlane(screwPlane, hit)) return;

      // Measured ALONG the profile's axis; the other two components of the same
      // hit point are deliberately thrown away, which is what "only along the
      // axis" means in practice — moving the pointer across the face does not
      // move the part.
      const along = (hit.x - screwStartHit.x) * screwAxisVec.x
        + (hit.y - screwStartHit.y) * screwAxisVec.y
        + (hit.z - screwStartHit.z) * screwAxisVec.z;
      // Clamped to the profile's own extent, so the screw cannot slide off the
      // end of the bar it is mounted on and hang in space on nothing — the same
      // reason the profile case refuses to leave a screw where it could not be
      // picked up again.
      const centre = screwProfile.position[screwAxis];
      const half = screwProfile.length / 2;
      const v = Math.min(
        Math.max(startScrew.position[screwAxis] + Math.round(along * 1000), centre - half),
        centre + half,
      );
      if (v === lastScrew) return;
      lastScrew = v;
      // Position only. `rotation` and `profileId` are what ties the screw to its
      // face and neither of them changes: the screw never leaves the face it
      // started on, so there is nothing to re-orient it to.
      updateScrew(part.id, {
        position: {
          x: screwAxis === 'x' ? v : startScrew.position.x,
          y: screwAxis === 'y' ? v : startScrew.position.y,
          z: screwAxis === 'z' ? v : startScrew.position.z,
        },
      });
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        // Announced in the store so the scene can take the camera away — and so
        // anything that cares that a part is mid-flight can see it.
        setMovingPart(part);
        if (controlsRef?.current) controlsRef.current.enabled = false;
        // Any sliding child is choosing where it SITS ON ITS PARENT, and the two
        // numbers worth showing are its distances to that parent's ends — not a
        // height above the floor. The floor is only the datum for the one case
        // where the parent happens to be vertical, and it is the wrong datum even
        // there: a rail pinned 40 mm from the top of its post reads as "40 from
        // the top", but as a height it reads as 560, which is a number nobody
        // asked for and which changes if the post is later made taller.
        //
        // A root profile dragged across the ground publishes nothing: it has no
        // parent, so it has no second end to be measured against.
        if (part.kind === 'profile' && slideAxis) {
          setDimension({ profileId: part.id, kind: 'anchor' });
        }
      }
      ev.preventDefault();
      ev.stopPropagation();
      if (part.kind === 'profile') applyProfile(ev);
      else if (part.kind === 'bracket') applyBracket(ev);
      else applyScrew(ev);
    };

    const onUp = () => {
      if (dragging) {
        lastDrag = { id: part.id, at: performance.now() };
        setMovingPart(null);
      }
      if (controlsRef?.current) controlsRef.current.enabled = true;
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onUp);
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
  }, [camera, gl, setMovingPart, translateProfile, moveBracket, updateBracket, updateScrew, setDimension, controlsRef]);
}
