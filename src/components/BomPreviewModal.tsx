import { useEffect, useMemo, type FC } from 'react';
import { useModelStore } from '../store/modelStore';
import { computeBom, bomToCsv, type BomRow } from '../utils/bomExport';
import { TEMPLATE_LAYOUTS } from '../types/furniture';

interface BomPreviewModalProps {
  onClose: () => void;
}

/**
 * Centered modal showing the bill of materials for the current model,
 * opened from the toolbar BOM button. Recomputes live from the store so it
 * always matches the current frame params + bracket set.
 */
const BomPreviewModal: FC<BomPreviewModalProps> = ({ onClose }) => {
  const model = useModelStore((s) => s.model);
  const currentParams = useModelStore((s) => s.currentParams);
  const brackets = useModelStore((s) => s.brackets);

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
    return computeBom(
      model,
      {
        insetRatioX: currentParams.insetRatioX,
        insetRatioZ: currentParams.insetRatioZ,
        crossBeamHeightRatio: currentParams.crossBeamHeightRatio,
        hasCrossBeams: layout?.hasCrossBeams ?? false,
        crossBeamOrientation: layout?.crossBeamOrientation ?? 'front_back',
      },
      brackets.filter((b) => b.enabled).length,
    );
  }, [model, currentParams, brackets]);

  if (!model) return null;

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const dims = `${model.parameters.find((p) => p.id === 'width')?.value ?? 1200} × ${model.parameters.find((p) => p.id === 'depth')?.value ?? 600} mm`;

  const handleExport = () => {
    const csv = bomToCsv(rows);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bom_${model.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-[600px] max-w-full max-h-[82vh] flex flex-col bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">📋 BOM 物料清单</h2>
            <p className="text-[10px] text-neutral-500 mt-0.5">
              {model.name} · {dims}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="关闭"
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-2 font-medium">零件名称</th>
                <th className="py-2 pr-2 font-medium">材料</th>
                <th className="py-2 pr-2 font-medium">型材</th>
                <th className="py-2 pr-2 font-medium text-right">长度 (mm)</th>
                <th className="py-2 font-medium text-right">数量</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type} className="border-b border-neutral-800/40">
                  <td className="py-2 pr-2 text-neutral-200">{r.part}</td>
                  <td className="py-2 pr-2 text-neutral-400">{r.material}</td>
                  <td className="py-2 pr-2 text-neutral-400">{r.profile}</td>
                  <td className="py-2 pr-2 text-neutral-300 text-right tabular-nums">
                    {r.lengthMm ? r.lengthMm : '—'}
                  </td>
                  <td className="py-2 text-neutral-200 text-right tabular-nums">×{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            共 <span className="text-neutral-300 font-medium">{totalQty}</span> 件
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
            >
              关闭
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-xs rounded-md bg-wood-600 hover:bg-wood-500 text-white transition-colors cursor-pointer"
              title="导出 BOM 为 CSV"
            >
              📤 导出 CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BomPreviewModal;
