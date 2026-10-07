// ---------------------------------------------------------------------------
// Accessory kits (配件组合) — preset fastener sets for corner-bracket joints.
//
// A corner bracket never appears alone: every 角码 joint is also 2 socket-head
// bolts + 2 T-nuts (or a tapped end face). This module is the single source of
// truth for that relationship — the 3D renderers and the BOM both derive what
// they need from here, so they can never disagree about how many screws a joint
// carries.
//
// BRACKET-LOCAL FRAME (catalog units, mm) — same convention as src/diy/connectors.ts:
//   origin = the bracket corner, +x and +y are the two legs, z centred, the
//   mating (profile-contact) faces on the x=0 / y=0 planes. So:
//     · a bolt through the +x leg travels along -Y, into the profile at y < 0
//     · a bolt through the +y leg travels along -X, into the profile at x < 0
//   A seat's `position` is the SHOULDER point (the bearing surface on the outer
//   face of the bracket plate); the head extends outward, the shaft inward.
//
// Nothing here recomputes a bracket's world transform. Fasteners are returned in
// LOCAL coordinates and nested under the bracket's own group by the renderers,
// so whatever Euler order the bracket mesh uses, the fasteners match it exactly.
//
// No React / zustand / three dependencies — pure data + geometry helpers.
// The one exception is `t`, and only for the two helpers that RETURN prose
// (`kitFitReason`, and the name builders in names.ts reading SCREW_FAMILIES):
// they are read during render by components that already subscribe, so importing
// the plain translator costs no React and keeps the wording in the dictionary.
// ---------------------------------------------------------------------------

import type { ScrewSize } from '../types/furniture';
import { DEFAULT_BRACKET_STL_URL } from '../types/furniture';
import { CAST_CONNECTOR, CONNECTORS } from '../diy/connectors';
import { snapScrewLength, DEFAULT_SCREW_FAMILY } from '../diy/fastenerDims';
import type { SocketFamily } from '../diy/fastenerDims';
import type { ScrewFamily, TNutFamily } from '../diy/fasteners';
import { findScrew, findTNut } from '../diy/fasteners';
import { coverById } from '../diy/connectors';
import { t } from '../i18n';

// ---------------------------------------------------------------------------
// Hardware
//
// The hardware is now the CATALOG's hardware: a spec names a real MayTec part
// (see src/diy/fasteners.ts for the baked table and the frames it was measured
// in) instead of describing a cylinder to be drawn. Two fields carry that —
// `family` picks which standard, `length` is the catalog's nominal length — and
// both are part of the spec's identity, which is why `specLineKey` includes them.
// ---------------------------------------------------------------------------

/** What a piece of hardware IS. Decides which renderer draws it, whether it
 *  lives inside a profile slot, and the material the BOM prints. */
export type HardwareKind = 'socket_screw' | 'countersunk_screw' | 'flange_screw' | 't_nut' | 'cover';

// `SocketFamily` (the cap-head standards) is declared in fastenerDims, beside the
// default family it constrains, and imported here as a type — one definition, so
// a family cannot be a cap head in one module and not in the other.
export type { SocketFamily };

export interface HardwareSpec {
  kind: HardwareKind;
  /** Display name used verbatim in the BOM and the property panel. */
  name: string;
  /** Screw size — every screw kind has one. */
  size?: ScrewSize;
  /** Which catalog standard the screw is (screws only). Decides both the drawn
   *  part and which nominal lengths are on offer. */
  family?: ScrewFamily;
  /** Catalog NOMINAL length (mm) — the number in the part name: thread length
   *  for a cap screw, overall length for a countersunk one. The head sits BEHIND
   *  the mating plane, so this is also the drawn shaft length. */
  length?: number;
  /** Which T-nut family a `t_nut` is. Not `family`: a T-nut's family is about how
   *  it grips the slot (plain block vs spring plate), which is a different axis
   *  from a screw's thread standard — the catalog holds an M6 in both, for the
   *  same slot, so (size, series) alone does not name the part. */
  tnutFamily?: TNutFamily;
  /** Catalog id of the DRAWN part, for a kind whose shape is neither a
   *  (family, size, length) screw nor a (size, series) T-nut: the angle cover.
   *  Consumers resolve it through the connector catalog, which is where the bake
   *  writes it, so the part drawn is always the part the catalog names. */
  uid?: string;
}

/** How deep past the mating plane the T-nut body sits (mm) — display only. */
export const MATE_DEPTH_MM = 8;

/**
 * Base colour per hardware kind — ONE table for the three scenes that draw
 * hardware (the main viewer, the kit editor, the DIY editor).
 *
 * It lives here, not in each renderer, because the three copies that used to
 * exist had already drifted apart on how much they explained and would have gone
 * on drifting on what they contained: adding a kind is a one-line edit to the
 * union, and nothing makes a second and third map notice. Every screw reads as
 * steel and the T-nut as brass, matching the material the BOM prints for each —
 * a countersunk screw drawn brass would be the same colour as a T-nut, which
 * really is brass. The cover is the one tone chosen to MATCH something rather
 * than stand apart: hiding the joint is the whole job of a cover, so it takes the
 * zinc of the angle it clips to and not a colour of its own.
 *
 * Colours, not materials: this module stays free of three.js.
 */
export const HARDWARE_TONE: Record<HardwareKind, string> = {
  socket_screw: '#c8c8c8',
  countersunk_screw: '#c8c8c8',
  flange_screw: '#c8c8c8',
  t_nut: '#b08d57',
  cover: '#9aa0a6',
};

/**
 * The kind a family belongs to. Derived rather than stored twice so the pair
 * cannot disagree — a spec saying `kind: 'socket_screw'` with
 * `family: 'countersunk'` would draw a flat head under a "圆柱头" name.
 */
export function kindForFamily(family: ScrewFamily): HardwareKind {
  if (family === 'countersunk') return 'countersunk_screw';
  if (family === 'wn7381') return 'flange_screw';
  return 'socket_screw';
}

/**
 * How each standard is named, in the three lengths the UI needs it.
 *
 * Kept here rather than in the generated table because this is copy, not
 * geometry, and the table is regenerated wholesale: a label that lived there
 * would be overwritten by the next bake. `std` is the DIN number, for a tooltip —
 * a workshop buys by that number, not by our label for it.
 */
