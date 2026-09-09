// Headless geometry check for holeTemplates.
// Repo source uses extensionless TS imports, so run this through the Vite dev
// server (import '/src/utils/holeTemplates.verify.ts' in a page) rather than
// bare `node`. Deliberately uses only console/throw so it type-checks under
// `tsc -b` without Node globals; on failure it throws and the import rejects.

import { holeWorldBounds } from './holeGeometry';
import {
  HOLE_TEMPLATES,
  templateFitReason,
  holesFitBoard,
  resolveTemplateHoles,
  reflowAnchoredHoles,
  anchorFromCoord,
  reanchorFromCoord,
} from './holeTemplates';
import type { TabletopHole, AxisAnchor } from '../types/furniture';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new RangeError(`holeTemplates.verify: ${msg}`);
}

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;
const bbox = (h: TabletopHole) => holeWorldBounds(h);
const overlaps = (a: TabletopHole, b: TabletopHole): boolean => {
  const A = bbox(a);
  const B = bbox(b);
  return A.minX < B.maxX - 1e-6 && B.minX < A.maxX - 1e-6 && A.minY < B.maxY - 1e-6 && B.minY < A.maxY - 1e-6;
};

const EXPECT_COUNTS: Record<string, number> = { 'rear-cable': 3, 'grommet-desk': 2, 'rear-vents': 6 };

for (const tpl of HOLE_TEMPLATES) {
  // ids: assigned only at resolve time, unique, non-empty.
  const made = resolveTemplateHoles(tpl, 1200, 600);
  assert(made.length === EXPECT_COUNTS[tpl.id], `${tpl.id}: expected ${EXPECT_COUNTS[tpl.id]} holes, got ${made.length}`);
  assert(new Set(made.map((h) => h.id)).size === made.length, `${tpl.id}: ids not unique`);
  assert(made.every((h) => typeof h.id === 'string' && h.id.length > 0), `${tpl.id}: empty id`);
  // Template holes are managed: both axes carry an edge anchor.
  assert(
    made.every((h) => !!h.anchorX && !!h.anchorY),
    `${tpl.id}: every template hole must carry anchorX + anchorY`,
  );

  // Fit gate: allowed at min sizes, refused one step below either dimension.
  assert(templateFitReason(tpl, tpl.minWidth, tpl.minDepth) === null, `${tpl.id}: should fit at min sizes`);
  assert(templateFitReason(tpl, tpl.minWidth - 1, tpl.minDepth) !== null, `${tpl.id}: width just below min must refuse`);
  assert(templateFitReason(tpl, tpl.minWidth, tpl.minDepth - 1) !== null, `${tpl.id}: depth just below min must refuse`);

  // Margin + no-self-overlap across a realistic size sweep (>= 35 mm to each edge).
  for (let w = tpl.minWidth; w <= 2000; w += 100) {
    for (let d = tpl.minDepth; d <= 1200; d += 100) {
      const holes = resolveTemplateHoles(tpl, w, d);
      assert(holesFitBoard(holes, w, d, 35), `${tpl.id} @ ${w}x${d}: a hole pokes within 35 mm of an edge`);
      for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
          assert(!overlaps(holes[i], holes[j]), `${tpl.id} @ ${w}x${d}: hole ${i} overlaps hole ${j}`);
        }
      }
    }
  }
}

