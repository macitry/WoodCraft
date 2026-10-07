/**
 * BOM (Bill of Materials) export utility.
 *
 * Generates a CSV file listing all aluminum profiles with their
 * computed dimensions based on current model parameters.
 */

import type { FurnitureModel, ProfileSize } from '../types/furniture';
import { PROFILE_DIMS } from '../types/furniture';
import type { AccessoryKit, HardwareKind, KitLayoutMap } from './accessoryKits';
import { catalogUid, kitScheduleFor } from './accessoryKits';
import { CAST_CONNECTOR, connectorByStlUrl } from '../diy/connectors';
import { t } from '../i18n';
import { hardwareName, kitName, kitOps, materialName } from '../i18n/names';

/**
 * The accessory kit applied to this model, plus where to find the user's edits.
 *
 * A binding object rather than one more positional argument: there is exactly one
 * caller, and kit + edits + joints are one thought — which kit, edited how, over
 * which joints.
 *
 * `kit` is optional because the two halves of the binding are independent. The
 * joints are a fact about the model's BRACKETS — they decide what those brackets
 * are made of and what they are called, whether or not any hardware is bolted
 * through them — while the kit only adds hardware rows. Gating the joints behind
 * a kit is how a model with eight brackets and no kit came to export them as
 * "角码, 料号 —" while the 3D drew a catalog part.
 */
