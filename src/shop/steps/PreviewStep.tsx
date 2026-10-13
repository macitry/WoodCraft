import { useEffect } from 'react';
import { useT } from '../../i18n';
import { useShopStore } from '../shopStore';
import ShopViewer from '../ShopViewer';

/**
 * Step three: the model.
 *
 * The build starts when this step is first shown, and not before — asking for
 * the model the moment a template is chosen would spend a CAD build on a
 * customer who then changed their mind about the size. `ensureBuilt` re-enters
 * on every visit and starts a second build only if the dimensions have actually
 * changed, so stepping back and forward again is free.
 *
 * The wait is real and can be long: the server answers a cache miss instantly
 * with a solver-only preview and builds the CAD in a background thread. See
 * `retryBuild` in the store for how that is waited out.
 */
const PreviewStep: React.FC = () => {
  const t = useT();
  const model = useShopStore((s) => s.model);
  const building = useShopStore((s) => s.building);
  const failed = useShopStore((s) => s.buildFailed);
  const progress = useShopStore((s) => s.progress);
  const ensureBuilt = useShopStore((s) => s.ensureBuilt);
  const retryBuild = useShopStore((s) => s.retryBuild);

  useEffect(() => {
    void ensureBuilt();
  }, [ensureBuilt]);

  if (failed) {
    return (
      <div className="shop-view">
        <div className="shop-loading">
          <div className="shop-loading-title">{t('shop.preview.failed')}</div>
          <p className="shop-loading-note">{t('shop.preview.failedNote')}</p>
          <button type="button" className="shop-size" style={{ maxWidth: 180 }} onClick={() => void retryBuild()}>
            <span className="shop-size-cap">{t('shop.preview.retry')}</span>
          </button>
        </div>
      </div>
    );
  }

  if (building || !model) {
    // The server's progress is one value for the whole process rather than for
    // this build, so it is shown as what it is — a sign that work is happening
    // — and never as a promise about how far along THIS model is.
    const total = progress?.total ?? 0;
    const current = progress?.current ?? 0;
    const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null;
    return (
      <div className="shop-view">
        <div className="shop-loading">
          <div className="shop-loading-title">{t('shop.preview.building')}</div>
          <p className="shop-loading-note">{t('shop.preview.buildingNote')}</p>
          <div className="shop-bar">
            <div
              className="shop-bar-fill"
              style={{ width: pct === null ? '38%' : `${pct}%`, opacity: pct === null ? 0.55 : 1 }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-view">
      <ShopViewer model={model} />
      <div className="shop-view-hint">{t('shop.preview.hint')}</div>
      <div className="shop-view-hint" style={{ left: 'auto', right: 14 }}>
        {t('shop.preview.parts', { n: model.parts.length })}
      </div>
    </div>
  );
};

export default PreviewStep;