export const SCREW_FAMILIES: Record<ScrewFamily, { label: string; short: string; std: string }> = {
  din912: { label: '内六角圆柱头螺栓', short: '圆柱头', std: 'DIN 912' },
  din7984: { label: '内六角薄头螺栓', short: '薄头', std: 'DIN 7984' },
  countersunk: { label: '内六角沉头螺栓', short: '沉头', std: 'DIN 7991' },
  // Not 内六角: no key fits this one. The flange is part of the head, so the name
  // says so — a 圆头 that a workshop would reach for a screwdriver for.
  wn7381: { label: '圆头法兰螺钉', short: '圆头法兰', std: 'WN 7381' },
};

// Display names are BUILT from the spec's own fields, never stored as literals:
// a user can change a bolt's family/size/length, and a stored literal would then
// be left behind describing hardware that is no longer there. Consumers only ever
// read `spec.name` (the BOM text, the property panels), so building it here is
// the one place the name can be wrong-or-right.
export function screwName(family: ScrewFamily, size: ScrewSize, length: number): string {
  return `${SCREW_FAMILIES[family].label} ${size}×${length}`;
}
/**
 * How each T-nut family is named. `short` distinguishes two nuts that can share a
 * size AND a series — the catalog holds an M6 in both — so a BOM that printed only
 * "T 型螺母 M6 · 30 系列" twice would be naming one part for two different pieces of
 * hardware.
 */
export const TNUT_FAMILIES: Record<TNutFamily, { short: string }> = {
  t_slot: { short: '普通' },
  // The catalog's own wording for 1.32.4F ("w/spring, F M6"), and the visible
  // difference: the spring plate is what lets this nut be pushed in afterwards.
  spring: { short: '带弹簧' },
};

/** `series` is the profile series the nut's slot fits (30 series → 30 mm profile).
 *  It is NOT derivable from `size`: the thread size and the slot it wedges into
 *  are independent facts, which is why a nut's spec is not user-overridable. Same
 *  for `family`, one level down again. */
export function tNutName(size: ScrewSize, series: number, family: TNutFamily = 't_slot'): string {
  return `T 型螺母 ${size} · ${series} 系列 · ${TNUT_FAMILIES[family].short}`;
}

/** Profile series the presets' T-nuts fit. Exported because a hand-added nut has
 *  to pick a series from somewhere, and guessing one from its thread size is the
 *  mistake `tNutName` exists to prevent. */
export const SCREW_SERIES = 30;

/**
 * A screw in ANY family, with its kind derived from the family rather than
 * restated — the one place a `family` becomes a `kind`. The per-family
 * constructors below are this with the family already decided, and
 * `resizeScrew` needs this general form because a user can move a spec between
 * families, including across the socket/pan-head divide.
 */
export function screwOf(family: ScrewFamily, size: ScrewSize, length: number): HardwareSpec {
  return { kind: kindForFamily(family), name: screwName(family, size, length), size, family, length };
}
/** A cap-head screw: DIN 912 (圆柱头) or DIN 7984 (薄头). */
export function socketScrew(family: SocketFamily, size: ScrewSize, length: number): HardwareSpec {
  return screwOf(family, size, length);
}
/** A countersunk (沉头) screw — its head sinks below the surface it sits in. */
export function countersunkScrew(size: ScrewSize, length: number): HardwareSpec {
  return screwOf('countersunk', size, length);
}
/** A WN 7381 圆头法兰螺钉 — a pan head with a flange, driven by a screwdriver. */
export function flangeScrew(size: ScrewSize, length: number): HardwareSpec {
  return screwOf('wn7381', size, length);
}
export function tNut(
  size: ScrewSize,
  series = SCREW_SERIES,
  family: TNutFamily = 't_slot',
): HardwareSpec {
  return { kind: 't_nut', name: tNutName(size, series, family), size, tnutFamily: family };
}

/**
 * An angle cover (盖板) — a catalog part that clips over a finished joint.
 *
 * Identified by catalog id rather than by size, because that is all there is: it
 * has no thread, no length and no series. The NAME comes from the same catalog
 * entry the geometry does, so the part the BOM prints and the part the 3D draws
 * cannot be two different covers.
 *
 * A `cover()` callable only from a real id is deliberate — there is no sensible
 * default cover, and `coverById` returns null rather than guessing one.
 */
export function cover(uid: string): HardwareSpec {
  const catalog = coverById(uid);
  // Named the way the DIY BOM names a CONNECTOR — a Chinese noun plus the
  // catalog's own label, `角码 Angle Alu 25x40` (diyBom.ts) — because this name is
  // what the BOM and the property panel print, and both of those are read in
  // Chinese. The catalog's label alone ('Angle Cover 28x28') would leave the one
  // hardware row whose noun is not Chinese. An id the catalog does not hold falls
  // back to the raw uid, not to another cover's name.
  return { kind: 'cover', name: catalog ? `盖板 ${catalog.label}` : uid, uid };
}

/**
 * Re-spec a SCREW at a new family/size/length, keeping its kind (and so its
 * display-name prefix). T-nuts are rejected: their name carries a profile series
 * that `size` does not determine, so rebuilding one from `size` would print a
 * lying name.
 *
 * The length is SNAPPED to a nominal the catalog holds (see snapScrewLength): a
 * spec is what the BOM and the CSV print, and 17 mm is not a part. Changing
 * family without changing length therefore moves to the nearest length that
 * family offers — DIN 912's M6 skips 14, so a 14 mm 薄头 becomes a 12 mm 圆柱头
 * (mid-gap, and a tie goes to the shorter) rather than a nonexistent 14 mm one.
 */
export function resizeScrew(
  spec: HardwareSpec,
  size: ScrewSize,
  length: number,
  family?: ScrewFamily,
): HardwareSpec {
  // Rejected here, where the type says it should be, and not only at the call
  // site: falling through to socketScrew would silently turn a T-nut into a bolt.
  // Rejected for the same reason as a T-nut, and by the same rule: a cover has no
  // size, no length and no family, so every field a resize would write is one the
  // part does not have. `screwOf` below would happily produce one anyway.
  if (spec.kind === 't_nut' || spec.kind === 'cover') return spec;
  const fam = family ?? spec.family ?? DEFAULT_SCREW_FAMILY;
  return screwOf(fam, size, snapScrewLength(fam, size, length));
}

