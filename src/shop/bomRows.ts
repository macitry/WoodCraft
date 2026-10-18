import { hardwareBomRows, type BomRow } from '../utils/bomExport';
import type { AccessoryKit } from '../utils/accessoryKits';
import { bracketStlUrl, type BracketInstance } from '../types/furniture';
import type { ShopBomEntry } from './shopApi';
import { partName } from './labels';
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
 *
 * The frame rows come from the server; the corner brackets and their fasteners
 * come from the page's own bracket generator (`shopBrackets`) through the very
 * `hardwareBomRows` the editor exports with. The server does not model joints,
 * and a shopping list that stops at the bare frame is not what the editor hands
 * the same customer.
 */
export function shopBomRows(
  entries: ShopBomEntry[],
  profile: string,
  t: Translate,
  hardware?: { brackets: BracketInstance[]; kit: AccessoryKit | null } | null,
  board?: string | null,
): BomRow[] {
  const frameRows = entries.map((entry) => {
    const dims = entry.dimensions ?? {};
    // Frame parts come back with an extrusion length; a board is described by
    // its face instead, and its longest side is what a cutting list wants.
    const lengthMm =
      dims.extrusion_length ?? Math.max(dims.width ?? 0, dims.depth ?? 0);
    const isFrame = entry.partType !== 'tabletop';
    return {
      part: partName(t, entry.name),
      // The raw id, not the label: `BomRow.type` is the export's machine column
      // (see `bomToCsv`), and the editor writes 'leg'/'beam' there too. The
      // table translates it for display.
      type: entry.partType,
      // The tabletop's material is the customer's choice on this page. The
      // server only knows "a board" (`material: "wood"`, with the board's name
      // carried in a field the BOM endpoint does not return), so an exported
      // desk would otherwise forget the walnut the customer picked two steps
      // ago. The id is one of the baked boards and `materialName` translates it
      // in the table and in both writers.
      material: entry.partType === 'tabletop' && board ? board : entry.material,
      profile: isFrame ? profile : '',
      lengthMm,
      qty: entry.quantity,
      note: entry.massKg !== null ? `${entry.massKg.toFixed(3)} kg` : undefined,
    };
  });

  if (!hardware) return frameRows;
  return [
    ...frameRows,
    // `jointStlUrls` in draw order: the same resolution the viewer uses for the
    // mesh (`bracketStlUrl`), so the fasteners counted here are the ones on the
    // brackets on screen.
    ...hardwareBomRows(
      hardware.brackets.length,
      hardware.brackets.map((b) => bracketStlUrl(b)),
      hardware.kit,
      null,
    ),
  ];
}
