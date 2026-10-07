// ---------------------------------------------------------------------------
// Translation entry points.
//
//   · `t(key, vars)` — the plain function. Reads the live language, so it is
//     callable from anywhere: an export click, a module-level table, a thrown
//     Error. It is NOT reactive; use it only outside React.
//   · `useT()` — the hook. Subscribes to the language and hands back a `t`
//     bound to it. The bound function's identity changes with the language,
//     so `[t]` is a correct useMemo dependency and a memo cannot go stale.
//
// Components must use `useT()`, never the free `t`: a component that renders
// the free `t` has nothing telling React to re-render it when the switch
// flips, and the page would keep its old language until something else moved.
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { getLang, useLangStore, type Lang } from './lang';
import { en, zh, type DictKey } from './dict';

export type { Lang };
export type Vars = Record<string, string | number>;
export type Translate = (key: DictKey, vars?: Vars) => string;

export { useLangStore };

const DICTS: Record<Lang, Record<DictKey, string>> = { zh, en };

/**
 * Replace `{name}` placeholders. An unknown placeholder is left standing
 * rather than blanked, so a typo shows up as `{n}` on screen instead of a
 * sentence that silently lost its number.
 */
function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function translate(lang: Lang, key: DictKey, vars?: Vars): string {
  return fill(DICTS[lang][key], vars);
}

/**
 * Is this string a key we hold? The door for DYNAMIC keys — `part.${id}` where
 * `id` came off the wire — which by construction cannot be a literal type.
 * A `true` here narrows the argument to `DictKey`, so the caller can hand it
 * straight to `t` and still be type-checked.
 */
export function hasKey(key: string): key is DictKey {
  return Object.prototype.hasOwnProperty.call(zh, key);
}

/** Current language, for non-React callers. Reactive code wants `useLang()`.
 *  Reads the module variable (see lang.ts), not the store, so importing this
 *  into `bomExport` does not drag a React store along with it. */
export const t: Translate = (key, vars) => translate(getLang(), key, vars);

/** Subscribe to the language. Re-renders on a flip; returns the language. */
export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

/** Subscribe + get a `t` bound to the live language. Safe as a memo dep. */
export function useT(): Translate {
  const lang = useLang();
  return useMemo(() => (key: DictKey, vars?: Vars) => translate(lang, key, vars), [lang]);
}

/**
 * `?lang=zh|en` — an entry-point override, applied once at boot.
 *
 * Two callers, and both are why it exists:
 *   · a link can carry its language, so a shared URL opens in the language it
 *     was written in rather than in whatever the reader's browser prefers;
 *   · the probe suite asserts on Chinese copy. Headless Chrome reports
 *     `en-US`, so without this every text-asserting probe would flip to
 *     English at once the day the default became browser-driven. `?lang=zh`
 *     pins them, visibly, in the probe's own source.
 *
 * It goes through `setLang`, i.e. it is remembered. A one-shot override would
 * be forgotten by the first `navigate()` — the SPA drops the query string —
 * and the page would change language halfway through a click-through.
 */
export function applyLangParam(search: string): void {
  const value = new URLSearchParams(search).get('lang');
  if (value === 'zh' || value === 'en') useLangStore.getState().setLang(value);
}