/**
 * The catalog article number (料号) of the part a spec is drawn AS.
 *
 * Resolved through the SAME lookup the renderer uses — `findScrew` / `findTNut`,
 * which snap to the nearest baked part — rather than re-derived from the spec.
 * That is the whole point: the BOM's 料号 and the 3D's mesh are then two reads of
 * one resolution, so they cannot name different parts. (A length the catalog does
 * not hold is exactly where a second implementation would drift.)
 *
 * Undefined when there is no number to give, never a placeholder string: a
 * counter that prints a made-up number is worse than a blank cell.
 */
export function catalogUid(spec: HardwareSpec): string | undefined {
  // The cover carries its id, because its id IS its identity — there is no
  // (family, size, length) to look it up by.
  if (spec.uid) return spec.uid;
  if (spec.kind === 't_nut') {
    return findTNut(spec.size ?? 'M6', SCREW_SERIES, spec.tnutFamily).uid;
  }
  return findScrew(spec.family ?? DEFAULT_SCREW_FAMILY, spec.size ?? 'M6', spec.length ?? 0).uid;
}

// The presets' family is DIN 7984 for a reason that is not cosmetic: the
// 端面攻丝 preset taps its profile end face 15 mm deep, so its bolt has to be a
// 14 — and 7984's M6 stocks one while DIN 912's M6 jumps 12 → 16 and would
// bottom out in the hole it was tapped into.
const M6_THIN_12 = socketScrew('din7984', 'M6', 12);
const M6_THIN_14 = socketScrew('din7984', 'M6', 14);
const M6_TNUT = tNut('M6', SCREW_SERIES, 't_slot');
const M5_CSK_16 = countersunkScrew('M5', 16);

// 角码标准连接 ships the exact hardware of a MayTec 30x30 corner: two WN 7381
// M6×10 flange screws, two spring T-nuts, and the cap that hides the joint. The
// 10 is not a preference — it is the length the catalog pairs with this gusset,
// and it is SHORTER than the 12 the other kits use for the same M6 thread, so
// swapping the fastener and swapping the length are the same edit.
const M6_FLANGE_10 = flangeScrew('M6', 10);
const M6_TNUT_SPRING = tNut('M6', SCREW_SERIES, 'spring');
const ANGLE_COVER_28 = cover('1.46.204.2828A');

// ---------------------------------------------------------------------------
// Hole patterns — where a given connector can take a fastener
//
// The pattern belongs to the CONNECTOR, not to the kit: a kit says "how many
// bolts per joint", the connector says "how many seats exist and where". A
// 4-bolt kit on a 2-seat bracket must cap at 2, never hang a screw head off the
// edge of the plate. That cap is applied inside `jointFasteners`, which the
// renderers, the panels and the BOM all read — one code path, so they cannot
// disagree about how many pieces exist. (`perJointCount` exposes the cap alone,
// for callers that want the geometric limit rather than the current set.)
// ---------------------------------------------------------------------------

/** One fastener site on one leg: `along` = distance out from the corner along
 *  that leg, `across` = offset along z (the profile-slot direction). */
export interface HoleSpec {
  along: number;
  across: number;
}

export interface ConnectorHolePattern {
  /** Plate thickness per leg (mm). `y` = thickness of the +x leg (a -Y bolt
   *  passes through it), `x` = thickness of the +y leg (a -X bolt). */
  plateT: { x: number; y: number };
  /** Seats through the +x leg, `along` measured on x (bolt axis -Y). */
  xRun: HoleSpec[];
  /** Seats through the +y leg, `along` measured on y (bolt axis -X). */
  yRun: HoleSpec[];
  /** Baked axis extent (mm) the pattern was authored against. */
  extMm: number;
}

/**
 * The cast L-bracket (box x/y 0..20, plate ≈3 thick, 17 wide in z). Its single
 * slot per leg is modelled as two discrete seats so a 2-bolt kit takes the inner
 * pair and a 4-bolt kit can use all four.
 */
export const DEFAULT_HOLE_PATTERN: ConnectorHolePattern = {
  plateT: { x: 3, y: 3 },
  xRun: [{ along: 8, across: 0 }, { along: 15, across: 0 }],
  yRun: [{ along: 8, across: 0 }, { along: 15, across: 0 }],
  extMm: 21,
};

/**
 * The GD-Zn 28x28 angle (1.46.204.2828.2) — the part the 角码标准连接 kit is built
 * around.
 *
 * Authored rather than derived from the default's ratio, which would put the
 * seats at 8 × 28/21 ≈ 10.7 and 15 × 28/21 ≈ 20. Two reasons that is wrong here:
 * this part has ONE mount per leg and not two, and its usable leg is the 4 mm
 * die-cast wall it shares with the other leg — a seat at 20 would already be past
 * the point where the two walls meet.
 *
 * `along: 15` is measured off the mesh (the leg's mount feature centres at
 * 15.3 mm), and `plateT: 4` likewise: a bolt crosses a 4 mm wall, not the 3 mm
 * plate the cast bracket has. plateT is not cosmetic — it decides where the T-nut
 * is placed (seat + plateT + MATE_DEPTH_MM) — and it also goes into the pattern
 * signature that scopes a kit's per-part edits, so this part cannot inherit edits
 * authored against a different pattern.
 */
/** Same string as `DEFAULT_BRACKET_STL_URL`: this part IS the default bracket.
 *  Two names because the two roles are different — this one says which PART a
 *  pattern or box belongs to, the other says where a bracket with no `stlUrl`
 *  lands — and defining one as the other is what keeps them from drifting. */
export const GUSSET_STL_URL = DEFAULT_BRACKET_STL_URL;

export const GUSSET_HOLE_PATTERN: ConnectorHolePattern = {
  plateT: { x: 4, y: 4 },
  xRun: [{ along: 15, across: 0 }],
  yRun: [{ along: 15, across: 0 }],
  extMm: 28,
};

