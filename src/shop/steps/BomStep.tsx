import { useMemo } from 'react';
import { useT } from '../../i18n';
import { materialName, textureLabel } from '../../i18n/names';
import { boardById } from '../../materials/boardRegistry';
import { bomToCsv, bomToXlsx } from '../../utils/bomExport';
import { downloadFile } from '../../utils/download';
import { useShopStore } from '../shopStore';
import { bomSheetBlob } from '../bomImage';
import { shopBomRows } from '../bomRows';
import { shopBrackets } from '../shopBrackets';
import { DEFAULT_ACCESSORY_KIT_ID, accessoryKitById } from '../../utils/accessoryKits';
import { partTypeLabel, templateName } from '../labels';
import type { ShopBom, ShopModel } from '../shopApi';

/**
 * Step three: what it is made of, and the file you take away.
 *
 * Two things about this page are deliberate and worth stating.
 *
 * The PRICE COLUMN IS A PLACEHOLDER. The server returns no prices — `BomEntry`
 * has name, type, quantity, material, dimensions and mass, and nothing else —
 * so the column reads `0.00` everywhere, with a line under the table saying so.
 * It is shown rather than omitted because a parts list without one looks
 * unfinished to anyone who has ordered metal, and it is NOT exported, because a
 * spreadsheet of zeroes is a quote for nothing.
 *
 * The EXPORT IS THE APP'S OWN. `bomToCsv` / `bomToXlsx` / `downloadFile` are
 * the same three the professional editor uses, reached through a row mapping
 * (`bomRows.ts`) rather than a second writer. The customer's file and the
 * fabricator's file are the same document in the same column order.
 */
