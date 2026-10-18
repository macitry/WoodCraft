import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyLangParam } from '../i18n';
import { setDocumentTitles, SHOP_TITLES } from '../i18n/lang';
import ShopShell from './ShopShell';
import '../index.css';
import '@glass-sdk/liquid-glass/styles.css';
import './shop.css';

/**
 * The customer page's entry point.
 *
 * Deliberately NOT `src/main.tsx` and deliberately without a router. That file
 * boots `BrowserRouter` around the three routes of the professional editor, and
 * a customer who can reach `/diy` by editing the address bar is exactly what
 * the second HTML entry exists to prevent. Nothing here needs a URL either: the
 * four steps are a wizard, so they are state, and the URL stays `/shop.html`
 * from first paint to the last export.
 */
applyLangParam(window.location.search);
// `shop.html`'s own title (it is set before paint by the inline script there).
// Without this the bundle's first import of `lang.ts` would overwrite it with
// the editor's title, which is a different product in the same tab.
setDocumentTitles(SHOP_TITLES);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in the document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ShopShell />
  </StrictMode>,
);