export const HOLE_PATTERNS: Record<string, ConnectorHolePattern> = {
  // Keyed by the CAST bracket's own url — deliberately not by
  // `DEFAULT_BRACKET_STL_URL`, which is now the same string as GUSSET_STL_URL
  // below: keying this row by "the default" would have collapsed the two rows
  // into one and handed the cast pattern to whichever came last.
  [CAST_CONNECTOR.stlUrl]: DEFAULT_HOLE_PATTERN,
  [GUSSET_STL_URL]: GUSSET_HOLE_PATTERN,
};

/**
 * The pattern for a connector's STL. Authored patterns win; any other catalog
 * connector gets the default pattern scaled by its size ratio (a 48 mm gusset's
 * seats sit proportionally further out than a 21 mm cast bracket's). Unknown
 * URLs fall back to the default pattern unscaled.
 *
 * An ABSENT url is not an unknown one, and this function does not resolve it: a
 * bracket with no `stlUrl` is the DEFAULT bracket, which is a fact about the
 * bracket, not about this lookup — `bracketStlUrl` owns it, and every caller that
 * has a bracket resolves through that before asking here. Folding the default in
 * at this level would make the two lookups that have to agree (this one and
 * ModelLoader's mesh) agree only by this function's say-so, while the 料号 lookup
 * in `connectorByStlUrl` could still resolve an absent url to the cast bracket.
 */
export function holePatternFor(stlUrl?: string | null): ConnectorHolePattern {
  if (!stlUrl) return DEFAULT_HOLE_PATTERN;
  const authored = HOLE_PATTERNS[stlUrl];
  if (authored) return authored;
  const conn = CONNECTORS.find((c) => c.stlUrl === stlUrl);
  if (!conn) return DEFAULT_HOLE_PATTERN;
  const k = conn.extMm / DEFAULT_HOLE_PATTERN.extMm;
  const scaleRun = (run: HoleSpec[]): HoleSpec[] => run.map((s) => ({ along: s.along * k, across: s.across * k }));
  return {
    plateT: { x: DEFAULT_HOLE_PATTERN.plateT.x * k, y: DEFAULT_HOLE_PATTERN.plateT.y * k },
    xRun: scaleRun(DEFAULT_HOLE_PATTERN.xRun),
    yRun: scaleRun(DEFAULT_HOLE_PATTERN.yRun),
    extMm: conn.extMm,
  };
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

export interface JointSeat {
  leg: 'x' | 'y';
  /** Distance out from the corner along this leg (catalog mm, unscaled). This is
   *  the seat's identity, not its `position` — see partKey. */
  along: number;
  /** Offset along z — ACROSS the slot, its width direction, not its length
   *  (catalog mm, unscaled). Both legs' slots run along their own leg, so both
   *  measure their width on z; `along` is what spreads a run down the slot. */
  across: number;
  /** Shoulder (bearing surface) position, bracket-local mm. */
  position: readonly [number, number, number];
  /** Which way the hardware faces AND which way it is turned while facing that
   *  way. The +Z column of this Euler maps onto the inward normal (see
   *  `socketAxis`, which reads exactly that column); the remaining roll about it
   *  puts the part's own +Y along this leg.
   *
   *  The roll is not decoration. A T-nut is a BLOCK — 20mm along its own Y and
   *  11mm across — that lives inside the profile's slot, so its long axis has to
   *  run ALONG the profile: on this leg, along +x or +y. Leaving the roll to
   *  whatever the Euler happens to produce is how the +x leg came to seat its nut
   *  across the slot (long axis on z, perpendicular to both profiles) while the
   *  +y leg seated it along — the same joint, two answers. Screws are turned
   *  about their own axis and show nothing, which is why only the nuts made it
   *  visible. */
  rotation: readonly [number, number, number];
  /** Plate thickness the shaft crosses before reaching the mating plane (mm). */
  plateT: number;
}

/**
 * Flatten a pattern into seats, INTERLEAVED leg-by-leg so that a kit asking for
 * n bolts spreads them across both legs (n=2 → one per leg), which is how a
 * corner joint is actually bolted.
 */
export function jointSeats(pattern: ConnectorHolePattern): JointSeat[] {
  const out: JointSeat[] = [];
  const rows = Math.max(pattern.xRun.length, pattern.yRun.length);
  for (let i = 0; i < rows; i++) {
    const x = pattern.xRun[i];
    if (x) {
      out.push({
        leg: 'x',
        along: x.along,
        across: x.across,
        position: [x.along, pattern.plateT.y, x.across],
        // The -90° roll is the whole point of the `rotation` doc above: +90°
        // about X alone faces the hardware -Y but lays its own +Y on +z, i.e.
        // across the slot. Rolling it back turns the nut along the leg, which is
        // the same thing the y-run leg already gets from its single -90° about Y
        // (that one leaves +Y on +y, its own leg — do not "symmetrise" the two).
        rotation: [Math.PI / 2, 0, -Math.PI / 2],
        plateT: pattern.plateT.y,
      });
    }
    const y = pattern.yRun[i];
    if (y) {
      out.push({
        leg: 'y',
        along: y.along,
        across: y.across,
        position: [pattern.plateT.x, y.along, y.across],
        rotation: [0, -Math.PI / 2, 0],
        plateT: pattern.plateT.x,
      });
    }
  }
  return out;
}

/**
 * The three.js `Euler` order 'XYZ' applied to (0, 0, 1) — the third column of
 * the rotation matrix. This is the same order R3F's <mesh rotation={...}> uses,
 * so a fastener's facing direction is whatever the mesh will actually get.
 */
export function socketAxis(rotation: readonly [number, number, number]): [number, number, number] {
  const [rx, ry] = rotation;
  return [Math.sin(ry), -Math.sin(rx) * Math.cos(ry), Math.cos(rx) * Math.cos(ry)];
}

// ---------------------------------------------------------------------------
// Part identity
// ---------------------------------------------------------------------------

export type PartRole = 'bolt' | 'mate' | 'cover' | 'extra';

/** Trim float noise without losing meaning: derived hole patterns multiply the
 *  authored seat out by an `extMm` ratio (8 × 48/21 = 18.285714285714285), and
 *  using that raw value in an identity makes the key unreadable and brittle
 *  against any rounding later added to holePatternFor. */
const q3 = (v: number) => Math.round(v * 1000) / 1000;
const q6 = (v: number) => Math.round(v * 1e6) / 1e6;
const DEG = Math.PI / 180;

/**
 * Stable identity for a derived part, keyed on the SEAT rather than its index in
 * `jointFasteners`' output. That buys three things an index cannot:
 *   · independent of `scale`, so one layout serves the main configurator
 *     (scale 1) and DIY (scale = size/extMm) alike;
 *   · independent of the kit, so swapping a 2-bolt kit for a 4-bolt one keeps
 *     the edits on the seats they were made on (the leading seats are the same);
 *   · scoped to the hole pattern, so a nudge authored against one connector does
 *     not silently re-apply to a connector whose seats sit somewhere else.
 */
export function partKey(role: PartRole, seat: JointSeat): string {
  return `${role}|${seat.leg}|${q3(seat.along)}|${q3(seat.across)}`;
}

/**
 * The key for a joint's cover. A cover has no seat — it is one per joint, at the
 * bracket's own origin — so `partKey` has nothing to build from and the key is a
 * constant. It still goes through `partKey`-shaped plumbing so a cover edit is
 * found by the same lookup as any other part (see `jointFasteners`).
 */
export const COVER_KEY = 'cover|joint|0|0';

/**
 * Identifies a hole pattern, for scoping edits.
 *
 * Deliberately a PATTERN signature and not a connector id: `holePatternFor`
 * derives patterns purely from a connector's `extMm`, and the catalog has four
 * connectors sharing `extMm: 40` (plus two sharing 48 and two sharing 30.12)
 * which therefore produce byte-identical patterns. Scoping by connector would
 * let two names for one pattern disagree — and since the BOM side resolves
 * through `holePatternFor(undefined)` whenever it has no stlUrl, it could look
 * up a different pattern than the renderer did and quietly export other hardware.
 */
export function holePatternSignature(pattern: ConnectorHolePattern): string {
  const run = (r: HoleSpec[]) => r.map((s) => `${q3(s.along)}:${q3(s.across)}`).join(',');
  return `${q3(pattern.extMm)}|${q3(pattern.plateT.x)}:${q3(pattern.plateT.y)}|${run(pattern.xRun)}|${run(pattern.yRun)}`;
}

/** The pattern signature a connector's STL resolves to. */
export function patternKeyFor(stlUrl?: string | null): string {
  return holePatternSignature(holePatternFor(stlUrl));
}

/** Edits for many (kit, connector) pairs, as the store holds them. */
export type KitLayoutMap = Record<string, KitLayout>;

/**
 * The key a (kit, connector) pair's edits are filed under. It lives here beside
 * `patternKeyFor` rather than in the store because the pure BOM path and the
 * store must agree on it exactly — a mismatch would look up a different pattern
 * and quietly export hardware the 3D never drew.
 */
export function kitLayoutKey(kitId: string, stlUrl?: string | null): string {
  return `${kitId}@${patternKeyFor(stlUrl)}`;
}

/** The edits for one joint, resolved through its own connector. */
export function layoutFor(
  layouts: KitLayoutMap | null | undefined,
  kitId: string,
  stlUrl?: string | null,
): KitLayout | null {
  return layouts?.[kitLayoutKey(kitId, stlUrl)] ?? null;
}

/**
 * A degree delta applied per axis to a seat's XYZ Euler (radians), wrapped into
 * (−180, 180].
 *
 * A DELTA rather than an absolute override: the seat's authored orientation is
 * the connector's business, so pinning it from the outside would fight any future
 * pattern that gives a seat a tilt. Returning `rotation` untouched when there is
 * no delta also preserves the reference identity that accessoryKits.verify.ts
 * asserts between calls.
 */
function applyRotOffset(
  rotation: readonly [number, number, number],
  delta?: readonly [number, number, number],
): readonly [number, number, number] {
  if (!delta) return rotation;
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const deg = (rotation[i] * 180) / Math.PI + delta[i];
    out[i] = (((((deg + 180) % 360) + 360) % 360) - 180) * (Math.PI / 180);
  }
  return out;
}