const BomStep: React.FC = () => {
  const t = useT();
  const bom = useShopStore((s) => s.bom);
  const bomLoading = useShopStore((s) => s.bomLoading);
  const bomFailed = useShopStore((s) => s.bomFailed);
  const building = useShopStore((s) => s.building);
  const buildFailed = useShopStore((s) => s.buildFailed);
  const retryBom = useShopStore((s) => s.retryBom);
  const build = useShopStore((s) => s.build);
  const template = useShopStore((s) => s.template);
  const profile = useShopStore((s) => s.profile);
  const board = useShopStore((s) => s.board);
  const model = useShopStore((s) => s.model);
  const values = useShopStore((s) => s.values);

  const entries = bom?.entries ?? [];

  // `t` is a dependency on purpose: the rows carry translated names, so they are
  // rebuilt when the language flips. The bracket set is the same one the viewer
  // draws, and the fasteners are counted through the editor's own
  // `hardwareBomRows`, so the list and the exported file carry the hardware the
  // 3D shows rather than stopping at the bare frame.
  const rows = useMemo(() => {
    if (!bom) return [];
    const bracketSource = bracketModel(model, bom, values, profile);
    const brackets = bracketSource && template
      ? shopBrackets(bracketSource, template.id)
      : [];
    return shopBomRows(
      bom.entries,
      profile,
      t,
      {
        brackets,
        kit: accessoryKitById(DEFAULT_ACCESSORY_KIT_ID),
      },
      board,
    );
  }, [bom, profile, t, model, template, values, board]);

  const fileBase = template ? templateName(t, template.id, template.name) : 'WoodCraft';

  // A build that failed is not an empty list, and saying so in the empty list's
  // words is worse than saying nothing: 「这个模型没有返回零件清单」 blames the
  // customer's furniture for a server-side failure. This branch has to come
  // first, and it needs its own retry — `retryBom` fetches a list for a model
  // that does not exist, so only another build can help.
  if (buildFailed && !bom) {
    return (
      <div className="shop-scroll">
        <h2 className="shop-h1">{t('shop.bom.title')}</h2>
        <p className="shop-lead">{t('shop.view.failed')}</p>
        <p className="shop-table-note">{t('shop.view.failedNote')}</p>
        <button
          type="button"
          className="shop-size"
          style={{ maxWidth: 160 }}
          data-shop-nav="build-retry"
          onClick={() => void build(true)}
        >
          <span className="shop-size-cap">{t('shop.view.retry')}</span>
        </button>
      </div>
    );
  }

  if (bomFailed && !bom) {
    return (
      <div className="shop-scroll">
        <h2 className="shop-h1">{t('shop.bom.title')}</h2>
        <p className="shop-lead">{t('shop.bom.failed')}</p>
        <button type="button" className="shop-size" style={{ maxWidth: 160 }} onClick={() => void retryBom()}>
          <span className="shop-size-cap">{t('shop.bom.retry')}</span>
        </button>
      </div>
    );
  }

  // A build still running is not an empty list, and it is not a failure either.
  // This used to be unreachable — the list step was gated on a finished model,
  // so `!bom` here always meant "something went wrong". The gate is gone (the
  // model is built on its own clock now), so a customer who clicks on early
  // arrives here with no list and nothing wrong, and needs to be told which.
  if (!bom && building) {
    return (
      <div className="shop-scroll">
        <h2 className="shop-h1">{t('shop.bom.title')}</h2>
        <p className="shop-lead">{t('shop.view.building')}</p>
        <p className="shop-table-note">{t('shop.view.buildingNote')}</p>
      </div>
    );
  }

  if (!bom) {
    return (
      <div className="shop-scroll">
        <h2 className="shop-h1">{t('shop.bom.title')}</h2>
        <p className="shop-lead">{bomLoading ? t('shop.bom.loading') : t('shop.bom.empty')}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="shop-scroll">
        <h2 className="shop-h1">{t('shop.bom.title')}</h2>
        <p className="shop-lead">{t('shop.bom.empty')}</p>
      </div>
    );
  }

  // The server's own total when it has one; otherwise the rows add up to it.
  const massTotal =
    bom.totalMassKg ??
    entries.reduce((sum, e) => sum + (e.massKg ?? 0) * (e.quantity || 1), 0);

  // The picture is the sheet a customer forwards on: the render on top, the
  // same rows the table and the files carry underneath. A picture alone makes
  // the recipient ask what the parts are; a list alone loses the view.
  //
  // The render is READ from the viewer's canvas rather than redrawn — that is
  // the view the customer chose, at the pane's own pixel density — which is
  // why `ShopViewer` sets `preserveDrawingBuffer`: the frame was drawn before
  // this click and would otherwise be gone.
  //
  // Prices stay out of the sheet for the reason they stay out of the files: the
  // server has none, and a quote of zero is worse than no quote.
  const exportImage = async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-shop-viewer] canvas');
    if (!canvas) {
      window.alert(t('shop.bom.imageFailed'));
      return;
    }
    const boardLabel = textureLabel(boardById(board));
    const size = [values.width, values.depth, values.height]
      .map((n) => n ?? '—')
      .join(' × ');
    const blob = await bomSheetBlob({
      canvas,
      title: fileBase,
      subtitle: `${size} mm · ${t('shop.size.profile.title')} ${profile} · ${t('shop.size.board.title')} ${boardLabel}`,
      sectionTitle: t('shop.bom.title'),
      columns: [
        t('shop.bom.col.name'),
        t('shop.bom.col.type'),
        t('shop.bom.col.material'),
        t('shop.bom.col.spec'),
        t('shop.bom.col.length'),
        t('shop.bom.col.qty'),
        t('shop.bom.col.mass'),
      ],
      // Mass comes from the server's entry, exactly as the table shows it. It
      // is NOT `row.note`: the note is a mass string on the frame rows but the
      // kit's name on hardware rows, and the sheet would print 「Standard…」 in
      // the mass column for every bolt.
      rows: rows.map((row, i) => {
        const entry = bom.entries[i];
        return [
          row.part,
          partTypeLabel(t, row.type),
          materialName(row.material, row.material),
          row.profile || '—',
          row.lengthMm > 0 ? String(row.lengthMm) : '—',
          String(row.qty),
          entry && entry.massKg !== null ? `${entry.massKg.toFixed(3)} kg` : '—',
        ];
      }),
      footer: `${t('shop.bom.massTotal')} ${massTotal.toFixed(3)} kg · ${t('shop.bom.imageNoPrice')}`,
    });
    if (!blob) {
      window.alert(t('shop.bom.imageFailed'));
      return;
    }
    downloadFile(
      `${fileBase} ${t('shop.bom.imageName')}.png`,
      new Uint8Array(await blob.arrayBuffer()),
      'image/png',
    );
  };

  return (
    <div className="shop-scroll">
      <h2 className="shop-h1">{t('shop.bom.title')}</h2>
      <p className="shop-lead">{t('shop.bom.lead')}</p>

      <div className="shop-table-wrap">
      <table className="shop-table">
        <thead>
          <tr>
            <th>{t('shop.bom.col.name')}</th>
            <th>{t('shop.bom.col.type')}</th>
            <th>{t('shop.bom.col.material')}</th>
            <th>{t('shop.bom.col.spec')}</th>
            <th className="num">{t('shop.bom.col.length')}</th>
            <th className="num">{t('shop.bom.col.qty')}</th>
            <th className="num">{t('shop.bom.col.mass')}</th>
            <th className="num">{t('shop.bom.col.price')}</th>
            <th className="num">{t('shop.bom.col.subtotal')}</th>
          </tr>
        </thead>
        <tbody data-shop-bom-rows={rows.length}>
          {rows.map((row, i) => {
            // The first rows are the server's own, in order; brackets and
            // hardware are appended after them and have no server entry (and
            // therefore no mass).
            const entry = bom.entries[i];
            return (
              <tr key={`${row.type}-${row.part}-${i}`}>
                <td className="shop-table-name">{row.part}</td>
                <td>{partTypeLabel(t, row.type)}</td>
                <td>{materialName(row.material, row.material)}</td>
                <td>{row.profile || '—'}</td>
                <td className="num">{row.lengthMm > 0 ? row.lengthMm : '—'}</td>
                <td className="num">{row.qty}</td>
                <td className="num">
                  {entry && entry.massKg !== null ? entry.massKg.toFixed(3) : '—'}
                </td>
                <td className="num" data-shop-price="0.00">
                  0.00
                </td>
                <td className="num">0.00</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <p className="shop-table-note" data-shop-bom-total>
        {t('shop.bom.massTotal')} {massTotal.toFixed(3)} kg · {t('shop.bom.priceTotal')} 0.00
      </p>
      <p className="shop-table-note">{t('shop.bom.pricePlaceholder')}</p>

      <div className="shop-exports">
        <button
          type="button"
          className="shop-size shop-export"
          data-shop-export="xlsx"
          onClick={() =>
            downloadFile(
              `${fileBase} BOM.xlsx`,
              bomToXlsx(rows),
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
          }
        >
          <span className="shop-size-cap">{t('shop.bom.export.xlsx')}</span>
        </button>
        <button
          type="button"
          className="shop-size shop-export"
          data-shop-export="csv"
          onClick={() =>
            // No BOM (byte-order mark) in front: the file is UTF-8 and both the
            // CSV and the workbook come out of the same row set, so the two are
            // one document. Adding a mark here alone would make them differ.
            downloadFile(`${fileBase} BOM.csv`, bomToCsv(rows), 'text/csv;charset=utf-8')
          }
        >
          <span className="shop-size-cap">{t('shop.bom.export.csv')}</span>
        </button>
        <button
          type="button"
          className="shop-size shop-export"
          data-shop-export="png"
          onClick={exportImage}
        >
          <span className="shop-size-cap">{t('shop.bom.export.png')}</span>
        </button>
      </div>

      <p className="shop-table-note">{t('shop.bom.exportNote')}</p>
    </div>
  );
};

/**
 * The model the bracket generator should see.
 *
 * Normally that is the live model — the one the viewer draws — so the list
 * describes exactly the picture beside it. But the list is answered by a
 * FINISHED build while the viewer may already hold a newer solver-only preview;
 * when there is no live model at all, the BOM's own entries carry the same part
 * ids and types (all the generator reads) and the slider values supply the
 * frame dimensions. Returning null means there is nothing to place brackets on
 * and the list stays frame-only rather than inventing joints.
 */
function bracketModel(
  model: ShopModel | null,
  bom: ShopBom,
  values: Record<string, number>,
  profile: string,
): ShopModel | null {
  if (model) return model;
  if (bom.entries.length === 0) return null;
  return {
    modelId: '',
    name: bom.furnitureName,
    status: 'full',
    parts: bom.entries.map((entry) => ({
      name: entry.name,
      partType: entry.partType,
      profile,
      material: entry.material,
      dimensions: entry.dimensions,
      massKg: entry.massKg,
      stlUrl: null,
      pose: null,
    })),
    dimensions: {
      width: values.width,
      depth: values.depth,
      height: values.height,
      tabletop_thickness: values.tabletop_thickness,
    },
    message: null,
  };
}

export default BomStep;
