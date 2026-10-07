import { useMemo, Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useDiyStore, DEFAULT_BRACKET_CONNECTOR_ID } from '../store/diyStore';
import { ConnectorStl } from './DiyBracketStl';
import { connectorById } from './connectors';
import { logDiyBracket } from './diyLog';
import { bracketAtHint, computeCornerHints, eulerFromNormals } from './diyCornerGeometry';
import type { CornerHint } from './diyCornerGeometry';

// Re-export the pure geometry so existing callers (DiyProfileRenderer,
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
  /** False while another mode owns the click — see the gate in the parent. */
  canPlace: boolean;
  onPlace: () => void;
}> = ({ hint, stlUrl, canPlace, onPlace }) => {
  const [hovered, setHovered] = useState(false);
  const e = eulerFromNormals(hint.faceA, hint.faceB);
  const hot = hovered && canPlace;

  return (
    <group
      position={[hint.position.x * M, hint.position.y * M, hint.position.z * M]}
      rotation={[e.x, e.y, e.z]}
      renderOrder={5}
      // A ghost that is not clickable carries NO handlers, so the ray passes
      // straight through it to the profile underneath. Attaching a handler that
      // decides not to act would swallow the click that the two-face pick and
      // the profile selection are waiting for.
      onPointerOver={canPlace ? (ev) => { ev.stopPropagation(); setHovered(true); } : undefined}
      onPointerOut={canPlace ? () => setHovered(false) : undefined}
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
  // During a two-face comparison the blue auto-reference bracket already shows
  // the auto result — hide the orange previews to avoid overlap.
  const autoRefBracket = useDiyStore((s) => s.autoRefBracket);
  const brackets = useDiyStore((s) => s.brackets);
  const armedConnectorId = useDiyStore((s) => s.armedConnectorId);
  const placeBracketAtHint = useDiyStore((s) => s.placeBracketAtHint);
  const mode = useDiyStore((s) => s.mode);
  const placingProfile = useDiyStore((s) => s.placingProfile);

  const hints = useMemo(() => {
    if (!showCornerHints || autoRefBracket) return [];
    const all = computeCornerHints(profiles);
    // Skip previews where a bracket is already placed at the same spot, so the
    // preview does not draw on top of an existing (orange/placed) bracket.
    //
    // This is also what keeps the two click targets disjoint: a spot with a
    // bracket selects that bracket, a spot without one places a new bracket.
    const placed = brackets.filter((b) => b.enabled);
    if (placed.length === 0) return all;
    // `bracketAtHint` is the same "occupied" test the store's placement guard
    // uses, so a corner can never be drawn as free and then refused as taken.
    return all.filter((h) => !bracketAtHint(placed, h));
  }, [showCornerHints, profiles, autoRefBracket, brackets]);

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

  // Placement is only allowed when nothing else owns the click. In particular
  // NOT while the two-face mode is picking: that mode's whole point is that a
  // click lands on a face, and these ghosts sit right on top of the faces it
  // wants.
  const canPlace = mode === 'idle' && !placingProfile;

  // `connectorById` alone is wrong here: given null it falls back to the CAST
  // bracket, not to `DEFAULT_BRACKET_CONNECTOR_ID`. Resolving the default first
  // keeps the preview and the placement the same part.
  const preview = connectorById(armedConnectorId ?? DEFAULT_BRACKET_CONNECTOR_ID);

  if (hints.length === 0) return null;

  return (
    <group>
      {hints.map((h, i) => (
        <CornerHintGhost
          key={i}
          hint={h}
          stlUrl={preview.stlUrl}
          canPlace={canPlace}
          // `?? undefined` not `?? default`: `placeBracketAtHint` applies the
          // same default itself, so the null-ness is decided in one place.
          onPlace={() => placeBracketAtHint(h, armedConnectorId ?? undefined)}
        />
      ))}
    </group>
  );
};

export default DiyCornerHints;
