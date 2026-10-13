import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassContent, GlassScene, GlassSurface } from '@glass-sdk/liquid-glass';
import type { GlassDiagnostic } from '@glass-sdk/liquid-glass';
import LangToggle from '../components/LangToggle';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/dict';
import { SHOP_STEPS, useShopStore, type ShopStep } from './shopStore';
import { templateName } from './labels';
import StyleStep from './steps/StyleStep';
import SizeStep from './steps/SizeStep';
import PreviewStep from './steps/PreviewStep';
import BomStep from './steps/BomStep';

/**
 * The page: three bands and the glass around them.
 *
 * WHY THE BANDS ARE SEPARATE. liquid-glass refracts its own CONTENT layer —
 * `GlassContent`, registered once through the controller — rather than whatever
 * happens to be painted behind a surface. A glass bar laid over the 3D canvas
 * would therefore show the page's background through itself while covering the
 * model, which is the one thing this page exists to show. So the canvas gets a
 * band with no glass in it at all, and every control lives above or below.
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
  preview: 'shop.step.preview',
  bom: 'shop.step.bom',
};

/** How long the scene gets to report itself ready before we degrade anyway. */
const READY_TIMEOUT_MS = 4000;

const ShopShell: React.FC = () => {
  const t = useT();
  const step = useShopStore((s) => s.step);
  const template = useShopStore((s) => s.template);
  const values = useShopStore((s) => s.values);
  const profile = useShopStore((s) => s.profile);
  const model = useShopStore((s) => s.model);
  const goTo = useShopStore((s) => s.goTo);
  const next = useShopStore((s) => s.next);
  const back = useShopStore((s) => s.back);
  const loadTemplates = useShopStore((s) => s.loadTemplates);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

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

  const at = SHOP_STEPS.indexOf(step);
  const canNext =
    at < SHOP_STEPS.length - 1 &&
    (step !== 'style' || template !== null) &&
    (step !== 'preview' || model !== null);

  const size =
    values.width === undefined
      ? null
      : `${Math.round(values.width)} × ${Math.round(values.depth ?? 0)} × ${Math.round(
          values.height ?? 0,
        )} mm`;

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
                const reachable = i <= at || (i === 1 && template) || (i >= 2 && model);
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

          <main className="shop-main">
            {step === 'style' && <StyleStep />}
            {step === 'size' && <SizeStep />}
            {step === 'preview' && <PreviewStep />}
            {step === 'bom' && <BomStep />}
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
