/**
 * BOM (Bill of Materials) export utility.
 *
 * Generates a CSV file listing all aluminum profiles with their
 * computed dimensions based on current model parameters.
 */

import type { FurnitureModel } from '../types/furniture';
import type { AccessoryKit, HardwareKind, KitLayoutMap } from './accessoryKits';
import { kitScheduleFor } from './accessoryKits';

/**
 * The accessory kit applied to this model, plus where to find the user's edits.
 *
 * A binding object rather than one more positional argument: there is exactly one
 * caller, and kit + edits + joints are one thought — which kit, edited how, over
 * which joints.
 */
export interface KitBinding {
  kit: AccessoryKit;
  /** The user's per-part edits, keyed per connector (see kitLayoutKey). */
  layouts?: KitLayoutMap | null;
  /**
   * One stlUrl per joint the kit is bound to — its LENGTH is the joint count, so
   * it must describe the same set of brackets as `bracketCount`. Omit only when
   * every joint uses the default hole pattern, which is the pre-edits behaviour.
   */
  jointStlUrls?: (string | null | undefined)[];
}

export interface BomRow {
  part: string;
  type: string;
  material: string;
  profile: string;
  lengthMm: number;
  qty: number;
  /** Free-text remark — which kit a fastener belongs to, or a fitting note. */
  note?: string;
}

/** Frontend layout params that shape the BOM (mirrors currentParams). */
export interface BomParams {
  insetRatioX: number;
  insetRatioZ: number;
  crossBeamHeightRatio: number;
  hasCrossBeams: boolean;
  crossBeamOrientation: 'front_back' | 'left_right';
}

/**
 * Compute BOM rows from the current model state.
 *
 * Profile dimensions are computed from model parameters using the
 * same "frame layout" logic as computeFrameLayout, so the BOM matches
 * what the 3D view renders (including frame inset and cross beams).
 * Corner brackets are counted from the live bracket list (enabled only).
 */
export function computeBom(
  model: FurnitureModel,
  params: BomParams,
  bracketCount: number,
  /** Accessory kit applied to every joint. Omit / null for no hardware rows. */
  binding?: KitBinding | null,
): BomRow[] {
  const w = getParam(model, 'width', 1200);
  const d = getParam(model, 'depth', 600);
  const h = getParam(model, 'height', 750);
  const tt = getParam(model, 'tabletop_thickness', 18);
  const insetX = params.insetRatioX * w;
  const insetZ = params.insetRatioZ * d;
  const ps = 30; // profile size

  const frameW = w - insetX * 2;
  const frameD = d - insetZ * 2;
  const legH = h - tt - ps;
  const longDim = Math.max(frameW, frameD);
  const shortDim = Math.min(frameW, frameD);

  const rows: BomRow[] = [];

  // Tabletop
  rows.push({
    part: '桌面 (Tabletop)',
    type: 'tabletop',
    material: 'plywood',
    profile: '-',
    lengthMm: 0,
    qty: 1,
  });

  // Legs (4x)
  rows.push({
    part: '桌腿 (Leg)',
    type: 'leg',
    material: 'aluminum',
    profile: '3030',
    lengthMm: legH,
    qty: 4,
  });

  // Beams front/back (long beams)
  rows.push({
    part: '横梁-长边 (Beam long)',
    type: 'beam',
    material: 'aluminum',
    profile: '3030',
    lengthMm: longDim,
    qty: 2,
  });

  // Beams left/right (short beams)
  rows.push({
    part: '横梁-短边 (Beam short)',
    type: 'beam',
    material: 'aluminum',
    profile: '3030',
    lengthMm: shortDim - 2 * ps,
    qty: 2,
  });

  // Cross beams (加强横梁) — only for templates that have them
  if (params.hasCrossBeams) {
    const isFrontBack = params.crossBeamOrientation === 'front_back';
    const len = isFrontBack ? longDim - 2 * ps : shortDim - 2 * ps;
    rows.push({
      part: '加强横梁 (Cross beam)',
      type: 'cross_beam',
      material: 'aluminum',
      profile: '3030',
      lengthMm: len,
      qty: 2,
    });
  }

  // Corner brackets (auto + manual, enabled only)
  if (bracketCount > 0) {
    rows.push({
      part: '角码 (Corner bracket)',
      type: 'bracket',
      material: 'aluminum',
      profile: '-',
      lengthMm: 0,
      qty: bracketCount,
    });
  }

  // Accessory-kit hardware — the same `jointFasteners` the 3D draws, resolved
  // joint by joint so each is counted against its OWN connector's hole pattern
  // (and so its own edits). Frame-scope kits ignore the joints entirely and are
  // budgeted per desk, which kitScheduleFor handles itself.
  const kit = binding?.kit ?? null;
  if (kit) {
    const joints = binding?.jointStlUrls ?? new Array<string | null | undefined>(bracketCount).fill(null);
    for (const line of kitScheduleFor(kit, joints, binding?.layouts)) {
      rows.push({
        part: line.spec.name,
        type: 'hardware',
        material: HARDWARE_MATERIAL[line.spec.kind],
        profile: line.spec.size ?? '-',
        lengthMm: line.spec.length ?? 0,
        qty: line.qty,
        note: kit.name,
      });
    }
  }

  return rows.filter(keepsInExport);
}

