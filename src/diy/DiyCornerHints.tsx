import { useMemo, Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useDiyStore, DEFAULT_BRACKET_CONNECTOR_ID } from '../store/diyStore';
import { ConnectorStl } from './DiyBracketStl';
import { connectorById } from './connectors';
import { logDiyBracket } from './diyLog';
import { bracketAtHint, eulerFromNormals } from './diyCornerGeometry';
import { allCornerHints, freeCornerHints } from './diyBracketTarget';
import type { CornerHint } from './diyCornerGeometry';

// Re-export the pure geometry so existing callers (DiyViewer,
// main-frame auto-placement) keep importing from this same module path.
export { computeCornerHints, findCornerAt, eulerFromNormals } from './diyCornerGeometry';
export type { CornerHint } from './diyCornerGeometry';

const M = 0.001;

/** Ghost tint at rest, and under the pointer. */
const REST_COLOR = '#ff8844';
const HOT_COLOR = '#ffb380';

/**
 * One corner ghost — and, since this rewrite, one click target.
 *
 * It owns its own hover state rather than taking it from the parent: the parent
 * holds the hint LIST, so lifting hover up there would re-render every ghost (and
 * re-run each one's `eulerFromNormals`) on every pointer move across a single one.
 */
const CornerHintGhost: React.FC<{
  hint: CornerHint;
  stlUrl: string;
  /** False while a mode owns the click — see the gate in the parent. */
  canPlace: boolean;
  /**
   * Highlighting is gated separately from clicking, and more loosely: a part in
   * hand takes the click (the viewer places at the same corner) but must not
   * take the highlight, because the highlight is the answer to "which corner am
   * I about to fill".
   */
  canHover: boolean;
  onPlace: () => void;
}> = ({ hint, stlUrl, canPlace, canHover, onPlace }) => {
  const [hovered, setHovered] = useState(false);
  const e = eulerFromNormals(hint.faceA, hint.faceB);
  const hot = hovered && canHover;

  return (
    <group
      position={[hint.position.x * M, hint.position.y * M, hint.position.z * M]}
      rotation={[e.x, e.y, e.z]}
      renderOrder={5}
      // A ghost that is not clickable carries NO click handler, so the ray passes
      // straight through it to the profile underneath. Attaching a handler that
      // decides not to act would swallow the click that the two-face pick and
      // the profile selection are waiting for. (`stopPropagation` here stops
      // other r3f handlers only; it does not stop the DOM event that reaches
      // DiyViewer, which is why the click gate has to exist as well.)
      onPointerOver={canHover ? (ev) => { ev.stopPropagation(); setHovered(true); } : undefined}
      onPointerOut={canHover ? () => setHovered(false) : undefined}
      onClick={canPlace ? (ev) => { ev.stopPropagation(); onPlace(); } : undefined}
    >
      {/* The armed connector, not a fixed bracket: a ghost that previewed one
          part and placed another is a lie about the thing it invites you to
          click. `ConnectorStl` normalises ext→size and keeps the mounting spine
          at the origin, so any catalog connector previews where it will land. */}
      <Suspense fallback={null}>
        <ConnectorStl
          url={stlUrl}
          size={hint.size}
          color={hot ? HOT_COLOR : REST_COLOR}
          opacity={hot ? 0.9 : 0.55}
          metalness={0.2}
        />
      </Suspense>
    </group>
  );
};

