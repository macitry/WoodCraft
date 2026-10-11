import { useEffect, useRef, useState } from 'react';
import type { ViewPreset } from '../types/furniture';
import { useDiyStore } from '../store/diyStore';
import { useT } from '../i18n';
import { DIY_BACKGROUNDS, backgroundById } from './diyBackgrounds';

/**
 * The free-form builder's view controls, in a strip above the canvas.
 *
 * A strip in normal flow rather than a floating overlay, which is also how the
 * Configurator's plan view does it (`TabletopPlan`). Two reasons:
 *
 * - the viewport's root is what listens for placement clicks (`DiyViewer`), so
 *   anything that shares those pixels would place a part every time a control
 *   was pressed. A strip above the scene is simply not in that element.
 * - the in-hand banner and the kit toast are centred at the top of the canvas
 *   (`DiyViewer` top-3). An overlay here would land on top of them.
 *
 * The controls are all momentary except the grid, which is a state and is drawn
 * as one — same recipe as the plan view's tool group, so the two toolbars are
 * recognisably the same object.
 */

const PRESETS: ViewPreset[] = ['front', 'top', 'side', 'perspective'];

/**
 * The four labels come from the shared `view.*` keys rather than fresh
 * `diy.view*` twins: they are documented as the vocabulary every page with a
 * camera uses, and 前视 means the same thing on both pages.
 */
const PRESET_LABEL: Record<ViewPreset, 'view.front' | 'view.top' | 'view.side' | 'view.perspective'> = {
  front: 'view.front',
  top: 'view.top',
  side: 'view.side',
  perspective: 'view.perspective',
};

const DiyToolbar: React.FC = () => {
  const t = useT();
  const viewPreset = useDiyStore((s) => s.viewPreset);
  const setViewPreset = useDiyStore((s) => s.setViewPreset);
  const showGrid = useDiyStore((s) => s.showGrid);
  const setShowGrid = useDiyStore((s) => s.setShowGrid);
  const background = useDiyStore((s) => s.background);
  const setBackground = useDiyStore((s) => s.setBackground);

  const [menuOpen, setMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const bg = backgroundById(background);

  /**
   * Dismiss the picker on a press anywhere else.
   *
   * `pointerdown` rather than `click`: the press that lands outside is the same
   * one that starts an orbit on the canvas, and closing on the press means the
   * menu is gone before the camera moves rather than after it has. The listener
   * only exists while the menu is open, so a closed picker costs the page
   * nothing.
   *
   * A press ON the toggle is excluded by the containment test, so the toggle's
   * own click can still close it — otherwise the two would race and the menu
   * would reopen.
   */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  return (
    <div
      data-diy-toolbar
      // `flex-wrap` because the strip shares its width with nothing: on a narrow
      // window the grid toggle wraps to a second line rather than being clipped.
      className="px-3 py-2 border-b border-neutral-800 flex-shrink-0 flex items-center gap-3 flex-wrap"
    >
      <div className="flex items-center rounded-md bg-neutral-900 border border-neutral-800 p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            data-diy-view={p}
            data-diy-view-active={viewPreset === p ? '1' : '0'}
            title={t(PRESET_LABEL[p])}
            onClick={() => setViewPreset(p)}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
              viewPreset === p
                ? 'bg-wood-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            {t(PRESET_LABEL[p])}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-neutral-800" />

      {/* Blue, not the wood amber the views use: the two are different kinds of
          control — one says which view you are on, the other that an overlay is
          switched on — and in the amber they would read as two selections in one
          group. This is the same split the plan view's toolbar makes (its tools
          are amber, its snap and annotation toggles are coloured apart). */}
      <button
        data-diy-grid={showGrid ? '1' : '0'}
        aria-pressed={showGrid}
        onClick={() => setShowGrid(!showGrid)}
        className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
          showGrid
            ? 'bg-blue-800 text-blue-200'
            : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
        }`}
      >
        {t('diy.showGrid')}
      </button>

      <div className="w-px h-5 bg-neutral-800" />

      {/* The picker. A menu rather than a row of chips for two reasons: it does
          not widen the strip by six items, and the row that lists them can say
          what each one is called. The chip beside the trigger shows the CURRENT
          one, so the closed control still answers the question it is asked. */}
      <div ref={pickerRef} className="relative">
        <button
          data-diy-bg-toggle
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
            menuOpen
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
          }`}
        >
          <span
            data-diy-bg-chip
            // `border-black/30`: the chips run from near-black to near-white, and
            // one hairline of a mid tone is what keeps the pale ones from
            // dissolving into whatever is behind them.
            className="w-3 h-3 rounded-sm border border-black/30 inline-block"
            style={{ background: bg.css }}
          />
          {t('diy.background')}
          <span aria-hidden className="text-[9px] leading-none">
            ▾
          </span>
        </button>

        {menuOpen && (
          <div
            data-diy-bg-menu
            role="listbox"
            // Above the canvas and its overlays (the in-hand banner is z-10),
            // because an open menu the user cannot see is worse than a banner
            // they cannot.
            className="absolute left-0 top-full mt-1 z-40 min-w-[8.5rem] rounded-md border border-neutral-800 bg-neutral-900 p-1 shadow-xl"
          >
            {DIY_BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                role="option"
                aria-selected={b.id === background}
                data-diy-bg={b.id}
                data-diy-bg-active={b.id === background ? '1' : '0'}
                onClick={() => {
                  setBackground(b.id);
                  setMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded text-left transition-colors cursor-pointer ${
                  b.id === background
                    ? 'bg-wood-600 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-sm border border-black/30 flex-shrink-0"
                  style={{ background: b.css }}
                />
                {t(b.labelKey)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiyToolbar;
