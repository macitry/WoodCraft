// Headless check for accessoryKits — the counting and seating rules that both
// the 3D renderers and the BOM depend on.
// Repo source uses extensionless TS imports, so run this through the Vite dev
// server (import '/src/utils/accessoryKits.verify.ts' in a page) rather than
// bare `node`. Deliberately uses only console/throw so it type-checks under
// `tsc -b` without Node globals; on failure it throws and the import rejects.

import {
  ACCESSORY_KITS,
  DEFAULT_HOLE_PATTERN,
  EMPTY_LAYOUT,
  HOLE_PATTERNS,
  MATE_DEPTH_MM,
  accessoryKitById,
  holePatternFor,
  holePatternSignature,
  kitLayoutKey,
  layoutFor,
  jointFasteners,
  jointSeats,
  kitFitReason,
  kitParts,
  kitSchedule,
  kitScheduleFor,
  minScrewLength,
  offsetFromAbsolute,
  partKey,
  patternKeyFor,
  perJointCount,
  resizeScrew,
  socketAxis,
  socketScrew,
  socketScrewName,
  specSummary,
  tNut,
  woodScrewName,
} from './accessoryKits';
import type { HardwareSpec, KitLayout, KitLayoutMap, LocalFastener, PartRole } from './accessoryKits';
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

// ---------------------------------------------------------------------------
// Catalog names are DERIVED from the spec, never stored literals
// ---------------------------------------------------------------------------
{
  // The BOM prints `spec.name` verbatim, so a stored literal would go on
  // describing hardware that is no longer there the moment a size override lands.
  const rebuiltName = (s: HardwareSpec) =>
    s.kind === 'socket_screw'
      ? socketScrewName(s.size!, s.length!)
      : s.kind === 'wood_screw'
        ? woodScrewName(s.size!, s.length!)
        : tNut(s.size!).name; // the catalog's series is tNut's own default

  for (const kit of ACCESSORY_KITS) {
    for (const spec of kitParts(kit)) {
      assert(rebuiltName(spec) === spec.name, `${kit.id}: "${spec.name}" is not what its own fields derive`);
      if (spec.kind === 't_nut') {
        assert(spec.length === undefined, `${kit.id}: a T-nut carries no length`);
      } else {
        assert(!!spec.size && typeof spec.length === 'number', `${kit.id}: a screw needs a size and a length`);
      }
    }
  }

  // A shorter screw would lose its shaft entirely — buildScrewGroup clamps
  // shaftLen to 0 and draws a bare head — so the floor belongs here, not in the UI.
  const bolt = accessoryKitById('corner-standard')!.bolt;
  const wood = accessoryKitById('tabletop-fix')!.bolt;
  assert(resizeScrew(bolt, 'M6', 1).length === minScrewLength('M6'), 'a too-short override must clamp to the shortest usable screw');
  assert(resizeScrew(bolt, 'M6', 18.4).length === 18, 'lengths must round to whole mm');
  assert(resizeScrew(bolt, 'M5', 30).name === socketScrewName('M5', 30), 'a re-specced bolt must rename itself');
  assert(resizeScrew(bolt, 'M5', 30).kind === 'socket_screw', 'a re-specced bolt must stay a bolt');
  assert(resizeScrew(wood, 'M5', 20).kind === 'wood_screw', 'a wood screw must stay a wood screw');
  assert(resizeScrew(wood, 'M5', 20).name === woodScrewName('M5', 20), 'and keep its own name prefix');
  // A T-nut's name carries a profile series that `size` does not determine, so
  // rebuilding one from a size would print a lying name — it is passed through.
  const nut = accessoryKitById('corner-standard')!.mate!;
  assert(resizeScrew(nut, 'M5', 30) === nut, 'a T-nut must never be re-specced into a screw');
}