/** Row types that are legitimately counted rather than measured (length 0). */
const COUNTED_TYPES = new Set(['tabletop', 'bracket', 'hardware']);

/** Length-less rows survive the export only when they are countable parts —
 *  a zero-length row of any other type means the geometry degenerate. */
function keepsInExport(r: BomRow): boolean {
  return r.lengthMm > 0 || COUNTED_TYPES.has(r.type);
}

const HARDWARE_MATERIAL: Record<HardwareKind, string> = {
  socket_screw: 'steel',
  t_nut: 'brass',
  // Steel, not brass: this used to be the tabletop's 木螺钉 and is now the
  // countersunk machine screw the catalog actually holds.
  countersunk_screw: 'steel',
};

/** Machining lines a kit calls for. Deduped, order-stable. */
export function bomOpsFrom(kits: (AccessoryKit | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const kit of kits) {
    if (!kit) continue;
    for (const op of kit.ops) if (!out.includes(op)) out.push(op);
  }
  return out;
}

/**
 * Generate CSV string from BOM rows.
 *
 * The first six columns are byte-stable — every existing consumer keys off
 * 数量 at index 5. The 备注 column is appended ONLY when some row actually has
 * a remark, so a plain desk's CSV is unchanged. Ops go in a trailing comment
 * block after a blank line, which CSV readers treat as a short row.
 */
export function bomToCsv(rows: BomRow[], ops: string[] = []): string {
  const hasNotes = rows.some((r) => r.note);
  const header = hasNotes
    ? '零件名称,类型,材料,型材型号,长度(mm),数量,备注'
    : '零件名称,类型,材料,型材型号,长度(mm),数量';
  const body = rows.map((r) => {
    const base = `${r.part},${r.type},${r.material},${r.profile},${r.lengthMm || '-'},${r.qty}`;
    return hasNotes ? `${base},${r.note ?? ''}` : base;
  });
  const lines = [header, ...body];
  if (ops.length > 0) {
    lines.push('');
    lines.push('# 加工要求');
    for (const op of ops) lines.push(`# ${op}`);
  }
  return lines.join('\n');
}

/**
 * Generate a human-readable text summary.
 */
export function bomToText(rows: BomRow[], ops: string[] = []): string {
  const total = rows.reduce((s, r) => s + r.qty, 0);
  let out = `WoodCraft BOM — ${new Date().toLocaleDateString()}\n`;
  out += '══════════════════════════════════════\n\n';
  for (const r of rows) {
    const len = r.lengthMm ? `${r.lengthMm} mm` : '-';
    out += `  ${r.part.padEnd(20)} ${r.profile.padEnd(6)} ${len.padEnd(12)} ×${r.qty}\n`;
  }
  out += `\n──────────────────────────────────────\n`;
  out += `  Total parts: ${total}\n`;
  if (ops.length > 0) {
    out += `\n加工要求\n`;
    for (const op of ops) out += `  · ${op}\n`;
  }
  return out;
}

// ---- helpers ----

function getParam(model: FurnitureModel, id: string, fallback: number): number {
  return model.parameters.find((p) => p.id === id)?.value ?? fallback;
}