/** The delta that turns a derived position into `absolute`. The editor shows
 *  absolute millimetres (how a user thinks about where a bolt goes) while storage
 *  keeps the delta, so this is the single conversion between the two. */
export function offsetFromAbsolute(
  base: readonly [number, number, number],
  absolute: readonly [number, number, number],
): [number, number, number] {
  return [q6(absolute[0] - base[0]), q6(absolute[1] - base[1]), q6(absolute[2] - base[2])];
}

// ---------------------------------------------------------------------------
// Layout overrides — per-part edits layered on the derived set
//
// A kit's parts stay DERIVED (see jointFasteners); a KitLayout only adds edits
// on top. With no layout the derived output is byte-for-byte what it always was,
// which is what lets both modes keep rendering unchanged until someone actually
// adjusts something.
// ---------------------------------------------------------------------------

export interface PartEdit {
  /** Delta against the derived seat position, in CATALOG mm (i.e. before the
   *  renderer's scale). A delta rather than an absolute position is what keeps
   *  "0.5mm deeper than the hole" meaning the same thing after a connector swap. */
  offset?: [number, number, number];
  /** Orientation delta, DEGREES, XYZ order — the order the renderers consume.
   *  Note the rest of the app labels ZYX roll/pitch/yaw, so the UI must say XYZ. */
  rotOffset?: [number, number, number];
  /** Screw spec override; ignored for t_nut (see resizeScrew). */
  size?: ScrewSize;
  family?: ScrewFamily;
  length?: number;
  /** Soft delete: out of the 3D AND out of the BOM at once. There is deliberately
   *  no "hidden but still counted" state — that would break the
   *  drawn === listed === exported identity this module exists to hold. */
  removed?: boolean;
}

/** A part the user added by hand. No seat behind it, so its position and
 *  orientation are absolute rather than deltas. */