const DiyCornerHints: React.FC = () => {
  const showCornerHints = useDiyStore((s) => s.showCornerHints);
  const profiles = useDiyStore((s) => s.profiles);
  const brackets = useDiyStore((s) => s.brackets);
  const hand = useDiyStore((s) => s.hand);
  const heldConnectorId = hand?.kind === 'connector' ? hand.connectorId : null;
  // What the next bracket will be built from with an empty hand — the last
  // connector the user chose or placed, not the factory default. Read here so
  // the orange previews show the part a click would actually produce.
  const lastConnectorId = useDiyStore((s) => s.lastConnectorId);
  const placeBracketAtHint = useDiyStore((s) => s.placeBracketAtHint);
  const bindKit = useDiyStore((s) => s.bindKit);
  const pickUpHand = useDiyStore((s) => s.pickUpHand);
  const mode = useDiyStore((s) => s.mode);

  // The part a click would place — the same resolution `placeBracketAtHint` and
  // `placeBracketAtGhost` use, so a preview cannot promise one part while the
  // click produces another.
  const nextConnector = connectorById(
    heldConnectorId ?? lastConnectorId ?? DEFAULT_BRACKET_CONNECTOR_ID,
  );

  const hints = useMemo(() => {
    if (!showCornerHints) return [];
    // A 三通件 is not placed on a joint, so the joints must stand down while one
    // is in play. Two things go wrong if they do not: every corner draws a cube
    // preview that the click would not honour (a node lands where the pointer
    // is, not on a corner), and a click that DID reach them would hand the node
    // a two-face pose it was never solved for — `placeBracketAtHint` builds a
    // joint bracket out of whatever connector is chosen.
    //
    // Keyed on `lastConnectorId` as well as the hand: that is the id an empty
    // hand would place, so a node left behind by the last placement has to close
    // the corners down too. The gate lifts the moment an angle is picked again.
    if (nextConnector.kind === 'node') return [];
    // `freeCornerHints` skips the joints that already carry a bracket, so a
    // preview is not drawn on top of an existing (orange/placed) bracket. That
    // is also what keeps the two click targets disjoint: a spot with a bracket
    // selects that bracket, a spot without one places a new one. Shared with the
    // pointer-follow preview and the move-drag, so all three agree on which
    // joints are on offer.
    //
    // A KIT is the exception, and it is not a small one: a kit BINDS to a
    // bracket instead of replacing one, so the joints it wants are exactly the
    // occupied ones. Filtering those out left the gesture with nothing to click
    // on — a joint has its bracket from the moment it exists, so every kit would
    // have been refused with "only on a corner" while sitting on one.
    if (hand?.kind === 'kit') return allCornerHints(profiles);
    return freeCornerHints(profiles, brackets);
  }, [showCornerHints, profiles, brackets, hand, nextConnector]);

  // Persist every preview-mode hint set (position + pose) when the corner
  // preview turns on, or when the joint configuration changes.
  useEffect(() => {
    if (hints.length === 0) return;
    logDiyBracket('corner_hints', {
      source: 'preview',
      count: hints.length,
      hints: hints.map((h) => {
        const e = eulerFromNormals(h.faceA, h.faceB);
        return {
          position: [h.position.x, h.position.y, h.position.z],
          size: h.size,
          euler_deg: [
            +THREE.MathUtils.radToDeg(e.x).toFixed(2),
            +THREE.MathUtils.radToDeg(e.y).toFixed(2),
            +THREE.MathUtils.radToDeg(e.z).toFixed(2),
          ],
          faceA: [h.faceA.x, h.faceA.y, h.faceA.z],
          faceB: [h.faceB.x, h.faceB.y, h.faceB.z],
          profiles: [h.profileIdA, h.profileIdB],
        };
      }),
    });
  }, [hints]);

  // Dev-only, same convention as `__wcDiyCamera` in DiyScene: the click targets
  // are WebGL meshes with no DOM node, so a headless probe has to project a
  // hint's mm position to screen coordinates and click there. Without this the
  // whole click-to-place path is untestable.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcDiyCornerHints?: unknown };
    w.__wcDiyCornerHints = hints;
    return () => {
      delete w.__wcDiyCornerHints;
    };
  }, [hints]);

  // Placement is only allowed when nothing else owns the click.
  //
  // A part in hand does NOT close these down: with a connector or a kit picked
  // up, these ghosts ARE the click targets (`onPlace` below places what is in
  // hand). The pointer-follow preview is drawn on the same set of joints, so
  // the ghost and the target cannot disagree.
  //
  // The child-profile ghost does not close them down either, and it must not:
  // it is armed by a hover now, and these spheres sit on the corners of the
  // selected bar — the exact spots a hover passes through. They stay live
  // because a click on one of them is the more specific intent, and r3f's
  // `stopPropagation` in `onClick` is what makes the sphere win over the face
  // underneath it.
  const canPlace = mode === 'idle';
  const canHover = mode === 'idle';

  // The part the ghosts preview is `nextConnector`, computed with the hint gate
  // above — one resolution, two readers, so the preview cannot promise one part
  // while the click places another.

  /**
   * A click on a joint places whatever is in hand there.
   *
   * Two cases, and the store's own rules decide both: a kit binds to the bracket
   * on the joint (placing one first if the joint is bare, so the kit is never
   * hung on a bracket that was not rotated into place); anything else — a held
   * connector, or nothing held at all — places/swaps the bracket, and with an
   * empty hand the store reaches for `lastConnectorId` itself.
   */
  const placeOn = (h: CornerHint) => {
    if (hand?.kind === 'kit') {
      // The occupying bracket is reused rather than replaced: `placeBracketAtHint`
      // would swap its connector for the default, i.e. picking up a kit would
      // silently throw away the connector the user chose.
      const target = bracketAtHint(brackets.filter((b) => b.enabled), h)?.id
        ?? placeBracketAtHint(h);
      if (target) bindKit(hand.kitId, target);
      // `bindKit` only binds — it places nothing, so it does not consume what is
      // in hand the way the placement actions do. Without this the next click
      // would bind a second kit.
      pickUpHand(null);
      return;
    }
    placeBracketAtHint(h, heldConnectorId ?? undefined);
  };

  if (hints.length === 0) return null;

  return (
    <group>
      {hints.map((h, i) => (
        <CornerHintGhost
          key={i}
          hint={h}
          stlUrl={nextConnector.stlUrl}
          canPlace={canPlace}
          canHover={canHover}
          onPlace={() => placeOn(h)}
        />
      ))}
    </group>
  );
};

export default DiyCornerHints;
