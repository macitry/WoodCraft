import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassContent, GlassScene, GlassSurface } from '@glass-sdk/liquid-glass';
import type { GlassDiagnostic } from '@glass-sdk/liquid-glass';
import LangToggle from '../components/LangToggle';
import { useT } from '../i18n';
import { textureLabel } from '../i18n/names';
import type { DictKey } from '../i18n/dict';
import { boardById } from '../materials/boardRegistry';
import { SHOP_STEPS, useShopStore, type ShopStep } from './shopStore';
import { templateName } from './labels';
import ShopViewer from './ShopViewer';
import { useLiveModel } from './useLiveModel';
import StyleStep from './steps/StyleStep';
import SizeStep from './steps/SizeStep';
import BomStep from './steps/BomStep';

/**
 * The page: a header, two columns and a footer, with the glass around them.
 *
 * WHY THE CANVAS HAS NO GLASS OVER IT. liquid-glass refracts its own CONTENT
 * layer — `GlassContent`, registered once through the controller — rather than
 * whatever happens to be painted behind a surface. A glass bar laid over the 3D
 * canvas would therefore show the page's background through itself while
 * covering the model, which is the one thing this page exists to show. So the
 * right-hand column holds nothing but the canvas, and every control lives in the
 * left column, the header or the footer.
 *
 * THE FALLBACK IS NOT A SECOND LAYOUT. No element is added or removed on the
 * degraded path; `data-glass-fallback` goes on this root and `shop.css` swaps
 * the material for a `backdrop-filter`. That is the only way the two paths stay
 * in step — a fallback that re-renders differently is a fallback that rots.
 *
 * WHAT TRIGGERS IT. Two signals, both the library's own rather than a WebGPU
 * probe of our own invention: a diagnostic carrying an `error`, and the scene
 * root failing to reach `data-glass-ready="true"` within a few seconds. The
 * second is pessimistic on purpose — a page whose glass never arrives should
 * degrade rather than wait forever behind an invisible bar.
 */
const STEP_LABEL: Record<ShopStep, DictKey> = {
  style: 'shop.step.style',
  size: 'shop.step.size',
  bom: 'shop.step.bom',
};

/**
 * What the badge over the canvas says. Not a step — a state of the picture, and
 * it therefore only exists when there IS a picture: an empty pane says so in the
 * middle of itself, and a badge repeating that sentence above it reads as a bug.
 */
type ViewState = 'live' | 'building' | 'ready' | 'failed';

const VIEW_LABEL: Record<ViewState, DictKey> = {
  live: 'shop.view.live',
  building: 'shop.view.building',
  ready: 'shop.view.ready',
  failed: 'shop.view.failed',
};

/** How long the scene gets to report itself ready before we degrade anyway. */
const READY_TIMEOUT_MS = 4000;

