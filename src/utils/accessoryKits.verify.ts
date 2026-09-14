// Headless check for accessoryKits — the counting and seating rules that both
// the 3D renderers and the BOM depend on.
// Repo source uses extensionless TS imports, so run this through the Vite dev
// server (import '/src/utils/accessoryKits.verify.ts' in a page) rather than
// bare `node`. Deliberately uses only console/throw so it type-checks under
// `tsc -b` without Node globals; on failure it throws and the import rejects.

import {
  ACCESSORY_KITS,
  DEFAULT_HOLE_PATTERN,
  MATE_DEPTH_MM,
  accessoryKitById,
  holePatternFor,
  jointFasteners,
  jointSeats,
  kitFitReason,
  kitParts,
  kitSchedule,
  perJointCount,
  socketAxis,
} from './accessoryKits';
import { DEFAULT_BRACKET_STL_URL } from '../types/furniture';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new RangeError(`accessoryKits.verify: ${msg}`);
}

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;
const nearVec = (a: readonly number[], b: readonly number[], tol = 1e-9) =>
  a.length === b.length && a.every((v, i) => near(v, b[i], tol));

const STL = DEFAULT_BRACKET_STL_URL;

// ---------------------------------------------------------------------------
// Catalog integrity
// ---------------------------------------------------------------------------
{
  const ids = ACCESSORY_KITS.map((k) => k.id);
  assert(new Set(ids).size === ids.length, 'kit ids must be unique');
  assert(ids.every((id) => typeof id === 'string' && id.length > 0), 'kit ids must be non-empty');
  assert(ids.every((id) => /^[a-z0-9-]+$/.test(id)), 'kit ids must be stable kebab-case slugs');

  for (const kit of ACCESSORY_KITS) {
    assert(kit.name.length > 0 && kit.desc.length > 0, `${kit.id}: needs a name and a description`);
    assert(kit.minProfileSize > 0, `${kit.id}: minProfileSize must be positive`);
    assert(kit.bolt.length! > 0, `${kit.id}: the bolt needs a length`);
    const parts = kitParts(kit);
    assert(parts.length === (kit.mate ? 2 : 1), `${kit.id}: kitParts must list every distinct part`);
    if (kit.scope === 'joint') {
      assert(kit.boltsPerJoint > 0, `${kit.id}: a joint kit must declare boltsPerJoint`);
      assert(kit.perFrame === undefined, `${kit.id}: a joint kit must not declare perFrame`);
    } else {
      assert(kit.perFrame! > 0, `${kit.id}: a frame kit must declare perFrame`);
      assert(kit.boltsPerJoint === 0, `${kit.id}: a frame kit has no per-joint seating`);
    }
    // The rule that keeps the op notes honest: T-nuts mean side-slot entry,
    // where there is no material to tap. End-face tapping is a different kit.
    const endsTapping = kit.ops.some((o) => o.includes('端面攻丝'));
    assert(!(kit.mate && endsTapping), `${kit.id}: a T-nut kit must not claim end-face tapping`);
    assert(!endsTapping || !kit.mate, `${kit.id}: the tapping kit must not ship T-nuts`);
  }

  // Exactly one tapping kit, and it ships no mate — the two halves of the rule.
  const tappers = ACCESSORY_KITS.filter((k) => k.ops.some((o) => o.includes('端面攻丝')));
  assert(tappers.length === 1 && !tappers[0].mate, 'end-face tapping must be exactly one mate-less kit');
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
{
  assert(accessoryKitById(null) === null, 'null → no kit');
  assert(accessoryKitById(undefined) === null, 'undefined → no kit');
  assert(accessoryKitById('nope') === null, 'unknown id → no kit');
  assert(accessoryKitById('') === null, 'empty id → no kit');
  for (const kit of ACCESSORY_KITS) {
    assert(accessoryKitById(kit.id) === kit, `${kit.id}: must resolve to the same object`);
  }
}

// ---------------------------------------------------------------------------
// Seats: geometry lives in the bracket's own local frame
// ---------------------------------------------------------------------------
{
  const seats = jointSeats(DEFAULT_HOLE_PATTERN);
  // 2 seats per leg, interleaved so a 2-bolt kit takes one from each leg.
  assert(seats.length === 4, `default pattern must expose 4 seats (got ${seats.length})`);
  assert(
    seats.map((s) => s.leg).join('') === 'xyxy',
    `seats must interleave leg-by-leg (got ${seats.map((s) => s.leg).join('')})`,
  );

  const plate = DEFAULT_HOLE_PATTERN.plateT;
  for (const s of seats) {
    const [x, y, z] = s.position;
    if (s.leg === 'x') {
      // A -Y bolt: shoulder sits on the +x leg's OUTER face (y = plate thickness),
      // somewhere along that leg, on its centreline in z.
      assert(near(y, plate.y), `x-run seat must sit at y=plateT.y (got ${y})`);
      assert(x > 0 && x <= DEFAULT_HOLE_PATTERN.extMm, `x-run seat must lie along the +x leg (got x=${x})`);
      assert(nearVec(socketAxis(s.rotation), [0, -1, 0]), 'x-run seat must face -Y');
      assert(near(s.plateT, plate.y), 'x-run seat must cross the +x leg plate');
    } else {
      assert(near(x, plate.x), `y-run seat must sit at x=plateT.x (got ${x})`);
      assert(y > 0 && y <= DEFAULT_HOLE_PATTERN.extMm, `y-run seat must lie along the +y leg (got y=${y})`);
      assert(nearVec(socketAxis(s.rotation), [-1, 0, 0]), 'y-run seat must face -X');
      assert(near(s.plateT, plate.x), 'y-run seat must cross the +y leg plate');
    }
    assert(near(z, 0), 'default seats must sit on the plate centreline');
  }
}

// The socket-axis helper must reproduce three.js' Euler order 'XYZ' third column.
{
  const rt2 = Math.SQRT1_2;
  assert(nearVec(socketAxis([0, 0, 0]), [0, 0, 1]), 'identity rotation keeps +Z');
  assert(nearVec(socketAxis([Math.PI / 2, 0, 0]), [0, -1, 0], 1e-12), '+90° about X must face -Y');
  assert(nearVec(socketAxis([0, -Math.PI / 2, 0]), [-1, 0, 0], 1e-12), '-90° about Y must face -X');
  assert(nearVec(socketAxis([Math.PI, 0, 0]), [0, 0, -1], 1e-12), '180° about X must face -Z');
  // A compound case pins the (sin y, -sin x cos y, cos x cos y) form.
  assert(
    nearVec(socketAxis([Math.PI / 4, Math.PI / 4, 0]), [rt2, -rt2 * rt2, rt2 * rt2], 1e-12),
    'compound rotation must match three.js Euler XYZ',
  );
}

// ---------------------------------------------------------------------------
// holePatternFor: authored patterns win, other connectors scale, junk falls back
// ---------------------------------------------------------------------------
{
  assert(holePatternFor(STL) === DEFAULT_HOLE_PATTERN, 'the cast bracket must use the authored pattern');
  assert(holePatternFor(null) === DEFAULT_HOLE_PATTERN, 'no stlUrl → default pattern');
  assert(holePatternFor('/nope.stl') === DEFAULT_HOLE_PATTERN, 'unknown stlUrl → default pattern');

  const big = holePatternFor('/connectors/1.46.20536.stl'); // Angle Alu 48x48, extMm 48
  assert(big !== DEFAULT_HOLE_PATTERN, 'a catalog connector must get its own derived pattern');
  assert(big.extMm === 48, 'derived pattern must carry the connector extent');
  assert(big.plateT.x > DEFAULT_HOLE_PATTERN.plateT.x, 'a bigger bracket needs a thicker plate');
  assert(
    near(big.xRun[0].along / big.extMm, DEFAULT_HOLE_PATTERN.xRun[0].along / DEFAULT_HOLE_PATTERN.extMm),
    'derived seats must keep their relative position on the leg',
  );
  const derivedSeats = jointSeats(big);
  assert(derivedSeats.length === 4, 'derived pattern must still expose 4 seats');
  assert(
    derivedSeats.every((s) => socketAxis(s.rotation).some((v) => v !== 0)),
    'derived seats must keep a valid facing direction',
  );
}

// ---------------------------------------------------------------------------
// jointFasteners: the "min(declared, available)" cap, and the null cases
// ---------------------------------------------------------------------------
{
  assert(jointFasteners(null, STL).length === 0, 'no kit → no fasteners');
  assert(jointFasteners(accessoryKitById('nope'), STL).length === 0, 'unknown kit → no fasteners');

  const frameKit = accessoryKitById('tabletop-fix')!;
  assert(jointFasteners(frameKit, STL).length === 0, 'a frame-scope kit places nothing at a joint');
  assert(perJointCount(frameKit, STL) === 0, 'a frame-scope kit has no per-joint count');

  const standard = accessoryKitById('corner-standard')!;
  const heavy = accessoryKitById('corner-heavy')!;
  const tapped = accessoryKitById('corner-tapped')!;

  // 2 bolts + 2 T-nuts = 4 pieces, and exactly one bolt per leg.
  const std = jointFasteners(standard, STL);
  assert(std.length === 4, `standard kit must place 2 bolts + 2 nuts (got ${std.length})`);
  const stdBolts = std.filter((f) => !f.internal);
  const stdNuts = std.filter((f) => f.internal);
  assert(stdBolts.length === 2 && stdNuts.length === 2, 'standard kit: 2 bolts, 2 nuts');
  assert(stdBolts[0].spec.kind === 'socket_screw' && stdNuts[0].spec.kind === 't_nut', 'standard kit part kinds');
  const boltLegs = stdBolts.map((f) => (nearVec(socketAxis(f.rotation), [-1, 0, 0]) ? 'y' : 'x'));
  assert(boltLegs.join('') === 'xy', `2 bolts must straddle both legs (got ${boltLegs.join('')})`);
  assert(perJointCount(standard, STL) === 2, 'standard kit is 2 per joint');

  // A T-nut sits deeper than its bolt, along the same axis.
  for (let i = 0; i < 2; i++) {
    const bolt = stdBolts[i];
    const nut = stdNuts[i];
    const axis = socketAxis(bolt.rotation);
    const d = [nut.position[0] - bolt.position[0], nut.position[1] - bolt.position[1], nut.position[2] - bolt.position[2]];
    const dist = Math.hypot(...d);
    assert(dist > 0, 'the T-nut must not sit on the bolt shoulder');
    assert(nearVec(d.map((v) => v / dist), axis, 1e-12), 'the T-nut must sit further along the bolt axis');
    assert(dist <= MATE_DEPTH_MM + 6, 'the T-nut must stay near the mating plane');
    assert(nearVec(nut.rotation, bolt.rotation), 'the T-nut shares the bolt orientation');
  }

  // The cap: 4 declared bolts, only 4 seats → 4; a hypothetical 8 would still be 4.
  const hv = jointFasteners(heavy, STL);
  assert(hv.filter((f) => !f.internal).length === 4, 'the heavy kit must seat all 4 authored seats');
  assert(perJointCount(heavy, STL) === 4, 'heavy kit is 4 per joint');
  const over: typeof heavy = { ...heavy, boltsPerJoint: 8 };
  assert(perJointCount(over, STL) === 4, 'a kit may never exceed the connector seat count');
  assert(jointFasteners(over, STL).filter((f) => !f.internal).length === 4, 'capped bolts must render 4, not 8');

  // The tapping kit ships no mate — the 3D shows bolts only.
  const tap = jointFasteners(tapped, STL);
  assert(tap.length === 2 && tap.every((f) => !f.internal), 'the tapping kit must place 2 bolts and no nut');

  // Every BOLT shoulder must land on the plate footprint (along its leg, inside
  // the leg length, within the plate width) — otherwise the head hangs off the
  // bracket. T-nuts are deliberately off-plate: they live in the mating
  // profile's T-slot, on the far side of the x=0 / y=0 plane.
  const halfWidth = 8.5;
  for (const kit of [standard, heavy, tapped]) {
    for (const f of jointFasteners(kit, STL)) {
      const [x, y, z] = f.position;
      assert(Math.abs(z) <= halfWidth, `${kit.id}: a fastener drifted off the plate centreline (z=${z})`);
      if (f.internal) {
        assert(x < 0 || y < 0, `${kit.id}: a T-nut must sit past the mating plane (${x},${y})`);
      } else {
        const along = nearVec(socketAxis(f.rotation), [-1, 0, 0]) ? y : x;
        assert(
          along > 0 && along <= DEFAULT_HOLE_PATTERN.extMm,
          `${kit.id}: a bolt seat lies off the end of its leg (${x},${y})`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scale: the DIY viewer draws the same STL at size/extMm, so the fasteners
// must scale with it or they drift off the plate.
// ---------------------------------------------------------------------------
{
  const kit = accessoryKitById('corner-standard')!;
  const one = jointFasteners(kit, STL, 1);
  const two = jointFasteners(kit, STL, 2);
  assert(two.length === one.length, 'scaling must not change the piece count');
  for (let i = 0; i < one.length; i++) {
    assert(nearVec(one[i].position.map((v) => v * 2), two[i].position, 1e-9), 'positions must scale linearly');
    assert(nearVec(one[i].rotation, two[i].rotation), 'scaling must not touch orientation');
    assert(one[i].spec === two[i].spec, 'scaling must not swap parts');
  }
}

// ---------------------------------------------------------------------------
// kitSchedule: the BOM must agree with the renderers, joint for joint
// ---------------------------------------------------------------------------
{
  for (const kit of ACCESSORY_KITS) {
    for (const n of [0, 1, 7, 16]) {
      const lines = kitSchedule(kit, n, STL);
      if (n === 0) {
        assert(lines.length === 0, `${kit.id}: an empty assembly needs no hardware`);
        continue;
      }
      assert(lines.length === kitParts(kit).length, `${kit.id}: one line per distinct part`);
      assert(lines.every((l) => l.qty > 0 && Number.isInteger(l.qty)), `${kit.id}: quantities must be positive integers`);
      const expected = kit.scope === 'joint' ? perJointCount(kit, STL) * n : kit.perFrame!;
      assert(lines[0].qty === expected, `${kit.id} @ ${n} joints: expected ${expected} bolts, got ${lines[0].qty}`);
      if (kit.mate) assert(lines[1].qty === expected, `${kit.id} @ ${n}: one nut per bolt`);
    }
  }

  // The identity the whole feature rests on: rendered pieces × joints == BOM qty.
  for (const kit of ACCESSORY_KITS) {
    for (const n of [1, 7, 16]) {
      const rendered = kit.scope === 'joint' ? jointFasteners(kit, STL).filter((f) => !f.internal).length : 0;
      if (kit.scope === 'joint') {
        assert(rendered * n === kitSchedule(kit, n, STL)[0].qty, `${kit.id}: rendered bolts × joints must equal the BOM qty`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Determinism + fit gate
// ---------------------------------------------------------------------------
{
  const kit = accessoryKitById('corner-heavy')!;
  assert(JSON.stringify(jointFasteners(kit, STL)) === JSON.stringify(jointFasteners(kit, STL)), 'jointFasteners must be deterministic');
  assert(JSON.stringify(kitSchedule(kit, 5, STL)) === JSON.stringify(kitSchedule(kit, 5, STL)), 'kitSchedule must be deterministic');
  assert(jointScheduleStable(kit), 'jointFasteners must not depend on call order');
}

function jointScheduleStable(kit: (typeof ACCESSORY_KITS)[number]): boolean {
  const a = JSON.stringify(jointFasteners(kit, STL));
  kitSchedule(kit, 3, STL);
  return a === JSON.stringify(jointFasteners(kit, STL));
}

{
  for (const kit of ACCESSORY_KITS) {
    assert(kitFitReason(kit, kit.minProfileSize) === null, `${kit.id}: must fit at its own minimum`);
    assert(kitFitReason(kit, 40) === null, `${kit.id}: must fit a 40-series profile`);
    assert(kitFitReason(kit, 20) !== null, `${kit.id}: must refuse a 20-series profile`);
    assert(kitFitReason(kit, 20)!.includes('20'), `${kit.id}: the refusal must state the current size`);
  }
}

console.log(`accessoryKits.verify: all assertions passed (${ACCESSORY_KITS.length} kits)`);
