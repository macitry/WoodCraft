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
// through kitSchedule — the same function the 3D renderers' count comes from —
// so the exported quantity is the number of pieces actually drawn.
// ---------------------------------------------------------------------------

import type { DiyBracket, DiyKitInstance, DiyProfile, DiyScrew } from '../types/furniture';
import type { BomRow } from './bomExport';
import { accessoryKitById, kitSchedule } from './accessoryKits';
import type { HardwareKind } from './accessoryKits';
import { connectorById } from '../diy/connectors';

const HARDWARE_MATERIAL: Record<HardwareKind, string> = {
  socket_screw: 'steel',
  t_nut: 'brass',
  wood_screw: 'steel',
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
): BomRow[] {
  const bag = new RowBag();

  // ---- profiles: (size, length) → one row per distinct cut length ----
  // DiyProfile carries no `enabled` flag — every profile in the store is live.
  for (const p of profiles) {
    const len = Math.round(p.length);
    bag.add(`profile|${p.profileSize}|${len}`, {
      part: `型材 ${p.profileSize}`,
      type: 'profile',
      material: 'aluminum',
      profile: p.profileSize,
      lengthMm: len,
      qty: 1,
    });
  }

  // ---- brackets: catalog entry → one row each ----
  const bracketById = new Map(brackets.map((b) => [b.id, b]));
  for (const b of brackets) {
    if (!b.enabled) continue;
    const cc = connectorById(b.connectorId);
    bag.add(`bracket|${cc.id}`, {
      part: `角码 ${cc.label}`,
      type: 'bracket',
      material: 'aluminum',
      profile: String(Math.round(b.size)),
      lengthMm: 0,
      qty: 1,
    });
  }

  // ---- hand-placed screws: (size, length) → one row ----
  for (const s of screws) {
    if (!s.enabled) continue;
    bag.add(`screw|${s.size}|${s.length}`, {
      part: `内六角圆柱头螺栓 ${s.size}×${s.length}`,
      type: 'screw',
      material: 'steel',
      profile: s.size,
      lengthMm: s.length,
      qty: 1,
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
    for (const line of kitSchedule(kit, 1, stlUrl)) {
      bag.add(`hw|${line.spec.name}`, {
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

  return bag.values();
}

/** Machining lines the bound kits call for. Deduped, order-stable. */
export function diyOps(kitInstances: DiyKitInstance[]): string[] {
  const out: string[] = [];
  for (const k of kitInstances) {
    if (!k.enabled) continue;
    for (const op of accessoryKitById(k.kitId)?.ops ?? []) {
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
