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
// ---------------------------------------------------------------------------

import type { ScrewSize } from '../types/furniture';
import { DEFAULT_BRACKET_STL_URL, SCREW_HEAD_DIMS } from '../types/furniture';
import { CAST_CONNECTOR, CONNECTORS } from '../diy/connectors';

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------

export type HardwareKind = 'socket_screw' | 't_nut' | 'wood_screw';

export interface HardwareSpec {
  kind: HardwareKind;
  /** Display name used verbatim in the BOM and the property panel. */
  name: string;
  /** Screw size — drives the procedural head geometry (screws only). */
  size?: ScrewSize;
  /** Total length, head + shaft (screws only). */
  length?: number;
}

/** How deep past the mating plane the T-nut body sits (mm) — display only. */
export const MATE_DEPTH_MM = 8;

// Display names are BUILT from the spec's own fields, never stored as literals:
// a user can change a bolt's size/length, and a stored literal would then be
// left behind describing hardware that is no longer there. Consumers only ever
// read `spec.name` (the BOM text, the property panels), so building it here is
// the one place the name can be wrong-or-right.
export function socketScrewName(size: ScrewSize, length: number): string {
  return `内六角圆柱头螺栓 ${size}×${length}`;
}
export function woodScrewName(size: ScrewSize, length: number): string {
  return `十字沉头木螺钉 ${size}×${length}`;
}
/** `series` is the profile series the nut's slot fits (30 series → 30 mm profile).
 *  It is NOT derivable from `size`: the thread size and the slot it wedges into
 *  are independent facts, which is why a nut's spec is not user-overridable. */
export function tNutName(size: ScrewSize, series: number): string {
  return `T 型螺母 ${size} · ${series} 系列`;
}

/** Profile series the presets' T-nuts fit. Exported because a hand-added nut has
 *  to pick a series from somewhere, and guessing one from its thread size is the
 *  mistake `tNutName` exists to prevent. */
export const SCREW_SERIES = 30;

export function socketScrew(size: ScrewSize, length: number): HardwareSpec {
  return { kind: 'socket_screw', name: socketScrewName(size, length), size, length };
}
export function woodScrew(size: ScrewSize, length: number): HardwareSpec {
  return { kind: 'wood_screw', name: woodScrewName(size, length), size, length };
}
export function tNut(size: ScrewSize, series = SCREW_SERIES): HardwareSpec {
  return { kind: 't_nut', name: tNutName(size, series), size };
}

/** Shortest screw that still has a shaft: below this `buildScrewGroup` clamps
 *  `shaftLen` to 0 and draws a head with nothing behind it. */
export function minScrewLength(size: ScrewSize): number {
  return SCREW_HEAD_DIMS[size].headH + 1;
}

/**
 * Re-spec a SCREW at a new size/length, keeping its kind (and so its display-name
 * prefix). T-nuts are rejected: their name carries a profile series that `size`
 * does not determine, so rebuilding one from `size` would print a lying name.
 */
export function resizeScrew(spec: HardwareSpec, size: ScrewSize, length: number): HardwareSpec {
  // Rejected here, where the type says it should be, and not only at the call
  // site: falling through to socketScrew would silently turn a T-nut into a bolt.
  if (spec.kind === 't_nut') return spec;
  const len = Math.max(minScrewLength(size), Math.round(length));
  return spec.kind === 'wood_screw' ? woodScrew(size, len) : socketScrew(size, len);
}

const M6_SOCKET_18 = socketScrew('M6', 18);
const M6_SOCKET_20 = socketScrew('M6', 20);
const M6_TNUT = tNut('M6');
const M5_WOOD_16 = woodScrew('M5', 16);

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

export const HOLE_PATTERNS: Record<string, ConnectorHolePattern> = {
  [DEFAULT_BRACKET_STL_URL]: DEFAULT_HOLE_PATTERN,
};

