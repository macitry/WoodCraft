import { useEffect, useRef, useState, type CSSProperties } from 'react';
import LangToggle from '../components/LangToggle';
import { useLang, useT, type Translate } from '../i18n';
import type { DictKey } from '../i18n/dict';
import { textureLabel, textureNote } from '../i18n/names';
import { boardById } from '../materials/boardRegistry';
import HeroDesk from './HeroDesk';

/**
 * The cover site.
 *
 * One scrolling page: the desk, the reason, the parts list, how it is made,
 * what it is made of, one door. It is a separate HTML entry (see
 * vite.config.ts) and imports neither the editor's router nor the shop's
 * store, so a visitor who only came to look does not download either.
 *
 * The design language is the one the rest of the product already uses — dark
 * ground, warm wood, aluminium grey — but pushed editorial: a serif accent in
 * English, a technical grid, mono labels, and real parts as the imagery. The
 * only 3D on the page is a desk built locally in `HeroDesk`; nothing here
 * waits on the backend.
 *
 * The width control is the page's one interaction, and it is deliberately the
 * same number in three places: the hero desk, the mass readout, and the sample
 * list below. Seeing them move together is the product demonstration; the copy
 * around them only has to stay out of the way.
 */

const LINKS: { id: string; key: DictKey }[] = [
  { id: 'delivery', key: 'cover.nav.delivery' },
  { id: 'process', key: 'cover.nav.process' },
  { id: 'materials', key: 'cover.nav.materials' },
];

const STEPS = [
  { title: 'cover.process.s1.title', body: 'cover.process.s1.body' },
  { title: 'cover.process.s2.title', body: 'cover.process.s2.body' },
  { title: 'cover.process.s3.title', body: 'cover.process.s3.body' },
] as const;

const BOARD_IDS = ['oak', 'walnut', 'plank', 'ply'] as const;

const SAMPLE_WIDTHS = [1200, 1500, 1800] as const;
type SampleWidth = (typeof SAMPLE_WIDTHS)[number];

interface SampleConfig {
  width: SampleWidth;
  /** Solver totals, in kg, for the default basic-desk at 600 deep × 750 high,
   *  18 mm top, 3030 frame. Mass is linear in extrusion length, so these three
   *  points are the whole curve the control can reach. */
  total: number;
  tabletop: number;
  legs: number;
  rails: number;
  sideRails: number;
  railLength: number;
}

/**
 * Real `/api/models/{id}/bom` output, grouped by identical part. The legs share
 * one length (732 mm) at every width; the side rails stay 540 mm; only the
 * tabletop and the two long rails grow with the width. Bracket and fastener
 * rows are absent because the current solver does not put them in the BOM —
 * this sheet only shows what a download would actually contain.
 */
const SAMPLE_CONFIGS: Record<SampleWidth, SampleConfig> = {
  1200: {
    width: 1200,
    total: 14.364,
    tabletop: 9.072,
    legs: 2.464,
    rails: 1.919,
    sideRails: 0.909,
    railLength: 1140,
  },
  1500: {
    width: 1500,
    total: 17.137,
    tabletop: 11.34,
    legs: 2.464,
    rails: 2.424,
    sideRails: 0.909,
    railLength: 1440,
  },
  1800: {
    width: 1800,
    total: 19.91,
    tabletop: 13.608,
    legs: 2.464,
    rails: 2.929,
    sideRails: 0.909,
    railLength: 1740,
  },
};

const Arrow: React.FC = () => (
  <svg className="arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 13 13 3M5.5 3H13v7.5" />
  </svg>
);

const BrandMark: React.FC = () => (
  <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden="true">
    <rect x="1.5" y="1.5" width="10" height="10" />
    <rect className="brand-mark-b" x="8.5" y="8.5" width="10" height="10" />
  </svg>
);

const StepIcon: React.FC<{ kind: 'choose' | 'size' | 'list' }> = ({ kind }) => {
  if (kind === 'choose') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M7 20 24 11l17 9-17 9L7 20Z" />
        <path d="M12 23v11M36 23v11M18 21v9M30 21v9" />
        <path d="M7 20v4l17 9 17-9v-4" />
      </svg>
    );
  }
  if (kind === 'size') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="8" y="14" width="32" height="20" />
        <path d="M8 38v4M40 38v4M8 40h32M15 40v-3M33 40v-3" />
        <path d="M16 20h16M24 20v4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 14h28M10 24h28M10 34h28" />
      <path d="M6 14h.5M6 24h.5M6 34h.5" />
    </svg>
  );
};

