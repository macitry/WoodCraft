// ---------------------------------------------------------------------------
// UI language — the one switch the whole app reads.
//
// There are two kinds of reader and the split is the whole design:
//
//   · Components subscribe through `useT()` / `useLang()`, so flipping the
//     switch re-renders every string on screen.
//   · Plain modules — bomExport, diyBom, accessoryKits, boardUpload — cannot
//     subscribe to anything and are called from inside some other component's
//     render or from an export click. They read the module-level `current`
//     below. Same shape as materials/boardRegistry: the store is the render
//     trigger, the module variable is the truth.
//
// Because of that second reader, `setLang` MUST write `current` before it
// notifies the store. Store-first would re-render React against a language the
// plain modules have not switched to yet, i.e. exactly one frame of the mix
// this file exists to remove.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

export type Lang = 'zh' | 'en';

/** Single key, like `diy.leftW` and the board selection — this repo keeps
 *  one-off UI state in bare localStorage rather than adding zustand/persist. */
const STORAGE_KEY = 'woodcraft.lang';

/**
 * A saved choice wins; otherwise follow the browser. `navigator.language` is
 * the one signal that is already right on a Chinese machine without the user
 * having to find the switch first.
 *
 * Never throws: a disabled localStorage (private mode, blocked cookies) costs
 * the user their saved choice and nothing else.
 *
 * `index.html` runs the same test in an inline script before the bundle loads,
 * so the document's `lang` and title are right from first paint rather than
 * from mount. It cannot import this — there is no bundle yet — and the two are
 * kept in step by hand: same storage key, same browser test, same two strings.
 * A change to one of them belongs in the other.
 */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // Storage unavailable — fall through to the browser's own answer.
  }
  const nav = typeof navigator === 'undefined' ? '' : navigator.language;
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let current: Lang = detect();

/** The language right now, for non-React callers. React code should subscribe
 *  via `useT()` instead, or a flip will not re-render it. */
export const getLang = (): Lang => current;

/** Tab titles, per language. The brand is the same word in both. */
const TITLES: Record<Lang, string> = {
  zh: 'WoodCraft — 参数化家具设计器',
  en: 'WoodCraft — Parametric Furniture Designer',
};

/**
 * Everything about the document that is not a React node but still has to
 * follow the language: its `lang`, which screen readers, hyphenation and the
 * browser's font fallback all key off, and its title, which is the app's name in
 * the tab and in the history.
 *
 * One function rather than two calls at each site, because they are one fact —
 * "what language is this document in" — and the title is exactly the half that
 * gets forgotten. It was: `?lang=en` corrected `lang` and left a Chinese title
 * in the tab. `index.html` sets both before the bundle loads; this keeps them
 * true afterwards, for `?lang=` and for the toggle alike.
 */
function applyDocumentLang(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  document.title = TITLES[current];
}

applyDocumentLang();

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Flip to the other language — what the toggle button calls. */
  toggleLang: () => void;
}

export const useLangStore = create<LangState>((set, get) => ({
  lang: current,

  setLang: (lang) => {
    if (lang === current) return;
    // Order matters — see the header. `current` first, then the store.
    current = lang;
    applyDocumentLang();
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Quota / disabled storage: the choice still holds for this session.
    }
    set({ lang });
  },

  toggleLang: () => get().setLang(current === 'zh' ? 'en' : 'zh'),
}));