export interface ExtraPart {
  id: string;
  spec: HardwareSpec;
  /** Absolute, CATALOG mm. */
  position: [number, number, number];
  /** Degrees, XYZ order. */
  rotation: [number, number, number];
  /** Hardware living inside the profile slot (a T-nut). Renders ghosted and only
   *  under the x-ray toggle — drawn with normal depth testing it is buried by the
   *  profile around it, which reads as a bug. */
  internal: boolean;
}

/** Per-part edits for one (kit, hole pattern) pair. */
export interface KitLayout {
  /** Keyed by partKey. */
  parts: Record<string, PartEdit>;
  extra: ExtraPart[];
}

export const EMPTY_LAYOUT: KitLayout = { parts: {}, extra: [] };

// ---------------------------------------------------------------------------
// Kits
// ---------------------------------------------------------------------------

/** 'joint' kits attach to every corner bracket; 'frame' kits are budgeted per
 *  assembly (a tabletop is fixed with a small fixed set of screws regardless of
 *  how many brackets there are). */
export type KitScope = 'joint' | 'frame';

export interface AccessoryKit {
  /** Stable id — persisted on the model / the DIY instance. */
  id: string;
  name: string;
  /** One-line explanation shown on the library card and in the BOM note. */
  desc: string;
  scope: KitScope;
  /** Bolts driven at each corner joint (joint scope only). */
  boltsPerJoint: number;
  /** Bolts budgeted per assembly (frame scope only). */
  perFrame?: number;
  /** The fastener placed at every seat. */
  bolt: HardwareSpec;
  /** Optional mating hardware — one per seated bolt (T-nut). */
  mate?: HardwareSpec;
  /** Optional cosmetic part — ONE per joint, not one per seat: it clips over the
   *  finished corner, so its position is the bracket's own origin rather than a
   *  hole. Joint-scope kits only: a frame-scope kit has no joint to cover, and
   *  listing one would put a part in the BOM that the 3D never draws. */
  cover?: HardwareSpec;
  /** Machining this kit requires, beyond what the brackets themselves need. */
  ops: string[];
  /**
   * The bolt threads into the profile's END FACE rather than into a T-nut in its
   * side slot — the one property that makes a kit incompatible with shipping a
   * `mate`, because there is no nut in that design.
   *
   * A flag and not a substring of `ops`: the ops are prose, they are now
   * translated, and `accessoryKits.verify.ts` used to prove this rule by
   * searching them for 「端面攻丝」. A rule held up by a word inside a sentence
   * that the UI is free to retranslate is not a rule, it is a coincidence — this
   * is the machine-readable half the assertion should have been reading.
   */
  tapsProfile?: boolean;
  /** Smallest profile cross-section the kit is rated for (mm). */
  minProfileSize: number;
}

/** A piece of hardware placed in bracket-local space by a renderer. */
export interface LocalFastener {
  /** Stable identity — `partKey` for derived parts, `extra:<id>` for added ones.
   *  Renderers use it as their React key, so an add/remove does not make React
   *  reuse a node for a different part. */
  key: string;
  spec: HardwareSpec;
  /** Which of the three sources this part came from. Load-bearing for BOM line
   *  order: bolts first, then mates, then added parts. */
  role: PartRole;
  /** Bracket-local mm. */
  position: [number, number, number];
  /** XYZ Euler, radians. */
  rotation: readonly [number, number, number];
  /** True for hardware that lives inside the profile slot (T-nut) — the
   *  renderers draw these ghosted, and only when explicitly asked. */
  internal: boolean;
  /** True for hardware the user added by hand — no seat behind it. */
  added?: boolean;
}

/**
 * The built-in kits. Note the T-nut rule: a kit that ships T-nuts must NOT
 * claim "型材端面攻丝" — the bolt enters the profile's SIDE slot, where there is
 * no material to tap. That is exactly why the T-nut exists. End-face tapping is
 * its own kit, and it drops the T-nut.
 */
export const ACCESSORY_KITS: AccessoryKit[] = [
  {
    // The MayTec 30x30 corner as the catalog actually sells it as one joint: two
    // WN 7381 M6×10 flange screws into two spring T-nuts, hidden by an angle cover.
    // Every part here is a catalog part with a uid, so this kit's BOM can print 料号.
    //
    // Two changes from the old 2 × 薄头 M6×12, and neither is a preference. The
    // SPRING nut is the point of the kit: unlike a plain block, it can be pushed
    // into a slot after the frame is assembled, which is the only way to bolt a
    // joint whose profiles cannot be slid apart. And 10 is the length the catalog
    // pairs with this hardware — shorter than the 12 the other kits use on the same
    // M6 thread, so the fastener and the length change together or not at all.
    id: 'corner-standard',
    name: '角码标准连接',
    desc: '每处角码 2 颗 M6×10 圆头法兰螺钉 + 2 颗带弹簧 T 型螺母（可后装）+ 1 只角件盖板',
    scope: 'joint',
    boltsPerJoint: 2,
    bolt: M6_FLANGE_10,
    mate: M6_TNUT_SPRING,
    cover: ANGLE_COVER_28,
    ops: [],
    minProfileSize: 30,
  },
  {
    id: 'corner-heavy',
    name: '角码加强连接',
    desc: '每处角码 4 颗 M6×12 内六角薄头螺栓 + 4 颗 T 型螺母，用于承重横梁',
    scope: 'joint',
    boltsPerJoint: 4,
    bolt: M6_THIN_12,
    mate: M6_TNUT,
    ops: [],
    minProfileSize: 30,
  },
  {
    id: 'corner-tapped',
    name: '端面攻丝连接',
    desc: '每处角码 2 颗 M6×14 内六角薄头螺栓，不配螺母 —— 型材端面攻丝代替',
    scope: 'joint',
    boltsPerJoint: 2,
    bolt: M6_THIN_14,
    ops: ['型材端面攻丝 M6 · 深 15（代替 T 型螺母）'],
    tapsProfile: true,
    minProfileSize: 30,
  },
  {
    id: 'tabletop-fix',
    // Was a 十字沉头木螺钉, which the catalog has no such thing as. The nearest
    // real part is a countersunk MACHINE screw (0.63.D07991.05016), and the swap
    // is not cosmetic: a machine screw threads into something, so the board needs
    // a nut or an insert — hence the third op line. The alternative (keeping the
    // wood screw) would mean shipping a BOM line for a part nobody stocks.
    name: '桌板固定',
    desc: '每张桌板 4 颗 M5×16 内六角沉头螺栓（配预埋螺母）—— 只进清单与工序，不在 3D 中显示',
    scope: 'frame',
    boltsPerJoint: 0,
    perFrame: 4,
    bolt: M5_CSK_16,
    ops: ['桌板钻孔 Ø5', '孔口沉头 Ø10', '桌板侧预埋 M5 螺母 / 螺纹嵌件'],
    minProfileSize: 30,
  },
];