/**
 * Marks every `[data-reveal]` on screen as seen, once. Kept as a DOM query
 * rather than a per-component hook because the page has dozens of them and a
 * single observer is one callback instead of dozens.
 */
function useReveal(): void {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((el) => {
        el.dataset.inview = 'true';
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.inview = 'true';
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -6% 0px' },
    );
    nodes.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/** The sheet's four grouped rows. `—` is used for a value the part does not
 *  have (a tabletop has no extrusion length), not for missing data. */
function sampleRows(t: Translate, oak: string, config: SampleConfig): string[][] {
  const kg = (n: number): string => `${n.toFixed(3)} kg`;
  return [
    [
      t('shop.part.tabletop'),
      t('shop.partType.tabletop'),
      oak,
      `${config.width} × 600 × 18`,
      '—',
      '1',
      kg(config.tabletop),
    ],
    [
      t('cover.sample.legs'),
      t('shop.partType.leg'),
      t('cover.sample.mat.alu'),
      '3030',
      '732',
      '4',
      kg(config.legs),
    ],
    [
      t('cover.sample.rails'),
      t('shop.partType.beam'),
      t('cover.sample.mat.alu'),
      '3030',
      String(config.railLength),
      '2',
      kg(config.rails),
    ],
    [
      t('cover.sample.sideRails'),
      t('shop.partType.beam'),
      t('cover.sample.mat.alu'),
      '3030',
      '540',
      '2',
      kg(config.sideRails),
    ],
  ];
}

const SampleSheet: React.FC<{ config: SampleConfig }> = ({ config }) => {
  const t = useT();
  const lang = useLang();
  const rows = sampleRows(t, textureLabel(boardById('oak')), config);
  const heads: { key: DictKey; cls: string }[] = [
    { key: 'shop.bom.col.name', cls: 'sheet-name' },
    { key: 'shop.bom.col.type', cls: 'sheet-type' },
    { key: 'shop.bom.col.material', cls: 'sheet-mat' },
    { key: 'shop.bom.col.spec', cls: 'sheet-spec' },
    { key: 'shop.bom.col.length', cls: 'sheet-len' },
    { key: 'shop.bom.col.qty', cls: 'sheet-qty' },
    { key: 'shop.bom.col.mass', cls: 'sheet-mass' },
  ];
  // These files are generated from the same three solver BOMs the table shows,
  // one pair per width and language, and ship in public/samples. They are real
  // downloads, not a badge that looks like one.
  const base = `/samples/woodcraft-bom-${config.width}-${lang}`;
  const file = `WoodCraft-BOM-${config.width}-${lang}`;

  return (
    <aside className="sheet" data-reveal>
      <div className="sheet-head">
        <span className="sheet-tag">{t('cover.sample.label')}</span>
        <span className="sheet-spec-line">{t('cover.sample.spec', { w: config.width })}</span>
      </div>

      <div className="sheet-table" role="table" aria-label={t('cover.sample.label')}>
        <div className="sheet-row sheet-row--head" role="row">
          {heads.map((h) => (
            <span key={h.key} className={`sheet-cell ${h.cls}`} role="columnheader">
              {t(h.key)}
            </span>
          ))}
        </div>
        {rows.map((row, i) => (
          <div className="sheet-row" role="row" key={i}>
            {row.map((cell, j) => (
              <span
                key={j}
                className={`sheet-cell ${heads[j].cls}`}
                role="cell"
                data-num={j >= 4 ? '' : undefined}
              >
                {cell}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="sheet-foot">
        <span className="sheet-total">
          {t('cover.sample.total')} <strong>{config.total.toFixed(3)} kg</strong>
        </span>
        <span className="sheet-export">
          {t('cover.sample.export')}
          <a href={`${base}.xlsx`} download={`${file}.xlsx`}>
            XLSX
          </a>
          <a href={`${base}.csv`} download={`${file}.csv`}>
            CSV
          </a>
        </span>
      </div>
      <p className="sheet-note">{t('cover.sample.note')}</p>
    </aside>
  );
};

const CoverPage: React.FC = () => {
  const t = useT();
  const [solid, setSolid] = useState(false);
  const [menu, setMenu] = useState(false);
  // 1500 is the middle of the three stops, so the first frame has room to
  // read as either a smaller or a larger desk when the visitor reaches for the
  // control. It is also the desk the hero and the sheet both describe.
  const [width, setWidth] = useState<SampleWidth>(1500);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  useReveal();

  const config = SAMPLE_CONFIGS[width];

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 28);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    const returnTo = menuBtnRef.current;
    document.body.style.overflow = 'hidden';
    // The dialog covers the menu button; without this a keyboard user is left
    // tabbing through a page they cannot see. Cleanup puts them back.
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      returnTo?.focus();
    };
  }, [menu]);

  const delay = (ms: number): CSSProperties => ({ '--d': `${ms}ms` }) as CSSProperties;

  return (
    <div className="cover-root">
      <header className="cover-nav" data-solid={solid ? '' : undefined}>
        <a className="brand" href="cover.html" aria-label="WoodCraft">
          <BrandMark />
          <span className="brand-word">WoodCraft</span>
        </a>

        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`}>
              {t(l.key)}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <LangToggle className="cover-lang" />
          <a className="nav-cta" href="shop.html">
            {t('cover.nav.start')}
            <Arrow />
          </a>
          <button
            ref={menuBtnRef}
            type="button"
            className="menu-btn"
            aria-expanded={menu}
            aria-label={t(menu ? 'cover.menu.close' : 'cover.menu.open')}
            onClick={() => setMenu(true)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      {menu && (
        <div className="cover-menu" role="dialog" aria-modal="true" aria-label={t('cover.menu.label')}>
          <div className="cover-menu-top">
            <span className="brand">
              <BrandMark />
              <span className="brand-word">WoodCraft</span>
            </span>
            <button
              ref={closeRef}
              type="button"
              className="menu-close"
              onClick={() => setMenu(false)}
              aria-label={t('cover.menu.close')}
            >
              <span />
              <span />
            </button>
          </div>
          <nav className="menu-links">
            {LINKS.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={() => setMenu(false)}>
                {t(l.key)}
              </a>
            ))}
          </nav>
          <div className="menu-foot">
            <a className="btn btn--primary" href="shop.html" onClick={() => setMenu(false)}>
              {t('cover.nav.start')}
              <Arrow />
            </a>
          </div>
        </div>
      )}

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-eyebrow" data-reveal>
              <span className="pulse" />
              {t('cover.hero.eyebrow')}
            </p>
            <h1 id="hero-title" className="hero-title" data-reveal style={delay(70)}>
              <span className="line">{t('cover.hero.line1')}</span>
              <span className="line line--accent">{t('cover.hero.line2')}</span>
            </h1>
            <p className="hero-sub" data-reveal style={delay(150)}>
              {t('cover.hero.sub')}
            </p>
            <div className="hero-actions" data-reveal style={delay(230)}>
              <a className="btn btn--primary" href="shop.html">
                {t('cover.nav.start')}
                <Arrow />
              </a>
            </div>

            <div className="hero-width" data-reveal style={delay(310)}>
              <div className="hero-width-head">
                <span className="hero-width-label">{t('cover.hero.width')}</span>
                <span className="hero-width-unit">mm</span>
              </div>
              <div className="hero-width-row">
                <div className="hero-width-stops" role="group" aria-label={t('cover.hero.width')}>
                  {SAMPLE_WIDTHS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className="hero-width-stop"
                      aria-pressed={width === w}
                      onClick={() => setWidth(w)}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <span className="hero-width-mass">
                  <b>{config.total.toFixed(3)}</b> kg
                </span>
              </div>
              <p className="hero-width-hint">{t('cover.hero.widthHint')}</p>
            </div>
          </div>

          <div className="hero-stage">
            <div className="hero-grid" aria-hidden="true" />
            <div className="hero-aura" aria-hidden="true" />
            <HeroDesk widthMm={width} />
            <span className="hero-annot hero-annot--a" aria-hidden="true">
              <i />
              {t('cover.hero.note1')}
            </span>
            <span className="hero-annot hero-annot--b" aria-hidden="true">
              <i />
              {t('cover.hero.note2')}
            </span>
          </div>

          <a className="hero-scroll" href="#manifesto">
            <span>{t('cover.hero.scroll')}</span>
            <i />
          </a>
        </section>

        <section id="manifesto" className="manifesto" aria-labelledby="manifesto-title">
          <h2 id="manifesto-title" className="manifesto-line" data-reveal>
            <span>
              <span>{t('cover.idea.line1a')}</span>
              <span className="manifesto-break">{t('cover.idea.line1b')}</span>
            </span>
            <span className="soft">{t('cover.idea.line2')}</span>
          </h2>
        </section>

        <section id="delivery" className="section" aria-labelledby="delivery-title">
          <div className="section-head">
            <p className="section-label" data-reveal>
              {t('cover.delivery.eyebrow')}
            </p>
            <div className="section-body">
              <h2 id="delivery-title" className="section-title section-title--wide" data-reveal>
                {t('cover.delivery.title1')}
                <br />
                <span className="soft">{t('cover.delivery.title2')}</span>
              </h2>
              <p className="lede" data-reveal style={delay(90)}>
                {t('cover.delivery.body')}
              </p>
            </div>
          </div>

          <SampleSheet config={config} />
        </section>

        <section id="process" className="section" aria-labelledby="process-title">
          <div className="section-head section-head--row">
            <p className="section-label" data-reveal>
              {t('cover.process.eyebrow')}
            </p>
            <h2 id="process-title" className="section-title section-title--wide" data-reveal>
              {t('cover.process.title')}
            </h2>
          </div>

          <ol className="process">
            {STEPS.map((step, i) => (
              <li className="process-step" key={step.title} data-reveal style={delay(i * 110)}>
                <div className="process-top">
                  <span className="process-num">0{i + 1}</span>
                  <StepIcon kind={i === 0 ? 'choose' : i === 1 ? 'size' : 'list'} />
                </div>
                <h3>{t(step.title)}</h3>
                <p>{t(step.body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="materials" className="section" aria-labelledby="materials-title">
          <div className="section-head">
            <p className="section-label" data-reveal>
              {t('cover.materials.eyebrow')}
            </p>
            <div className="section-body">
              <h2 id="materials-title" className="section-title section-title--wide" data-reveal>
                {t('cover.materials.title')}
              </h2>
              <p className="lede" data-reveal style={delay(80)}>
                {t('cover.materials.body')}
              </p>
            </div>
          </div>

          <div className="wood-grid">
            {BOARD_IDS.map((id, i) => {
              const board = boardById(id);
              return (
                <figure className="wood-card" key={id} data-reveal style={delay(i * 90)}>
                  <img src={board.faceUrl} alt="" loading="lazy" draggable={false} />
                  <div className="wood-shade" />
                  <figcaption>
                    <span className="wood-index">0{i + 1}</span>
                    <span className="wood-name">{textureLabel(board)}</span>
                    <span className="wood-note">{textureNote(board)}</span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>

        <section className="cover-cta" aria-labelledby="cta-title">
          <p className="cta-eyebrow" data-reveal>
            {t('cover.cta.eyebrow')}
          </p>
          <h2 id="cta-title" className="cta-title" data-reveal style={delay(70)}>
            {t('cover.cta.title')}
          </h2>
          <p className="cta-body" data-reveal style={delay(140)}>
            {t('cover.cta.body')}
          </p>
          <div className="cta-actions" data-reveal style={delay(210)}>
            <a className="btn btn--primary btn--lg" href="shop.html">
              {t('cover.nav.start')}
              <Arrow />
            </a>
          </div>
        </section>
      </main>

      <footer className="cover-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="brand">
              <BrandMark />
              <span className="brand-word">WoodCraft</span>
            </span>
            <p>{t('cover.footer.tagline')}</p>
          </div>
          <div className="footer-cols">
            <div>
              <h4>{t('cover.footer.product')}</h4>
              <a href="shop.html">{t('cover.nav.start')}</a>
              <a href="index.html">{t('cover.nav.editor')}</a>
            </div>
            <div>
              <h4>{t('cover.footer.explore')}</h4>
              {LINKS.map((l) => (
                <a key={l.id} href={`#${l.id}`}>
                  {t(l.key)}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 WoodCraft. {t('cover.footer.rights')}</span>
          <span>{t('cover.footer.built')}</span>
          <span className="footer-note">{t('cover.footer.note')}</span>
        </div>
      </footer>
    </div>
  );
};

export default CoverPage;
