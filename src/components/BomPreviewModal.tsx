import { useEffect, useMemo, type FC } from 'react';
import { useModelStore } from '../store/modelStore';
import { computeBom, bomToCsv, bomToXlsx, bomOpsFrom, type BomRow } from '../utils/bomExport';
import { TEMPLATE_LAYOUTS, bracketStlUrl } from '../types/furniture';
import { accessoryKitById } from '../utils/accessoryKits';
import { useKitLayoutStore } from '../store/kitLayoutStore';
import { downloadFile } from '../utils/download';
import { useT } from '../i18n';
import { materialName } from '../i18n/names';

interface BomPreviewModalProps {
  onClose: () => void;
}

/**
 * Centered modal showing the bill of materials for the current model,
 * opened from the toolbar BOM button. Recomputes live from the store so it
 * always matches the current frame params + bracket set.
 */
const BomPreviewModal: FC<BomPreviewModalProps> = ({ onClose }) => {
  const t = useT();
  const model = useModelStore((s) => s.model);
  const currentParams = useModelStore((s) => s.currentParams);
  const brackets = useModelStore((s) => s.brackets);
  const activeKitId = useModelStore((s) => s.activeKitId);
  const kit = accessoryKitById(activeKitId);
  // Subscribed, not read once: without this the modal would keep exporting the
  // preset count after an edit moved or removed a part.
  const kitLayouts = useKitLayoutStore((s) => s.layouts);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = useMemo<BomRow[]>(() => {
    if (!model) return [];
    const layout = TEMPLATE_LAYOUTS[currentParams.templateId];
    const enabled = brackets.filter((b) => b.enabled);
    return computeBom(
      model,
      {
        insetRatioX: currentParams.insetRatioX,
        insetRatioZ: currentParams.insetRatioZ,
        crossBeamHeightRatio: currentParams.crossBeamHeightRatio,
        hasCrossBeams: layout?.hasCrossBeams ?? false,
        crossBeamOrientation: layout?.crossBeamOrientation ?? 'front_back',
      },
      enabled.length,
      // One stlUrl per enabled bracket, in the order they are drawn: the export
      // must resolve each joint through the connector the 3D used, or a model
      // mixing connectors would export hardware nobody drew. `bracketStlUrl` is
      // that same resolution — a bracket with no `stlUrl` of its own is drawn as
      // the default bracket, so it must be exported as one too.
      //
      // Passed whenever there is a bracket, NOT only when a kit is selected: the
      // joints describe the brackets, and the brackets are on the desk and
      // orderable whether or not anything is bolted through them. `kit` rides
      // along and is genuinely optional.
      enabled.length ? { kit, layouts: kitLayouts, jointStlUrls: enabled.map(bracketStlUrl) } : null,
    );
  }, [model, currentParams, brackets, kit, kitLayouts]);

  const ops = useMemo(() => bomOpsFrom([kit]), [kit]);

  if (!model) return null;

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const dims = `${model.parameters.find((p) => p.id === 'width')?.value ?? 1200} × ${model.parameters.find((p) => p.id === 'depth')?.value ?? 600} mm`;
  // Same gate as the CSV: the 料号 column appears only when a row actually has a
  // number. A model with no kit and no bracket connector has none, and an empty
  // column full of dashes is a column of noise pretending to be data. Kept in step
  // with bomToCsv by both asking the rows, not by a flag passed between them.
  const hasArticle = rows.some((r) => r.articleNo);

  // Two formats over one set of rows. Both go out through the shared
  // `downloadFile`, which is what makes the binary one work at all — the inline
  // anchor this used to do would have had to stringify the workbook's bytes.
  const exportCsv = () => {
    // U+FEFF so Excel reads the Chinese headers as UTF-8.
    downloadFile(`bom_${model.id}.csv`, `﻿${bomToCsv(rows, ops)}`, 'text/csv;charset=utf-8');
  };

  const exportXlsx = () => {
    downloadFile(
      `bom_${model.id}.xlsx`,
      bomToXlsx(rows, ops),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`${hasArticle ? 'w-[720px]' : 'w-[600px]'} max-w-full max-h-[82vh] flex flex-col bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">{t('panel.bomTitle')}</h2>
            <p className="text-[10px] text-neutral-500 mt-0.5">
              {model.name} · {dims}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title={t('common.close')}
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-2 font-medium">{t('panel.colPart')}</th>
                <th className="py-2 pr-2 font-medium">{t('panel.colMaterial')}</th>
                <th className="py-2 pr-2 font-medium">{t('panel.colProfile')}</th>
                {hasArticle && <th className="py-2 pr-2 font-medium">{t('panel.colArticle')}</th>}
                <th className="py-2 pr-2 font-medium text-right">{t('panel.colLength')}</th>
                <th className="py-2 font-medium text-right">{t('panel.colQty')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                // Keyed by part too: a kit puts two rows of the same type in the
                // table (bolt + nut), so type alone collides.
                <tr key={`${r.type}-${r.part}-${i}`} className="border-b border-neutral-800/40">
                  <td className="py-2 pr-2 text-neutral-200">{r.part}</td>
                  <td className="py-2 pr-2 text-neutral-400">
                    {materialName(r.material, r.material)}
                  </td>
                  <td className="py-2 pr-2 text-neutral-400">{r.profile}</td>
                  {hasArticle && (
                    <td
                      className="py-2 pr-2 font-mono text-[10px] text-amber-200/70 select-all"
                      // Selectable and monospaced: ordering is a copy-paste of these
                      // digits, and a proportional font makes 1 vs l a guess.
                      title={r.articleNo ? t('panel.articleHint') : t('panel.articleMissing')}
                    >
                      {r.articleNo ?? '—'}
                    </td>
                  )}
                  <td className="py-2 pr-2 text-neutral-300 text-right tabular-nums">
                    {r.lengthMm ? r.lengthMm : '—'}
                  </td>
                  <td className="py-2 text-neutral-200 text-right tabular-nums">×{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {ops.length > 0 && (
            <div className="mt-4 pt-3 border-t border-neutral-800">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">{t('panel.ops')}</p>
              <ul className="mt-1 space-y-0.5">
                {ops.map((op) => (
                  <li key={op} className="text-[11px] text-amber-500/90">⚙ {op}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            {t('panel.bomTotal', { n: totalQty })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
            >
              {t('common.close')}
            </button>
            <button
              onClick={exportCsv}
              className="px-3 py-1.5 text-xs rounded-md bg-wood-600 hover:bg-wood-500 text-white transition-colors cursor-pointer"
              title={t('panel.exportCsvHint')}
            >
              {t('panel.exportCsv')}
            </button>
            {/* Same weight as the CSV button, not a lesser one: they are two
                formats of the same document, and the newer one is the better
                of the two for anyone who wants to total the quantities. */}
            <button
              onClick={exportXlsx}
              className="px-3 py-1.5 text-xs rounded-md bg-wood-600 hover:bg-wood-500 text-white transition-colors cursor-pointer"
              title={t('panel.exportXlsxHint')}
            >
              {t('panel.exportXlsx')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BomPreviewModal;
