import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyLangParam } from '../i18n';
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in the document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ShopShell />
  </StrictMode>,
);