const byId = new Map(ACCESSORY_KITS.map((k) => [k.id, k]));

/**
 * The kits that attach to a JOINT — everything you can hang on one bracket.
 *
 * Lives here rather than in the library's UI module because two panels now offer
 * the same list: the 元件库 drag source and the bracket's own property panel. A
 * second, drifting copy of this filter is how the two would come to disagree
 * about which kits can be bound where.
 */
export const JOINT_KITS: AccessoryKit[] = ACCESSORY_KITS.filter((k) => k.scope === 'joint');

/** Look up a kit; `null`/unknown → null (null is the "无" state, not a sentinel
 *  kit — there is deliberately no "none" entry in ACCESSORY_KITS). */
export function accessoryKitById(id?: string | null): AccessoryKit | null {
  return (id && byId.get(id)) || null;
}

/**
 * Seats a kit fills at one joint: min(declared, available) — the geometric cap,
 * ignoring any layout. Deliberately stays pure: it describes what the CONNECTOR
 * can take, so it is not the place to learn how many parts are currently drawn.
 * `jointFasteners` applies the cap and the layout both; count its output instead
 * when the number has to match the 3D or the BOM.
 */
export function perJointCount(kit: AccessoryKit | null, stlUrl?: string | null): number {
  if (!kit || kit.scope !== 'joint') return 0;
  return Math.min(kit.boltsPerJoint, jointSeats(holePatternFor(stlUrl)).length);
}

/**
 * Hardware for ONE connection joint, in bracket-local mm. Empty for a null kit,
 * for an unknown one, or for frame-scope kits (which have no per-joint location
 * — they contribute to the BOM only).
 *
 * `layout` layers the user's per-part edits on top of the derived set: an offset
 * (catalog mm, so it is meaningful at any `scale`), an orientation delta, a
 * screw size/length swap, a soft delete, and any hand-added parts. Pass null (or
 * nothing) and the output is byte-for-byte the untouched derivation.
 */
export function jointFasteners(
  kit: AccessoryKit | null,
  stlUrl?: string | null,
  scale = 1,
  layout?: KitLayout | null,
): LocalFastener[] {
  if (!kit || kit.scope !== 'joint') return [];
  const seats = jointSeats(holePatternFor(stlUrl));
  const n = Math.min(kit.boltsPerJoint, seats.length);
  const out: LocalFastener[] = [];

  const put = (role: PartRole, spec: HardwareSpec, seat: JointSeat, extra: number, internal: boolean) => {
    const key = partKey(role, seat);
    const edit = layout?.parts[key];
    if (edit?.removed) return;

    // Clone a spec ONLY when it was actually overridden: accessoryKits.verify.ts
    // asserts `spec` by reference between calls, and KitLine.spec identity with
    // kit.bolt is what the panels' text hangs off.
    const finalSpec =
      edit && (edit.size || edit.length || edit.family) && spec.kind !== 't_nut'
        ? resizeScrew(spec, edit.size ?? spec.size!, edit.length ?? spec.length ?? 0, edit.family)
        : spec;

    const rotation = applyRotOffset(seat.rotation, edit?.rotOffset);
    const axis = socketAxis(rotation);
    const off = edit?.offset;
    const d = extra * scale;
    out.push({
      key,
      spec: finalSpec,
      role,
      position: [
        (seat.position[0] + (off?.[0] ?? 0)) * scale + axis[0] * d,
        (seat.position[1] + (off?.[1] ?? 0)) * scale + axis[1] * d,
        (seat.position[2] + (off?.[2] ?? 0)) * scale + axis[2] * d,
      ],
      rotation,
      internal,
    });
  };

  for (let i = 0; i < n; i++) put('bolt', kit.bolt, seats[i], 0, false);
  if (kit.mate) {
    // The T-nut sits in the slot just past the mating plane — the bolt's shaft
    // crosses the plate, so offset it by the plate thickness plus the nut body.
    for (let i = 0; i < n; i++) put('mate', kit.mate, seats[i], seats[i].plateT + MATE_DEPTH_MM, true);
  }
  if (kit.cover) {
    // Not routed through `put`: a cover has no seat, and `put` would ask for one.
    // Everything else is the same — the same edit lookup, the same soft delete, so
    // a cover is removable on the same terms as any other part.
    const cEdit = layout?.parts[COVER_KEY];
    if (!cEdit?.removed) {
      const cOff = cEdit?.offset;
      out.push({
        key: COVER_KEY,
        spec: kit.cover,
        role: 'cover',
        position: [
          (cOff?.[0] ?? 0) * scale,
          (cOff?.[1] ?? 0) * scale,
          (cOff?.[2] ?? 0) * scale,
        ],
        rotation: applyRotOffset([0, 0, 0], cEdit?.rotOffset),
        internal: false,
      });
    }
  }
  for (const e of layout?.extra ?? []) {
    out.push({
      key: `extra:${e.id}`,
      spec: e.spec,
      role: 'extra',
      position: [e.position[0] * scale, e.position[1] * scale, e.position[2] * scale],
      rotation: [e.rotation[0] * DEG, e.rotation[1] * DEG, e.rotation[2] * DEG],
      internal: e.internal,
      added: true,
    });
  }
  return out;
}

export interface KitLine {
  spec: HardwareSpec;
  qty: number;
}

// A cover is ONE per joint and sits at neither a seat nor a chosen position, so
// it is not part of the seat/z/along identity a `bolt` or `mate` uses — see
// COVER_KEY. Ranked between mates and hand-added parts: a joint's own hardware
// first, then what the user did to it.
const RANK: Record<PartRole, number> = { bolt: 0, mate: 1, cover: 2, extra: 3 };