// ---------------------------------------------------------------------------
// Part identity: a seat, not an array index
// ---------------------------------------------------------------------------
{
  const ROLES: PartRole[] = ['bolt', 'mate', 'extra'];

  // Within one pattern every seat must key uniquely — two seats sharing a key
  // would silently share one PartEdit, and an edit to one would move the other.
  for (const [label, pattern] of Object.entries(HOLE_PATTERNS)) {
    for (const role of ROLES) {
      const keys = jointSeats(pattern).map((s) => partKey(role, s));
      assert(new Set(keys).size === keys.length, `${label}/${role}: duplicate seat keys would collide`);
    }
  }
  for (const role of ROLES) {
    const keys = jointSeats(DEFAULT_HOLE_PATTERN).map((s) => partKey(role, s));
    assert(new Set(keys).size === keys.length, `default pattern / ${role}: duplicate seat keys`);
  }

  // The key must survive a scale change, or one edit would need one layout per mode.
  const KIT = accessoryKitById('corner-standard')!;
  const keysAt = (scale: number) => jointFasteners(KIT, STL, scale).map((f) => f.key).join(' ');
  assert(keysAt(1) === keysAt(2), 'partKey must not depend on scale');

  // Keying on the seat (not the index) means an edit follows its seat into a kit
  // that asks for MORE bolts: the 4-bolt kit's leading seats are the same four.
  const EDIT_KEY = 'bolt|x|8|0';
  assert(jointSeats(DEFAULT_HOLE_PATTERN).some((s) => partKey('bolt', s) === EDIT_KEY), 'the probe key must exist');
  const nudge: KitLayout = { parts: { [EDIT_KEY]: { offset: [1, 2, 3] } }, extra: [] };
  assert(
    jointFasteners(KIT, STL, 1, nudge).map((f) => f.key).join(' ') === jointFasteners(KIT, STL, 1).map((f) => f.key).join(' '),
    'an offset must not renumber the parts',
  );

  // Scoping. Layouts are keyed on the PATTERN signature rather than a connector
  // id because the BOM resolves `holePatternFor(undefined)` whenever it has no
  // stlUrl — that lookup has to land on the same pattern the renderer used.
  assert(holePatternSignature(DEFAULT_HOLE_PATTERN) === patternKeyFor(STL), 'the cast bracket must key to the authored pattern');
  assert(patternKeyFor(STL) === patternKeyFor(null) && patternKeyFor(null) === patternKeyFor(undefined), 'the no-stlUrl lookup must reach the cast bracket\'s pattern');
}

// ---------------------------------------------------------------------------
// The no-layout path is byte-for-byte what it always was
// ---------------------------------------------------------------------------
{
  const KIT = accessoryKitById('corner-standard')!;
  const HEAVY = accessoryKitById('corner-heavy')!;
  const FRAME = accessoryKitById('tabletop-fix')!;
  const isNoop = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  for (const kit of [KIT, HEAVY, FRAME]) {
    const bare = jointFasteners(kit, STL);
    assert(isNoop(jointFasteners(kit, STL, 1, null), bare), `${kit.id}: an explicit null layout must match no layout`);
    // The one that actually bites: the store hands an EMPTY layout to every
    // (kit, connector) pair it has never seen edited.
    assert(isNoop(jointFasteners(kit, STL, 1, EMPTY_LAYOUT), bare), `${kit.id}: an empty layout must be a no-op`);
    assert(isNoop(kitSchedule(kit, 5, STL, null), kitSchedule(kit, 5, STL)), `${kit.id}: kitSchedule(kit, n, stl, null)`);
    assert(isNoop(kitSchedule(kit, 5, STL, { [kitLayoutKey(kit.id, STL)]: EMPTY_LAYOUT }), kitSchedule(kit, 5, STL)), `${kit.id}: kitSchedule with an empty layout`);
    assert(isNoop(kitScheduleFor(kit, [STL, STL], { [kitLayoutKey(kit.id, STL)]: EMPTY_LAYOUT }), kitScheduleFor(kit, [STL, STL])), `${kit.id}: kitScheduleFor with an empty layout`);
    assert(isNoop(specSummary(kit, STL, EMPTY_LAYOUT), specSummary(kit, STL)), `${kit.id}: specSummary with an empty layout`);
  }
}

