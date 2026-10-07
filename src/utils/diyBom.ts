// ---------------------------------------------------------------------------
// DIY BOM — the free-form builder's parts list.
//
// Deliberately NOT built on computeBom(): that takes a FurnitureModel plus the
// desk template's layout parameters (inset ratios, cross-beam orientation), none
// of which exist here — the DIY frame is an arbitrary graph of profiles. What IS
// shared is the ROW SHAPE and the CSV/TXT writers (bomExport.bomToCsv /
// bomToText), so both modes' exports have identical columns and remark blocks.
//
// Grouping: profiles by (size, length), brackets by connector catalog entry,
// hand-placed screws by (size, length), kit hardware by part name. Kit lines go
// through kitScheduleFor — the same function the 3D renderers' count comes from
// — so the exported quantity is the number of pieces actually drawn.
// ---------------------------------------------------------------------------

import type { DiyBracket, DiyKitInstance, DiyProfile, DiyScrew } from '../types/furniture';
import type { BomRow } from './bomExport';
import { PROFILE_ARTICLE_NO, connectorArticleNo } from './bomExport';
import {
  accessoryKitById,
  catalogUid,
  kitScheduleFor,
  screwOf,
} from './accessoryKits';
import type { HardwareKind, KitLayoutMap } from './accessoryKits';
import { connectorById } from '../diy/connectors';
import { DEFAULT_SCREW_FAMILY } from '../diy/fastenerDims';
import { t } from '../i18n';
import { connectorLabel, hardwareName, kitName, kitOps } from '../i18n/names';

const HARDWARE_MATERIAL: Record<HardwareKind, string> = {
  socket_screw: 'steel',
  t_nut: 'brass',
  // See the note in bomExport: this key was the tabletop's 木螺钉.
  countersunk_screw: 'steel',
  // A WN 7381 IS a steel screw, drive aside.
  flange_screw: 'steel',
  // Zinc alloy, the catalog's GD-Zn — the only hardware here that is not steel.
  cover: 'zinc',
};

/** Accumulate rows by key, summing quantities and preserving first-seen order. */
class RowBag {
  private order: string[] = [];
  private rows = new Map<string, BomRow>();

  add(key: string, row: BomRow): void {
    const existing = this.rows.get(key);
    if (existing) {
      existing.qty += row.qty;
      return;
    }
    this.order.push(key);
    this.rows.set(key, { ...row });
  }

  /** First-seen order: profiles, then brackets, then screws, then hardware. */
  values(): BomRow[] {
    return this.order.map((k) => this.rows.get(k)!);
  }
}

/**
 * BOM rows for the DIY assembly. Disabled profiles / brackets / screws are
 * omitted, matching what the 3D view draws.
 */
export function computeDiyBom(
  profiles: DiyProfile[],
  brackets: DiyBracket[],
  screws: DiyScrew[],
  kitInstances: DiyKitInstance[],
  /** The user's per-part kit edits, as the store holds them. */
  layouts?: KitLayoutMap | null,
): BomRow[] {
  const bag = new RowBag();

  // ---- profiles: (size, length) → one row per distinct cut length ----
  // DiyProfile carries no `enabled` flag — every profile in the store is live.
  for (const p of profiles) {
    const len = Math.round(p.length);
    bag.add(`profile|${p.profileSize}|${len}`, {
      part: t('name.profile', { size: p.profileSize }),
      type: 'profile',
      material: 'aluminum',
      profile: p.profileSize,
      lengthMm: len,
      qty: 1,
      articleNo: PROFILE_ARTICLE_NO[p.profileSize],
    });
  }

  // ---- brackets: catalog entry → one row each ----
  const bracketById = new Map(brackets.map((b) => [b.id, b]));
  for (const b of brackets) {
    if (!b.enabled) continue;
    const cc = connectorById(b.connectorId);
    bag.add(`bracket|${cc.id}`, {
      // The connector's own label is data, so it goes through the dictionary —
      // the BOM naming the part 「角码 Angle Alu 25x40」 in Chinese mode is the
      // same 混杂 as the panel doing it.
      part: t('bom.bracketNamed', { label: connectorLabel(cc) }),
      type: 'bracket',
      material: 'aluminum',
      profile: String(Math.round(b.size)),
      lengthMm: 0,
      qty: 1,
      articleNo: connectorArticleNo(cc),
    });
  }

  // ---- hand-placed screws: (size, length) → one row ----
  // The name is BUILT from the screw's own family, like every other hardware
  // name here: the literal that used to sit here said 内六角圆柱头螺栓 (DIN 912)
  // for every screw, while a dragged screw starts on DIN 7984 薄头 — so the export
  // could name a standard the part is not, and now that the row carries the
  // catalog number too, the two would visibly disagree.
  for (const s of screws) {
    if (!s.enabled) continue;
    const fam = s.family ?? DEFAULT_SCREW_FAMILY;
    // One spec, read twice: the name and the 料号 must describe the same part,
    // and building it twice is how they would come to disagree.
    const spec = screwOf(fam, s.size, s.length);
    bag.add(`screw|${fam}|${s.size}|${s.length}`, {
      part: hardwareName(spec),
      type: 'screw',
      material: 'steel',
      profile: s.size,
      lengthMm: s.length,
      qty: 1,
      articleNo: catalogUid(spec),
    });
  }

  // ---- kit hardware: derived per instance, summed by part name ----
  // One schedule call per instance rather than one per kit id: two instances of
  // the same kit can sit on connectors with different hole patterns (a 21mm cast
  // bracket vs a 48mm gusset), and each must be counted against its own.
  for (const k of kitInstances) {
    if (!k.enabled) continue;
    const kit = accessoryKitById(k.kitId);
    const bracket = bracketById.get(k.bracketId);
    if (!kit || !bracket || !bracket.enabled) continue;
    const stlUrl = connectorById(bracket.connectorId).stlUrl;
    for (const line of kitScheduleFor(kit, [stlUrl], layouts)) {
      // The grouping key stays the RAW `spec.name`: it is an identity, and an
      // identity that changed with the UI language would regroup the rows the
      // moment someone flipped the switch. Only the printed name is translated.
      bag.add(`hw|${line.spec.name}`, {
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

  return bag.values();
}

/** Machining lines the bound kits call for. Deduped, order-stable. */
export function diyOps(kitInstances: DiyKitInstance[]): string[] {
  const out: string[] = [];
  for (const k of kitInstances) {
    if (!k.enabled) continue;
    const kit = accessoryKitById(k.kitId);
    if (!kit) continue;
    for (const op of kitOps(kit)) {
      if (!out.includes(op)) out.push(op);
    }
  }
  return out;
}

/** Default file stem for a DIY export. */
export function diyBomName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `diy-bom-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
