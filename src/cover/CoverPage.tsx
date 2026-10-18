import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import LangToggle from '../components/LangToggle';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/dict';
import { textureLabel, textureNote } from '../i18n/names';
import { boardById } from '../materials/boardRegistry';
import HeroDesk from './HeroDesk';

/**
 * The cover site.
 *
 * One scrolling page, four ideas, two doors: the customer wizard and the
 * professional editor. It is a separate HTML entry (see vite.config.ts) and
 * imports neither the editor's router nor the shop's store, so a visitor who
 * only came to look does not download either.
 *
 * The design language is the one the rest of the product already uses — dark
 * ground, warm wood, aluminium grey — but pushed editorial: a serif accent in
 * English, a technical grid, mono labels, and real parts as the imagery. The
 * only 3D on the page is a desk built locally in `HeroDesk`; nothing here
 * waits on the backend.
 */

const LINKS: { id: string; key: DictKey }[] = [
  { id: 'idea', key: 'cover.nav.idea' },
  { id: 'process', key: 'cover.nav.process' },
  { id: 'materials', key: 'cover.nav.materials' },
  { id: 'delivery', key: 'cover.nav.delivery' },
];

const STEPS = [
  { title: 'cover.process.s1.title', body: 'cover.process.s1.body', tag: 'cover.process.s1.tag' },
  { title: 'cover.process.s2.title', body: 'cover.process.s2.body', tag: 'cover.process.s2.tag' },
  { title: 'cover.process.s3.title', body: 'cover.process.s3.body', tag: 'cover.process.s3.tag' },
] as const;

const FEATURES = [
  { title: 'cover.delivery.f1.title', body: 'cover.delivery.f1.body' },
  { title: 'cover.delivery.f2.title', body: 'cover.delivery.f2.body' },
  { title: 'cover.delivery.f3.title', body: 'cover.delivery.f3.body' },
] as const;

const BOARD_IDS = ['oak', 'walnut', 'plank', 'ply'] as const;

const PROFILE_SECTIONS = [
  { code: '2020', mm: 20, glyph: 30 },
  { code: '3030', mm: 30, glyph: 43 },
  { code: '4040', mm: 40, glyph: 56 },
];

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

const ProfileGlyph: React.FC<{ width: number }> = ({ width }) => (
  <svg
    className="metal-glyph"
    viewBox="0 0 48 48"
    width={width}
    height={width}
    aria-hidden="true"
  >
    <rect x="4" y="4" width="40" height="40" />
    <rect x="11" y="11" width="26" height="26" />
    <path d="M4 18h7v12H4M44 18h-7v12h7M18 4v7h12V4M18 44v-7h12v7" />
  </svg>
);

const SectionIndex: React.FC<{ n: string; children: ReactNode }> = ({ n, children }) => (
  <div className="section-index" data-reveal>
    <span className="section-num">{n}</span>
    <span className="section-label">{children}</span>
  </div>
);

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

/** The sample sheet's six rows. `——` is used for a value the part does not
 *  have (a tabletop has no extrusion length), not for missing data. */
function useSampleRows(): string[][] {
  const t = useT();
  const oak = textureLabel(boardById('oak'));
  return [
    [t('shop.part.tabletop'), t('shop.partType.tabletop'), oak, '1200 × 600 × 18', '—', '1', '9.072 kg'],
    [t('cover.sample.legs'), t('shop.partType.leg'), t('cover.sample.mat.alu'), '3030', '732', '4', '2.584 kg'],
    [t('cover.sample.rails'), t('shop.partType.beam'), t('cover.sample.mat.alu'), '3030', '1140', '2', '2.052 kg'],
    [t('cover.sample.sideRails'), t('shop.partType.beam'), t('cover.sample.mat.alu'), '3030', '540', '2', '0.972 kg'],
    [t('shop.partType.bracket'), t('shop.partType.bracket'), t('cover.sample.mat.diecast'), '3030', '—', '8', '0.288 kg'],
    [t('shop.partType.hardware'), t('shop.partType.hardware'), t('cover.sample.mat.steel'), 'M8 × 20', '—', '16', '0.296 kg'],
  ];
}

