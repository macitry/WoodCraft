import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyLangParam } from '../i18n';
import { COVER_TITLES, setDocumentTitles } from '../i18n/lang';
import CoverPage from './CoverPage';
import '../index.css';
import './cover.css';

/**
 * The cover site's entry point.
 *
 * Deliberately no router and no shared store: this page links to the editor
 * and the shop but never imports either of them, which is what keeps their
 * chunk graphs out of a visitor's download. The page scrolls normally, so the
 * app-shell rules in `index.css` (body overflow hidden, #root 100dvh) are
 * undone in `cover.css`.
 *
 * `setDocumentTitles` is called before the first render so the tab never
 * flashes the editor's title, and keeps this page's title in place across
 * language flips too.
 */
applyLangParam(window.location.search);
setDocumentTitles(COVER_TITLES);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in the document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <CoverPage />
  </StrictMode>,
);