// Spot-check the authored anchor maths at the nominal 1200 x 600 board.
{
  const t1 = resolveTemplateHoles(HOLE_TEMPLATES.find((t) => t.id === 'rear-cable')!, 1200, 600);
  assert(t1[0].type === 'slot' && near(t1[0].x, 0) && near(t1[0].y, -300 + 69), 'T1 trough centre must be x=0, y=-d/2+69');
  assert(t1[0].anchorX!.mode === 'abs', 'T1 trough X must be centred (abs)');
  assert(JSON.stringify(t1[0].anchorY) === JSON.stringify({ mode: 'mm', sign: -1, value: 69 }), 'T1 trough Y must be mm rear 69');
  assert(t1[1].type === 'circle' && near(t1[1].x, -515) && near(t1[1].y, -205), 'T1 left grommet must sit at x=-w/2+85, y=-d/2+95');
  assert(t1[2].type === 'circle' && near(t1[2].x, 515) && near(t1[2].y, -205), 'T1 right grommet must sit at x=w/2-85, y=-d/2+95');
  assert(
    JSON.stringify(t1[2].anchorX) === JSON.stringify({ mode: 'mm', sign: 1, value: 85 }),
    'T1 right grommet X must be mm right 85',
  );

  const t2 = resolveTemplateHoles(HOLE_TEMPLATES.find((t) => t.id === 'grommet-desk')!, 1200, 600);
  assert(t2[0].type === 'circle' && near(t2[0].x, 0) && near(t2[0].y, -215), 'T2 Ø85 must be rear-centre (y=-d/2+85)');
  const rectHole = t2[1];
  assert(
    rectHole.type === 'rect' && near(rectHole.y, 190) && rectHole.width === 108 && rectHole.height === 60 && rectHole.cornerRadius === 8,
    'T2 power-box must be 108x60 cr8 at y=d/2-110',
  );

  const t3 = resolveTemplateHoles(HOLE_TEMPLATES.find((t) => t.id === 'rear-vents')!, 1200, 600);
  const ys = t3.map((h) => h.y).sort((a, b) => a - b);
  assert(
    JSON.stringify(ys) === JSON.stringify([-150, -150, -30, -30, 90, 90]),
    'T3 slat rows must sit at -d/2+[150,270,390] (mirrored)',
  );
  assert(t3.every((h) => h.angle === 90), 'T3 slats must be rotated 90°');
  assert(t3.every((h) => Math.abs(Math.abs(h.x) - 440) < 1e-9), 'T3 slats must sit |x|=w/2-160');
}

// Reflow: resizing the board re-resolves anchored holes against the new edges.
{
  const t1 = HOLE_TEMPLATES.find((t) => t.id === 'rear-cable')!;
  const made = resolveTemplateHoles(t1, 1200, 600);

  // Same size → stable reference (nothing moved, so no store write should fire).
  assert(reflowAnchoredHoles(made, 1200, 600) === made, 'reflow at the same size must return the input array');

  const grown = reflowAnchoredHoles(made, 1600, 800);
  assert(grown !== made, 'reflow at a new size must produce a new array');
  const trough = grown.find((h) => h.type === 'slot')!;
  assert(near(trough.x, 0) && near(trough.y, -800 / 2 + 69), 'T1 trough must follow rear edge on resize');
  const grommets = grown.filter((h) => h.type === 'circle');
  assert(grommets.length === 2, 'still two grommets');
  for (const g of grommets) {
    assert(near(Math.abs(g.x), 800 - 85), 'grommet X must keep 85 mm from its side edge');
    assert(near(g.y, -800 / 2 + 95), 'grommet Y must keep 95 mm from the rear edge');
  }
  // Anchors are preserved through reflow (the rule, not just the resolved spot).
  assert(grommets[0].anchorY!.mode === 'mm' && near((grommets[0].anchorY as { value: number }).value, 95), 'anchor kept after reflow');
}

// Anchor-derivation maths.
{
  assert(JSON.stringify(anchorFromCoord(515, 600, 1200, 'mm')) === JSON.stringify({ mode: 'mm', sign: 1, value: 85 }), 'coord → mm nearest-edge anchor');
  assert(JSON.stringify(anchorFromCoord(-415, 600, 1200, 'mm')) === JSON.stringify({ mode: 'mm', sign: -1, value: 185 }), 'moved coord re-anchors to nearest edge');
  assert((anchorFromCoord(0, 600, 1200, 'mm') as AxisAnchor).mode === 'abs', 'centre coord → abs');
  const pct = anchorFromCoord(515, 600, 1200, 'pct') as Extract<AxisAnchor, { mode: 'pct' }>;
  assert(pct.mode === 'pct' && pct.sign === 1 && near(pct.value * 1200, 85, 1e-3), 'coord → pct anchor (value × dimension = 85)');
  const absIn = { mode: 'abs' } as AxisAnchor;
  assert((reanchorFromCoord(absIn, -515, 600, 1200) as AxisAnchor).mode === 'abs', 'moving an abs axis keeps it abs');
}

console.log(`holeTemplates.verify: all assertions passed (${HOLE_TEMPLATES.length} templates)`);
