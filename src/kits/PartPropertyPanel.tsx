import { useState, type FC, type ReactNode } from 'react';
import { SCREW_HEAD_DIMS } from '../types/furniture';
import type { ScrewSize } from '../types/furniture';
import type { ExtraPart, HardwareSpec, LocalFastener, PartEdit } from '../utils/accessoryKits';
import { minScrewLength } from '../utils/accessoryKits';
import { useKitLayoutStore } from '../store/kitLayoutStore';

const SIZES: ScrewSize[] = ['M4', 'M5', 'M6'];

const cls =
  'w-16 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-right tabular-nums focus:border-wood-600 focus:outline-none';

/** The three axes, named. NOT roll/pitch/yaw — this page's rotations are XYZ
 *  Euler radians in the assembly's own frame, and the rest of the app's rotation
 *  inputs are ZYX degrees. An unlabelled trio of boxes would be read as the
 *  latter, so every field says which one it is. */
const AXIS_LABEL = ['X', 'Y', 'Z'] as const;

export interface PartPropertyPanelProps {
  setKey: string;
  fastener: LocalFastener;
  /** The part's unedited seat position (catalog mm) — where the deltas count from. */
  base: [number, number, number];
  /** The preset spec this seat would carry with no edits (identical to the
   *  fastener's own spec when unedited). */
  baseSpec: HardwareSpec;
  edit: PartEdit | undefined;
  extra: ExtraPart | undefined;
}

/**
 * Numeric editing for the selected part.
 *
 * Every field writes through the store, which stores DELTAS against the seat for
 * a derived part and absolute values for a hand-added one. That is why the panel
 * shows the derived position (what is drawn) and not the stored offset: the
 * offset is an implementation detail of "how far from the preset hole", and it is
 * the half the user cannot check by looking at the screen.
 *
 * Local draft state per field, committed on blur/Enter, matching the existing
 * screw editor: binding an input straight to the store would rewrite the box
 * under the caret on every keystroke.
 */
