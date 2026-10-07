import { useRef, useState } from 'react';
import { useModelStore } from '../store/modelStore';
import { TABLETOP_TEXTURES } from '../materials/tabletopTextures';
import { boardFromFile } from '../materials/boardUpload';
import { useT } from '../i18n';
import { textureLabel, textureNote } from '../i18n/names';
import type { FC } from 'react';

/**
 * Board picker for the tabletop.
 *
 * This panel used to be a list of mock materials whose swatch buttons had no
 * onClick at all — clicking one selected nothing and changed nothing, and the
 * colours it showed came from a different table than the one the renderer reads.
 * It is now the one place the tabletop's surface is chosen, and it reads the
 * same generated table the renderer does, so a chip and the board it labels
 * cannot drift apart.
 *
 * Scope is the TABLETOP only. The frame is extruded aluminium and the brackets
 * are steel; neither is a material decision the user has to make, and saying so
 * is cheaper than a control that appears to apply to everything.
 *
 * The swatch is the baked PNG itself, tiled, rather than a flat colour chip: the
 * difference between oak and walnut is mostly in the grain, and four brown
 * squares side by side would be a worse menu than four pieces of wood.
 *
 * The user's own uploads join the list below the baked four, and are marked with
 * `data-custom-board` rather than `data-texture`. That is not cosmetic: the
 * end-to-end probe pins "the `data-texture` chips are exactly the baked table",
 * and a separate attribute keeps that assertion true by construction instead of
 * by remembering to weaken it.
 */
const MaterialSelector: FC = () => {
  const t = useT();
  const selected = useModelStore((s) => s.tabletopTexture);
  const setTabletopTexture = useModelStore((s) => s.setTabletopTexture);
  const customBoards = useModelStore((s) => s.customBoards);
  const addCustomBoard = useModelStore((s) => s.addCustomBoard);
  const removeCustomBoard = useModelStore((s) => s.removeCustomBoard);
  const setBoardTileMm = useModelStore((s) => s.setBoardTileMm);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      // Decode and derive first, register second: a board must never enter the
      // list before the blobs it points at exist. Failure is `alert`, matching
      // the DXF import — the app's other "you brought a file" path — because a
      // store-`error` overlay reads as "the model failed", which this is not.
      addCustomBoard(await boardFromFile(file));
    } catch (err) {
      alert(t('panel.uploadFailed') + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-2">
        {t('panel.boardMaterial')}
      </p>

      <div className="space-y-1.5">
        {TABLETOP_TEXTURES.map((tex) => {
          const active = tex.id === selected;
          return (
            <button
              key={tex.id}
              data-texture={tex.id}
              data-active={active ? 'true' : 'false'}
              aria-pressed={active}
              onClick={() => setTabletopTexture(tex.id)}
              className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md border
                transition-colors cursor-pointer text-left
                ${active
                  ? 'border-wood-600 bg-wood-500/15'
                  : 'border-neutral-800 hover:border-neutral-600'
                }`}
            >
              <div
                className="w-10 h-10 rounded border border-neutral-700 flex-shrink-0"
                style={{
                  // Tiled at roughly the size one board-width of this face shows
                  // on screen, so the chip is a sample of the surface and not a
                  // shrunken copy of the whole file.
                  backgroundImage: `url(${tex.faceUrl})`,
                  backgroundSize: '260% auto',
                  backgroundColor: tex.color,
                }}
              />
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${active ? 'text-wood-200' : 'text-neutral-300'}`}>
                  {textureLabel(tex)}
                </div>
                <div className="text-[10px] text-neutral-600 leading-snug">{textureNote(tex)}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ---------------- the user's own boards ---------------- */}
      <div className="mt-4 pt-3 border-t border-neutral-800">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-600 font-medium">
            {t('panel.myUploads')}
          </p>
          <label
            className={`px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700
              text-neutral-300 transition-colors cursor-pointer
              ${busy ? 'opacity-50 pointer-events-none' : ''}`}
            title={t('panel.uploadHint')}
          >
            {busy ? t('panel.uploadBusy') : t('panel.uploadImage')}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onPick(e.target.files?.[0]);
                // Reset so the same file can be picked again — the identical
                // file is a legitimate second board at a different tile size.
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {customBoards.length === 0 ? (
          <p className="text-[10px] text-neutral-600 leading-snug">
            {t('panel.uploadEmptyHint')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {customBoards.map((board) => {
              const active = board.id === selected;
              return (
                <div
                  key={board.id}
                  data-custom-board={board.id}
                  data-active={active ? 'true' : 'false'}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md border
                    transition-colors
                    ${active
                      ? 'border-wood-600 bg-wood-500/15'
                      : 'border-neutral-800 hover:border-neutral-600'
                    }`}
                >
                  <button
                    onClick={() => setTabletopTexture(board.id)}
                    aria-pressed={active}
                    className="w-10 h-10 rounded border border-neutral-700 flex-shrink-0 cursor-pointer"
                    style={{
                      backgroundImage: `url(${board.faceUrl})`,
                      backgroundSize: '260% auto',
                      backgroundColor: board.color,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setTabletopTexture(board.id)}
                      className={`block w-full text-left text-sm truncate cursor-pointer
                        ${active ? 'text-wood-200' : 'text-neutral-300'}`}
                    >
                      {/* The user's own file name: their data, never translated. */}
                      {board.label}
                    </button>
                    {/* Committed on blur / Enter, NOT per keystroke: each commit
                        re-authors this board's UVs, which rebuilds the tabletop
                        geometry, and `ModelLoader` disposes materials but never
                        geometries — a per-keystroke write would leak a buffer
                        per digit typed. */}
                    <label className="flex items-center gap-1 text-[10px] text-neutral-600">
                      {t('panel.squareRepresents')}
                      <input
                        key={board.faceTileMm}
                        type="number"
                        min={1}
                        step={10}
                        defaultValue={board.faceTileMm}
                        data-tile-mm={board.id}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v > 0 && v !== board.faceTileMm) {
                            setBoardTileMm(board.id, v);
                          } else {
                            e.target.value = String(board.faceTileMm);
                          }
                        }}
                        className="w-16 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5
                          text-neutral-300 text-[10px] focus:outline-none focus:border-wood-600"
                      />
                      mm
                    </label>
                  </div>
                  <button
                    onClick={() => removeCustomBoard(board.id)}
                    title={t('panel.deleteBoard')}
                    className="px-2 py-0.5 text-[10px] rounded bg-red-900/30 hover:bg-red-900/60
                      text-red-400 transition-colors cursor-pointer flex-shrink-0"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {customBoards.length > 0 && (
          <p className="mt-2 text-[10px] text-neutral-600 leading-snug">
            {t('panel.uploadFooterHint')}
          </p>
        )}
      </div>

      <p className="mt-3 text-[10px] text-neutral-600 leading-snug">
        {t('panel.boardScope')}
      </p>
    </div>
  );
};

export default MaterialSelector;