// ---------------------------------------------------------------------------
// Edits layer on top: offset, rotation, spec, delete, add
// ---------------------------------------------------------------------------
{
  const KIT = accessoryKitById('corner-standard')!;
  const HEAVY = accessoryKitById('corner-heavy')!;
  const BIG = '/connectors/1.46.20536.stl'; // Angle Alu 48x48 — a different hole pattern
  const EDIT_KEY = 'bolt|x|8|0';
  const MATE_KEY = 'mate|x|8|0';

  const specKey = (s: HardwareSpec) => `${s.kind}|${s.size ?? ''}|${s.length ?? ''}|${s.name}`;
  const drawnCount = (parts: LocalFastener[], spec: HardwareSpec) =>
    parts.filter((f) => specKey(f.spec) === specKey(spec)).length;
  const find = (parts: LocalFastener[], key: string) => parts.find((f) => f.key === key);
  /** File one layout under this kit's cast-bracket pattern, the way the store does. */
  const mapOf = (layout: KitLayout): KitLayoutMap => ({ [kitLayoutKey(KIT.id, STL)]: layout });

  const base = jointFasteners(KIT, STL);
  const baseBolt = find(base, EDIT_KEY)!;
  const baseMate = find(base, MATE_KEY)!;
  assert(!!baseBolt && !!baseMate, 'precondition: the probe seats must be seated');

  // ---- offset: exact, catalog mm, and it follows the scale ----
  const nudge: KitLayout = { parts: { [EDIT_KEY]: { offset: [1, 2, 3] } }, extra: [] };
  const moved = jointFasteners(KIT, STL, 1, nudge);
  assert(moved.length === base.length, 'an offset must not change the piece count');
  const movedBolt = find(moved, EDIT_KEY)!;
  assert(
    nearVec(movedBolt.position, [baseBolt.position[0] + 1, baseBolt.position[1] + 2, baseBolt.position[2] + 3], 1e-6),
    `offset must land exactly (got ${movedBolt.position})`,
  );
  assert(nearVec(movedBolt.rotation, baseBolt.rotation, 1e-12), 'an offset must not touch orientation');
  // Per-part, meaning per-part: a neighbour stays put.
  assert(nearVec(find(moved, MATE_KEY)!.position, baseMate.position, 1e-12), 'editing one part must not move its neighbour');

  const moved2 = jointFasteners(KIT, STL, 2, { parts: { [EDIT_KEY]: { offset: [1, 2, 3] } }, extra: [] });
  const b2 = find(jointFasteners(KIT, STL, 2), EDIT_KEY)!;
  assert(
    nearVec(find(moved2, EDIT_KEY)!.position, [b2.position[0] + 2, b2.position[1] + 4, b2.position[2] + 6], 1e-6),
    'a catalog-mm offset must scale with the model',
  );

  // The editor shows absolute mm and stores the delta; typing a number in must
  // come back out unchanged or the panel and the model would disagree.
  assert(nearVec(offsetFromAbsolute(baseBolt.position, [baseBolt.position[0] + 1, baseBolt.position[1] + 2, baseBolt.position[2] + 3]), [1, 2, 3]), 'absolute → delta');
  const typed: [number, number, number] = [baseBolt.position[0] + 1.5, baseBolt.position[1] - 2.25, baseBolt.position[2]];
  const roundTrip = find(
    jointFasteners(KIT, STL, 1, { parts: { [EDIT_KEY]: { offset: offsetFromAbsolute(baseBolt.position, typed) } }, extra: [] }),
    EDIT_KEY,
  )!;
  assert(nearVec(roundTrip.position, typed, 1e-6), `an absolute position typed in the editor must come back out unchanged (got ${roundTrip.position})`);

  // ---- rotation: a delta in degrees, wrapped ----
  const turned = (deg: number) => find(jointFasteners(KIT, STL, 1, { parts: { [EDIT_KEY]: { rotOffset: [0, deg, 0] } }, extra: [] }), EDIT_KEY)!;
  assert(nearVec(socketAxis(turned(90).rotation), [1, 0, 0], 1e-12), 'a +90° Y delta must swing the bolt axis from -Y to +X');
  assert(nearVec(turned(90).position, baseBolt.position, 1e-12), 'rotating a bolt in place must not move it');
  assert(nearVec(turned(270).rotation, turned(-90).rotation, 1e-12), 'a rotation delta must wrap, not accumulate');
  // A Z delta spins the part about its own axis, and socketAxis ignores it — the
  // +Z image of an XYZ Euler depends only on x and y. For a round bolt that is a
  // cosmetically inert control, so the panel must not oversell it.
  const spun = find(jointFasteners(KIT, STL, 1, { parts: { [EDIT_KEY]: { rotOffset: [0, 0, 90] } }, extra: [] }), EDIT_KEY)!;
  assert(nearVec(socketAxis(spun.rotation), socketAxis(baseBolt.rotation), 1e-12), 'a Z delta must not change which way a bolt faces');
  assert(spun.rotation[2] !== baseBolt.rotation[2], '...though it is still stored');

  // ---- spec: only the edited screw changes, and it earns its own BOM line ----
  const mixed: KitLayout = { parts: { [EDIT_KEY]: { size: 'M5', length: 30 } }, extra: [] };
  const mixedParts = jointFasteners(KIT, STL, 1, mixed);
  assert(mixedParts.length === base.length, 'a spec swap must not change the piece count');
  assert(find(mixedParts, EDIT_KEY)!.spec.name === socketScrewName('M5', 30), 'the edited bolt takes the new spec');
  assert(find(mixedParts, MATE_KEY)!.spec === baseMate.spec, 'its T-nut keeps the preset spec object');
  const mixedLines = kitSchedule(KIT, 4, STL, mapOf(mixed));
  assert(mixedLines.length === 3, `two specs + one mate must be three lines (got ${mixedLines.length})`);
  assert(mixedLines[0].qty === 4 && mixedLines[1].qty === 4, 'each spec keeps its own quantity');
  assert(mixedLines[2].spec.kind === 't_nut' && mixedLines[2].qty === 8, 'mates follow the bolt count');

  // A T-nut is not re-speccable, so an edit aimed at one is inert.
  const nutEdit = jointFasteners(KIT, STL, 1, { parts: { [MATE_KEY]: { size: 'M5', length: 30 } }, extra: [] });
  assert(find(nutEdit, MATE_KEY)!.spec === baseMate.spec, 'a spec override aimed at a T-nut must be ignored');

  // ---- removed: out of the 3D and out of the BOM, together ----
  const cut: KitLayout = { parts: { [EDIT_KEY]: { removed: true } }, extra: [] };
  const cutParts = jointFasteners(KIT, STL, 1, cut);
  assert(cutParts.length === base.length - 1, 'a removed part must not be drawn');
  assert(!find(cutParts, EDIT_KEY), 'a removed part must not appear at all');
  // Per-part, not per-pair: its T-nut stays until it is removed too.
  assert(!!find(cutParts, MATE_KEY), 'removing a bolt must leave its T-nut alone');
  const cutLines = kitSchedule(KIT, 3, STL, mapOf(cut));
  assert(cutLines[0].qty === 3, `a removed bolt must drop out of the BOM too (got ${cutLines[0].qty})`);
  assert(cutLines[1].qty === 6, 'its mate line is untouched');

  // ---- extra: hand-added hardware joins the drawn AND the counted set ----
  const ADDED_SPEC = socketScrew('M6', 30);
  const extras: KitLayout = {
    parts: {},
    extra: [
      { id: 'v1', spec: ADDED_SPEC, position: [5, 6, 7], rotation: [0, 0, 0], internal: false },
      { id: 'v2', spec: tNut('M6'), position: [-9, -9, 0], rotation: [0, -90, 0], internal: true },
    ],
  };
  const added = jointFasteners(KIT, STL, 1, extras);
  assert(added.length === base.length + 2, 'hand-added parts must join the drawn set');
  const v1 = find(added, 'extra:v1')!;
  assert(!!v1 && v1.added === true && v1.role === 'extra', 'an added part must be tagged and identifiable by role');
  assert(nearVec(v1.position, [5, 6, 7]), 'an added part keeps the absolute catalog position it was given');
  assert(nearVec(v1.rotation, [0, 0, 0], 1e-12), 'added-part degrees must convert to radians');
  const v2 = find(added, 'extra:v2')!;
  assert(v2.internal === true, 'an added T-nut must stay internal (ghosted, x-ray only)');
  assert(nearVec(v2.rotation, [0, -Math.PI / 2, 0], 1e-12), 'added-part degrees must convert to radians');
  assert(nearVec(jointFasteners(KIT, STL, 2, extras).find((f) => f.key === 'extra:v2')!.position, [-18, -18, 0], 1e-12), 'added parts must scale too');
  // An added part is part of the kit's DEFINITION, so it is replicated at every
  // joint; and identical hardware merges into one line rather than two.
  const extraLines = kitSchedule(KIT, 2, STL, mapOf(extras));
  assert(extraLines.length === 3, `added hardware that is already in the kit must merge (got ${extraLines.length})`);
  assert(extraLines[0].qty === 4, 'seated bolts, 2 per joint');
  assert(extraLines[1].qty === 6, `added T-nut must merge with the seated ones: 4 seated + 2 added (got ${extraLines[1].qty})`);
  assert(extraLines[2].qty === 2 && extraLines[2].spec.length === 30, 'the added bolt is its own line, one per joint');

  // ---- the invariant, in its general form ----
  // Listed === drawn, spec for spec and count for count, for every layout. The
  // old check only looked at line [0]; a mixed spec or a delete is exactly where
  // "line order is the contract" stops being enough on its own.
  const CASES: [string, KitLayout | null][] = [
    ['base', null],
    ['offset', nudge],
    ['mixed', mixed],
    ['cut', cut],
    ['added', extras],
  ];
  for (const [label, lay] of CASES) {
    const parts = jointFasteners(KIT, STL, 1, lay);
    const lines = kitSchedule(KIT, 3, STL, lay ? mapOf(lay) : null);
    for (const line of lines) {
      assert(line.qty === drawnCount(parts, line.spec) * 3, `${label}: ${line.spec.name} — BOM ${line.qty} must be drawn × 3 joints (${drawnCount(parts, line.spec)})`);
    }
    assert(lines.length === new Set(parts.map((f) => specKey(f.spec))).size, `${label}: every distinct drawn spec needs exactly one line`);
    assert(lines[0].spec.kind === 'socket_screw' || lines[0].spec.kind === 'wood_screw', `${label}: line [0] must stay the bolt line`);
    // The panels show the one-joint schedule, so it must be exactly that.
    assert(JSON.stringify(specSummary(KIT, STL, lay)) === JSON.stringify(kitSchedule(KIT, 1, STL, lay ? mapOf(lay) : null)), `${label}: specSummary must be the one-joint schedule`);
  }
  assert(specSummary(KIT, STL, mixed).reduce((a, l) => a + l.qty, 0) === mixedParts.length, 'the listed total must equal the drawn total');

  // ---- an edit must not leak to a connector it was not authored against ----
  const bigPattern = holePatternFor(BIG);
  assert(bigPattern !== DEFAULT_HOLE_PATTERN, 'precondition: the 48mm gusset has its own pattern');
  assert(
    JSON.stringify(jointFasteners(KIT, BIG, 1, nudge)) === JSON.stringify(jointFasteners(KIT, BIG, 1)),
    'an edit keyed on the cast bracket must not touch a connector whose seats sit elsewhere',
  );
  assert(
    JSON.stringify(kitScheduleFor(KIT, [BIG, BIG], mapOf(nudge))) === JSON.stringify(kitScheduleFor(KIT, [BIG, BIG])),
    'nor its schedule',
  );
  // A schedule over BOTH connectors: each joint resolved at its own seats, so this
  // is where a single representative stlUrl would have gone wrong.
  const twoPatterns = kitScheduleFor(KIT, [STL, BIG], mapOf(nudge));
  const bothDrawn = [...jointFasteners(KIT, STL, 1, nudge), ...jointFasteners(KIT, BIG, 1, nudge)];
  for (const line of twoPatterns) {
    assert(line.qty === drawnCount(bothDrawn, line.spec), `mixed connectors: ${line.spec.name} must equal the sum drawn at each joint`);
  }
  assert(twoPatterns[0].qty === 4, `2 seats either side of a 48mm gusset is 4 bolts (got ${twoPatterns[0].qty})`);

  // ---- an assembly may carry a DIFFERENT edit on each connector ----
  // Each pattern gets its own edit: remove one bolt on the cast bracket, remove
  // one on the gusset, and add a distinct part only on the gusset. Resolving a
  // single layout for the whole assembly — instead of per joint — would drop one
  // or the other silently, which is the shape of the bug this keying prevents.
  const bigKey = partKey('bolt', jointSeats(bigPattern)[0]);
  const perJoint: KitLayoutMap = {
    [kitLayoutKey(KIT.id, STL)]: { parts: { [EDIT_KEY]: { removed: true } }, extra: [] },
    [kitLayoutKey(KIT.id, BIG)]: {
      parts: { [bigKey]: { removed: true } },
      extra: [{ id: 'g', spec: socketScrew('M6', 30), position: [1, 2, 3], rotation: [0, 0, 0], internal: false }],
    },
  };
  const mixedEdits = kitScheduleFor(KIT, [STL, BIG], perJoint);
  // Each joint drops one of its two bolts; mates are untouched on both.
  assert(mixedEdits[0].qty === 2, `each joint must resolve its OWN edits (got ${mixedEdits[0].qty} bolts)`);
  assert(mixedEdits[1].qty === 4, `neither joint's T-nuts are touched (got ${mixedEdits[1].qty})`);
  assert(mixedEdits[2].spec.length === 30 && mixedEdits[2].qty === 1, 'the 48mm-only added part appears exactly once');
  // With the gusset's entry gone, its own removal must stop applying — the 21mm
  // edit must NOT be reused in its place.
  const onlyCast = kitScheduleFor(KIT, [STL, BIG], { [kitLayoutKey(KIT.id, STL)]: perJoint[kitLayoutKey(KIT.id, STL)] });
  assert(onlyCast[0].qty === 3, `dropping the gusset's entry must restore its bolt (got ${onlyCast[0].qty})`);
  assert(onlyCast.length === 2, `and drop its added part (${JSON.stringify(onlyCast.map((l) => l.qty))})`);
  // `layoutFor` is the only way in, so it must never fall back to another
  // connector's edits — or another kit's.
  assert(layoutFor(perJoint, KIT.id, STL) === perJoint[kitLayoutKey(KIT.id, STL)], 'layoutFor must find the exact pair');
  assert(layoutFor(perJoint, KIT.id, BIG) === perJoint[kitLayoutKey(KIT.id, BIG)], 'layoutFor must resolve the gusset to its own');
  assert(layoutFor(perJoint, KIT.id, BIG) !== layoutFor(perJoint, KIT.id, STL), 'two patterns must not share edits');
  assert(layoutFor(perJoint, 'nope', STL) === null, 'layoutFor must not fall back to a different kit');
  assert(layoutFor(null, KIT.id, STL) === null && layoutFor(undefined, KIT.id, STL) === null, 'no map → no edits');
  // An unknown stlUrl falls back to the default pattern, so it legitimately
  // shares the cast bracket's edits — the fallback must be consistent, not empty.
  assert(layoutFor(perJoint, KIT.id, '/nope.stl') === layoutFor(perJoint, KIT.id, STL), 'an unknown connector falls back to the default pattern, and to its edits');

  // ---- the edit follows its seat into a bigger kit ----
  const heavyBase = jointFasteners(HEAVY, STL);
  const heavyEdit = find(jointFasteners(HEAVY, STL, 1, nudge), EDIT_KEY)!;
  const heavyOrig = find(heavyBase, EDIT_KEY)!;
  assert(heavyBase.length === 8 && !!heavyOrig, 'precondition: the heavy kit seats 4 bolts + 4 nuts');
  assert(
    nearVec(heavyEdit.position, [heavyOrig.position[0] + 1, heavyOrig.position[1] + 2, heavyOrig.position[2] + 3], 1e-6),
    'an edit authored on a 2-bolt kit must land on the same seat in a 4-bolt one',
  );

  // ---- determinism and call-order independence, with a layout ----
  for (const [label, lay] of CASES) {
    const a = JSON.stringify(jointFasteners(KIT, STL, 1, lay));
    kitSchedule(KIT, 3, STL, lay ? mapOf(lay) : null);
    specSummary(KIT, STL, lay);
    assert(a === JSON.stringify(jointFasteners(KIT, STL, 1, lay)), `${label}: jointFasteners must be deterministic`);
    const s = JSON.stringify(kitSchedule(KIT, 5, STL, lay ? mapOf(lay) : null));
    assert(s === JSON.stringify(kitSchedule(KIT, 5, STL, lay ? mapOf(lay) : null)), `${label}: kitSchedule must be deterministic`);
  }
}

console.log(`accessoryKits.verify: all assertions passed (${ACCESSORY_KITS.length} kits)`);
