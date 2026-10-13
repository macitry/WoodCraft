import { useT } from '../../i18n';
import { useShopStore } from '../shopStore';
import { templateDesc, templateName } from '../labels';

/**
 * Step one: the catalogue.
 *
 * The cards are the backend's, drawn from `/api/templates` — not a list kept
 * here. Two things follow from that. The page cannot offer a piece of furniture
 * the server would refuse to build, and the day the server knows about a third
 * piece, it appears here without a line changing on this side.
 *
 * There is no photograph on a card: the server sends no image, and a rendered
 * thumbnail would mean building every model in the catalogue on every visit.
 * The small drawing is a shape, not a picture — it says "a desk" and is honest
 * about saying only that.
 */
const StyleStep: React.FC = () => {
  const t = useT();
  const templates = useShopStore((s) => s.templates);
  const loading = useShopStore((s) => s.templatesLoading);
  const failed = useShopStore((s) => s.templatesFailed);
  const chosen = useShopStore((s) => s.template);
  const chooseTemplate = useShopStore((s) => s.chooseTemplate);
  const loadTemplates = useShopStore((s) => s.loadTemplates);

  return (
    <div className="shop-scroll">
      <h2 className="shop-h1">{t('shop.style.title')}</h2>
      <p className="shop-lead">{t('shop.style.lead')}</p>

      {failed ? (
        <div className="shop-empty">
          <p style={{ margin: '0 0 14px' }}>{t('shop.style.empty')}</p>
          <button className="shop-size" style={{ maxWidth: 200 }} onClick={() => void loadTemplates()}>
            <span className="shop-size-cap">{t('shop.style.retry')}</span>
          </button>
        </div>
      ) : loading ? (
        <div className="shop-empty">…</div>
      ) : (
        <div className="shop-cards">
          {templates.map((template) => {
            const isChosen = chosen?.id === template.id;
            return (
              <button
                key={template.id}
                type="button"
                className="shop-card"
                aria-pressed={isChosen}
                onClick={() => chooseTemplate(template)}
              >
                <div className="shop-card-art">
                  <DeskGlyph />
                </div>
                <div className="shop-card-name">
                  {templateName(t, template.id, template.name)}
                </div>
                <div className="shop-card-desc">
                  {templateDesc(t, template.id, template.description)}
                </div>
                <div className="shop-card-meta">
                  {isChosen
                    ? t('shop.style.selected')
                    : t('shop.style.cardMeta', { n: template.parameters.length })}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** A desk, drawn to size: a top, two legs, one rail. A `vector-effect`-free
 *  outline in the current colour, so it takes the page's tint. */
const DeskGlyph: React.FC = () => (
  <svg width="72" height="52" viewBox="0 0 72 52" fill="none" aria-hidden="true">
    <rect x="6" y="12" width="60" height="5" rx="2" fill="currentColor" opacity="0.85" />
    <rect x="11" y="17" width="4" height="30" rx="1.5" fill="currentColor" opacity="0.55" />
    <rect x="57" y="17" width="4" height="30" rx="1.5" fill="currentColor" opacity="0.55" />
    <rect x="15" y="24" width="42" height="3.5" rx="1.5" fill="currentColor" opacity="0.32" />
  </svg>
);

export default StyleStep;
