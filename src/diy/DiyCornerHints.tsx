import { useMemo, Suspense, useEffect } from 'react';
import * as THREE from 'three';
import { useDiyStore } from '../store/diyStore';
import { CornerBracketStl } from './DiyBracketStl';
import { logDiyBracket } from './diyLog';
import { computeCornerHints, eulerFromNormals } from './diyCornerGeometry';

// Re-export the pure geometry so existing callers (DiyProfileRenderer,
// main-frame auto-placement) keep importing from this same module path.
export { computeCornerHints, findCornerAt, eulerFromNormals } from './diyCornerGeometry';
export type { CornerHint } from './diyCornerGeometry';

const M = 0.001;

const DiyCornerHints: React.FC = () => {
  const showCornerHints = useDiyStore((s) => s.showCornerHints);
  const profiles = useDiyStore((s) => s.profiles);
  // During a two-face comparison the blue auto-reference bracket already shows
  // the auto result — hide the orange previews to avoid overlap.
  const autoRefBracket = useDiyStore((s) => s.autoRefBracket);
  const brackets = useDiyStore((s) => s.brackets);

  const hints = useMemo(() => {
    if (!showCornerHints || autoRefBracket) return [];
    const all = computeCornerHints(profiles);
    // Skip previews where a bracket is already placed at the same spot, so the
    // preview does not draw on top of an existing (orange/placed) bracket.
    const placed = brackets.filter((b) => b.enabled);
    if (placed.length === 0) return all;
    return all.filter((h) =>
      !placed.some((b) =>
        Math.hypot(
          b.position.x - h.position.x,
          b.position.y - h.position.y,
          b.position.z - h.position.z,
        ) <= 2,
      ),
    );
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

  if (hints.length === 0) return null;

  return (
    <group>
      {hints.map((h, i) => {
        const e = eulerFromNormals(h.faceA, h.faceB);
        return (
          <group
            key={i}
            position={[h.position.x * M, h.position.y * M, h.position.z * M]}
            rotation={[e.x, e.y, e.z]}
            renderOrder={5}
          >
            {/* Real corner bracket, flush on the two mounting faces */}
            <Suspense fallback={null}>
              <CornerBracketStl size={h.size} color="#ff8844" opacity={0.55} metalness={0.2} />
            </Suspense>
          </group>
        );
      })}
    </group>
  );
};

export default DiyCornerHints;
