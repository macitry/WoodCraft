import { hasKey, type Translate } from '../i18n';

/**
 * Translating the strings that arrive from the server.
 *
 * The catalogue's names and descriptions, the parameter labels and the part
 * types all come off the wire in English, because English is what the backend
 * is written in. They still have to be shown in the reader's language.
 *
 * Each helper looks for a key of its own and falls back to the server's string
 * when there is none. That fallback is the important half: a second kind of
 * furniture added on the backend, with parameters this page has never heard of,
 * appears here carrying its own English words rather than not appearing at all.
 * The alternative — a lookup table that only knows today's furniture — would
 * break the promise that steps one and two need no front-end change when the
 * catalogue grows.
 *
 * `hasKey` is the guard that makes this type-safe: it narrows the built key to
 * a `DictKey`, which is what lets the result go straight to `t`.
 */

export function templateName(t: Translate, id: string, fallback: string): string {
  const key = `shop.template.${id}.name`;
  return hasKey(key) ? t(key) : fallback;
}

export function templateDesc(t: Translate, id: string, fallback: string): string {
  const key = `shop.template.${id}.desc`;
  return hasKey(key) ? t(key) : fallback;
}

export function paramLabel(t: Translate, id: string, fallback: string): string {
  const key = `shop.param.${id}`;
  return hasKey(key) ? t(key) : fallback;
}

/** The four part types the desk solver emits; anything else is a "fitting". */
export function partTypeLabel(t: Translate, partType: string): string {
  const key = `shop.partType.${partType}`;
  return hasKey(key) ? t(key) : t('shop.partType.other');
}

/**
 * A part's name. The server's are identifiers — `leg_front_left` — which are
 * fine on a drawing and wrong on a shopping list, so the ones we know are
 * named, and the rest keep the identifier. An identifier is not a good label,
 * but it is a great deal better than a blank.
 */
export function partName(t: Translate, name: string): string {
  const key = `shop.part.${name}`;
  return hasKey(key) ? t(key) : name;
}
