import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { applyLangParam } from './i18n';
import './index.css';

// Before the first render, so the app never paints in the wrong language and
// then swaps. See `applyLangParam` for why the entry point carries a language.
applyLangParam(window.location.search);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found in the document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
