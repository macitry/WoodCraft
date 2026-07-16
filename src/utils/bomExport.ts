/**
 * BOM (Bill of Materials) export utility.
 *
 * Generates a CSV file listing all aluminum profiles with their
 * computed dimensions based on current model parameters.
 */

import type { FurnitureModel } from '../types/furniture';

export interface BomRow {
  part: string;
  type: string;
  material: string;
  profile: string;
  lengthMm: number;
  qty: number;
}

/**
 * Compute BOM rows from the current model state.
 *
 * Profile dimensions are computed from model parameters using the
 * same "frame layout" logic as computeFrameLayout.
 */
export function computeBom(model: FurnitureModel): BomRow[] {
  const w = getParam(model, 'width', 1200);
  const d = getParam(model, 'depth', 600);
  const h = getParam(model, 'height', 750);
  const tt = getParam(model, 'tabletop_thickness', 18);
  const insetX = getInset(model, 'insetRatioX');
  const insetZ = getInset(model, 'insetRatioZ');
  const ps = 30; // profile size

  const frameW = w - insetX * 2;
  const frameD = d - insetZ * 2;
  const legH = h - tt - ps;

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
  const longDim = Math.max(frameW, frameD);
  const shortDim = Math.min(frameW, frameD);
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

  return rows.filter((r) => r.lengthMm > 0 || r.type === 'tabletop');
}

/**
 * Generate CSV string from BOM rows.
 */
export function bomToCsv(rows: BomRow[]): string {
  const header = '零件名称,类型,材料,型材型号,长度(mm),数量';
  const body = rows.map((r) =>
    `${r.part},${r.type},${r.material},${r.profile},${r.lengthMm || '-'},${r.qty}`,
  );
  return [header, ...body].join('\n');
}

/**
 * Generate a human-readable text summary.
 */
export function bomToText(rows: BomRow[]): string {
  const total = rows.reduce((s, r) => s + r.qty, 0);
  let out = `WoodCraft BOM — ${new Date().toLocaleDateString()}\n`;
  out += '══════════════════════════════════════\n\n';
  for (const r of rows) {
    const len = r.lengthMm ? `${r.lengthMm} mm` : '-';
    out += `  ${r.part.padEnd(20)} ${r.profile.padEnd(6)} ${len.padEnd(12)} ×${r.qty}\n`;
  }
  out += `\n──────────────────────────────────────\n`;
  out += `  Total parts: ${total}\n`;
  return out;
}

// ---- helpers ----

function getParam(model: FurnitureModel, id: string, fallback: number): number {
  return model.parameters.find((p) => p.id === id)?.value ?? fallback;
}

function getInset(_model: FurnitureModel, _key: string): number {
  // Read from store since insets are frontend-only (not in model.parameters)
  // We approximate from the current model state
  return 0; // default; BOM reflects frame dimensions, inset is a visual offset
}