const PartPropertyPanel: FC<PartPropertyPanelProps> = ({
  setKey,
  fastener,
  base,
  baseSpec,
  edit,
  extra,
}) => {
  const setPartPosition = useKitLayoutStore((s) => s.setPartPosition);
  const setPartRotation = useKitLayoutStore((s) => s.setPartRotation);
  const setPartSpec = useKitLayoutStore((s) => s.setPartSpec);
  const setPartRemoved = useKitLayoutStore((s) => s.setPartRemoved);
  const clearPart = useKitLayoutStore((s) => s.clearPart);

  const pos = fastener.position;
  const rotDeg = fastener.rotation.map((r) => (r * 180) / Math.PI) as [number, number, number];
  const [draftPos, setDraftPos] = useState<[string, string, string]>(
    pos.map((v) => v.toFixed(1)) as [string, string, string],
  );
  const [draftRot, setDraftRot] = useState<[string, string, string]>(
    rotDeg.map((v) => v.toFixed(1)) as [string, string, string],
  );

  // The spec the user is editing FROM: an override if there is one, else the
  // preset. A T-nut is not re-speccable (its name carries a profile series that
  // `size` does not determine), so it has no size/length fields at all.
  const spec = fastener.spec;
  const resizable = !fastener.internal && spec.kind !== 't_nut';
  /** A hand-added part: no seat, no preset spec, and no `parts` entry of its own. */
  const isExtra = extra !== undefined || fastener.added === true;

  const commitPos = (i: 0 | 1 | 2, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      setDraftPos(pos.map((x) => x.toFixed(1)) as [string, string, string]);
      return;
    }
    const next = [pos[0], pos[1], pos[2]] as [number, number, number];
    next[i] = v;
    // `base` is the seat, so the store records the delta. For an added part the
    // store ignores `base` entirely and keeps the absolute value.
    setPartPosition(setKey, fastener.key, extra ? [0, 0, 0] : base, next);
  };

  const commitRot = (i: 0 | 1 | 2, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const cur = (extra?.rotation ?? edit?.rotOffset ?? [0, 0, 0]).slice() as [
      number,
      number,
      number,
    ];
    // Derived parts store a delta against the seat's own orientation; an added
    // part stores the absolute orientation. Both are XYZ degrees.
    cur[i] = v;
    setPartRotation(setKey, fastener.key, cur);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">选中零件</p>
        <p className="text-xs text-neutral-100 leading-snug mt-1">{spec.name}</p>
        <p className="text-[10px] font-mono text-neutral-600 break-all">{fastener.key}</p>
        <p className="text-[10px] text-neutral-500 mt-0.5">
          {fastener.added ? '手工添加' : fastener.role === 'bolt' ? '螺栓' : '配合件'}
          {fastener.internal ? ' · 槽内（透视）' : ''}
          {edit ? ' · 已微调' : ''}
        </p>
      </div>

      <Section label="位置 Position (mm) · 绝对值">
        {AXIS_LABEL.map((a, i) => (
          <Row key={a} label={a}>
            <input
              type="number"
              data-field={`pos-${a.toLowerCase()}`}
              step={1}
              value={draftPos[i]}
              onChange={(e) =>
                setDraftPos((d) => {
                  const n = [...d] as [string, string, string];
                  n[i] = e.target.value;
                  return n;
                })
              }
              onBlur={(e) => commitPos(i as 0 | 1 | 2, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className={cls}
            />
          </Row>
        ))}
        {!extra && (
          <p className="text-[10px] text-neutral-600">
            预设孔位 {base.map((v) => v.toFixed(1)).join(', ')} mm · 存的是相对它的增量
          </p>
        )}
      </Section>

      <Section label="朝向 Rotation (°) · XYZ 序">
        {AXIS_LABEL.map((a, i) => (
          <Row key={a} label={a}>
            <input
              type="number"
              data-field={`rot-${a.toLowerCase()}`}
              step={1}
              value={draftRot[i]}
              onChange={(e) =>
                setDraftRot((d) => {
                  const n = [...d] as [string, string, string];
                  n[i] = e.target.value;
                  return n;
                })
              }
              onBlur={(e) => commitRot(i as 0 | 1 | 2, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className={cls}
            />
          </Row>
        ))}
        <p className="text-[10px] text-neutral-600">
          {extra ? '绝对值。' : '相对预设朝向的增量。'}
          注意：Z 轴旋转不改变螺栓的朝向 —— 轴向只由 X / Y 决定。
        </p>
      </Section>

      {resizable ? (
        <Section label="规格 Size / Length">
          <div className="flex gap-1">
            {SIZES.map((sz) => (
              <button
                key={sz}
                onClick={() => setPartSpec(setKey, fastener.key, sz, spec.length ?? 18, baseSpec)}
                disabled={spec.size === sz}
                className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                  spec.size === sz
                    ? 'bg-wood-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
          <Row label="总长 (mm)">
            <input
              type="number"
              data-field="len"
              step={1}
              min={spec.size ? minScrewLength(spec.size) : 6}
              value={spec.length ?? 0}
              onChange={(e) => {
                if (!spec.size) return;
                setPartSpec(setKey, fastener.key, spec.size, Number(e.target.value) || 0, baseSpec);
              }}
              className={cls}
            />
          </Row>
          <p className="text-[10px] text-neutral-600">
            头径 {SCREW_HEAD_DIMS[spec.size ?? 'M6'].headD}mm · 头高{' '}
            {SCREW_HEAD_DIMS[spec.size ?? 'M6'].headH}mm · 最短{' '}
            {minScrewLength(spec.size ?? 'M6')}mm（头高 + 1）
          </p>
        </Section>
      ) : (
        <Section label="规格 Size / Length">
          <p className="text-[10px] text-neutral-600 leading-snug">
            T 型螺母的规格不可改：名字里的「系列」由它压进的型材槽决定，不是 `size`
            的函数 —— 由 size 拼出来的名字会说谎。取下它或换一颗，比改半个名字诚实。
          </p>
        </Section>
      )}

      <div className="pt-1 space-y-1.5 border-t border-neutral-800">
        {/* Hiding is offered only for a DERIVED part: it has a seat to come back
            to. An added part has none, so `setPartRemoved` deletes it outright —
            a button saying 隐藏 while doing that would be a lie, and the label
            below says what actually happens. */}
        {!isExtra && (
          <button
            onClick={() => setPartRemoved(setKey, fastener.key, !edit?.removed)}
            className={`w-full px-3 py-1.5 text-xs rounded transition-colors cursor-pointer ${
              edit?.removed
                ? 'bg-amber-600/25 hover:bg-amber-600/40 text-amber-200'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
            }`}
            title="3D、清单与导出同时消失；清单仍留一行可恢复"
          >
            {edit?.removed ? '恢复显示' : '隐藏此零件'}
          </button>
        )}
        <button
          onClick={() => clearPart(setKey, fastener.key)}
          // An added part is held in `extra`, not in `parts`, so it has no
          // `edit` to test — gating on `edit` alone left this button dead and
          // a hand-added part impossible to remove.
          disabled={!edit && !isExtra}
          className={`w-full px-3 py-1.5 text-xs rounded transition-colors ${
            edit || isExtra
              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer'
              : 'bg-neutral-900 text-neutral-600 cursor-not-allowed'
          }`}
        >
          {isExtra ? '移除这个零件' : '重置此零件'}
        </button>
      </div>

    </div>
  );
};

const Section: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <p className="text-[10px] text-neutral-500 uppercase">{label}</p>
    <div className="space-y-1">{children}</div>
  </div>
);

const Row: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between items-center">
    <span className="text-neutral-400 text-xs">{label}</span>
    {children}
  </div>
);

export default PartPropertyPanel;
