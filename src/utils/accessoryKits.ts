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
import { DEFAULT_BRACKET_STL_URL } from '../types/furniture';
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

const M6_SOCKET_18: HardwareSpec = { kind: 'socket_screw', name: '内六角圆柱头螺栓 M6×18', size: 'M6', length: 18 };
const M6_SOCKET_20: HardwareSpec = { kind: 'socket_screw', name: '内六角圆柱头螺栓 M6×20', size: 'M6', length: 20 };
const M6_TNUT: HardwareSpec = { kind: 't_nut', name: 'T 型螺母 M6 · 30 系列', size: 'M6' };
const M5_WOOD_16: HardwareSpec = { kind: 'wood_screw', name: '十字沉头木螺钉 M5×16', size: 'M5', length: 16 };

// ---------------------------------------------------------------------------
// Hole patterns — where a given connector can take a fastener
//
// The pattern belongs to the CONNECTOR, not to the kit: a kit says "how many
// bolts per joint", the connector says "how many seats exist and where". A
// 4-bolt kit on a 2-seat bracket must cap at 2, never hang a screw head off the
// edge of the plate. That capping rule is `perJointCount` and both the renderers
// and the BOM go through it.
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
        position: [x.along, pattern.plateT.y, x.across],
        rotation: [Math.PI / 2, 0, 0],
        plateT: pattern.plateT.y,
      });
    }
    const y = pattern.yRun[i];
    if (y) {
      out.push({
        leg: 'y',
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
  spec: HardwareSpec;
  /** Bracket-local mm. */
  position: [number, number, number];
  /** XYZ Euler, radians. */
  rotation: readonly [number, number, number];
  /** True for hardware that lives inside the profile slot (T-nut) — the
   *  renderers draw these ghosted, and only when explicitly asked. */
  internal: boolean;
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

/** Seats a kit actually fills at one joint: min(declared, available). */
export function perJointCount(kit: AccessoryKit | null, stlUrl?: string | null): number {
  if (!kit || kit.scope !== 'joint') return 0;
  return Math.min(kit.boltsPerJoint, jointSeats(holePatternFor(stlUrl)).length);
}

/**
 * Hardware for ONE connection joint, in bracket-local mm. Empty for a null kit,
 * for an unknown one, or for frame-scope kits (which have no per-joint location
 * — they contribute to the BOM only).
 */
export function jointFasteners(
  kit: AccessoryKit | null,
  stlUrl?: string | null,
  scale = 1,
): LocalFastener[] {
  if (!kit || kit.scope !== 'joint') return [];
  const seats = jointSeats(holePatternFor(stlUrl));
  const n = Math.min(kit.boltsPerJoint, seats.length);
  const out: LocalFastener[] = [];
  const put = (spec: HardwareSpec, seat: JointSeat, extra: number, internal: boolean) => {
    const axis = socketAxis(seat.rotation);
    const d = extra * scale;
    out.push({
      spec,
      position: [
        seat.position[0] * scale + axis[0] * d,
        seat.position[1] * scale + axis[1] * d,
        seat.position[2] * scale + axis[2] * d,
      ],
      rotation: seat.rotation,
      internal,
    });
  };
  for (let i = 0; i < n; i++) put(kit.bolt, seats[i], 0, false);
  if (kit.mate) {
    // The T-nut sits in the slot just past the mating plane — the bolt's shaft
    // crosses the plate, so offset it by the plate thickness plus the nut body.
    for (let i = 0; i < n; i++) put(kit.mate, seats[i], seats[i].plateT + MATE_DEPTH_MM, true);
  }
  return out;
}

export interface KitLine {
  spec: HardwareSpec;
  qty: number;
}

/**
 * BOM lines for a kit across `jointCount` joints. Shares `perJointCount` with
 * `jointFasteners`, so the listed quantity always equals the number of pieces
 * the renderers draw (times the joint count) — that identity is asserted in
 * accessoryKits.verify.ts.
 */
export function kitSchedule(kit: AccessoryKit | null, jointCount: number, stlUrl?: string | null): KitLine[] {
  if (!kit) return [];
  const n = Math.max(0, Math.floor(jointCount));
  if (n === 0) return [];
  if (kit.scope === 'frame') {
    const qty = Math.max(0, Math.floor(kit.perFrame ?? 0));
    if (qty === 0) return [];
    const lines: KitLine[] = [{ spec: kit.bolt, qty }];
    if (kit.mate) lines.push({ spec: kit.mate, qty });
    return lines;
  }
  const per = perJointCount(kit, stlUrl);
  if (per === 0) return [];
  const lines: KitLine[] = [{ spec: kit.bolt, qty: per * n }];
  if (kit.mate) lines.push({ spec: kit.mate, qty: per * n });
  return lines;
}

/** The kit's hardware, one entry per distinct part (for summaries / previews). */
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