/**
 * Group key for a BOM line. NOT the display name alone: once a bolt's spec is
 * user-editable two distinct specs can end up sharing a name, and merging them
 * would sum the quantities while taking kind/material from whichever came first
 * — producing a row that corresponds to nothing actually drawn.
 */
function specLineKey(spec: HardwareSpec): string {
  return `${spec.kind}|${spec.family ?? ''}|${spec.size ?? ''}|${spec.length ?? ''}|${spec.name}`;
}

/**
 * Fold fasteners into BOM lines. Line ORDER is part of the contract — bolts, then
 * mates, then the cover, then hand-added parts — because accessoryKits.verify.ts
 * indexes `[0]` as the bolt line to check it against the rendered bolt count.
 * `sort` is stable, so parts within a role keep their seat order.
 */
function linesFrom(parts: LocalFastener[]): KitLine[] {
  const ordered = [...parts].sort((a, b) => RANK[a.role] - RANK[b.role]);
  const order: string[] = [];
  const bag = new Map<string, KitLine>();
  for (const f of ordered) {
    const k = specLineKey(f.spec);
    const line = bag.get(k);
    if (line) line.qty += 1;
    else { order.push(k); bag.set(k, { spec: f.spec, qty: 1 }); }
  }
  return order.map((k) => bag.get(k)!);
}

/** A frame-scope kit has no per-joint location, so its lines come straight from
 *  `perFrame` — never from `jointFasteners`, which returns [] for these. */
function frameLines(kit: AccessoryKit): KitLine[] {
  const qty = Math.max(0, Math.floor(kit.perFrame ?? 0));
  if (qty === 0) return [];
  const lines: KitLine[] = [{ spec: kit.bolt, qty }];
  if (kit.mate) lines.push({ spec: kit.mate, qty });
  // `kit.cover` is deliberately NOT listed here. A cover is drawn only by
  // `jointFasteners`, which returns [] for a frame kit, so listing one would put a
  // part in the BOM and the CSV that the 3D never draws — exactly the
  // drawn === listed === exported identity this module holds. A frame kit that
  // wants a cover has nowhere to put it; `AccessoryKit.cover` says joint-scope only.
  return lines;
}

/**
 * BOM lines for a kit across joints whose hole patterns may DIFFER — one entry
 * per joint. Quantities are counted from `jointFasteners`, the very list the
 * renderers draw, so "listed === drawn" holds by construction rather than by two
 * call sites agreeing about `perJointCount`.
 *
 * Takes one stlUrl per joint rather than a count plus a representative stlUrl:
 * given a bare count the BOM resolved the DEFAULT hole pattern while the renderer
 * used each bracket's own. The counts coincided for the built-in kits so nothing
 * looked wrong — until a per-part edit made against one pattern got looked up
 * against another, and the export silently stopped matching the 3D.
 */
export function kitScheduleFor(
  kit: AccessoryKit | null,
  jointStlUrls: (string | null | undefined)[],
  layouts?: KitLayoutMap | null,
): KitLine[] {
  if (!kit) return [];
  if (kit.scope === 'frame') return frameLines(kit);
  if (jointStlUrls.length === 0) return [];
  const parts: LocalFastener[] = [];
  // Resolved PER JOINT, not once for the assembly: a model may mix connectors,
  // and an edit authored against one pattern must not be applied to — or worse,
  // silently dropped from — the joints using another.
  for (const stlUrl of jointStlUrls) {
    parts.push(...jointFasteners(kit, stlUrl, 1, layoutFor(layouts, kit.id, stlUrl)));
  }
  return linesFrom(parts);
}

/**
 * Convenience for "every joint has the same connector" — forwards to
 * kitScheduleFor. Most callers really do have a uniform count, and this reads
 * the way it always did.
 */
export function kitSchedule(
  kit: AccessoryKit | null,
  jointCount: number,
  stlUrl?: string | null,
  layouts?: KitLayoutMap | null,
): KitLine[] {
  if (!kit) return [];
  const n = Math.max(0, Math.floor(jointCount));
  if (n === 0) return [];
  if (kit.scope === 'frame') return frameLines(kit);
  return kitScheduleFor(kit, new Array<string | null | undefined>(n).fill(stlUrl), layouts);
}

/**
 * The kit's distinct hardware at ONE joint, with counts, after any overrides —
 * this is what the property panels list. Counted from `jointFasteners`, so the
 * listed quantity cannot drift from the drawn one (the panels used to count
 * matches against `kitParts`, which lists PRESET specs: a size override printed
 * ×0 and a soft delete printed the old count).
 */
export function specSummary(
  kit: AccessoryKit | null,
  stlUrl?: string | null,
  layout?: KitLayout | null,
): KitLine[] {
  if (!kit) return [];
  if (kit.scope === 'frame') return frameLines(kit);
  return linesFrom(jointFasteners(kit, stlUrl, 1, layout));
}

/**
 * The kit's hardware as PRESET — one entry per distinct part, ignoring any
 * layout. For a card's "M6×18 + T螺母" one-liner or a catalog description. For
 * anything that must agree with what is drawn or exported use `specSummary`.
 */
export function kitParts(kit: AccessoryKit): HardwareSpec[] {
  // Mirrors `frameLines` on the cover: a frame-scope kit has no joint for one to
  // clip onto, so it names none — listing one there would put a part in the BOM
  // that the 3D never draws.
  const cover = kit.scope === 'joint' && kit.cover ? [kit.cover] : [];
  return [kit.bolt, ...(kit.mate ? [kit.mate] : []), ...cover];
}

/** Why this kit can't be used on a frame of the given profile size, or null. */
export function kitFitReason(kit: AccessoryKit, profileSizeMm: number): string | null {
  if (profileSizeMm >= kit.minProfileSize) return null;
  // Reads the live language, so the panel that prints this must subscribe to it.
  // Every caller is a component that renders the result, and all of them call
  // `useT()` for their own labels.
  return t('fit.tooSmall', { min: kit.minProfileSize, cur: profileSizeMm });
}

/** The cast bracket's own extent — the reference the default pattern is built on. */
export const REFERENCE_EXT_MM = CAST_CONNECTOR.extMm;
