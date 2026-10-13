import type { BomRow } from '../utils/bomExport';
import type { ShopBomEntry } from './shopApi';
import { partName, partTypeLabel } from './labels';
import type { Translate } from '../i18n';

/**
 * The server's parts list, in the shape the exporter already understands.
 *
 * `computeBom` in `src/utils/bomExport.ts` is NOT used, and cannot be: it takes
 * a `FurnitureModel` — the local mock/configurator shape, with components,
 * holes and bracket counts — while what we have is the server's own BOM. Going
 * through it would mean inventing a `FurnitureModel` to throw away.
 *
 * What IS reused is everything downstream of the rows: `bomToCsv`, `bomToXlsx`
 * and `downloadFile` take a plain `BomRow[]` and know nothing about where it
 * came from, so the page gets the same spreadsheet the professional editor
 * produces, headers and all, for the cost of this one mapping.
 *
 * Prices are absent on purpose. The server returns none, and the `0.00` the
 * page shows in that column is a placeholder for a number nobody has. Writing
 * it into the file would hand a fabricator a quote of zero.
 */
export function shopBomRows(
  entries: ShopBomEntry[],
  profile: string,
  t: Translate,
): BomRow[] {
  return entries.map((entry) => {
    const dims = entry.dimensions ?? {};
    // Frame parts come back with an extrusion length; a board is described by
    // its face instead, and its longest side is what a cutting list wants.
    const lengthMm =
      dims.extrusion_length ?? Math.max(dims.width ?? 0, dims.depth ?? 0);
    const isFrame = entry.partType !== 'tabletop';
    return {
      part: partName(t, entry.name),
      type: partTypeLabel(t, entry.partType),
      material: entry.material,
      profile: isFrame ? profile : '',
      lengthMm,
      qty: entry.quantity,
      note: entry.massKg !== null ? `${entry.massKg.toFixed(3)} kg` : undefined,
    };
  });
}