/**
 * The pattern for a connector's STL. Authored patterns win; any other catalog
 * connector gets the default pattern scaled by its size ratio (a 48 mm gusset's
 * seats sit proportionally further out than a 21 mm cast bracket's). Unknown
 * URLs fall back to the default pattern unscaled.
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
  /** Offset along z, the profile-slot direction (catalog mm, unscaled). */
  across: number;
  /** Shoulder (bearing surface) position, bracket-local mm. */
  position: readonly [number, number, number];
  /** XYZ Euler (radians) mapping the hardware's +Z axis onto the inward normal. */
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
        rotation: [Math.PI / 2, 0, 0],
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

export type PartRole = 'bolt' | 'mate' | 'extra';

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
  /** Machining this kit requires, beyond what the brackets themselves need. */
  ops: string[];
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
    id: 'corner-standard',
    name: '角码标准连接',
    desc: '每处角码 2 颗 M6 内六角螺栓 + 2 颗 T 型螺母（压入型材槽内）',
    scope: 'joint',
    boltsPerJoint: 2,
    bolt: M6_SOCKET_18,
    mate: M6_TNUT,
    ops: [],
    minProfileSize: 30,
  },
  {
    id: 'corner-heavy',
    name: '角码加强连接',
    desc: '每处角码 4 颗 M6 螺栓 + 4 颗 T 型螺母，用于承重横梁',
    scope: 'joint',
    boltsPerJoint: 4,
    bolt: M6_SOCKET_18,
    mate: M6_TNUT,
    ops: [],
    minProfileSize: 30,
  },
  {
    id: 'corner-tapped',
    name: '端面攻丝连接',
    desc: '每处角码 2 颗 M6 螺栓，不配螺母 —— 型材端面攻丝代替',
    scope: 'joint',
    boltsPerJoint: 2,
    bolt: M6_SOCKET_20,
    ops: ['型材端面攻丝 M6 · 深 15（代替 T 型螺母）'],
    minProfileSize: 30,
  },
  {
    id: 'tabletop-fix',
    name: '桌板固定',
    desc: '每张桌板 4 颗 M5 沉头木螺钉 —— 只进清单与工序，不在 3D 中显示',
    scope: 'frame',
    boltsPerJoint: 0,
    perFrame: 4,
    bolt: M5_WOOD_16,
    ops: ['桌板钻孔 Ø5', '孔口沉头 Ø10'],
    minProfileSize: 30,
  },
];

const byId = new Map(ACCESSORY_KITS.map((k) => [k.id, k]));

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
      edit && (edit.size || edit.length) && spec.kind !== 't_nut'
        ? resizeScrew(spec, edit.size ?? spec.size!, edit.length ?? spec.length ?? 0)
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

const RANK: Record<PartRole, number> = { bolt: 0, mate: 1, extra: 2 };

/**
 * Group key for a BOM line. NOT the display name alone: once a bolt's spec is
 * user-editable two distinct specs can end up sharing a name, and merging them
 * would sum the quantities while taking kind/material from whichever came first
 * — producing a row that corresponds to nothing actually drawn.
 */
function specLineKey(spec: HardwareSpec): string {
  return `${spec.kind}|${spec.size ?? ''}|${spec.length ?? ''}|${spec.name}`;
}

/**
 * Fold fasteners into BOM lines. Line ORDER is part of the contract — bolts,
 * then mates, then hand-added parts — because accessoryKits.verify.ts indexes
 * `[0]` as the bolt line to check it against the rendered bolt count. `sort` is
 * stable, so parts within a role keep their seat order.
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
  return kit.mate ? [kit.bolt, kit.mate] : [kit.bolt];
}

/** Why this kit can't be used on a frame of the given profile size, or null. */
export function kitFitReason(kit: AccessoryKit, profileSizeMm: number): string | null {
  if (profileSizeMm >= kit.minProfileSize) return null;
  return `需 ≥${kit.minProfileSize}mm 型材（当前 ${profileSizeMm}mm）`;
}

/** The cast bracket's own extent — the reference the default pattern is built on. */
export const REFERENCE_EXT_MM = CAST_CONNECTOR.extMm;