export interface KitBinding {
  kit?: AccessoryKit | null;
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
  /**
   * Catalog article number (料号) — the string a workshop orders by. Absent for a
   * row whose part the catalog does not hold (the tabletop; the built-in
   * programmatic bracket), and absent is the honest answer there rather than a
   * number that names something else.
   */
  articleNo?: string;
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
 * The catalog article number for the profile the app models.
 *
 * `43LP` = four slotted faces (what every member of a desk frame uses) in the
 * catalog's light variant. The app models exactly one profile per cross-section,
 * so there is exactly one number to give each size.
 *
 * A MayCad table prints the machining codes and the length on the end of this
 * string (`1.11.030030.43LP-AA4A00/130`). WoodCraft does not model machining, so
 * the article number is the base part and the cut is the 长度 column — two facts
 * in two columns rather than one encoded string, which is what makes the length
 * sortable and the article number orderable.
 */
export const PROFILE_ARTICLE_NO: Record<ProfileSize, string> = {
  '2020': '1.10.020020.43LP',
  '3030': '1.11.030030.43LP',
  '4040': '1.11.040040.43LP',
};

/**
 * A connector's article number, or undefined when it has none.
 *
 * The built-in cast bracket is a programmatic part with no catalog entry, so its
 * id is not an article number and printing it would name something nobody sells.
 * Both BOM builders need this rule, and only one of them should hold it.
 */
export function connectorArticleNo(c: { id: string }): string | undefined {
  return c.id === CAST_CONNECTOR.id ? undefined : c.id;
}

/** The article number for a joint: every distinct number its connectors used.
 *  Abbreviating a mixed list to one of them would be a lie about the others. */
function jointArticleNo(stlUrls: (string | null | undefined)[]): string | undefined {
  const ids: string[] = [];
  for (const url of stlUrls) {
    const no = connectorArticleNo(connectorByStlUrl(url));
    if (no && !ids.includes(no)) ids.push(no);
  }
  return ids.length ? ids.join(' / ') : undefined;
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
  // One source for the profile: the length maths below and the 料号 column both
  // derive from it, so a model that ever moves to a different cross-section cannot
  // end up measuring 30 mm of a 4040.
  const profile: ProfileSize = '3030';
  const ps = PROFILE_DIMS[profile];
  const profileArticle = PROFILE_ARTICLE_NO[profile];

  const frameW = w - insetX * 2;
  const frameD = d - insetZ * 2;
  const legH = h - tt - ps;
  const longDim = Math.max(frameW, frameD);
  const shortDim = Math.min(frameW, frameD);

  const rows: BomRow[] = [];

  // Tabletop
  rows.push({
    part: t('bom.tabletop'),
    type: 'tabletop',
    material: 'plywood',
    profile: '-',
    lengthMm: 0,
    qty: 1,
  });

  // Legs (4x)
  rows.push({
    part: t('bom.leg'),
    type: 'leg',
    material: 'aluminum',
    profile,
    lengthMm: legH,
    qty: 4,
    articleNo: profileArticle,
  });

  // Beams front/back (long beams)
  rows.push({
    part: t('bom.beamLong'),
    type: 'beam',
    material: 'aluminum',
    profile,
    lengthMm: longDim,
    qty: 2,
    articleNo: profileArticle,
  });

  // Beams left/right (short beams)
  rows.push({
    part: t('bom.beamShort'),
    type: 'beam',
    material: 'aluminum',
    profile,
    lengthMm: shortDim - 2 * ps,
    qty: 2,
    articleNo: profileArticle,
  });

  // Cross beams (加强横梁) — only for templates that have them
  if (params.hasCrossBeams) {
    const isFrontBack = params.crossBeamOrientation === 'front_back';
    const len = isFrontBack ? longDim - 2 * ps : shortDim - 2 * ps;
    rows.push({
      part: t('bom.crossBeam'),
      type: 'cross_beam',
      material: 'aluminum',
      profile,
      lengthMm: len,
      qty: 2,
      articleNo: profileArticle,
    });
  }

  const jointUrls = binding?.jointStlUrls ?? null;

  // Corner brackets (auto + manual, enabled only)
  if (bracketCount > 0) {
    rows.push({
      part: t('bom.bracket'),
      type: 'bracket',
      material: 'aluminum',
      profile: '-',
      lengthMm: 0,
      qty: bracketCount,
      // One row covers every joint, so the number is the distinct connectors
      // actually in play. With no joint list there is nothing to resolve and the
      // row carries no number rather than guessing at the default's.
      articleNo: jointUrls ? jointArticleNo(jointUrls) : undefined,
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
        // Recomposed rather than read off `line.spec.name`: the kits' specs were
        // built at module load, so their names are stuck in one language. Same
        // for the note — `kit.name` is the data's copy, `kitName` is the
        // dictionary's.
        part: hardwareName(line.spec),
        type: 'hardware',
        material: HARDWARE_MATERIAL[line.spec.kind],
        profile: line.spec.size ?? '-',
        lengthMm: line.spec.length ?? 0,
        qty: line.qty,
        note: kitName(kit),
        articleNo: catalogUid(line.spec),
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
  // The one hardware row that is not a screw or a nut. Steel like the rest of the
  // screws, because a WN 7381 IS a steel screw.
  flange_screw: 'steel',
  // Zinc alloy, the catalog's GD-Zn — the only hardware here that is not steel.
  cover: 'zinc',
};

/** Machining lines a kit calls for. Deduped, order-stable.
 *
 *  Through `kitOps`, not `kit.ops`: these lines end up in the CSV as `# …`
 *  comments and in the modal's 加工要求 block, and the raw array is the
 *  authored copy in one language. Deduping after translation is the same
 *  operation on the same list in the same order. */
export function bomOpsFrom(kits: (AccessoryKit | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const kit of kits) {
    if (!kit) continue;
    for (const op of kitOps(kit)) if (!out.includes(op)) out.push(op);
  }
  return out;
}

/**
 * Generate CSV string from BOM rows.
 *
 * The first six columns are byte-stable — every existing consumer keys off
 * 数量 at index 5. 备注 and 料号 are each appended ONLY when some row actually
 * has the value, so a plain desk's CSV is unchanged and neither column shifts
 * the other: a spreadsheet that already opens 备注 at index 6 keeps finding it
 * there. Ops go in a trailing comment block after a blank line, which CSV
 * readers treat as a short row.
 */
export function bomToCsv(rows: BomRow[], ops: string[] = []): string {
  const hasNotes = rows.some((r) => r.note);
  const hasArticle = rows.some((r) => r.articleNo);
  const header = [
    t('bom.csvHeader'),
    hasNotes ? t('bom.csvNotes') : null,
    hasArticle ? t('bom.csvArticle') : null,
  ]
    .filter((c) => c !== null)
    .join(',');
  const body = rows.map((r) => {
    // `r.type` stays a raw id — it is the machine column, and the comment above
    // is about consumers keying off its POSITION. `材料` is a name, so it is
    // written the way the UI shows it rather than as the enum value behind it.
    const base = `${r.part},${r.type},${materialName(r.material, r.material)},${r.profile},${r.lengthMm || '-'},${r.qty}`;
    // Each optional column is emitted whenever it is IN THE HEADER, not per row:
    // a short row would be read as a malformed line, and a missing number in the
    // middle of a column is a blank cell, not a shifted one.
    return [
      base,
      hasNotes ? r.note ?? '' : null,
      hasArticle ? r.articleNo ?? '' : null,
    ]
      .filter((c) => c !== null)
      .join(',');
  });
  const lines = [header, ...body];
  if (ops.length > 0) {
    lines.push('');
    lines.push(t('bom.csvOpsComment'));
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
  out += `${t('bom.textTotal', { n: total })}\n`;
  if (ops.length > 0) {
    out += `\n${t('panel.ops')}\n`;
    for (const op of ops) out += `  · ${op}\n`;
  }
  return out;
}

// ---- helpers ----

function getParam(model: FurnitureModel, id: string, fallback: number): number {
  return model.parameters.find((p) => p.id === id)?.value ?? fallback;
}