const ShopShell: React.FC = () => {
  const t = useT();
  const step = useShopStore((s) => s.step);
  const template = useShopStore((s) => s.template);
  const values = useShopStore((s) => s.values);
  const profile = useShopStore((s) => s.profile);
  const board = useShopStore((s) => s.board);
  const model = useShopStore((s) => s.model);
  const building = useShopStore((s) => s.building);
  const buildFailed = useShopStore((s) => s.buildFailed);
  const progress = useShopStore((s) => s.progress);
  const goTo = useShopStore((s) => s.goTo);
  const next = useShopStore((s) => s.next);
  const back = useShopStore((s) => s.back);
  const build = useShopStore((s) => s.build);
  const loadTemplates = useShopStore((s) => s.loadTemplates);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // The one clock that keeps the right-hand pane in step with the left-hand
  // choices. It lives here rather than in a step because the pane outlives all
  // three of them — see `useLiveModel`.
  useLiveModel();

  const [fallback, setFallback] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (rootRef.current?.dataset.glassReady !== 'true') setFallback(true);
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const onDiagnostic = useCallback((d: GlassDiagnostic) => {
    if (d.error) setFallback(true);
  }, []);

  // The scene writes `data-glass-ready` on its own root and calls the
  // diagnostic on every change to it, so the attribute is the signal and the
  // callback is only needed for the error case above.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = () => {
      const value = root.dataset.glassReady;
      if (value === 'true') setFallback(false);
      else if (value === 'false') setFallback(true);
    };
    // Read once as well as watch: an observer only fires on CHANGE, and the
    // scene can have written `false` before this effect ran — which would
    // leave the page waiting on the four-second timeout for an answer it
    // already had.
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-glass-ready'] });
    return () => observer.disconnect();
  }, []);

  // The library follows the system reduced-motion setting on its own; this
  // turns the whole scene's motion off rather than only shortening it.
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // Touch has no wheel and no right button, so the desktop hint ("scroll to
  // zoom, right-drag to pan") would be instructing a thumb to do two things it
  // cannot. `pointer: coarse` is the platform's own answer and is read once —
  // the input device does not change mid-visit in any way worth re-rendering.
  const coarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );

  const at = SHOP_STEPS.indexOf(step);
  // Everything past the catalogue needs a piece of furniture and nothing else —
  // same rule as `goTo`, which enforces it again. The list used to be blocked on
  // a finished model too; that stopped making sense when the build moved onto
  // its own clock, because a customer who clicks on early should reach a list
  // that says it is still working rather than a button that does nothing.
  const canNext = at < SHOP_STEPS.length - 1 && template !== null;

  const size =
    values.width === undefined
      ? null
      : `${Math.round(values.width)} × ${Math.round(values.depth ?? 0)} × ${Math.round(
          values.height ?? 0,
        )} mm`;

  // Only meaningful with a model to describe — the `?.` is what lets the
  // calculation stand outside the `model &&` that renders it.
  const viewState: ViewState = buildFailed
    ? 'failed'
    : building
      ? 'building'
      : model?.status === 'full'
        ? 'ready'
        : 'live';

  // The server's progress is one global value for the whole process rather than
  // a per-customer one, so it is shown as a bare percentage: a percentage is
  // true of whatever is building, a phase name in English would not be.
  const percent =
    building && progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

  return (
    <div className="shop-root" data-glass-fallback={fallback ? '' : undefined}>
      <GlassScene
        ref={rootRef}
        className="shop-scene"
        appearance="dark"
        // Above the default 16 on purpose: the header, the two bar surfaces and
        // a couple of transient ones fit well under this, and the limit throws
        // rather than truncating, so it is set where the page cannot reach it.
        maxSurfaces={24}
        motion={reduced ? 'none' : 'full'}
        onDiagnostic={onDiagnostic}
      >
        <GlassContent className="shop-bg" layout="overlay">
          <div className="shop-bg-art" />
        </GlassContent>

        <div className="shop-stage">
          <header className="shop-head">
            <GlassSurface radius={18} className="shop-brand">
              <span className="shop-brand-mark">WoodCraft</span>
              <span className="shop-brand-tag">{t('shop.brand.tag')}</span>
            </GlassSurface>

            {/* Not a `tablist`: these are buttons in a progress indicator, and
                `aria-current="step"` is the role the platform provides for
                exactly that. A tablist whose children are not tabs is a lie
                that screen readers act on. */}
            <GlassSurface radius={999} className="shop-steps">
              {SHOP_STEPS.map((id, i) => {
                const state = i === at ? 'current' : i < at ? 'done' : 'todo';
                // Backwards is always allowed; forwards only as far as the
                // choices already reach — `goTo` enforces it again, so a click
                // here and a click on 下一步 cannot disagree.
                const reachable = i <= at || (i >= 1 && template !== null);
                return (
                  <button
                    key={id}
                    type="button"
                    className="shop-step"
                    data-state={state}
                    data-shop-step={id}
                    disabled={!reachable}
                    aria-current={state === 'current' ? 'step' : undefined}
                    onClick={() => reachable && goTo(id)}
                  >
                    <span className="shop-step-dot">{i + 1}</span>
                    <span>{t(STEP_LABEL[id])}</span>
                  </button>
                );
              })}
            </GlassSurface>

            <div className="shop-head-right">
              <span className="shop-brand-tag" data-shop-step-label>
                {t('shop.stepLabel', { n: at + 1, total: SHOP_STEPS.length })}
              </span>
              <LangToggle />
            </div>
          </header>

          {/* Two columns: the step on the left, the model on the right, and the
              model does not care which step it is. That is the whole change —
              there used to be a fourth step whose entire content was this pane,
              and a customer who wanted to see a new size had to walk back to it.
              `data-shop-main` carries the step name so a test can tell which
              column it is looking at. */}
          <main className="shop-main" data-shop-main={step}>
            <section className="shop-pane" data-shop-pane={step}>
              {step === 'style' && <StyleStep />}
              {step === 'size' && <SizeStep />}
              {step === 'bom' && <BomStep />}
            </section>

            <section className="shop-side" data-shop-side>
              <div className="shop-view" data-shop-viewer>
                {model ? (
                  // Keyed by furniture, NOT by model. A new model arrives every
                  // time a slider moves — a new `model_id` each time — and a
                  // remount per solve would reset the camera on every frame of a
                  // drag, which is both expensive and exactly wrong: the camera
                  // holds still precisely so the SIZE change is what you see.
                  <ShopViewer
                    key={template?.id ?? 'none'}
                    model={model}
                    templateId={template?.id ?? 'basic-desk'}
                    board={board}
                  />
                ) : (
                  // Two different silences. With no piece chosen there is
                  // nothing to draw and the customer has to act; with one
                  // chosen the solver is simply on its way, and "pick a piece"
                  // would be telling them to do what they just did.
                  <div className="shop-view-empty">
                    {template ? t('shop.view.solving') : t('shop.view.empty')}
                  </div>
                )}
              </div>

              {model && (
                <div className="shop-view-badge" data-shop-view={viewState}>
                  <span className="shop-view-dot" />
                  <span>{t(VIEW_LABEL[viewState])}</span>
                  {percent !== null && <span className="shop-view-pct">{percent}%</span>}
                  {viewState === 'failed' && (
                    <button
                      type="button"
                      className="shop-view-retry"
                      data-shop-nav="retry"
                      onClick={() => void build(true)}
                    >
                      {t('shop.view.retry')}
                    </button>
                  )}
                </div>
              )}

              {building && (
                <div className="shop-view-note" data-shop-view-note>
                  {t('shop.view.buildingNote')}
                </div>
              )}

              {/* Mutually exclusive with the above — `build()` clears
                  `buildFailed` when it starts — so the two can share the slot
                  and the attribute without ever both being on screen. */}
              {buildFailed && (
                <div className="shop-view-note" data-shop-view-note>
                  {t('shop.view.failedNote')}
                </div>
              )}

              {model && model.parts.length > 0 && (
                <div className="shop-view-foot">
                  <span className="shop-view-hint">
                    {t(coarse ? 'shop.view.hintTouch' : 'shop.view.hint')}
                  </span>
                  <span className="shop-view-parts" data-shop-view-parts>
                    {t('shop.view.parts', { n: model.parts.length })}
                  </span>
                </div>
              )}
            </section>
          </main>

          <footer className="shop-foot">
            <GlassSurface radius={18} className="shop-foot-note">
              <span className="shop-foot-chip">
                <span>{t('shop.foot.furniture')}</span>
                <span data-shop-summary="furniture">
                  {template ? templateName(t, template.id, template.name) : t('shop.foot.none')}
                </span>
              </span>
              <span className="shop-foot-chip">
                <span>{t('shop.foot.size')}</span>
                <span data-shop-summary="size">{size ?? t('shop.foot.none')}</span>
              </span>
              <span className="shop-foot-chip">
                <span>{t('shop.foot.profile')}</span>
                <span data-shop-summary="profile">{profile}</span>
              </span>
              <span className="shop-foot-chip">
                <span>{t('shop.foot.board')}</span>
                <span data-shop-summary="board">{textureLabel(boardById(board))}</span>
              </span>
            </GlassSurface>

            <div className="shop-head-right">
              <button
                type="button"
                className="shop-step"
                data-state={at > 0 ? 'done' : 'todo'}
                data-shop-nav="back"
                disabled={at === 0}
                onClick={back}
              >
                {t('shop.back')}
              </button>
              <button
                type="button"
                className="shop-step"
                data-state={canNext ? 'current' : 'todo'}
                data-shop-nav="next"
                disabled={!canNext}
                onClick={next}
              >
                {t('shop.next')}
              </button>
            </div>
          </footer>
        </div>
      </GlassScene>
    </div>
  );
};

export default ShopShell;
