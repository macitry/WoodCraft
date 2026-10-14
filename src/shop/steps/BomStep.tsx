import { useMemo } from 'react';
import { useT } from '../../i18n';
import { materialName } from '../../i18n/names';
import { bomToCsv, bomToXlsx } from '../../utils/bomExport';
import { downloadFile } from '../../utils/download';
import { useShopStore } from '../shopStore';
import { shopBomRows } from '../bomRows';
import { partName, partTypeLabel, templateName } from '../labels';

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
  const retryBom = useShopStore((s) => s.retryBom);
  const template = useShopStore((s) => s.template);
  const profile = useShopStore((s) => s.profile);

  const entries = bom?.entries ?? [];

  // `t` is a dependency on purpose: the rows carry translated names, so they are
  // rebuilt when the language flips. `shopBomRows` is cheap and the list is nine
  // rows long.
  const rows = useMemo(
    () => (bom ? shopBomRows(bom.entries, profile, t) : []),
    [bom, profile, t],
  );

  const fileBase = template ? templateName(t, template.id, template.name) : 'WoodCraft';

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

  return (
    <div className="shop-scroll">
      <h2 className="shop-h1">{t('shop.bom.title')}</h2>
      <p className="shop-lead">{t('shop.bom.lead')}</p>

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
        <tbody data-shop-bom-rows={entries.length}>
          {entries.map((entry, i) => {
            const row = rows[i];
            return (
              <tr key={entry.name}>
                <td className="shop-table-name">{partName(t, entry.name)}</td>
                <td>{partTypeLabel(t, entry.partType)}</td>
                <td>{materialName(entry.material, entry.material)}</td>
                <td>{row?.profile || '—'}</td>
                <td className="num">{row && row.lengthMm > 0 ? row.lengthMm : '—'}</td>
                <td className="num">{entry.quantity}</td>
                <td className="num">{entry.massKg !== null ? entry.massKg.toFixed(3) : '—'}</td>
                <td className="num" data-shop-price="0.00">
                  0.00
                </td>
                <td className="num">0.00</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="shop-table-note" data-shop-bom-total>
        {t('shop.bom.massTotal')} {massTotal.toFixed(3)} kg · {t('shop.bom.priceTotal')} 0.00
      </p>
      <p className="shop-table-note">{t('shop.bom.pricePlaceholder')}</p>

      <div className="shop-exports">
        <button
          type="button"
          className="shop-size"
          data-shop-export="xlsx"
          style={{ maxWidth: 200 }}
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
          className="shop-size"
          data-shop-export="csv"
          style={{ maxWidth: 200 }}
          onClick={() =>
            // No BOM (byte-order mark) in front: the file is UTF-8 and both the
            // CSV and the workbook come out of the same row set, so the two are
            // one document. Adding a mark here alone would make them differ.
            downloadFile(`${fileBase} BOM.csv`, bomToCsv(rows), 'text/csv;charset=utf-8')
          }
        >
          <span className="shop-size-cap">{t('shop.bom.export.csv')}</span>
        </button>
      </div>

      <p className="shop-table-note">{t('shop.bom.exportNote')}</p>
    </div>
  );
};

export default BomStep;