const SampleSheet: React.FC = () => {
  const t = useT();
  const rows = useSampleRows();
  const heads: { key: DictKey; cls: string }[] = [
    { key: 'shop.bom.col.name', cls: 'sheet-name' },
    { key: 'shop.bom.col.type', cls: 'sheet-type' },
    { key: 'shop.bom.col.material', cls: 'sheet-mat' },
    { key: 'shop.bom.col.spec', cls: 'sheet-spec' },
    { key: 'shop.bom.col.length', cls: 'sheet-len' },
    { key: 'shop.bom.col.qty', cls: 'sheet-qty' },
    { key: 'shop.bom.col.mass', cls: 'sheet-mass' },
  ];

  return (
    <aside className="sheet" data-reveal>
      <div className="sheet-head">
        <span className="sheet-tag">{t('cover.sample.label')}</span>
        <span className="sheet-spec-line">{t('cover.sample.spec')}</span>
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
          {t('cover.sample.total')} <strong>15.264 kg</strong>
        </span>
        <span className="sheet-export">
          {t('cover.sample.export')}
          <b>XLSX</b>
          <b>CSV</b>
          <b>PNG</b>
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  useReveal();

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
            {LINKS.map((l, i) => (
              <a key={l.id} href={`#${l.id}`} onClick={() => setMenu(false)}>
                <span className="menu-num">0{i + 1}</span>
                {t(l.key)}
              </a>
            ))}
          </nav>
          <div className="menu-foot">
            <a className="btn btn--primary" href="shop.html" onClick={() => setMenu(false)}>
              {t('cover.nav.start')}
              <Arrow />
            </a>
            <a className="menu-editor" href="index.html" onClick={() => setMenu(false)}>
              {t('cover.nav.editor')}
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
              <a className="btn btn--text" href="index.html">
                {t('cover.nav.editor')}
                <Arrow />
              </a>
            </div>
            <div className="hero-stats" data-reveal style={delay(310)}>
              <span>
                <b>4</b>
                {t('cover.hero.stat.pieces')}
              </span>
              <span>
                <b>3</b>
                {t('cover.hero.stat.sections')}
              </span>
              <span>
                <b>3</b>
                {t('cover.hero.stat.steps')}
              </span>
            </div>
          </div>

          <div className="hero-stage">
            <div className="hero-grid" aria-hidden="true" />
            <div className="hero-aura" aria-hidden="true" />
            <HeroDesk />
            <span className="hero-annot hero-annot--a" aria-hidden="true">
              <i />
              {t('cover.hero.note1')}
            </span>
            <span className="hero-annot hero-annot--b" aria-hidden="true">
              <i />
              {t('cover.hero.note2')}
            </span>
            <span className="hero-side" aria-hidden="true">
              PARAMETRIC FURNITURE — 2026
            </span>
          </div>

          <a className="hero-scroll" href="#idea">
            <span>{t('cover.hero.scroll')}</span>
            <i />
          </a>
        </section>

        <div className="cover-ticker" aria-hidden="true">
          <div className="cover-ticker-track">
            {[0, 1].map((i) => (
              <span className="cover-ticker-run" key={i}>
                ALUMINIUM 6063 <i>·</i> OAK <i>·</i> WALNUT <i>·</i> PLYWOOD <i>·</i> 1200 × 600 ×
                750 <i>·</i> PARAMETRIC <i>·</i> MADE TO MEASURE <i>·</i>&nbsp;
              </span>
            ))}
          </div>
        </div>

        <section id="idea" className="section section--idea" aria-labelledby="idea-title">
          <div className="section-head">
            <SectionIndex n="01">{t('cover.idea.eyebrow')}</SectionIndex>
            <div className="section-body">
              <h2 id="idea-title" className="section-title" data-reveal>
                {t('cover.idea.line1')}
                <br />
                <span className="soft">{t('cover.idea.line2')}</span>
              </h2>
              <p className="lede" data-reveal style={delay(90)}>
                {t('cover.idea.body')}
              </p>
              <p className="idea-note" data-reveal style={delay(160)}>
                <span className="rule" />
                {t('cover.idea.note')}
              </p>
            </div>
          </div>
        </section>

        <section id="process" className="section" aria-labelledby="process-title">
          <div className="section-head section-head--row">
            <SectionIndex n="02">{t('cover.process.eyebrow')}</SectionIndex>
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
                <span className="process-tag">{t(step.tag)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="materials" className="section" aria-labelledby="materials-title">
          <div className="section-head">
            <SectionIndex n="03">{t('cover.materials.eyebrow')}</SectionIndex>
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

          <div className="metal-band" data-reveal>
            <div className="metal-copy">
              <h3>{t('cover.metal.title')}</h3>
              <p>{t('cover.metal.body')}</p>
            </div>
            <div className="metal-sections">
              {PROFILE_SECTIONS.map((p) => (
                <div className="metal-item" key={p.code}>
                  <ProfileGlyph width={p.glyph} />
                  <span className="metal-code">{p.code}</span>
                  <span className="metal-sub">{t('cover.metal.section', { n: p.mm })}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="delivery" className="section" aria-labelledby="delivery-title">
          <div className="section-head section-head--row">
            <SectionIndex n="04">{t('cover.delivery.eyebrow')}</SectionIndex>
            <h2 id="delivery-title" className="section-title section-title--wide" data-reveal>
              {t('cover.delivery.title1')}
              <br />
              <span className="soft">{t('cover.delivery.title2')}</span>
            </h2>
          </div>

          <div className="delivery-grid">
            <div className="delivery-copy">
              <p className="lede" data-reveal>
                {t('cover.delivery.body')}
              </p>
              <ul className="deliver-list">
                {FEATURES.map((f, i) => (
                  <li key={f.title} data-reveal style={delay(i * 90)}>
                    <span className="deliver-num">0{i + 1}</span>
                    <div>
                      <h3>{t(f.title)}</h3>
                      <p>{t(f.body)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <SampleSheet />
          </div>
        </section>

        <section className="cover-cta" aria-labelledby="cta-title">
          <div className="dimension" aria-hidden="true">
            <span>1200 mm</span>
          </div>
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
            <a className="btn btn--ghost btn--lg" href="index.html">
              {t('cover.nav.editor')}
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
